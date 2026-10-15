import { BrowserWindow } from "electron";

export interface PrintJobOptions {
  html: string;
  printerName: string;
  copies?: number;
  paperWidthMm?: number; // 58 veya 80 (varsayılan 80)
}

export interface QueuedPrintJob {
  id: string;
  options: PrintJobOptions;
  resolve: (value: { success: boolean; error?: string }) => void;
  reject: (reason?: any) => void;
}

export class PrintManager {
  private queue: QueuedPrintJob[] = [];
  private isProcessing: boolean = false;
  private mainWindow: BrowserWindow | null = null;

  constructor() {}

  public setMainWindow(win: BrowserWindow) {
    this.mainWindow = win;
  }

  /**
   * Windows üzerindeki yüklü yazıcıların listesini döner.
   */
  public async listPrinters(): Promise<
    Array<{ name: string; displayName: string; description: string; status: number; isDefault: boolean }>
  > {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return [];
    }
    try {
      const printers = await this.mainWindow.webContents.getPrintersAsync();
      return printers;
    } catch (err: any) {
      console.error("[PrintManager] Yazıcı listesi alınamadı:", err);
      return [];
    }
  }

  /**
   * Fiş HTML'ini kuyruğa ekler ve sırayla yazdırır.
   */
  public async printHtml(options: PrintJobOptions): Promise<{ success: boolean; error?: string }> {
    if (!options.html || !options.html.trim()) {
      return { success: false, error: "Yazdırılacak fiş HTML içeriği boş olamaz." };
    }
    if (!options.printerName || !options.printerName.trim()) {
      return { success: false, error: "Yazıcı adı belirtilmelidir." };
    }

    // Yazıcı var mı kontrol et
    const cleanPrinter = options.printerName.trim();
    const printers = await this.listPrinters();
    const exists = printers.some(
      (p) => p.name.toLowerCase() === cleanPrinter.toLowerCase() || p.displayName.toLowerCase() === cleanPrinter.toLowerCase()
    );

    if (printers.length > 0 && !exists) {
      const err = `"${cleanPrinter}" adında bir yazıcı bulunamadı. Lütfen Windows yazıcı ayarlarını kontrol edin.`;
      console.warn(`[PrintManager] ${err}`);
      return { success: false, error: err };
    }

    // Sıralı yazdırma kuyruğuna ekle
    return new Promise((resolve, reject) => {
      const job: QueuedPrintJob = {
        id: crypto.randomUUID(),
        options: {
          ...options,
          printerName: cleanPrinter,
          copies: Math.max(1, Number(options.copies) || 1),
          paperWidthMm: options.paperWidthMm === 58 ? 58 : 80,
        },
        resolve,
        reject,
      };

      this.queue.push(job);
      this.processQueue();
    });
  }

  /**
   * Kuyruktaki işleri sırayla işler (biri bitmeden diğeri başlamaz).
   */
  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    const job = this.queue.shift()!;

    try {
      await this.executeJobWithTimeout(job, 15000);
    } catch (err: any) {
      console.error(`[PrintManager] Fiş yazdırma hatası (İş ${job.id}):`, err);
      job.resolve({ success: false, error: err?.message || String(err) });
    } finally {
      this.isProcessing = false;
      // Sıradaki işi başlat
      setImmediate(() => this.processQueue());
    }
  }

  /**
   * Tek bir fiş işini gizli, sandbox'lı pencerede 15s zaman aşımıyla yazdırır.
   */
  private executeJobWithTimeout(job: QueuedPrintJob, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      let isSettled = false;

      const finish = (result: { success: boolean; error?: string }) => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          try {
            if (printWin && !printWin.isDestroyed()) {
              printWin.destroy();
            }
          } catch {}
          job.resolve(result);
          resolve();
        }
      };

      const timer = setTimeout(() => {
        finish({
          success: false,
          error: `Yazdırma işlemi zaman aşımına uğradı (${timeoutMs / 1000}s). Yazıcı meşgul veya çevrimdışı olabilir.`,
        });
      }, timeoutMs);

      // Gizli, sandbox'lı, JavaScript çalıştırılmayan güvenli pencere
      const printWin = new BrowserWindow({
        show: false,
        width: 400,
        height: 600,
        webPreferences: {
          javascript: false, // Fiş içeriğinde script çalıştırılamaz
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
        },
      });

      const widthMm = job.options.paperWidthMm || 80;
      // 80mm veya 58mm termal kağıt ve sıfır marjin için CSS
      const injectedCss = `
        <style>
          @page { size: ${widthMm}mm auto; margin: 0 !important; }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: ${widthMm}mm !important;
            max-width: ${widthMm}mm !important;
            background: #fff !important;
            color: #000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            font-family: 'Courier New', Courier, monospace, sans-serif !important;
          }
          * {
            box-sizing: border-box !important;
          }
          .page-break {
            page-break-after: avoid;
            break-after: avoid;
          }
        </style>
      `;

      const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8">${injectedCss}</head><body>${job.options.html}</body></html>`;

      printWin.webContents.once("did-finish-load", () => {
        printWin.webContents.print(
          {
            silent: true,
            deviceName: job.options.printerName,
            copies: job.options.copies || 1,
            margins: { marginType: "none" },
            printBackground: true,
            pageSize: {
              width: widthMm * 1000, // mikron
              height: 297000,
            },
          },
          (success, failureReason) => {
            if (success) {
              console.log(`[PrintManager] Fiş başarıyla basıldı -> ${job.options.printerName}`);
              finish({ success: true });
            } else {
              const err = `Yazıcı baskı hatası: ${failureReason || "Bilinmeyen hata"}`;
              finish({ success: false, error: err });
            }
          }
        );
      });

      printWin.webContents.once("did-fail-load", (_e, errorCode, errorDescription) => {
        finish({
          success: false,
          error: `Fiş içeriği yüklenemedi: ${errorDescription} (${errorCode})`,
        });
      });

      // Data URL ile yükle
      printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`).catch((err) => {
        finish({
          success: false,
          error: `Pencere yükleme hatası: ${err?.message || String(err)}`,
        });
      });
    });
  }
}
