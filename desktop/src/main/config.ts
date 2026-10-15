import fs from "fs";
import path from "path";
import { app } from "electron";
import { DesktopConfig } from "../types/desktop";

const DEFAULT_CONFIG: DesktopConfig = {
  appName: "Mergen POS",
  appUrl: "https://ornek-canli-adres.vercel.app",
  window: {
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 600,
    kiosk: false,
    fullscreen: false,
    maximizeOnStart: true,
  },
  autoStartOnBoot: true,
  retryIntervalMs: 5000,
};

export function loadConfig(): DesktopConfig {
  let configPath = path.join(__dirname, "../../config.json");

  // Paketlenmiş uygulamada resources dizinini kontrol et
  if (app.isPackaged) {
    const packagedPath = path.join(process.resourcesPath, "config.json");
    if (fs.existsSync(packagedPath)) {
      configPath = packagedPath;
    }
  }

  let config = { ...DEFAULT_CONFIG };

  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(raw);
      config = {
        ...DEFAULT_CONFIG,
        ...parsed,
        window: {
          ...DEFAULT_CONFIG.window,
          ...(parsed.window || {}),
        },
      };
    } else {
      console.warn(`[Config] config.json bulunamadı (${configPath}), varsayılan ayarlar kullanılıyor.`);
    }
  } catch (err) {
    console.error(`[Config] config.json okunurken hata oluştu:`, err);
  }

  // Ortam değişkeni önceliği
  if (process.env.MERGEN_DESKTOP_URL && process.env.MERGEN_DESKTOP_URL.trim() !== "") {
    config.appUrl = process.env.MERGEN_DESKTOP_URL.trim();
  }

  return config;
}
