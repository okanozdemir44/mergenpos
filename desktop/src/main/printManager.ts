import { BrowserWindow, app } from "electron";
import fs from "fs";
import path from "path";

export interface PrintJobOptions {
  html: string;
  printerName: string;
  copies?: number;
  paperWidthMm?: number; // 58 veya 80 (varsayılan 80)
  /** true ise basılan HTML'in PDF kopyası userData/logs/print-debug/ klasörüne kaydedilir */
  savePdfForDebug?: boolean;
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
    const trimmedHtml = (options?.html || "").trim();
    if (!trimmedHtml) {
      return { success: false, error: "Fişte yazdırılacak kalem yok — HTML içeriği boş." };
    }
    if (!options.printerName || !options.printerName.trim()) {
      return { success: false, error: "Yazıcı adı belirtilmelidir." };
    }

    // Yazıcı var mı kontrol et
    const cleanPrinter = options.printerName.trim();
    const printers = await this.listPrinters();
    const exists = printers.some(
      (p) =>
        p.name.toLowerCase() === cleanPrinter.toLowerCase() ||
        p.displayName.toLowerCase() === cleanPrinter.toLowerCase()
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
          html: trimmedHtml,
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
   * HTML belgesi oluşturur; varsa mevcut <html> yapısına temel sayfa CSS enjekte eder.
   */
  private buildFullHtml(rawHtml: string, widthMm: number): string {
    const pageCss = `
      <style id="mergen-base-print-style">
        @page { size: ${widthMm}mm auto; margin: 0 !important; }
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          width: ${widthMm}mm !important;
          max-width: ${widthMm}mm !important;
          background: #ffffff !important;
          color: #000000 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          font-family: 'Courier New', Courier, monospace, sans-serif !important;
        }
        * { box-sizing: border-box !important; }
      </style>
    `;

    if (/<html[\s>]/i.test(rawHtml)) {
      if (/<\/head>/i.test(rawHtml)) {
        return rawHtml.replace(/<\/head>/i, `${pageCss}</head>`);
      }
      return rawHtml.replace(/<body/i, `<head>${pageCss}</head><body`);
    }
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/>${pageCss}</head><body style="margin:0;padding:0;">${rawHtml}</body></html>`;
  }

  /**
   * Tek bir fiş işini gizli pencerede çalıştırır.
   *
   * DKT-B823 gibi 80mm termal yazıcılarda:
   * 1. Sayfa render edilmeden (did-finish-load + fontlar + layout karesi) print çağrılırsa boş kağıt çıkar.
   * 2. CSS @page size veya webContents.print pageSize height 'auto' / belirsiz kalırsa
   *    termal yazıcı sürücüsü sayfayı ~1cm keser.
   * Çözüm:
   * 1. Fontların ve layout'un tamamlanmasını bekle (document.fonts.ready + rAF).
   * 2. DOM gerçek yüksekliğini (scrollHeight) ölç.
   * 3. pageSize'ı genişlik 80mm (80.000 mikron) ve ölçülen yükseklik + 8mm pay mikron cinsinden ver.
   * 4. @page { size: Wmm Hmm } CSS'ini DOM'a enjekte et.
   */
  private executeJobWithTimeout(job: QueuedPrintJob, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      let isSettled = false;
      let printWin: BrowserWindow | null = null;

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
          error: `Yazdırma işlemi zaman aşımına uğradı (${timeoutMs / 1000}s). Yazıcı meşgul veya çevrimdışı.`,
        });
      }, timeoutMs);

      const widthMm = job.options.paperWidthMm === 58 ? 58 : 80;
      const fullHtml = this.buildFullHtml(job.options.html, widthMm);

      // 80mm termal kağıt için ~302px + marj
      const winWidth = Math.ceil(widthMm * 3.78) + 40;

      printWin = new BrowserWindow({
        show: false,
        width: winWidth,
        height: 1200,
        webPreferences: {
          javascript: true, // Yükseklik ölçümü ve font-ready için gerekli
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: false,
          webSecurity: true,
        },
      });

      const capturedWin = printWin;

      capturedWin.webContents.once("did-finish-load", () => {
        // Render, font ve layout döngüsünün tam yerleşmesi için JS yürüt
        setTimeout(async () => {
          if (isSettled || capturedWin.isDestroyed()) return;

          try {
            // 1. Fontların yüklenmesini bekle ve DOM scroll yüksekliğini al
            const measuredHeightPx: number = await capturedWin.webContents.executeJavaScript(`
              (async () => {
                try {
                  if (document.fonts && document.fonts.ready) {
                    await document.fonts.ready;
                  }
                } catch (_) {}
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
                await new Promise(r => setTimeout(r, 80));
                const b = document.body;
                const d = document.documentElement;
                return Math.max(
                  b ? b.scrollHeight : 0,
                  b ? b.offsetHeight : 0,
                  d ? d.scrollHeight : 0,
                  d ? d.offsetHeight : 0,
                  300
                );
              })()
            `);

            // 1px @ 96 DPI = 25.4 / 96 mm
            // 1mm = 1.000 mikron
            const heightMm = Math.ceil(measuredHeightPx * (25.4 / 96)) + 8; // +8mm emniyet payı
            const widthMicron = widthMm * 1000; // 80mm = 80.000 mikron
            const heightMicron = heightMm * 1000;

            console.log(
              `[PrintManager] Ölçüm: ${widthMm}mm x ${measuredHeightPx}px -> ${widthMm}mm x ${heightMm}mm (${widthMicron}x${heightMicron} µm) -> "${job.options.printerName}"`
            );

            // DOM'a tam @page boyutunu enjekte et (auto belirsizliğini tamamen ortadan kaldır)
            await capturedWin.webContents.executeJavaScript(`
              (() => {
                let st = document.getElementById("mergen-exact-page-size");
                if (!st) {
                  st = document.createElement("style");
                  st.id = "mergen-exact-page-size";
                  document.head.appendChild(st);
                }
                st.textContent = "@page { size: ${widthMm}mm ${heightMm}mm !important; margin: 0 !important; }";
              })()
            `);

            // Hata ayıklama: PDF günlük klasörüne kaydetme
            if (job.options.savePdfForDebug) {
              try {
                const pdfBuf = await capturedWin.webContents.printToPDF({
                  printBackground: true,
                  pageSize: { width: widthMicron, height: heightMicron },
                  margins: { marginType: "none" },
                });
                const dbgDir = path.join(app.getPath("userData"), "logs", "print-debug");
                if (!fs.existsSync(dbgDir)) fs.mkdirSync(dbgDir, { recursive: true });
                const fname = `receipt-${Date.now()}-${job.id.slice(0, 8)}.pdf`;
                const fullPdfPath = path.join(dbgDir, fname);
                fs.writeFileSync(fullPdfPath, pdfBuf);
                console.log(`[PrintManager] Hata ayıklama PDF'i kaydedildi: ${fullPdfPath}`);
              } catch (pdfErr) {
                console.warn("[PrintManager] PDF hata ayıklama kaydı başarısız:", pdfErr);
              }
            }

            if (isSettled || capturedWin.isDestroyed()) return;

            // Yazdırmayı başlat
            capturedWin.webContents.print(
              {
                silent: true,
                deviceName: job.options.printerName,
                copies: job.options.copies || 1,
                margins: { marginType: "none" },
                printBackground: true,
                pageSize: {
                  width: widthMicron,
                  height: heightMicron,
                },
              },
              (success, failureReason) => {
                if (success) {
                  console.log(`[PrintManager] Fiş başarıyla basıldı -> ${job.options.printerName}`);
                  finish({ success: true });
                } else {
                  const err = `Yazıcı baskı hatası: ${failureReason || "Bilinmeyen hata"}`;
                  console.error(`[PrintManager] ${err}`);
                  finish({ success: false, error: err });
                }
              }
            );
          } catch (measureErr: any) {
            console.warn("[PrintManager] JS ölçüm hatası, PDF tabanlı alternatife geçiliyor:", measureErr);

            // Alternatif: printToPDF ile ölçüm ve baskı
            try {
              let fallbackHeightMicron = 220000; // 220mm varsayılan
              const pdfBuf = await capturedWin.webContents.printToPDF({
                margins: { marginType: "none" },
                printBackground: true,
              });

              // PDF MediaBox'tan boyutu oku
              const pdfHead = pdfBuf.slice(0, 4000).toString("latin1");
              const mBox = pdfHead.match(/\/MediaBox\s*\[\s*0\s+0\s+([0-9.]+)\s+([0-9.]+)\s*\]/);
              if (mBox) {
                const ptH = parseFloat(mBox[2]);
                if (ptH > 50) {
                  // 1 pt = 25400 / 72 mikron
                  fallbackHeightMicron = Math.round(ptH * (25400 / 72)) + 10000;
                }
              }

              const widthMicron = widthMm * 1000;

              capturedWin.webContents.print(
                {
                  silent: true,
                  deviceName: job.options.printerName,
                  copies: job.options.copies || 1,
                  margins: { marginType: "none" },
                  printBackground: true,
                  pageSize: {
                    width: widthMicron,
                    height: fallbackHeightMicron,
                  },
                },
                (success, failureReason) => {
                  if (success) {
                    finish({ success: true });
                  } else {
                    finish({ success: false, error: failureReason || "Yazdırma başarısız" });
                  }
                }
              );
            } catch (fallbackErr: any) {
              finish({
                success: false,
                error: `Yazdırma hazırlık hatası: ${fallbackErr?.message || String(fallbackErr)}`,
              });
            }
          }
        }, 120);
      });

      capturedWin.webContents.once("did-fail-load", (_e, errorCode, errorDescription) => {
        finish({
          success: false,
          error: `Fiş içeriği yüklenemedi: ${errorDescription} (${errorCode})`,
        });
      });

      // Data URL ile HTML içeriği yükle
      capturedWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`).catch((err) => {
        finish({
          success: false,
          error: `Pencere yükleme hatası: ${err?.message || String(err)}`,
        });
      });
    });
  }
}
