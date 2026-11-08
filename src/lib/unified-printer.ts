/**
 * Birleşik Fiş Yazdırma Modülü (Unified Printer)
 * 
 * Öncelik Sıralaması:
 * 1. Eğer Electron kabuğundaysak (window.desktopAPI?.print) VE
 *    kullanıcı ayarlarından "mergen_use_desktop_printer === 'true'" seçildiyse:
 *    -> Electron'un sessiz yazdırma kuyruğu (PrintManager) kullanılır.
 * 2. Eğer masaüstü yazdırma kapalıysa, hata verirse veya normal tarayıcıdaysak:
 *    -> Mevcut QZ Tray servisine (src/lib/qz.ts) güvenli bir şekilde yedeklenir.
 */

import * as qz from "qz-tray";
import { connectQZ, printHtml as printHtmlQz } from "./qz";

export class QzNotRunningError extends Error {
  code = "QZ_NOT_RUNNING";
  constructor(message = "QZ Tray çalışmıyor ya da bağlanamadı.") {
    super(message);
    this.name = "QzNotRunningError";
  }
}

export function isQzNotRunning(err: unknown): boolean {
  if (!err) return false;
  const code = (err as any)?.code;
  const name = (err as any)?.name;
  const msg = String((err as any)?.message || err);
  return (
    code === "QZ_NOT_RUNNING" ||
    name === "QzNotRunningError" ||
    msg.includes("QZ_NOT_RUNNING") ||
    msg.includes("sendData") ||
    msg.includes("has not been established yet") ||
    msg.includes("QZ Tray uygulamasına bağlanılamadı") ||
    msg.includes("QZ Tray açık mı") ||
    msg.includes("Connection closed")
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("QZ_CONNECT_TIMEOUT"));
    }, ms);
    promise.then(
      (res) => {
        clearTimeout(timer);
        resolve(res);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * QZ Tray bağlantısını güvenceye alır.
 * Zaten bağlıysa hemen döner; değilse 5 sn zaman aşımı ile bağlanmayı dener (1 kez yeniden dener).
 * Bağlanamazsa QzNotRunningError (code: QZ_NOT_RUNNING) fırlatır.
 */
export async function ensureQzConnected(): Promise<void> {
  if (typeof window === "undefined") {
    throw new QzNotRunningError("Tarayıcı ortamı dışında QZ çalıştırılamaz.");
  }

  // 1. Zaten bağlıysa hemen dön
  try {
    if (qz.websocket && typeof qz.websocket.isActive === "function" && qz.websocket.isActive()) {
      return;
    }
  } catch {
    // isActive() hatasında bağlanmayı dene
  }

  const attemptConnect = async () => {
    await withTimeout(connectQZ(), 5000);
  };

  try {
    await attemptConnect();
    return;
  } catch (firstErr) {
    console.warn("[QZ] İlk bağlantı denemesi başarısız, bir kez yeniden deneniyor...", firstErr);
  }

  try {
    await attemptConnect();
    return;
  } catch (secondErr) {
    console.error("[QZ] İkinci bağlantı denemesi de başarısız oldu:", secondErr);
    throw new QzNotRunningError("QZ Tray çalışmıyor ya da bağlanamadı.");
  }
}

/**
 * QZ Tray yazıcı listesini güvenle alır (öncesinde ensureQzConnected çağrılır).
 */
export async function getUnifiedPrinters(): Promise<string[]> {
  await ensureQzConnected();
  const printers = await qz.printers.find();
  return Array.isArray(printers) ? printers : [printers];
}

/**
 * Tarayıcı üzerinden fiş yazdırma penceresi açar ve konsola tek satır log basar.
 */
export function printHtmlViaBrowserWindow(html: string): void {
  console.log("[print] path=browser result=ok");
  if (typeof window === "undefined") return;
  const browserHtml = html.includes("<script")
    ? html
    : html.replace("</body>", "<script>window.onload=()=>{window.print();}</script></body>");
  const w = window.open("", "_blank", "noopener,noreferrer,width=420,height=640");
  if (w) {
    w.document.write(browserHtml);
    w.document.close();
  } else {
    window.print();
  }
}

export interface UnifiedPrintOptions {
  paperWidthMm?: number;
  copies?: number;
  savePdfForDebug?: boolean;
}

export interface PrintReceiptParams {
  printerName: string;
  html: string;
  copies?: number;
  paperWidthMm?: number;
  savePdfForDebug?: boolean;
}

export function isDesktopPrinterAvailable(): boolean {
  return typeof window !== "undefined" && Boolean(window.desktopAPI?.print);
}

export function getDesktopPrinterSetting(): boolean {
  if (typeof window === "undefined") return false;
  const val = localStorage.getItem("mergen_use_desktop_printer");
  if (val === null) {
    return isDesktopPrinterAvailable();
  }
  return val === "true";
}

export function setDesktopPrinterSetting(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("mergen_use_desktop_printer", String(enabled));
}

export function isSavePdfDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("mergen_save_print_pdf_debug") === "true";
}

export function setSavePdfDebugEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("mergen_save_print_pdf_debug", String(enabled));
}

export function getPrinterPaperWidth(): number {
  if (typeof window === "undefined") return 80;
  return Number(localStorage.getItem("mergen_printer_paper_width")) || 80;
}

export function setPrinterPaperWidth(width: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("mergen_printer_paper_width", String(width));
}

export function isAutoPrintEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("mergen_auto_print_receipts") === "true";
}

export function setAutoPrintEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("mergen_auto_print_receipts", String(enabled));
}

export function notifyPrinterWarning(printerName: string, rawError?: string) {
  if (typeof window === "undefined") return;

  const lower = (rawError || "").toLowerCase();
  let message = `"${printerName}" yazıcısı yanıt vermedi.`;

  if (rawError === "Fişte yazdırılacak kalem yok" || lower.includes("kalem yok")) {
    message = "Fişte yazdırılacak kalem yok";
  } else if (lower.includes("bulunamadı") || lower.includes("not found")) {
    message = `"${printerName}" yazıcısı bulunamadı. Lütfen Windows yazıcı ayarlarını kontrol edin.`;
  } else if (lower.includes("zaman aşımı") || lower.includes("timeout")) {
    message = `"${printerName}" yazıcısı zaman aşımına uğradı. Yazıcı çevrimdışı veya kağıdı bitmiş olabilir.`;
  } else if (lower.includes("çevrimdışı") || lower.includes("offline")) {
    message = `"${printerName}" yazıcısı çevrimdışı. Kablo veya ağ (LAN) bağlantısını kontrol edin.`;
  } else if (rawError) {
    message = `"${printerName}" yazdırma uyarısı: ${rawError}`;
  }

  // Arayüzde kasiyere anlık kısa Türkçe uyarı göstermek için CustomEvent fırlat
  window.dispatchEvent(
    new CustomEvent("mergen-printer-warning", {
      detail: { printerName, message },
    })
  );
}

export async function printReceiptHtml(
  printerOrParams: string | PrintReceiptParams,
  maybeHtml?: string,
  options?: UnifiedPrintOptions
): Promise<void> {
  let printerName: string;
  let htmlContent: string;
  let copies = 1;
  let paperWidthMm = 80;
  let savePdfForDebug = isSavePdfDebugEnabled();

  if (typeof printerOrParams === "object") {
    printerName = printerOrParams.printerName;
    htmlContent = printerOrParams.html;
    copies = printerOrParams.copies || 1;
    paperWidthMm = printerOrParams.paperWidthMm || getPrinterPaperWidth();
    if (typeof printerOrParams.savePdfForDebug === "boolean") {
      savePdfForDebug = printerOrParams.savePdfForDebug;
    }
  } else {
    printerName = printerOrParams;
    htmlContent = maybeHtml || "";
    copies = options?.copies || 1;
    paperWidthMm = options?.paperWidthMm || getPrinterPaperWidth();
    if (typeof options?.savePdfForDebug === "boolean") {
      savePdfForDebug = options.savePdfForDebug;
    }
  }

  const trimmedHtml = (htmlContent || "").trim();
  if (!trimmedHtml) {
    notifyPrinterWarning(printerName || "Yazıcı", "Fişte yazdırılacak kalem yok");
    return;
  }

  const isDesktop = isDesktopPrinterAvailable();
  const useDesktop = getDesktopPrinterSetting();

  // 1. Masaüstü kabuğunda sessiz yazdırma aktifse dene
  if (isDesktop && useDesktop && window.desktopAPI?.print) {
    try {
      const res = await window.desktopAPI.print.printHtml({
        html: trimmedHtml,
        printerName,
        copies,
        paperWidthMm,
        savePdfForDebug,
      });

      if (res.success) {
        console.log("[print] path=desktop result=ok");
        return;
      }
      console.log("[print] path=desktop result=error");
      console.warn("[UnifiedPrinter] Masaüstü yazdırma başarısız oldu, QZ Tray'e yedekleniyor:", res.error);
      notifyPrinterWarning(printerName, res.error);
    } catch (desktopErr: any) {
      console.log("[print] path=desktop result=error");
      console.warn("[UnifiedPrinter] Masaüstü yazdırma çağrı hatası, QZ Tray'e yedekleniyor:", desktopErr);
      notifyPrinterWarning(printerName, desktopErr?.message || String(desktopErr));
    }
  }

  // 2. QZ Tray ile yazdır (tarayıcı veya masaüstü yedeği)
  try {
    await ensureQzConnected();
    await printHtmlQz(printerName, trimmedHtml);
    console.log("[print] path=qz result=ok");
  } catch (qzErr: any) {
    if (isQzNotRunning(qzErr)) {
      console.log("[print] path=qz result=QZ_NOT_RUNNING");
    } else {
      console.log("[print] path=qz result=error");
    }
    notifyPrinterWarning(printerName, qzErr?.message || String(qzErr));
    throw qzErr;
  }
}

/**
 * Test fişi HTML'i üretir (80mm / 58mm, Türkçe karakterler ve kesme çizgisi)
 */
export function generateTestReceiptHtml(
  branchName: string = "Mergen POS",
  paperWidthMm: number = 80,
  roleTitle: string = "TEST FİŞİ"
): string {
  const now = new Date().toLocaleString("tr-TR");
  return `
    <div style="font-family: 'Courier New', Courier, monospace; width: 100%; padding: 5px; color: #000; font-size: 13px; line-height: 1.4;">
      <div style="text-align: center; font-weight: bold; font-size: 16px; margin-bottom: 4px;">
        *** ${roleTitle.toUpperCase()} ***
      </div>
      <div style="text-align: center; font-size: 14px; margin-bottom: 8px;">
        ${branchName}
      </div>
      <div style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 4px 0; margin-bottom: 8px; font-size: 11px;">
        Tarih: ${now}<br/>
        Genişlik: ${paperWidthMm}mm | Sessiz Yazdırma: AKTİF
      </div>
      
      <div style="border: 2px solid #000; padding: 6px; margin-bottom: 8px; text-align: center; font-weight: bold;">
        [ ${paperWidthMm}mm KAĞIT GENİŞLİK ÇERÇEVESİ ]
      </div>

      <div style="margin-bottom: 8px;">
        <strong>Türkçe Karakter Testi:</strong><br/>
        Küçük: ğ ü ş ı ö ç<br/>
        Büyük: Ğ Ü Ş İ Ö Ç
      </div>

      <div style="margin-bottom: 8px; font-size: 12px;">
        Rakamlar: 0123456789<br/>
        Semboller: ₺ % & / ( ) = ? !
      </div>

      <div style="border-top: 2px dashed #000; margin: 12px 0 6px 0;"></div>
      <div style="text-align: center; font-size: 10px; letter-spacing: 2px;">
        - - - - KESME NOKTASI - - - -
      </div>
      <div style="height: 25px;"></div>
    </div>
  `;
}

export { getOrFetchReceiptSettings, getCachedReceiptSettings } from "./receipt-settings-client";
