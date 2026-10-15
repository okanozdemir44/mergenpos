import fs from "fs";
import path from "path";
import { app, shell } from "electron";

const MAX_LOG_SIZE = 3 * 1024 * 1024; // 3 MB

export class AppLogger {
  private logDir: string;
  private logFile: string;

  constructor() {
    this.logDir = path.join(app.getPath("userData"), "logs");
    this.logFile = path.join(this.logDir, "app.log");
    this.ensureDir();
  }

  private ensureDir() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch {}
  }

  public log(level: "INFO" | "WARN" | "ERROR", message: string) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${level}] ${message}\n`;

    try {
      this.ensureDir();
      this.rotateIfNeeded();
      fs.appendFileSync(this.logFile, line, "utf-8");
    } catch {}

    if (level === "ERROR") {
      console.error(line.trim());
    } else if (level === "WARN") {
      console.warn(line.trim());
    } else {
      console.log(line.trim());
    }
  }

  private rotateIfNeeded() {
    try {
      if (fs.existsSync(this.logFile)) {
        const stats = fs.statSync(this.logFile);
        if (stats.size > MAX_LOG_SIZE) {
          const oldFile = path.join(this.logDir, "app.old.log");
          if (fs.existsSync(oldFile)) {
            fs.unlinkSync(oldFile);
          }
          fs.renameSync(this.logFile, oldFile);
        }
      }
    } catch {}
  }

  public openLogsFolder() {
    this.ensureDir();
    shell.openPath(this.logDir);
  }
}

export const logger = new AppLogger();

export function setupExceptionHandlers() {
  process.on("uncaughtException", (error) => {
    logger.log("ERROR", `Yakalanmamış Hata (uncaughtException): ${error?.stack || error}`);
  });

  process.on("unhandledRejection", (reason) => {
    logger.log("ERROR", `İşlenmemiş Promise Hatası (unhandledRejection): ${reason}`);
  });
}
