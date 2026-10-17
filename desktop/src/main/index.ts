import { app, BrowserWindow, ipcMain } from "electron";
import fs from "fs";
import path from "path";
import { loadConfig } from "./config";
import { setupSecurity, setupSessionPermissions } from "./security";
import { setupTray, showAndFocus } from "./tray";
import { SerialManager } from "./serialManager";
import { PrintManager } from "./printManager";
import { logger, setupExceptionHandlers } from "./logger";
import { setupAutoUpdater } from "./updater";

// Global hata yakalama
setupExceptionHandlers();

// Chromium autoplay politikasını kaldır: arama geldiğinde zil sesi kullanıcı tıklaması beklemeden çalsın
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

// 1. Tek Instance Kilidi
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let retryTimer: NodeJS.Timeout | null = null;

const config = loadConfig();
const serialManager = new SerialManager(config);
const printManager = new PrintManager();

function createWindow(): BrowserWindow {
  const icoPath = path.join(__dirname, "../../assets/icon.ico");
  const pngPath = path.join(__dirname, "../../assets/icon.png");
  const iconPath = fs.existsSync(icoPath) ? icoPath : pngPath;

  const win = new BrowserWindow({
    title: config.appName,
    width: config.window.width,
    height: config.window.height,
    minWidth: config.window.minWidth,
    minHeight: config.window.minHeight,
    kiosk: Boolean(config.window.kiosk),
    fullscreen: Boolean(config.window.fullscreen),
    autoHideMenuBar: true,
    icon: iconPath,
    show: false, // Hazır olunca göster
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
    },
  });

  win.setMenuBarVisibility(false);

  if (config.window.maximizeOnStart && !config.window.kiosk && !config.window.fullscreen) {
    win.maximize();
  }

  // Güvenlik kurallarını pencereye uygula
  setupSecurity(win.webContents, config.appUrl);

  // Kısayollar: F11 Tam Ekran, F5 Yenileme
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown") {
      if (input.key === "F11") {
        win.setFullScreen(!win.isFullScreen());
        event.preventDefault();
      } else if (input.key === "F5") {
        win.reload();
        event.preventDefault();
      }
    }
  });

  // Yükleme Başarılı
  win.webContents.on("did-finish-load", () => {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  });

  // İnternet Yok / Yükleme Hatası Durumu
  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    // İptal edilen istekleri yok say (örn. yeni bir loadURL çağrıldığında önceki iptal olur)
    if (errorCode === -3) return;

    console.warn(`[Bağlantı Hatası] ${validatedURL}: ${errorDescription} (${errorCode})`);

    const offlinePath = path.join(__dirname, "../../assets/offline.html");
    const offlineUrl = `file://${offlinePath}?target=${encodeURIComponent(config.appUrl)}`;

    // Henüz offline sayfasında değilsek offline sayfasını yükle
    if (!win.webContents.getURL().includes("offline.html")) {
      console.log(`[Offline Ekranı] offline.html devreye alındı. Hedef: ${config.appUrl}`);
      win.loadURL(offlineUrl).catch(() => {});
    }

    // Belirlenen aralıkta (varsayılan 5 sn) hedef URL'ye yeniden bağlanmayı dene
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      console.log(`[Yeniden Deneniyor] Hedef: ${config.appUrl}`);
      win.loadURL(config.appUrl).catch(() => {});
    }, config.retryIntervalMs || 5000);
  });

  // Pencere "X" ile kapatılınca arka planda kalsın
  win.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
      console.log("[Pencere] Arka plana (sistem tepsisine) gizlendi.");
    }
  });

  win.once("ready-to-show", () => {
    const bounds = win.getBounds();
    console.log(`[Pencere] Hazır ve gösterildi: "${win.getTitle()}" (${bounds.width}x${bounds.height})`);
    win.show();
    win.focus();
  });

  // Hedef URL'yi yükle
  win.loadURL(config.appUrl).catch((err) => {
    console.warn("[İlk Yükleme] URL yüklenemedi:", err.message);
  });

  return win;
}

// İkinci instance açılmak istendiğinde mevcut pencereyi öne getir
app.on("second-instance", () => {
  if (mainWindow) {
    showAndFocus(mainWindow);
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  serialManager.closePort().catch(() => {});
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
});

app.whenReady().then(() => {
  // Oturum izin yöneticisini kur
  setupSessionPermissions();

  // IPC: Konfigürasyon
  ipcMain.handle("desktop:get-config", () => {
    return config;
  });

  // IPC: Seri Port
  ipcMain.handle("serial:list-ports", async () => {
    return serialManager.listPorts();
  });

  ipcMain.handle("serial:open", async (_event, { port, baudRate, enableModemMode, signals }) => {
    return serialManager.openPort(port, baudRate, enableModemMode, signals);
  });

  ipcMain.handle("serial:close", async () => {
    return serialManager.closePort();
  });

  ipcMain.handle("serial:status", async () => {
    return serialManager.getStatus();
  });

  ipcMain.handle("serial:set-signals", async (_event, signals) => {
    return serialManager.setSignals(signals);
  });

  ipcMain.handle("serial:start-baud-scan", async (_event, { port, signals }) => {
    return serialManager.scanBaudRates(port, signals);
  });

  ipcMain.handle("serial:stop-baud-scan", async () => {
    serialManager.stopBaudScan();
    return { success: true };
  });

  ipcMain.handle("serial:trigger-mock", async (_event, sampleType) => {
    return serialManager.triggerMockSample(sampleType);
  });

  // IPC: Fiş Yazdırma
  ipcMain.handle("print:list-printers", async () => {
    return printManager.listPrinters();
  });

  ipcMain.handle("print:print-html", async (_event, options) => {
    return printManager.printHtml(options);
  });

  // Windows başlangıç ayarı (config'te tanımlıysa uygula)
  if (config.autoStartOnBoot) {
    const loginSettings = app.getLoginItemSettings();
    if (!loginSettings.openAtLogin) {
      app.setLoginItemSettings({ openAtLogin: true, openAsHidden: false });
    }
  }

  mainWindow = createWindow();
  serialManager.setMainWindow(mainWindow);
  printManager.setMainWindow(mainWindow);

  // Otomatik güncelleme altyapısını başlat
  setupAutoUpdater(mainWindow);

  // Sistem Tepsisi (Tray) kur
  setupTray(mainWindow, config, () => {
    isQuitting = true;
    serialManager.closePort().catch(() => {});
    app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      serialManager.setMainWindow(mainWindow);
      printManager.setMainWindow(mainWindow);
    } else if (mainWindow) {
      showAndFocus(mainWindow);
    }
  });
});

app.on("window-all-closed", () => {
  // Arka planda çalışmaya devam etmesi için Windows'ta quit çağırmıyoruz
});
