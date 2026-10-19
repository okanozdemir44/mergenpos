import fs from "fs";
import path from "path";
import { BrowserWindow } from "electron";
import * as koffi from "koffi";
import { logger } from "./logger";

export interface CallerIdInfo {
  serial: string;
  line: string;
  phone: string;
  dateTime: string;
  other: string;
}

export interface CallerIdServiceStatus {
  loaded: boolean;
  dllPath: string | null;
  isRunning: boolean;
  architecture: string;
  deviceConnected: boolean;
  lastCall: CallerIdInfo | null;
  lastCallTime: number | null;
  error: string | null;
}

// Koffi tip çakışmasını önlemek için modül düzeyinde tek seferlik tanımlanır
const CidCallbackProto = koffi.proto(
  "void (str16 serial, str16 line, str16 phone, str16 dateTime, str16 other)"
);
const SigCallbackProto = koffi.proto(
  "void (str16 model, str16 serial, int s1, int s2, int s3, int s4)"
);

export class CallerIdService {
  private mainWindow: BrowserWindow | null = null;
  private dllPath: string | null = null;
  private lib: any = null;

  // DLL fonksiyonları
  private fnCidStart: (() => void) | null = null;
  private fnSetEvents: ((cidCb: any, sigCb: any) => void) | null = null;
  private fnCidData: (() => string) | null = null;
  private fnDeviceSignal: (() => string) | null = null;

  // Koffi geri çağırma referansları (Garbage collection engellemek için)
  private registeredCidCb: any = null;
  private registeredSigCb: any = null;

  // Zamanlayıcılar
  private pollTimer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private deviceConnected: boolean = false;

  // Çağrı tekilleştirme (aynı numara kısa sürede birden fazla tetiklenmesin)
  private lastPhone: string | null = null;
  private lastPhoneTime: number = 0;
  private lastCallInfo: CallerIdInfo | null = null;
  private lastError: string | null = null;

  constructor() {
    this.dllPath = this.resolveDllPath();
  }

  public setMainWindow(win: BrowserWindow | null) {
    this.mainWindow = win;
  }

  /**
   * Paketleme (asar/unpacked), geliştirme ve çalışma dizinlerinde cid.dll dosyasını arar.
   */
  public resolveDllPath(): string | null {
    const candidatePaths = [
      // 1. Electron-builder unpacked dizini (üretim ortamı)
      process.resourcesPath
        ? path.join(process.resourcesPath, "app.asar.unpacked", "assets", "cid.dll")
        : "",
      process.resourcesPath ? path.join(process.resourcesPath, "assets", "cid.dll") : "",
      process.resourcesPath ? path.join(process.resourcesPath, "cid.dll") : "",

      // 2. Geliştirme ortamı (dist-electron/main içerisinden "../../assets/cid.dll")
      path.join(__dirname, "../../assets/cid.dll"),
      path.join(__dirname, "../assets/cid.dll"),

      // 3. Çalışma dizini kökü (desktop veya proje kökü)
      path.join(process.cwd(), "desktop", "assets", "cid.dll"),
      path.join(process.cwd(), "assets", "cid.dll"),
      path.join(process.cwd(), "cid.dll"),

      // 4. Proje ana kökü
      path.join(process.cwd(), "..", "cid.dll"),
    ].filter(Boolean);

    for (const p of candidatePaths) {
      try {
        if (fs.existsSync(p)) {
          logger.info(`[CallerIdService] cid.dll bulundu: ${p}`);
          return p;
        }
      } catch {
        // İzin veya yol hatası durumunda devam et
      }
    }

    logger.warn("[CallerIdService] cid.dll aranan hiçbir konumda bulunamadı.");
    return null;
  }

  /**
   * DLL dosyasını Koffi ile yükler ve fonksiyon/prototip tanımlarını bağlar.
   */
  public load(): boolean {
    if (this.lib) return true;

    if (!this.dllPath) {
      this.dllPath = this.resolveDllPath();
    }

    if (!this.dllPath || !fs.existsSync(this.dllPath)) {
      this.lastError = "cid.dll dosyası bulunamadı";
      logger.error(`[CallerIdService] ${this.lastError}`);
      this.emitLog(`[CID-HID HATA] ${this.lastError}`, "error");
      return false;
    }

    try {
      logger.info(`[CallerIdService] Koffi ile DLL yükleniyor: ${this.dllPath}`);
      this.lib = koffi.load(this.dllPath);

      // Fonksiyon prototipleri
      this.fnCidStart = this.lib.func("void CidStart()");
      this.fnCidData = this.lib.func("str16 CidData()");
      this.fnDeviceSignal = this.lib.func("str16 DeviceSignal()");
      this.fnSetEvents = this.lib.func("void SetEvents(void *onCid, void *onSig)");

      this.lastError = null;
      logger.info("[CallerIdService] cid.dll ve fonksiyonlar başarıyla yüklendi.");
      this.emitLog("[CID-HID] USB Caller ID DLL kütüphanesi başarıyla bağlandı.", "info");
      return true;
    } catch (err: any) {
      this.lastError = `DLL yüklenemedi: ${err?.message || String(err)}`;
      logger.error(`[CallerIdService] ${this.lastError}`);
      this.emitLog(`[CID-HID HATA] ${this.lastError}`, "error");
      return false;
    }
  }

  /**
   * Cihaz dinleme servisini başlatır.
   */
  public start(): boolean {
    if (this.isRunning) return true;

    if (!this.load()) {
      return false;
    }

    try {
      // 1. Cihazı başlat
      if (this.fnCidStart) {
        this.fnCidStart();
      }

      // Callback'leri hazırla
      if (!this.registeredCidCb) {
        this.registeredCidCb = koffi.register((serial: string, line: string, phone: string, dateTime: string, other: string) => {
          this.onCidEvent(serial, line, phone, dateTime, other);
        }, koffi.pointer(CidCallbackProto));
      }

      if (!this.registeredSigCb) {
        this.registeredSigCb = koffi.register((model: string, serial: string, s1: number, s2: number, s3: number, s4: number) => {
          this.onSigEvent(model, serial, s1, s2, s3, s4);
        }, koffi.pointer(SigCallbackProto));
      }

      // 2. Olay dinleyicilerini kaydet
      if (this.fnSetEvents && this.registeredCidCb && this.registeredSigCb) {
        this.fnSetEvents(this.registeredCidCb, this.registeredSigCb);
      }

      // 3. Çift güvenlik: CidData kuyruğunu düzenli olarak kontrol eden yoklama döngüsü (250ms)
      this.pollTimer = setInterval(() => {
        this.pollCidQueue();
      }, 250);

      this.isRunning = true;
      logger.info("[CallerIdService] Caller ID servisi ve yoklama döngüsü başlatıldı.");
      this.emitLog("[CID-HID] USB Caller ID cihazı aktif dinlemede.", "info");
      return true;
    } catch (err: any) {
      this.lastError = `Servis başlatma hatası: ${err?.message || String(err)}`;
      logger.error(`[CallerIdService] ${this.lastError}`);
      this.emitLog(`[CID-HID HATA] ${this.lastError}`, "error");
      return false;
    }
  }

  /**
   * Servisi ve arka plan yoklama döngüsünü durdurur.
   */
  public stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    // DLL içindeki iş parçacıklarını askıya al (suspend) ve geri çağırmaları temizle
    if (this.fnSetEvents) {
      try {
        this.fnSetEvents(null, null);
      } catch (err: any) {
        logger.warn(`[CallerIdService] fnSetEvents(null, null) çağrılırken hata: ${err?.message}`);
      }
    }

    if (this.registeredCidCb) {
      try {
        koffi.unregister(this.registeredCidCb);
      } catch {}
      this.registeredCidCb = null;
    }

    if (this.registeredSigCb) {
      try {
        koffi.unregister(this.registeredSigCb);
      } catch {}
      this.registeredSigCb = null;
    }

    this.isRunning = false;
    logger.info("[CallerIdService] Caller ID servisi durduruldu.");
    this.emitLog("[CID-HID] USB Caller ID cihazı durduruldu.", "warn");
  }

  /**
   * DLL içindeki CidData kuyruğunu yoklar.
   * Eğer kuyrukta çağrı varsa virgülle ayrılmış alanları ayıklar:
   * (DeviceSerial, Line, PhoneNumber, DateTime, Other)
   */
  private pollCidQueue() {
    if (!this.fnCidData) return;

    try {
      const dataStr = this.fnCidData();
      if (dataStr && typeof dataStr === "string" && dataStr.trim().length > 0) {
        logger.info(`[CallerIdService] CidData() verisi yakalandı: "${dataStr}"`);
        const parts = dataStr.split(",");
        const serial = parts[0]?.trim() || "";
        const line = parts[1]?.trim() || "1";
        const phone = parts[2]?.trim() || "";
        const dateTime = parts[3]?.trim() || "";
        const other = parts.slice(4).join(",").trim() || "";

        if (phone) {
          this.handleDetectedCall({
            serial,
            line,
            phone,
            dateTime,
            other,
          }, "CidDataQueue");
        }
      }
    } catch (err: any) {
      logger.warn(`[CallerIdService] pollCidQueue hatası: ${err?.message || String(err)}`);
    }
  }

  /**
   * DLL tarafından tetiklenen doğrudan çağrı geri çağırması (SetEvents -> CidCallback)
   */
  private onCidEvent(serial: string, line: string, phone: string, dateTime: string, other: string) {
    logger.info(`[CallerIdService] onCidEvent tetiklendi: Phone="${phone}", Line="${line}", Serial="${serial}"`);
    this.handleDetectedCall({
      serial: serial || "",
      line: line || "1",
      phone: phone || "",
      dateTime: dateTime || "",
      other: other || "",
    }, "DirectCallback");
  }

  /**
   * Cihaz donanım ve sinyal durum geri çağırması (SetEvents -> SigCallback)
   */
  private onSigEvent(model: string, serial: string, s1: number, s2: number, s3: number, s4: number) {
    // Sinyal geldiğinde cihazın takılı ve çalıştığını biliyoruz
    if (!this.deviceConnected) {
      this.deviceConnected = true;
      logger.info(`[CallerIdService] USB Caller ID cihazı sinyal gönderiyor (Model: ${model || "Genel"}, Seri: ${serial || "-"})`);
      this.emitLog(`[CID-HID] USB Cihaz bağlandı: Model=${model || "Genel"} Seri=${serial || "-"}`, "info");
    }
  }

  /**
   * Yakalanan çağrıyı temizler, tekilleştirir, pencereyi öne getirir
   * ve web arayüzündeki incomingCall() zincirine aktarır.
   */
  private handleDetectedCall(call: CallerIdInfo, source: "DirectCallback" | "CidDataQueue") {
    // Numarayı temizle (yalnızca rakamlar ve varsa başında artı)
    let cleanPhone = call.phone.replace(/[^\d+]/g, "").trim();

    // 0090 ile başlıyorsa yerel formata (0) çevir
    if (cleanPhone.startsWith("0090")) {
      cleanPhone = "0" + cleanPhone.slice(4);
    }

    if (!cleanPhone || cleanPhone.length < 3) {
      logger.warn(`[CallerIdService] Geçersiz numara yok sayıldı: "${call.phone}"`);
      return;
    }

    // Tekilleştirme: Aynı numara için 5 saniye içinde tekrar tetikleme
    const now = Date.now();
    if (this.lastPhone === cleanPhone && now - this.lastPhoneTime < 5000) {
      logger.info(`[CallerIdService] Mükerrer çağrı engellendi (${source}): ${cleanPhone}`);
      return;
    }

    this.lastPhone = cleanPhone;
    this.lastPhoneTime = now;
    this.lastCallInfo = { ...call, phone: cleanPhone };

    logger.info(`[CallerIdService] >>> YENİ ÇAĞRI İŞLENİYOR: ${cleanPhone} (Hat: ${call.line}) <<<`);
    this.emitLog(`[CID-HID ÇAĞRI] Tel: ${cleanPhone} | Hat: ${call.line} (${call.dateTime || "Şimdi"})`, "call");

    // 1. Pencereyi öne getir ve dikkat çek
    this.focusMainWindow();

    // 2. Web tarafındaki `onIncomingCall` dinleyicisine ilet
    // (src/context/CallerIdContext.tsx dosyasındaki incomingCall(cleanPhone) fonksiyonunu tetikler)
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("callerid:incoming", cleanPhone);
    }
  }

  /**
   * Yeni çağrı geldiğinde Electron penceresini öne getirir.
   */
  private focusMainWindow() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    try {
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }
      if (!this.mainWindow.isVisible()) {
        this.mainWindow.show();
      }
      this.mainWindow.focus();

      // Kullanıcı deneyimini bozmamak adına 3 saniyeliğine en üstte tut
      this.mainWindow.setAlwaysOnTop(true);
      setTimeout(() => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.setAlwaysOnTop(false);
        }
      }, 3000);
    } catch (err: any) {
      logger.warn(`[CallerIdService] Pencere öne getirilemedi: ${err?.message}`);
    }
  }

  /**
   * Web arayüzünün görebileceği ortak log kanalına iletir.
   */
  private emitLog(text: string, type: "info" | "call" | "warn" | "error" = "info") {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("serial:log", { text, type });
    }
  }

  /**
   * Servis durumunu döndürür.
   */
  public getStatus(): CallerIdServiceStatus {
    return {
      loaded: Boolean(this.lib),
      dllPath: this.dllPath,
      isRunning: this.isRunning,
      architecture: process.arch, // "x64"
      deviceConnected: this.deviceConnected,
      lastCall: this.lastCallInfo,
      lastCallTime: this.lastPhoneTime || null,
      error: this.lastError,
    };
  }
}
