import { app, BrowserWindow, Menu, Tray, nativeImage } from "electron";
import path from "path";
import fs from "fs";
import { DesktopConfig } from "../types/desktop";
import { logger } from "./logger";
import { checkForUpdatesManual } from "./updater";

let tray: Tray | null = null;

export function setupTray(
  mainWindow: BrowserWindow,
  config: DesktopConfig,
  onQuit: () => void
): Tray {
  if (tray) return tray;

  const icoPath = path.join(__dirname, "../../assets/icon.ico");
  const pngPath = path.join(__dirname, "../../assets/tray.png");
  const iconPath = fs.existsSync(icoPath) ? icoPath : pngPath;
  const icon = nativeImage.createFromPath(iconPath);

  tray = new Tray(icon);
  tray.setToolTip(config.appName || "Mergen POS");

  const updateMenu = () => {
    const isAutoStart = app.getLoginItemSettings().openAtLogin;

    const appVer = app.getVersion();
    const contextMenu = Menu.buildFromTemplate([
      {
        label: `${config.appName} Ekranını Aç`,
        click: () => {
          showAndFocus(mainWindow);
        },
      },
      { type: "separator" },
      {
        label: `Hakkında: ${config.appName} v${appVer}`,
        sublabel: config.appUrl,
        click: () => {
          showAndFocus(mainWindow);
        },
      },
      {
        label: "Güncellemeleri Denetle…",
        click: () => {
          checkForUpdatesManual(mainWindow);
        },
      },
      {
        label: "Hata Günlük Klasörünü Aç",
        click: () => {
          logger.openLogsFolder();
        },
      },
      { type: "separator" },
      {
        label: "Windows ile Birlikte Başlat",
        type: "checkbox",
        checked: isAutoStart,
        click: (menuItem) => {
          app.setLoginItemSettings({
            openAtLogin: menuItem.checked,
            openAsHidden: false,
          });
          updateMenu();
        },
      },
      { type: "separator" },
      {
        label: "Tamamen Çık",
        click: () => {
          onQuit();
        },
      },
    ]);

    tray?.setContextMenu(contextMenu);
  };

  updateMenu();
  console.log(`[Sistem Tepsisi] Tepsi ikonu (${config.appName}) ve bağlam menüsü başarıyla oluşturuldu.`);

  // Çift tıklamada pencereyi öne getir
  tray.on("double-click", () => {
    showAndFocus(mainWindow);
  });

  tray.on("click", () => {
    showAndFocus(mainWindow);
  });

  return tray;
}

export function showAndFocus(window: BrowserWindow) {
  if (window.isMinimized()) {
    window.restore();
  }
  if (!window.isVisible()) {
    window.show();
  }
  window.focus();
}
