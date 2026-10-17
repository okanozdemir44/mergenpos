import { BrowserWindow } from "electron";
import { SerialPort } from "serialport";
import { CallerIdStreamBuffer } from "../callerIdParser";
import {
  BaudScanItem,
  DesktopConfig,
  SerialPortInfo,
  SerialRawEvent,
  SerialSignals,
  SerialStatus,
  SignalSettings,
} from "../types/desktop";

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
  private currentSignalsConfig: SignalSettings = { dtr: "default", rts: "default" };
  private mainWindow: BrowserWindow | null = null;
  private config: DesktopConfig | null = null;

  private streamBuffer: CallerIdStreamBuffer;
  private shouldBeOpen: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private maxReconnectAttempts: number = 3;

  // Sinyal izleme (CTS, DSR, CD, RI)
  private signalPollTimer: NodeJS.Timeout | null = null;
  private lastSignals: SerialSignals | null = null;

  // Baud tarama
  private isBaudScanning: boolean = false;
  private stopBaudScanRequested: boolean = false;

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
   * @param signals DTR ve RTS sinyal ayarları ("default" | "on" | "off")
   */
  public async openPort(
    portName: string,
    baudRate: number = 9600,
    enableModemMode: boolean = false,
    signals?: SignalSettings
  ): Promise<{ success: boolean; error?: string }> {
    if (signals) {
      this.currentSignalsConfig = { ...this.currentSignalsConfig, ...signals };
    }

    const cleanPort = portName.trim().toUpperCase();

    // 1. Parametre Doğrulaması
    if (!COM_PORT_REGEX.test(cleanPort)) {
      const err = `Geçersiz COM port biçimi: "${portName}". (Örn: COM1, COM3)`;
      this.updateStatus({ error: err });
      this.emitLog(`[PORT HATA] ${err}`, "error");
      return { success: false, error: err };
    }

    if (!ALLOWED_BAUD_RATES.includes(baudRate)) {
      const err = `Geçersiz Baud Rate: ${baudRate}. İzin verilenler: ${ALLOWED_BAUD_RATES.join(", ")}`;
      this.updateStatus({ error: err });
      this.emitLog(`[PORT HATA] ${err}`, "error");
      return { success: false, error: err };
    }

    // İdempotent: Eğer zaten aynı port açık ve parametreler aynıysa sinyalleri güncelle, tekrar açmaya çalışma
    if (
      this.currentPort &&
      this.currentPort.isOpen &&
      this.currentPortName === cleanPort &&
      this.currentBaudRate === baudRate &&
      this.currentModemMode === enableModemMode
    ) {
      await this.applySignalsToOpenPort();
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
          // 1. Ham veriyi tampon ya da parser beklemeden ms zaman damgası, HEX ve ASCII ile log'a gönder
          const now = new Date();
          const ts =
            now.toTimeString().split(" ")[0] +
            "." +
            String(now.getMilliseconds()).padStart(3, "0");
          const hex = chunk.toString("hex").toUpperCase().match(/../g)?.join(" ") || "";
          let ascii = "";
          for (let i = 0; i < chunk.length; i++) {
            const b = chunk[i];
            ascii += b >= 32 && b <= 126 ? String.fromCharCode(b) : ".";
          }

          this.emitRawChunk({
            timestamp: ts,
            hex,
            ascii,
            len: chunk.length,
          });

          // 2. Parser tamponuna latin1 olarak aktar
          const text = chunk.toString("latin1");
          this.streamBuffer.feed(text);
        });

        port.on("error", (err: Error) => {
          const friendlyError = this.translateError(cleanPort, err);
          console.error(`[SerialManager] Hata (${cleanPort}):`, friendlyError);
          this.updateStatus({ error: friendlyError, isOpen: false });
          this.emitLog(`[PORT HATA] ${friendlyError}`, "error");

          // Beklenmedik bağlantı kopmalarında yeniden bağlanmayı dene
          if (this.shouldBeOpen && !this.reconnectTimer && !this.isBaudScanning) {
            this.scheduleReconnect();
          }
        });

        port.on("close", () => {
          console.log(`[SerialManager] Port kapandı: ${cleanPort}`);
          this.stopSignalPolling();
          const wasOpen = this.status.isOpen;
          this.updateStatus({ isOpen: false });
          this.emitLog(`[PORT KAPANDI] ${cleanPort}`, "warn");

          if (this.shouldBeOpen && wasOpen && !this.reconnectTimer && !this.isBaudScanning) {
            this.scheduleReconnect();
          }
        });

        port.open(async (err) => {
          if (err) {
            const friendly = this.translateError(cleanPort, err);
            console.warn(`[SerialManager] Port açılamadı (${cleanPort}):`, friendly);
            this.updateStatus({
              isOpen: false,
              port: cleanPort,
              baudRate,
              error: friendly,
            });
            this.emitLog(`[PORT HATA] ${friendly}`, "error");
            resolve({ success: false, error: friendly });
            return;
          }

          console.log(
            `[SerialManager] Port başarıyla açıldı: ${cleanPort} (${baudRate} baud, Modem Modu: ${enableModemMode})`
          );
          this.reconnectAttempts = 0;
          this.updateStatus({
            isOpen: true,
            port: cleanPort,
            baudRate,
            error: null,
            reconnecting: false,
          });

          // Sinyalleri (DTR / RTS) uygula
          await this.applySignalsToOpenPort();

          // Sinyal pinlerini (CTS, DSR, CD, RI) periyodik 500ms okumaya başla
          this.startSignalPolling();

          const dtrLabel = this.currentSignalsConfig.dtr ?? "Varsayılan";
          const rtsLabel = this.currentSignalsConfig.rts ?? "Varsayılan";
          this.emitLog(
            `[PORT AÇILDI] ${cleanPort} (${baudRate} baud, DTR: ${dtrLabel}, RTS: ${rtsLabel})`,
            "info"
          );

          // Modem modu yalnızca kullanıcı ayarlarından özellikle açıldıysa AT komutu gönderilir
          if (enableModemMode) {
            this.sendPredefinedCommand("ENABLE_CID_VCID");
          }

          resolve({ success: true });
        });
      } catch (err: any) {
        const friendly = this.translateError(cleanPort, err);
        this.updateStatus({ error: friendly, isOpen: false });
        this.emitLog(`[PORT HATA] ${friendly}`, "error");
        resolve({ success: false, error: friendly });
      }
    });
  }

  /**
   * Açık portu kapatır.
   */
  public async closePort(): Promise<{ success: boolean; error?: string }> {
    this.shouldBeOpen = false;
    this.stopSignalPolling();

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
      const portName = this.currentPortName;
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
        if (portName) {
          this.emitLog(`[PORT KAPANDI] ${portName}`, "warn");
        }
        resolve({ success: true });
      });
    });
  }

  /**
   * DTR ve RTS sinyallerini ayarlar ve port açıkken anında uygular.
   */
  public async setSignals(
    signals: SignalSettings
  ): Promise<{ success: boolean; error?: string }> {
    this.currentSignalsConfig = { ...this.currentSignalsConfig, ...signals };
    return this.applySignalsToOpenPort();
  }

  private async applySignalsToOpenPort(): Promise<{ success: boolean; error?: string }> {
    if (!this.currentPort || !this.currentPort.isOpen) {
      return { success: true };
    }

    const setOpts: { dtr?: boolean; rts?: boolean } = {};
    if (this.currentSignalsConfig.dtr === "on") setOpts.dtr = true;
    else if (this.currentSignalsConfig.dtr === "off") setOpts.dtr = false;

    if (this.currentSignalsConfig.rts === "on") setOpts.rts = true;
    else if (this.currentSignalsConfig.rts === "off") setOpts.rts = false;

    if (Object.keys(setOpts).length === 0) {
      return { success: true };
    }

    return new Promise((resolve) => {
      this.currentPort!.set(setOpts, (err) => {
        if (err) {
          const msg = `Sinyal ayarlanamadı: ${err.message}`;
          console.warn("[SerialManager] Sinyal hatası:", msg);
          this.emitLog(`[SİNYAL HATA] ${msg}`, "error");
          resolve({ success: false, error: msg });
        } else {
          const dtrStr = this.currentSignalsConfig.dtr ?? "Varsayılan";
          const rtsStr = this.currentSignalsConfig.rts ?? "Varsayılan";
          this.emitLog(`[SİNYAL UYGULANDI] DTR: ${dtrStr}, RTS: ${rtsStr}`, "info");
          resolve({ success: true });
        }
      });
    });
  }

  /**
   * CTS, DSR, CD (ve varsa RI) pin durumlarını 500 ms'de bir okur,
   * değişimleri tespit edip log'a ve arayüze iletir.
   */
  private startSignalPolling() {
    this.stopSignalPolling();
    this.signalPollTimer = setInterval(() => {
      if (!this.currentPort || !this.currentPort.isOpen) {
        this.stopSignalPolling();
        return;
      }

      this.currentPort.get((err, status) => {
        if (err || !status) return;

        const currentSignals: SerialSignals = {
          cts: Boolean(status.cts),
          dsr: Boolean(status.dsr),
          cd: Boolean(status.dcd), // dcd pin corresponds to CD (Carrier Detect)
          ri: typeof (status as any).ri === "boolean" ? (status as any).ri : null,
        };

        if (!this.lastSignals) {
          this.lastSignals = currentSignals;
          this.emitSignals(currentSignals);
        } else if (
          this.lastSignals.cts !== currentSignals.cts ||
          this.lastSignals.dsr !== currentSignals.dsr ||
          this.lastSignals.cd !== currentSignals.cd ||
          this.lastSignals.ri !== currentSignals.ri
        ) {
          const changes: string[] = [];
          if (this.lastSignals.cts !== currentSignals.cts) {
            changes.push(`CTS:${currentSignals.cts ? "AÇIK" : "KAPALI"}`);
          }
          if (this.lastSignals.dsr !== currentSignals.dsr) {
            changes.push(`DSR:${currentSignals.dsr ? "AÇIK" : "KAPALI"}`);
          }
          if (this.lastSignals.cd !== currentSignals.cd) {
            changes.push(`CD:${currentSignals.cd ? "AÇIK" : "KAPALI"}`);
          }
          if (
            this.lastSignals.ri !== currentSignals.ri &&
            currentSignals.ri !== null
          ) {
            changes.push(`RI:${currentSignals.ri ? "AÇIK" : "KAPALI"}`);
          }

          this.lastSignals = currentSignals;
          this.emitSignals(currentSignals);
          this.emitLog(`[SİNYAL DEĞİŞİMİ] ${changes.join(", ")}`, "info");
        } else {
          this.emitSignals(currentSignals);
        }
      });
    }, 500);
  }

  private stopSignalPolling() {
    if (this.signalPollTimer) {
      clearInterval(this.signalPollTimer);
      this.signalPollTimer = null;
    }
    this.lastSignals = null;
    this.emitSignals(null);
  }

  /**
   * Baud Tarama: 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200 hızlarını
   * sırayla 8 sn dinler; her hızda gelen bayt sayısını ve yazdırılabilir karakter oranını bildirir.
   */
  public async scanBaudRates(
    portName: string,
    signals?: SignalSettings
  ): Promise<{ success: boolean; error?: string }> {
    if (this.isBaudScanning) {
      return { success: false, error: "Baud tarama işlemi zaten devam ediyor." };
    }

    const previousPort = this.currentPortName;
    const previousBaud = this.currentBaudRate;
    const previousModem = this.currentModemMode;
    const previousShouldBeOpen = this.shouldBeOpen;

    this.isBaudScanning = true;
    this.stopBaudScanRequested = false;

    // Mevcut portu kapat
    await this.closePort();

    this.emitLog(
      `[BAUD TARAMA BAŞLADI] ${portName} portunda 8 hız sırayla 8'er saniye dinleniyor...`,
      "info"
    );

    const baudList = ALLOWED_BAUD_RATES;

    try {
      for (const rate of baudList) {
        if (this.stopBaudScanRequested) {
          this.emitLog("[BAUD TARAMA İPTAL EDİLDİ] Kullanıcı tarafından durduruldu.", "warn");
          break;
        }

        let byteCount = 0;
        let printableCount = 0;
        let secondsLeft = 8;

        this.emitBaudProgress({
          baudRate: rate,
          status: "scanning",
          byteCount: 0,
          printableCount: 0,
          printableRatio: 0,
          secondsLeft,
        });

        // Portu bu hızda aç
        const port = new SerialPort({
          path: portName.trim().toUpperCase(),
          baudRate: rate,
          autoOpen: false,
        });

        let portOpenSuccess = false;

        await new Promise<void>((res) => {
          port.open((err) => {
            if (err) {
              console.warn(`[SerialManager Scan] ${rate} açılamadı:`, err.message);
              res();
              return;
            }
            portOpenSuccess = true;
            res();
          });
        });

        if (!portOpenSuccess) {
          this.emitBaudProgress({
            baudRate: rate,
            status: "failed",
            byteCount: 0,
            printableCount: 0,
            printableRatio: 0,
            secondsLeft: 0,
          });
          continue;
        }

        // Sinyalleri uygula
        const activeSignals = signals || this.currentSignalsConfig;
        const setOpts: { dtr?: boolean; rts?: boolean } = {};
        if (activeSignals.dtr === "on") setOpts.dtr = true;
        else if (activeSignals.dtr === "off") setOpts.dtr = false;
        if (activeSignals.rts === "on") setOpts.rts = true;
        else if (activeSignals.rts === "off") setOpts.rts = false;
        if (Object.keys(setOpts).length > 0) {
          await new Promise<void>((res) => port.set(setOpts, () => res()));
        }

        // Veri dinleme
        port.on("data", (chunk: Buffer) => {
          byteCount += chunk.length;
          for (let i = 0; i < chunk.length; i++) {
            const b = chunk[i];
            if ((b >= 32 && b <= 126) || b === 10 || b === 13 || b === 9) {
              printableCount++;
            }
          }

          // Anında raw log'a da yaz
          const now = new Date();
          const ts =
            now.toTimeString().split(" ")[0] +
            "." +
            String(now.getMilliseconds()).padStart(3, "0");
          const hex = chunk.toString("hex").toUpperCase().match(/../g)?.join(" ") || "";
          let ascii = "";
          for (let i = 0; i < chunk.length; i++) {
            const b = chunk[i];
            ascii += b >= 32 && b <= 126 ? String.fromCharCode(b) : ".";
          }
          this.emitRawChunk({ timestamp: ts, hex, ascii, len: chunk.length });

          const ratio = byteCount > 0 ? Number(((printableCount / byteCount) * 100).toFixed(1)) : 0;
          this.emitBaudProgress({
            baudRate: rate,
            status: "scanning",
            byteCount,
            printableCount,
            printableRatio: ratio,
            secondsLeft,
          });
        });

        // 8 saniye bekle (1'er saniyelik sayaçla)
        for (let s = 8; s > 0; s--) {
          if (this.stopBaudScanRequested) break;
          secondsLeft = s;
          const ratio = byteCount > 0 ? Number(((printableCount / byteCount) * 100).toFixed(1)) : 0;
          this.emitBaudProgress({
            baudRate: rate,
            status: "scanning",
            byteCount,
            printableCount,
            printableRatio: ratio,
            secondsLeft,
          });
          await new Promise((r) => setTimeout(r, 1000));
        }

        // Portu kapat
        await new Promise<void>((res) => {
          if (port.isOpen) {
            port.close(() => res());
          } else {
            res();
          }
        });

        const finalRatio = byteCount > 0 ? Number(((printableCount / byteCount) * 100).toFixed(1)) : 0;
        this.emitBaudProgress({
          baudRate: rate,
          status: "completed",
          byteCount,
          printableCount,
          printableRatio: finalRatio,
          secondsLeft: 0,
        });

        this.emitLog(
          `[BAUD TARAMA] ${rate} baud: ${byteCount} bayt alındı (Yazdırılabilir: %${finalRatio})`,
          byteCount > 0 ? "info" : "warn"
        );
      }
    } finally {
      this.isBaudScanning = false;
      this.emitLog("[BAUD TARAMA TAMAMLANDI]", "info");

      // Eğer önceki bağlantı açıktıysa eski ayarlarla yeniden bağlan
      if (previousShouldBeOpen && previousPort && previousBaud) {
        await this.openPort(
          previousPort,
          previousBaud,
          previousModem,
          this.currentSignalsConfig
        );
      }
    }

    return { success: true };
  }

  /**
   * Devam eden baud taramasını durdurur.
   */
  public stopBaudScan() {
    this.stopBaudScanRequested = true;
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
   * Her gelen chunk baytını anında ms zaman damgası, HEX ve ASCII ile web'e aktarır.
   */
  private emitRawChunk(payload: SerialRawEvent) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("serial:raw", payload);
    }
  }

  /**
   * Log mesajını doğrudan web log listesine ekler.
   */
  private emitLog(text: string, type: "info" | "call" | "warn" | "error" = "info") {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("serial:log", { text, type });
    }
  }

  /**
   * CTS, DSR, CD, RI sinyal durumlarını web arayüzüne aktarır.
   */
  private emitSignals(signals: SerialSignals | null) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("serial:signals", signals);
    }
  }

  /**
   * Baud tarama ilerleme durumunu web arayüzüne aktarır.
   */
  private emitBaudProgress(item: BaudScanItem) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("serial:baud-scan-progress", item);
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
