import { BrowserWindow } from "electron";
import { SerialPort } from "serialport";
import { CallerIdStreamBuffer } from "../callerIdParser";
import { DesktopConfig, SerialPortInfo, SerialStatus } from "../types/desktop";

const ALLOWED_BAUD_RATES = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];
const COM_PORT_REGEX = /^COM\d+$/i;

// Güvenlik: Web'den rastgele komut yazılamaz, yalnızca sabit liste
const ALLOWED_AT_COMMANDS: Record<string, string> = {
  ENABLE_CID_VCID: "AT+VCID=1\r\n",
  ENABLE_CID_CLIP: "AT+CLIP=1\r\n",
  RESET_MODEM: "ATZ\r\n",
};

export class SerialManager {
  private currentPort: SerialPort | null = null;
  private currentPortName: string | null = null;
  private currentBaudRate: number | null = null;
  private currentModemMode: boolean = false;
  private mainWindow: BrowserWindow | null = null;
  private config: DesktopConfig | null = null;

  private streamBuffer: CallerIdStreamBuffer;
  private shouldBeOpen: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private maxReconnectAttempts: number = 3;

  // Çağrı odaklanma sınırlayıcısı: Aynı numara için 10 saniyede en fazla 1 kez pencereyi öne getir
  private lastFocusedPhone: string | null = null;
  private lastFocusedTime: number = 0;

  private status: SerialStatus = {
    isOpen: false,
    port: null,
    baudRate: null,
    error: null,
  };

  constructor(config?: DesktopConfig) {
    if (config) this.config = config;

    this.streamBuffer = new CallerIdStreamBuffer({
      onLine: (line, escaped) => {
        this.emitData({ raw: line, escaped });
      },
      onCall: (phone) => {
        this.handleIncomingCall(phone);
      },
    });
  }

  public setConfig(config: DesktopConfig) {
    this.config = config;
  }

  public setMainWindow(win: BrowserWindow) {
    this.mainWindow = win;
  }

  public getStatus(): SerialStatus {
    return { ...this.status };
  }

  /**
   * Bilgisayardaki mevcut COM portlarını listeler.
   */
  public async listPorts(): Promise<SerialPortInfo[]> {
    try {
      const ports = await SerialPort.list();
      return ports.map((p) => ({
        path: p.path,
        manufacturer: p.manufacturer,
        vendorId: p.vendorId,
        productId: p.productId,
      }));
    } catch (err: any) {
      console.error("[SerialManager] Port listesi alınamadı:", err);
      return [];
    }
  }

  /**
   * Belirtilen COM portunu açar.
   * @param portName COM port adı (örn. COM1, COM3)
   * @param baudRate Baud rate (varsayılan 9600)
   * @param enableModemMode Modem AT komutlarının gönderilip gönderilmeyeceği (varsayılan false)
   */
  public async openPort(
    portName: string,
    baudRate: number = 9600,
    enableModemMode: boolean = false
  ): Promise<{ success: boolean; error?: string }> {
    const cleanPort = portName.trim().toUpperCase();

    // 1. Parametre Doğrulaması
    if (!COM_PORT_REGEX.test(cleanPort)) {
      const err = `Geçersiz COM port biçimi: "${portName}". (Örn: COM1, COM3)`;
      this.updateStatus({ error: err });
      return { success: false, error: err };
    }

    if (!ALLOWED_BAUD_RATES.includes(baudRate)) {
      const err = `Geçersiz Baud Rate: ${baudRate}. İzin verilenler: ${ALLOWED_BAUD_RATES.join(", ")}`;
      this.updateStatus({ error: err });
      return { success: false, error: err };
    }

    // İdempotent: Eğer zaten aynı port açık ve parametreler aynıysa bağlantıyı koru, tekrar açmaya çalışma
    if (
      this.currentPort &&
      this.currentPort.isOpen &&
      this.currentPortName === cleanPort &&
      this.currentBaudRate === baudRate &&
      this.currentModemMode === enableModemMode
    ) {
      return { success: true };
    }

    // Açık eski port varsa önce kapat
    await this.closePort();

    this.shouldBeOpen = true;
    this.currentPortName = cleanPort;
    this.currentBaudRate = baudRate;
    this.currentModemMode = enableModemMode;
    this.streamBuffer.reset();

    return new Promise((resolve) => {
      try {
        const port = new SerialPort({
          path: cleanPort,
          baudRate,
          autoOpen: false,
        });

        this.currentPort = port;

        port.on("data", (chunk: Buffer) => {
          const text = chunk.toString("latin1"); // Türkçe/ASCII karakter setleri
          this.streamBuffer.feed(text);
        });

        port.on("error", (err: Error) => {
          const friendlyError = this.translateError(cleanPort, err);
          console.error(`[SerialManager] Hata (${cleanPort}):`, friendlyError);
          this.updateStatus({ error: friendlyError, isOpen: false });

          // Beklenmedik bağlantı kopmalarında yeniden bağlanmayı dene
          if (this.shouldBeOpen && !this.reconnectTimer) {
            this.scheduleReconnect();
          }
        });

        port.on("close", () => {
          console.log(`[SerialManager] Port kapandı: ${cleanPort}`);
          const wasOpen = this.status.isOpen;
          this.updateStatus({ isOpen: false });

          if (this.shouldBeOpen && wasOpen && !this.reconnectTimer) {
            this.scheduleReconnect();
          }
        });

        port.open((err) => {
          if (err) {
            const friendly = this.translateError(cleanPort, err);
            console.warn(`[SerialManager] Port açılamadı (${cleanPort}):`, friendly);
            this.updateStatus({
              isOpen: false,
              port: cleanPort,
              baudRate,
              error: friendly,
            });
            resolve({ success: false, error: friendly });
            return;
          }

          console.log(`[SerialManager] Port başarıyla açıldı: ${cleanPort} (${baudRate} baud, Modem Modu: ${enableModemMode})`);
          this.reconnectAttempts = 0;
          this.updateStatus({
            isOpen: true,
            port: cleanPort,
            baudRate,
            error: null,
            reconnecting: false,
          });

          // Modem modu yalnızca kullanıcı ayarlarından özellikle açıldıysa AT komutu gönderilir
          if (enableModemMode) {
            this.sendPredefinedCommand("ENABLE_CID_VCID");
          }

          resolve({ success: true });
        });
      } catch (err: any) {
        const friendly = this.translateError(cleanPort, err);
        this.updateStatus({ error: friendly, isOpen: false });
        resolve({ success: false, error: friendly });
      }
    });
  }

  /**
   * Açık portu kapatır.
   */
  public async closePort(): Promise<{ success: boolean; error?: string }> {
    this.shouldBeOpen = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;

    if (!this.currentPort) {
      this.updateStatus({ isOpen: false, error: null });
      return { success: true };
    }

    return new Promise((resolve) => {
      const port = this.currentPort;
      this.currentPort = null;

      if (!port || !port.isOpen) {
        this.updateStatus({ isOpen: false, error: null });
        resolve({ success: true });
        return;
      }

      port.close((err) => {
        this.updateStatus({ isOpen: false, error: null });
        if (err) {
          console.warn("[SerialManager] Port kapatılırken uyarı:", err.message);
        }
        resolve({ success: true });
      });
    });
  }

  /**
   * Cihaza sadece izinli sabit AT komutlarını gönderir.
   */
  public sendPredefinedCommand(commandKey: keyof typeof ALLOWED_AT_COMMANDS) {
    const cmd = ALLOWED_AT_COMMANDS[commandKey];
    if (!cmd || !this.currentPort || !this.currentPort.isOpen) return;

    try {
      this.currentPort.write(cmd, (err) => {
        if (!err) {
          console.log(`[SerialManager] Sabit komut gönderildi: ${commandKey}`);
        }
      });
    } catch {}
  }

  /**
   * Çağrı geldiğinde: Pencereyi öne getirir (10 saniye aralıkla) ve web'e numarayı iletir.
   */
  private handleIncomingCall(phone: string) {
    console.log(`[SerialManager] 📞 Çağrı yakalandı: ${phone}`);

    const now = Date.now();
    // Aynı numara için 10 saniye içinde mükerrer pencere fırlatmasını engelle
    const isSamePhoneRecent =
      this.lastFocusedPhone === phone && now - this.lastFocusedTime < 10000;

    if (!isSamePhoneRecent) {
      this.lastFocusedPhone = phone;
      this.lastFocusedTime = now;

      // Pencereyi öne getir
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        if (this.mainWindow.isMinimized()) {
          this.mainWindow.restore();
        }
        if (!this.mainWindow.isVisible()) {
          this.mainWindow.show();
        }
        this.mainWindow.focus();

        // En fazla 3 saniye en üstte tut (kullanıcıyı kilitlememek için)
        this.mainWindow.setAlwaysOnTop(true);
        setTimeout(() => {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.setAlwaysOnTop(false);
          }
        }, 3000);
      }
    }

    // Web arayüzüne her zaman bildir (web tarafında müşteri kartını açma mantığı çalışır)
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("callerid:incoming", phone);
    }
  }

  /**
   * Ham veriyi web arayüzüne IPC ile aktarır.
   */
  private emitData(payload: { raw: string; escaped: string }) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("serial:data", payload);
    }
  }

  /**
   * Durum değişikliğini web arayüzüne bildirir.
   */
  private updateStatus(partial: Partial<SerialStatus>) {
    this.status = { ...this.status, ...partial };
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("serial:status", this.status);
    }
  }

  /**
   * Cihaz çıkarılınca veya bağlantı kopunca artan süreyle 3 kez yeniden bağlanmayı dener.
   * 3 denemeden sonra otomatik deneme durur; kullanıcı "Yeniden Bağlan" butonunu kullanabilir.
   */
  private scheduleReconnect() {
    if (!this.shouldBeOpen || !this.currentPortName) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      const err = `${this.currentPortName} bağlantısı koptu. ${this.maxReconnectAttempts} deneme yapıldı ve durduruldu. Cihazı kontrol edip 'Yeniden Bağlan' butonuna tıklayın.`;
      console.warn(`[SerialManager] ${err}`);
      this.updateStatus({ error: err, reconnecting: false });
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 8000);

    console.log(
      `[SerialManager] Yeniden bağlanma denemesi ${this.reconnectAttempts}/${this.maxReconnectAttempts} (${delay}ms sonra)...`
    );

    this.updateStatus({
      reconnecting: true,
      error: `Cihaz bağlantısı koptu. Yeniden bağlanılıyor (${this.reconnectAttempts}/${this.maxReconnectAttempts})…`,
    });

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.shouldBeOpen && this.currentPortName && this.currentBaudRate) {
        await this.openPort(this.currentPortName, this.currentBaudRate, this.currentModemMode);
      }
    }, delay);
  }

  /**
   * Sistem hatalarını anlaşılır Türkçe mesajlara çevirir.
   */
  private translateError(port: string, err: any): string {
    const msg = (err?.message || String(err)).toLowerCase();

    if (
      msg.includes("access is denied") ||
      msg.includes("ebusy") ||
      msg.includes("eacces") ||
      msg.includes("permission denied")
    ) {
      return `${port} portu başka bir program tarafından kullanılıyor (örn. Vega vb.). Lütfen portu kullanan diğer programı kapatıp tekrar deneyin.`;
    }

    if (msg.includes("file not found") || msg.includes("cannot open")) {
      return `${port} portu bulunamadı. Cihazın bilgisayara bağlı olduğundan ve sürücüsünün yüklü olduğundan emin olun.`;
    }

    return `${port} bağlantı hatası: ${err?.message || "Bilinmeyen hata"}`;
  }

  /**
   * Sahte Cihaz Modu (Geliştirme / Test İçin)
   * Yalnızca config.mockSerial: true olduğunda çalışır.
   */
  public triggerMockSample(sampleType: "a" | "b" | "c" | "d" | "e" = "b") {
    if (!this.config?.mockSerial) {
      throw new Error("Sahte seri cihaz modu devre dışı (desktop/config.json -> mockSerial: false).");
    }

    console.log(`[SerialManager MOCK] Sahte çağrı simülasyonu başlatılıyor (Format: ${sampleType})`);

    const samples: Record<string, string[]> = {
      // (a) Düz numara satırı
      a: ["0555", "1234", "567\r\n"],
      // (b) NMBR formatı
      b: ["NM", "BR = 0532", "9998877\r\n"],
      // (c) Modem +CLIP formatı
      c: ["RING\r\n", '+CLIP: "0544', '3332211",128', "\r\n"],
      // (d) Çok satırlı Bell202 formatı
      d: [
        "DATE = 1015\r\n",
        "TIME = 0715\r\n",
        "NMBR = ",
        "0505",
        "1112233\r\n",
      ],
      // (e) CALLER ID formatı
      e: ["CALLER ID: ", "0533", "7778899\r\n"],
    };

    const chunks = samples[sampleType] || samples.b;
    let delay = 0;

    chunks.forEach((chunk, index) => {
      delay += index === 0 ? 50 : 150;
      setTimeout(() => {
        this.streamBuffer.feed(chunk);
      }, delay);
    });
  }
}
