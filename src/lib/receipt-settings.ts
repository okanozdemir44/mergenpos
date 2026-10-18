/**
 * Mergen POS - Restoran Bazlı Fiş Ayarları Şeması ve Varsayılanları
 * 
 * Güvenlik ve Uyumluluk İlkeleri:
 * 1. Monospace ve Türkçe uyumlu font listesi
 * 2. Min/Max sınırlamaları (geçersiz değerlerde otomatik varsayılana dönüş)
 * 3. HTML-kaçışlı güvenli metin alanları (XSS koruması)
 * 4. Sabit "MERGEN TEKNOLOJİ" marka satırı (ayarlardan değiştirilemez)
 * 5. Kenar boşlukları ve içerik genişliği kontrolü (sol/sağ boşluk, otomatik genişlik, ortalama)
 */

export const SAFE_RECEIPT_FONTS = [
  { id: "courier", name: "Courier New (Monospace)", value: "'Courier New', Courier, monospace" },
  { id: "consolas", name: "Consolas (Modern Monospace)", value: "'Consolas', 'Courier New', monospace" },
  { id: "arial", name: "Arial (Sans-Serif)", value: "Arial, Helvetica, sans-serif" },
] as const;

export type SafeFontFamily = typeof SAFE_RECEIPT_FONTS[number]["value"];

export interface ReceiptLayoutSettings {
  paddingLeftMm: number;      // Sol boşluk (0 - 10 mm, varsayılan: 3)
  paddingRightMm: number;     // Sağ boşluk (0 - 10 mm, varsayılan: 3)
  contentWidthMm: number;     // İçerik genişliği (40 - 80 mm, varsayılan: 76 [80mm] veya 54 [58mm])
  autoContentWidth: boolean;  // Kağıt genişliğine otomatik (varsayılan: true)
  centerContent: boolean;     // İçeriği ortala (varsayılan: false - mevcut şablon çıktısıyla birebir uyumlu)
}

export interface CashierReceiptSettings {
  paperWidthMm: 80 | 58;
  fontFamily: SafeFontFamily;
  layout: ReceiptLayoutSettings;

  // Başlık Bölümü
  header: {
    customTitle: string; // Boşsa restoran adı kullanılır
    extraLine: string;   // İsteğe bağlı adres veya telefon satırı
    showExtraLine: boolean;
    showLogo: boolean;   // Logo göster/gizle
    fontSizePx: number;  // 10 - 28, varsayılan: 16
    fontWeight: "normal" | "bold";
    textAlign: "left" | "center" | "right";
  };

  // Bilgi Satırları (Tarih, Fiş No, Kasiyer, Kanal, Müşteri)
  info: {
    fontSizePx: number;  // 8 - 18, varsayılan: 10
    lineHeight: number;  // 1.1 - 2.0, varsayılan: 1.35
  };

  // Kalem Listesi Tablosu
  items: {
    fontSizePx: number;  // 8 - 20, varsayılan: 11
    lineHeight: number;  // 1.1 - 2.0, varsayılan: 1.35
    showNotes: boolean;  // Kalem notunu göster/gizle
  };

  // Toplam & Ödeme Bölümü
  total: {
    fontSizePx: number;  // 10 - 26, varsayılan: 14
    fontWeight: "normal" | "bold";
  };

  // Alt Bilgi Bölümü
  footer: {
    complimentText: string; // Varsayılan: "Afiyet Olsun."
    fontSizePx: number;     // 9 - 22, varsayılan: 12
    fontWeight: "normal" | "bold";
    textAlign: "left" | "center" | "right";
  };
}

export interface KitchenReceiptSettings {
  paperWidthMm: 80 | 58;
  fontFamily: SafeFontFamily;
  layout: ReceiptLayoutSettings;

  // Başlık & Kanal Bölümü
  header: {
    customTitle: string;        // Boşsa sipariş tipi/kanal kullanılır
    showOrderChannel: boolean;   // Sipariş tipi / kanal satırını göster/gizle
    fontSizePx: number;         // 14 - 36, varsayılan: 24
    fontWeight: "normal" | "bold";
    textAlign: "left" | "center" | "right";
    showOrderNumber: boolean;
    orderNumberFontSizePx: number; // 16 - 40, varsayılan: 28
  };

  // Bilgi Satırları (Tarih vb.)
  info: {
    fontSizePx: number;  // 10 - 22, varsayılan: 14
    showDate: boolean;
  };

  // Kalemler Bölümü
  items: {
    itemNameFontSizePx: number; // 12 - 32, varsayılan: 18
    itemNameFontWeight: "normal" | "bold";
    showNotes: boolean;
    noteFontSizePx: number;     // 10 - 26, varsayılan: 16
  };
}

export interface ReceiptSettings {
  cashier: CashierReceiptSettings;
  kitchen: KitchenReceiptSettings;
}

export const DEFAULT_CASHIER_RECEIPT_SETTINGS: CashierReceiptSettings = {
  paperWidthMm: 80,
  fontFamily: "'Courier New', Courier, monospace",
  layout: {
    paddingLeftMm: 3,
    paddingRightMm: 3,
    contentWidthMm: 76,
    autoContentWidth: true,
    centerContent: false,
  },
  header: {
    customTitle: "",
    extraLine: "",
    showExtraLine: false,
    showLogo: false,
    fontSizePx: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  info: {
    fontSizePx: 10,
    lineHeight: 1.35,
  },
  items: {
    fontSizePx: 11,
    lineHeight: 1.35,
    showNotes: true,
  },
  total: {
    fontSizePx: 14,
    fontWeight: "bold",
  },
  footer: {
    complimentText: "Afiyet Olsun.",
    fontSizePx: 12,
    fontWeight: "bold",
    textAlign: "center",
  },
};

export const DEFAULT_KITCHEN_RECEIPT_SETTINGS: KitchenReceiptSettings = {
  paperWidthMm: 80,
  fontFamily: "'Courier New', Courier, monospace",
  layout: {
    paddingLeftMm: 3,
    paddingRightMm: 3,
    contentWidthMm: 76,
    autoContentWidth: true,
    centerContent: false,
  },
  header: {
    customTitle: "",
    showOrderChannel: true,
    fontSizePx: 24,
    fontWeight: "bold",
    textAlign: "center",
    showOrderNumber: true,
    orderNumberFontSizePx: 28,
  },
  info: {
    fontSizePx: 14,
    showDate: true,
  },
  items: {
    itemNameFontSizePx: 18,
    itemNameFontWeight: "bold",
    showNotes: true,
    noteFontSizePx: 16,
  },
};

export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  cashier: DEFAULT_CASHIER_RECEIPT_SETTINGS,
  kitchen: DEFAULT_KITCHEN_RECEIPT_SETTINGS,
};

/**
 * XSS Koruması: Kullanıcı metinlerini HTML varlıklarına dönüştürür.
 */
export function escapeHtml(str: string | null | undefined): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clamp(val: unknown, min: number, max: number, fallback: number): number {
  const num = Number(val);
  if (isNaN(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function sanitizeFont(font: unknown): SafeFontFamily {
  const match = SAFE_RECEIPT_FONTS.find((f) => f.value === font);
  return match ? match.value : "'Courier New', Courier, monospace";
}

function sanitizeAlign(align: unknown): "left" | "center" | "right" {
  if (align === "left" || align === "center" || align === "right") return align;
  return "center";
}

function sanitizeWeight(weight: unknown): "normal" | "bold" {
  return weight === "normal" ? "normal" : "bold";
}

function sanitizeLayout(rawLayout: any, defaultWidth: number): ReceiptLayoutSettings {
  const layout = rawLayout || {};
  return {
    paddingLeftMm: clamp(layout.paddingLeftMm, 0, 10, 3),
    paddingRightMm: clamp(layout.paddingRightMm, 0, 10, 3),
    contentWidthMm: clamp(layout.contentWidthMm, 40, 80, defaultWidth),
    autoContentWidth: layout.autoContentWidth !== false,
    centerContent: Boolean(layout.centerContent),
  };
}

/**
 * Gelen ham JSON ayarlarını doğrular ve sınırlandırılmış temiz ayarlara dönüştürür.
 */
export function sanitizeReceiptSettings(raw: any): ReceiptSettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_RECEIPT_SETTINGS };
  }

  const rawCashier = raw.cashier || {};
  const rawKitchen = raw.kitchen || {};

  const cashierPaperWidth: 80 | 58 = rawCashier.paperWidthMm === 58 ? 58 : 80;
  const kitchenPaperWidth: 80 | 58 = rawKitchen.paperWidthMm === 58 ? 58 : 80;

  const cashier: CashierReceiptSettings = {
    paperWidthMm: cashierPaperWidth,
    fontFamily: sanitizeFont(rawCashier.fontFamily),
    layout: sanitizeLayout(rawCashier.layout, cashierPaperWidth === 58 ? 54 : 76),
    header: {
      customTitle: String(rawCashier.header?.customTitle || "").slice(0, 80),
      extraLine: String(rawCashier.header?.extraLine || "").slice(0, 120),
      showExtraLine: Boolean(rawCashier.header?.showExtraLine),
      showLogo: Boolean(rawCashier.header?.showLogo),
      fontSizePx: clamp(rawCashier.header?.fontSizePx, 10, 28, 16),
      fontWeight: sanitizeWeight(rawCashier.header?.fontWeight),
      textAlign: sanitizeAlign(rawCashier.header?.textAlign),
    },
    info: {
      fontSizePx: clamp(rawCashier.info?.fontSizePx, 8, 18, 10),
      lineHeight: clamp(rawCashier.info?.lineHeight, 1.1, 2.0, 1.35),
    },
    items: {
      fontSizePx: clamp(rawCashier.items?.fontSizePx, 8, 20, 11),
      lineHeight: clamp(rawCashier.items?.lineHeight, 1.1, 2.0, 1.35),
      showNotes: rawCashier.items?.showNotes !== false,
    },
    total: {
      fontSizePx: clamp(rawCashier.total?.fontSizePx, 10, 26, 14),
      fontWeight: sanitizeWeight(rawCashier.total?.fontWeight),
    },
    footer: {
      complimentText: String(rawCashier.footer?.complimentText || "Afiyet Olsun.").slice(0, 100),
      fontSizePx: clamp(rawCashier.footer?.fontSizePx, 9, 22, 12),
      fontWeight: sanitizeWeight(rawCashier.footer?.fontWeight),
      textAlign: sanitizeAlign(rawCashier.footer?.textAlign),
    },
  };

  const kitchen: KitchenReceiptSettings = {
    paperWidthMm: kitchenPaperWidth,
    fontFamily: sanitizeFont(rawKitchen.fontFamily),
    layout: sanitizeLayout(rawKitchen.layout, kitchenPaperWidth === 58 ? 54 : 76),
    header: {
      customTitle: String(rawKitchen.header?.customTitle || "").slice(0, 60),
      showOrderChannel: rawKitchen.header?.showOrderChannel !== false,
      fontSizePx: clamp(rawKitchen.header?.fontSizePx, 14, 36, 24),
      fontWeight: sanitizeWeight(rawKitchen.header?.fontWeight),
      textAlign: sanitizeAlign(rawKitchen.header?.textAlign),
      showOrderNumber: rawKitchen.header?.showOrderNumber !== false,
      orderNumberFontSizePx: clamp(rawKitchen.header?.orderNumberFontSizePx, 16, 40, 28),
    },
    info: {
      fontSizePx: clamp(rawKitchen.info?.fontSizePx, 10, 22, 14),
      showDate: rawKitchen.info?.showDate !== false,
    },
    items: {
      itemNameFontSizePx: clamp(rawKitchen.items?.itemNameFontSizePx, 12, 32, 18),
      itemNameFontWeight: sanitizeWeight(rawKitchen.items?.itemNameFontWeight),
      showNotes: rawKitchen.items?.showNotes !== false,
      noteFontSizePx: clamp(rawKitchen.items?.noteFontSizePx, 10, 26, 16),
    },
  };

  return { cashier, kitchen };
}
