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

import { printHtml as printHtmlQz } from "./qz";

export interface UnifiedPrintOptions {
  paperWidthMm?: number;
  copies?: number;
}

export interface PrintReceiptParams {
  printerName: string;
  html: string;
  copies?: number;
  paperWidthMm?: number;
}

export function isDesktopPrinterAvailable(): boolean {
  return typeof window !== "undefined" && Boolean(window.desktopAPI?.print);
}

export function getDesktopPrinterSetting(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("mergen_use_desktop_printer") === "true";
}

export function setDesktopPrinterSetting(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("mergen_use_desktop_printer", String(enabled));
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

function notifyPrinterWarning(printerName: string, rawError?: string) {
  if (typeof window === "undefined") return;

  const lower = (rawError || "").toLowerCase();
  let message = `"${printerName}" yazıcısı yanıt vermedi.`;

  if (lower.includes("bulunamadı") || lower.includes("not found")) {
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

  if (typeof printerOrParams === "object") {
    printerName = printerOrParams.printerName;
    htmlContent = printerOrParams.html;
    copies = printerOrParams.copies || 1;
    paperWidthMm = printerOrParams.paperWidthMm || getPrinterPaperWidth();
  } else {
    printerName = printerOrParams;
    htmlContent = maybeHtml || "";
    copies = options?.copies || 1;
    paperWidthMm = options?.paperWidthMm || getPrinterPaperWidth();
  }

  const isDesktop = isDesktopPrinterAvailable();
  const useDesktop = getDesktopPrinterSetting();

  // 1. Masaüstü kabuğunda sessiz yazdırma aktifse dene
  if (isDesktop && useDesktop && window.desktopAPI?.print) {
    try {
      const res = await window.desktopAPI.print.printHtml({
        html: htmlContent,
        printerName,
        copies,
        paperWidthMm,
      });

      if (res.success) {
        return;
      }
      console.warn("[UnifiedPrinter] Masaüstü yazdırma başarısız oldu, QZ Tray'e yedekleniyor:", res.error);
      notifyPrinterWarning(printerName, res.error);
    } catch (desktopErr: any) {
      console.warn("[UnifiedPrinter] Masaüstü yazdırma çağrı hatası, QZ Tray'e yedekleniyor:", desktopErr);
      notifyPrinterWarning(printerName, desktopErr?.message || String(desktopErr));
    }
  }

  // 2. QZ Tray ile yazdır (tarayıcı veya masaüstü yedeği)
  try {
    await printHtmlQz(printerName, htmlContent);
  } catch (qzErr: any) {
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
