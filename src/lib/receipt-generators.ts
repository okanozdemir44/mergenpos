import type { ThermalReceiptProps } from "../components/receipt/ThermalReceipt";
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from "@/types/pos";
import {
  type ReceiptSettings,
  sanitizeReceiptSettings,
  escapeHtml,
} from "./receipt-settings";

/**
 * Format a number as TRY (e.g. 150.00)
 */
function formatTRY(amount: number) {
  return amount.toFixed(2);
}

/**
 * Kasa Fişi (Müşteri için fiyata ve logoya sahip fiş)
 * Eğer settings verilmezse veya boşsa, mevcut HTML'i karakteri karakterine (byte-for-byte) aynı üretir.
 */
export function generateCashierReceiptHtml(
  data: ThermalReceiptProps,
  settings?: ReceiptSettings
): string {
  // Ayar verilmediyse mevcut orijinal şablonu BİREBİR üret
  if (!settings || Object.keys(settings).length === 0) {
    const css = `
    @page { margin: 0; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 11.5px;
      line-height: 1.35;
      color: #000;
      background: #fff;
      margin: 0;
      padding: 0;
      width: 76mm;
    }
    .receipt-container {
      padding: 2mm 3mm 8mm 3mm;
    }
    .receipt-header { text-align: center; margin-bottom: 8px; }
    .receipt-brand { font-size: 16px; font-weight: 900; }
    .receipt-branch { font-size: 11px; margin-top: 2px; }
    .receipt-divider { border-top: 1px dashed #000; margin: 6px 0; }
    .receipt-info { font-size: 10px; margin-bottom: 6px; }
    .receipt-row { display: flex; justify-content: space-between; }
    .receipt-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; font-size: 11px; }
    .receipt-table th { text-align: left; border-bottom: 1px dashed #000; padding-bottom: 2px; font-weight: 700; }
    .receipt-table td { padding: 3px 0; vertical-align: top; }
    .receipt-table .col-qty { width: 15%; }
    .receipt-table .col-name { width: 55%; }
    .receipt-table .col-price { width: 30%; text-align: right; }
    .receipt-item-note { font-size: 9.5px; font-style: italic; display: block; margin-top: 1px; }
    .receipt-summary { margin-top: 6px; font-weight: 700; }
    .receipt-summary-total { font-size: 14px; display: flex; justify-content: space-between; margin-bottom: 6px; }
    .receipt-order-number-box {
      border: 2px solid #000;
      padding: 8px;
      text-align: center;
      font-size: 16px;
      font-weight: 900;
      margin: 8px 0;
    }
    .receipt-footer { text-align: center; margin-top: 10px; }
    .receipt-compliment { font-size: 12px; font-weight: 700; margin-bottom: 4px; }
    .receipt-logo { font-size: 14px; font-weight: 900; }
  `;

    const itemsHtml = data.items
      .map(
        (item) => `
    <tr>
      <td class="col-qty">${item.quantity} ${item.unit || "Tam"}</td>
      <td class="col-name">
        ${item.name}
        ${item.note ? `<span class="receipt-item-note">- ${item.note}</span>` : ""}
      </td>
      <td class="col-price">*${formatTRY(item.totalPrice ?? (item.unitPrice ? item.quantity * item.unitPrice : 0))}</td>
    </tr>
  `
      )
      .join("");

    return `
    <html>
      <head><meta charset="utf-8"/><style>${css}</style></head>
      <body>
        <div class="receipt-container">
          <div class="receipt-header">
            <div class="receipt-brand">${data.branchName || "MERGEN POS"}</div>
          </div>
          
          <div class="receipt-info">
            <div class="receipt-row"><span>Tarih:</span><span>${data.dateStr}</span></div>
            <div class="receipt-row"><span>Fiş No:</span><span>${data.receiptNo}</span></div>
            <div class="receipt-row"><span>Kasiyer:</span><span>${data.cashierName}</span></div>
            <div class="receipt-row"><span>Kanal:</span><span>${data.orderChannel}</span></div>
            ${
              data.orderChannel === "PAKET" && (data.customerName || data.customerPhone || data.deliveryAddress)
                ? `
            <div style="border-top: 1px dashed #000; margin-top: 4px; padding-top: 4px;">
              <div style="font-weight: 700; margin-bottom: 2px;">PAKET MÜŞTERİ BİLGİSİ</div>
              ${data.customerName ? `<div class="receipt-row"><span>Müşteri:</span><strong>${data.customerName.toUpperCase()}</strong></div>` : ""}
              ${data.customerPhone ? `<div class="receipt-row"><span>Telefon:</span><strong>${data.customerPhone}</strong></div>` : ""}
              ${data.deliveryAddress ? `<div style="margin-top: 2px;"><span>Adres:</span><div style="font-weight: 700;">${data.deliveryAddress}</div></div>` : ""}
            </div>
            `
                : ""
            }
          </div>
          
          <div class="receipt-divider"></div>
          
          <table class="receipt-table">
            <thead>
              <tr>
                <th class="col-qty">Miktar</th>
                <th class="col-name">Ürün</th>
                <th class="col-price">Tutar</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          
          <div class="receipt-divider"></div>
          
          <div class="receipt-summary-total">
            <span>TOPLAM</span>
            <span>*${formatTRY(data.total)}</span>
          </div>
          
          <div class="receipt-summary">
            <div class="receipt-row">
              <span>${data.paymentMethod ? (PAYMENT_METHOD_LABEL[data.paymentMethod as PaymentMethod] || data.paymentMethod) : "Belirsiz"}</span>
              <span>${formatTRY(data.total)}</span>
            </div>
            <div class="receipt-row">
              <span>Tahsil Edilen</span>
              <span>${formatTRY(data.paidAmount ?? data.total ?? 0)}</span>
            </div>
            <div class="receipt-row" style="margin-top: 2px;">
              <span>Kalan</span>
              <span>${formatTRY(data.changeAmount ?? 0)}</span>
            </div>
          </div>
          
          <div class="receipt-divider"></div>
          
          ${
            data.orderNumber
              ? `<div class="receipt-order-number-box">
                   <span>Sipariş No: ${data.orderNumber}</span>
                 </div>
                 <div class="receipt-divider"></div>`
              : ""
          }
          
          <div class="receipt-footer">
            <div class="receipt-compliment">${data.complimentText || "Afiyet Olsun."}</div>
            <div class="receipt-logo">MERGEN TEKNOLOJİ</div>
          </div>
        </div>
      </body>
    </html>
  `;
  }

  // Ayarlar verilmişse: sanitize edilmiş dinamik şablonu oluştur
  const cfg = sanitizeReceiptSettings(settings).cashier;
  const contentWidthMm = cfg.layout.autoContentWidth
    ? (cfg.paperWidthMm === 58 ? 54 : 76)
    : cfg.layout.contentWidthMm;
  const paperWidthCss = `${contentWidthMm}mm`;
  const bodyMarginCss = cfg.layout.centerContent ? "0 auto" : "0";
  const containerPaddingCss = `2mm ${cfg.layout.paddingRightMm}mm 8mm ${cfg.layout.paddingLeftMm}mm`;
  const headerWeight = cfg.header.fontWeight === "bold" ? 900 : 400;
  const totalWeight = cfg.total.fontWeight === "bold" ? 700 : 400;
  const footerWeight = cfg.footer.fontWeight === "bold" ? 700 : 400;

  const headerTitle = cfg.header.customTitle.trim()
    ? escapeHtml(cfg.header.customTitle)
    : escapeHtml(data.branchName || "MERGEN POS");

  const compliment = cfg.footer.complimentText.trim()
    ? escapeHtml(cfg.footer.complimentText)
    : escapeHtml(data.complimentText || "Afiyet Olsun.");

  const css = `
    @page { margin: 0; }
    body {
      font-family: ${cfg.fontFamily};
      font-size: 11.5px;
      line-height: 1.35;
      color: #000;
      background: #fff;
      margin: ${bodyMarginCss};
      padding: 0;
      width: ${paperWidthCss};
    }
    .receipt-container {
      padding: ${containerPaddingCss};
    }
    .receipt-header {
      text-align: ${cfg.header.textAlign};
      margin-bottom: 8px;
    }
    .receipt-brand {
      font-size: ${cfg.header.fontSizePx}px;
      font-weight: ${headerWeight};
    }
    .receipt-extra-line {
      font-size: ${Math.max(9, cfg.header.fontSizePx - 4)}px;
      margin-top: 2px;
      word-break: break-word;
    }
    .receipt-divider { border-top: 1px dashed #000; margin: 6px 0; }
    .receipt-info {
      font-size: ${cfg.info.fontSizePx}px;
      line-height: ${cfg.info.lineHeight};
      margin-bottom: 6px;
    }
    .receipt-row { display: flex; justify-content: space-between; }
    .receipt-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 6px;
      font-size: ${cfg.items.fontSizePx}px;
      line-height: ${cfg.items.lineHeight};
    }
    .receipt-table th { text-align: left; border-bottom: 1px dashed #000; padding-bottom: 2px; font-weight: 700; }
    .receipt-table td { padding: 3px 0; vertical-align: top; }
    .receipt-table .col-qty { width: 18%; }
    .receipt-table .col-name { width: 52%; }
    .receipt-table .col-price { width: 30%; text-align: right; }
    .receipt-item-note { font-size: 9.5px; font-style: italic; display: block; margin-top: 1px; }
    .receipt-summary { margin-top: 6px; font-weight: 700; }
    .receipt-summary-total {
      font-size: ${cfg.total.fontSizePx}px;
      font-weight: ${totalWeight};
      display: flex;
      justify-content: space-between;
      margin-bottom: 6px;
    }
    .receipt-order-number-box {
      border: 2px solid #000;
      padding: 8px;
      text-align: center;
      font-size: 16px;
      font-weight: 900;
      margin: 8px 0;
    }
    .receipt-footer {
      text-align: ${cfg.footer.textAlign};
      margin-top: 10px;
    }
    .receipt-compliment {
      font-size: ${cfg.footer.fontSizePx}px;
      font-weight: ${footerWeight};
      margin-bottom: 4px;
    }
    .receipt-logo {
      font-size: 14px;
      font-weight: 900;
      text-align: center;
    }
  `;

  const itemsHtml = data.items
    .map(
      (item) => `
    <tr>
      <td class="col-qty">${item.quantity} ${escapeHtml(item.unit || "Tam")}</td>
      <td class="col-name">
        ${escapeHtml(item.name)}
        ${cfg.items.showNotes && item.note ? `<span class="receipt-item-note">- ${escapeHtml(item.note)}</span>` : ""}
      </td>
      <td class="col-price">*${formatTRY(item.totalPrice ?? (item.unitPrice ? item.quantity * item.unitPrice : 0))}</td>
    </tr>
  `
    )
    .join("");

  return `
    <html>
      <head><meta charset="utf-8"/><style>${css}</style></head>
      <body>
        <div class="receipt-container">
          <div class="receipt-header">
            ${cfg.header.showLogo && data.logoUrl ? `<div style="text-align: ${cfg.header.textAlign}; margin-bottom: 6px;"><img src="${escapeHtml(data.logoUrl)}" style="max-width: 120px; max-height: 50px; object-fit: contain;" /></div>` : ""}
            <div class="receipt-brand">${headerTitle}</div>
            ${cfg.header.showExtraLine && cfg.header.extraLine ? `<div class="receipt-extra-line">${escapeHtml(cfg.header.extraLine)}</div>` : ""}
          </div>
          
          <div class="receipt-info">
            <div class="receipt-row"><span>Tarih:</span><span>${escapeHtml(data.dateStr)}</span></div>
            <div class="receipt-row"><span>Fiş No:</span><span>${escapeHtml(data.receiptNo)}</span></div>
            <div class="receipt-row"><span>Kasiyer:</span><span>${escapeHtml(data.cashierName)}</span></div>
            <div class="receipt-row"><span>Kanal:</span><span>${escapeHtml(data.orderChannel)}</span></div>
            ${
              data.orderChannel === "PAKET" && (data.customerName || data.customerPhone || data.deliveryAddress)
                ? `
            <div style="border-top: 1px dashed #000; margin-top: 4px; padding-top: 4px;">
              <div style="font-weight: 700; margin-bottom: 2px;">PAKET MÜŞTERİ BİLGİSİ</div>
              ${data.customerName ? `<div class="receipt-row"><span>Müşteri:</span><strong>${escapeHtml(data.customerName.toUpperCase())}</strong></div>` : ""}
              ${data.customerPhone ? `<div class="receipt-row"><span>Telefon:</span><strong>${escapeHtml(data.customerPhone)}</strong></div>` : ""}
              ${data.deliveryAddress ? `<div style="margin-top: 2px;"><span>Adres:</span><div style="font-weight: 700;">${escapeHtml(data.deliveryAddress)}</div></div>` : ""}
            </div>
            `
                : ""
            }
          </div>
          
          <div class="receipt-divider"></div>
          
          <table class="receipt-table">
            <thead>
              <tr>
                <th class="col-qty">Miktar</th>
                <th class="col-name">Ürün</th>
                <th class="col-price">Tutar</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          
          <div class="receipt-divider"></div>
          
          <div class="receipt-summary-total">
            <span>TOPLAM</span>
            <span>*${formatTRY(data.total)}</span>
          </div>
          
          <div class="receipt-summary">
            <div class="receipt-row">
              <span>${data.paymentMethod ? escapeHtml(PAYMENT_METHOD_LABEL[data.paymentMethod as PaymentMethod] || data.paymentMethod) : "Belirsiz"}</span>
              <span>${formatTRY(data.total)}</span>
            </div>
            <div class="receipt-row">
              <span>Tahsil Edilen</span>
              <span>${formatTRY(data.paidAmount ?? data.total ?? 0)}</span>
            </div>
            <div class="receipt-row" style="margin-top: 2px;">
              <span>Kalan</span>
              <span>${formatTRY(data.changeAmount ?? 0)}</span>
            </div>
          </div>
          
          <div class="receipt-divider"></div>
          
          ${
            data.orderNumber
              ? `<div class="receipt-order-number-box">
                   <span>Sipariş No: ${escapeHtml(String(data.orderNumber))}</span>
                 </div>
                 <div class="receipt-divider"></div>`
              : ""
          }
          
          <div class="receipt-footer">
            <div class="receipt-compliment">${compliment}</div>
            <div class="receipt-logo">MERGEN TEKNOLOJİ</div>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Mutfak Fişi (Fiyat yok, büyük punto, notlar belirgin)
 * Eğer settings verilmezse veya boşsa, mevcut HTML'i karakteri karakterine (byte-for-byte) aynı üretir.
 */
export function generateKitchenReceiptHtml(
  data: ThermalReceiptProps,
  settings?: ReceiptSettings
): string {
  // Ayar verilmediyse mevcut orijinal şablonu BİREBİR üret
  if (!settings || Object.keys(settings).length === 0) {
    const css = `
    @page { margin: 0; }
    body {
      font-family: 'Courier New', Courier, monospace;
      color: #000;
      background: #fff;
      margin: 0;
      padding: 0;
      width: 76mm;
    }
    .receipt-container {
      padding: 2mm 3mm 8mm 3mm;
    }
    .receipt-header { text-align: center; margin-bottom: 12px; }
    .receipt-order-channel { font-size: 24px; font-weight: 900; border: 2px solid #000; padding: 4px; display: inline-block; }
    .receipt-info { font-size: 14px; margin-bottom: 12px; border-bottom: 2px dashed #000; padding-bottom: 8px; }
    .receipt-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
    
    .receipt-items { margin-top: 10px; }
    .item-row { margin-bottom: 10px; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
    .item-main { display: flex; font-size: 18px; font-weight: 900; }
    .item-qty { width: 15%; }
    .item-name { width: 85%; }
    .item-note { font-size: 16px; font-weight: 900; border: 2px solid #000; padding: 4px; margin-top: 6px; display: inline-block; }
    
    .receipt-order-number-box {
      border: 4px solid #000;
      padding: 12px;
      text-align: center;
      font-size: 28px;
      font-weight: 900;
      margin: 16px 0;
    }
  `;

    const itemsHtml = data.items
      .map(
        (item) => `
    <div class="item-row">
      <div class="item-main">
        <div class="item-qty">${item.quantity}x</div>
        <div class="item-name">${item.name}</div>
      </div>
      ${item.note ? `<div class="item-note">NOT: ${item.note}</div>` : ""}
    </div>
  `
      )
      .join("");

    return `
    <html>
      <head><style>${css}</style></head>
      <body>
        <div class="receipt-container">
          <div class="receipt-header">
            <div class="receipt-order-channel">${data.orderChannel}</div>
          </div>
          
          ${
            data.orderNumber
              ? `<div class="receipt-order-number-box">
                   SİPARİŞ: ${data.orderNumber}
                 </div>`
              : ""
          }
          
          <div class="receipt-info">
            <div class="receipt-row"><span>Tarih:</span><span>${data.dateStr}</span></div>
          </div>
          
          <div class="receipt-items">
            ${itemsHtml}
          </div>
          
        </div>
      </body>
    </html>
  `;
  }

  // Ayarlar verilmişse: sanitize edilmiş mutfak şablonunu oluştur
  const cfg = sanitizeReceiptSettings(settings).kitchen;
  const contentWidthMm = cfg.layout.autoContentWidth
    ? (cfg.paperWidthMm === 58 ? 54 : 76)
    : cfg.layout.contentWidthMm;
  const paperWidthCss = `${contentWidthMm}mm`;
  const bodyMarginCss = cfg.layout.centerContent ? "0 auto" : "0";
  const containerPaddingCss = `2mm ${cfg.layout.paddingRightMm}mm 8mm ${cfg.layout.paddingLeftMm}mm`;
  const channelWeight = cfg.header.fontWeight === "bold" ? 900 : 400;
  const itemWeight = cfg.items.itemNameFontWeight === "bold" ? 900 : 400;

  const channelTitle = cfg.header.customTitle.trim()
    ? escapeHtml(cfg.header.customTitle)
    : escapeHtml(data.orderChannel);

  const css = `
    @page { margin: 0; }
    body {
      font-family: ${cfg.fontFamily};
      color: #000;
      background: #fff;
      margin: ${bodyMarginCss};
      padding: 0;
      width: ${paperWidthCss};
    }
    .receipt-container {
      padding: ${containerPaddingCss};
    }
    .receipt-header {
      text-align: ${cfg.header.textAlign};
      margin-bottom: 12px;
    }
    .receipt-order-channel {
      font-size: ${cfg.header.fontSizePx}px;
      font-weight: ${channelWeight};
      border: 2px solid #000;
      padding: 4px;
      display: inline-block;
    }
    .receipt-info {
      font-size: ${cfg.info.fontSizePx}px;
      margin-bottom: 12px;
      border-bottom: 2px dashed #000;
      padding-bottom: 8px;
    }
    .receipt-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
    
    .receipt-items { margin-top: 10px; }
    .item-row { margin-bottom: 10px; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
    .item-main {
      display: flex;
      font-size: ${cfg.items.itemNameFontSizePx}px;
      font-weight: ${itemWeight};
    }
    .item-qty { width: 18%; }
    .item-name { width: 82%; }
    .item-note {
      font-size: ${cfg.items.noteFontSizePx}px;
      font-weight: 900;
      border: 2px solid #000;
      padding: 4px;
      margin-top: 6px;
      display: inline-block;
    }
    
    .receipt-order-number-box {
      border: 4px solid #000;
      padding: 12px;
      text-align: center;
      font-size: ${cfg.header.orderNumberFontSizePx}px;
      font-weight: 900;
      margin: 16px 0;
    }
  `;

  const itemsHtml = data.items
    .map(
      (item) => `
    <div class="item-row">
      <div class="item-main">
        <div class="item-qty">${item.quantity}x</div>
        <div class="item-name">${escapeHtml(item.name)}</div>
      </div>
      ${cfg.items.showNotes && item.note ? `<div class="item-note">NOT: ${escapeHtml(item.note)}</div>` : ""}
    </div>
  `
    )
    .join("");

  return `
    <html>
      <head><style>${css}</style></head>
      <body>
        <div class="receipt-container">
          ${
            cfg.header.showOrderChannel
              ? `<div class="receipt-header">
                   <div class="receipt-order-channel">${channelTitle}</div>
                 </div>`
              : ""
          }
          
          ${
            cfg.header.showOrderNumber && data.orderNumber
              ? `<div class="receipt-order-number-box">
                   SİPARİŞ: ${escapeHtml(String(data.orderNumber))}
                 </div>`
              : ""
          }
          
          ${
            cfg.info.showDate
              ? `<div class="receipt-info">
                   <div class="receipt-row"><span>Tarih:</span><span>${escapeHtml(data.dateStr)}</span></div>
                 </div>`
              : ""
          }
          
          <div class="receipt-items">
            ${itemsHtml}
          </div>
          
        </div>
      </body>
    </html>
  `;
}

export type ZReportData = {
  branchName: string;
  dateStr: string;
  periodLabel: string;
  cashierName?: string;
  orderCount: number;
  totalRevenue: number;
  avgBasket: number;
  payments: {
    label: string;
    amount: number;
    count: number;
  }[];
  orderTypes: {
    label: string;
    amount: number;
    count: number;
  }[];
  topProducts?: {
    name: string;
    quantity: number;
    revenue: number;
  }[];
};

/**
 * Gün Sonu / Z-Raporu Termal Fiş Şablonu
 */
export function generateZReportHtml(
  data: ZReportData,
  settings?: ReceiptSettings
): string {
  const cfg = settings ? sanitizeReceiptSettings(settings).cashier : sanitizeReceiptSettings({}).cashier;
  const contentWidthMm = cfg.layout.autoContentWidth
    ? (cfg.paperWidthMm === 58 ? 54 : 76)
    : cfg.layout.contentWidthMm;
  const paperWidthCss = `${contentWidthMm}mm`;
  const bodyMarginCss = cfg.layout.centerContent ? "0 auto" : "0";
  const containerPaddingCss = `2mm ${cfg.layout.paddingRightMm}mm 8mm ${cfg.layout.paddingLeftMm}mm`;

  const paymentsHtml = (data.payments || [])
    .filter((p) => p.amount > 0 || p.count > 0)
    .map(
      (p) => `
      <div class="receipt-row" style="margin-bottom: 3px;">
        <span>${escapeHtml(p.label)} (${p.count})</span>
        <strong>₺ ${formatTRY(p.amount)}</strong>
      </div>
    `
    )
    .join("");

  const orderTypesHtml = (data.orderTypes || [])
    .filter((t) => t.amount > 0 || t.count > 0)
    .map(
      (t) => `
      <div class="receipt-row" style="margin-bottom: 3px;">
        <span>${escapeHtml(t.label)} (${t.count})</span>
        <span>₺ ${formatTRY(t.amount)}</span>
      </div>
    `
    )
    .join("");

  const topProductsHtml = (data.topProducts || [])
    .slice(0, 5)
    .map(
      (p, i) => `
      <div class="receipt-row" style="margin-bottom: 2px;">
        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 65%;">${i + 1}. ${escapeHtml(p.name)}</span>
        <span>${p.quantity} ad. (₺${formatTRY(p.revenue)})</span>
      </div>
    `
    )
    .join("");

  const css = `
    @page { margin: 0; }
    body {
      font-family: ${cfg.fontFamily};
      font-size: 11.5px;
      line-height: 1.35;
      color: #000;
      background: #fff;
      margin: ${bodyMarginCss};
      padding: 0;
      width: ${paperWidthCss};
    }
    .receipt-container {
      padding: ${containerPaddingCss};
    }
    .receipt-header {
      text-align: center;
      margin-bottom: 8px;
    }
    .receipt-brand {
      font-size: 16px;
      font-weight: 900;
    }
    .receipt-title {
      font-size: 13px;
      font-weight: 800;
      margin-top: 4px;
      padding: 3px 0;
      border-top: 1px dashed #000;
      border-bottom: 1px dashed #000;
    }
    .receipt-divider { border-top: 1px dashed #000; margin: 6px 0; }
    .receipt-double-divider { border-top: 2px solid #000; margin: 6px 0; }
    .receipt-info {
      font-size: 10px;
      line-height: 1.35;
      margin-bottom: 6px;
    }
    .receipt-row { display: flex; justify-content: space-between; }
    .section-title {
      font-size: 11px;
      font-weight: 900;
      margin: 6px 0 4px 0;
      text-transform: uppercase;
    }
    .receipt-summary-total {
      font-size: 15px;
      font-weight: 900;
      display: flex;
      justify-content: space-between;
      margin: 4px 0;
    }
    .receipt-footer {
      text-align: center;
      margin-top: 12px;
      font-size: 12px;
      font-weight: 900;
    }
  `;

  return `
    <html>
      <head><meta charset="utf-8"/><style>${css}</style></head>
      <body>
        <div class="receipt-container">
          <div class="receipt-header">
            <div class="receipt-brand">${escapeHtml(data.branchName || "MERGEN POS")}</div>
            <div class="receipt-title">*** GÜN SONU / Z-RAPORU ***</div>
          </div>

          <div class="receipt-info">
            <div class="receipt-row"><span>Tarih:</span><span>${escapeHtml(data.dateStr)}</span></div>
            <div class="receipt-row"><span>Dönem:</span><span>${escapeHtml(data.periodLabel)}</span></div>
            ${data.cashierName ? `<div class="receipt-row"><span>Kullanıcı:</span><span>${escapeHtml(data.cashierName)}</span></div>` : ""}
          </div>

          <div class="receipt-double-divider"></div>

          <div class="receipt-summary-total">
            <span>TOPLAM CİRO</span>
            <span>₺ ${formatTRY(data.totalRevenue)}</span>
          </div>
          <div class="receipt-row" style="font-size: 11px; font-weight: 700; margin-bottom: 2px;">
            <span>Toplam Adisyon:</span>
            <span>${data.orderCount} Adet</span>
          </div>
          <div class="receipt-row" style="font-size: 11px; font-weight: 700;">
            <span>Ortalama Sepet:</span>
            <span>₺ ${formatTRY(data.avgBasket)}</span>
          </div>

          <div class="receipt-divider"></div>
          <div class="section-title">KASA / ÖDEME DAĞILIMI</div>
          ${paymentsHtml || '<div style="font-size:10px;">Kayıtlı ödeme yok</div>'}

          <div class="receipt-divider"></div>
          <div class="section-title">SİPARİŞ KANALLARI</div>
          ${orderTypesHtml || '<div style="font-size:10px;">Kayıtlı kanal verisi yok</div>'}

          ${
            topProductsHtml
              ? `
          <div class="receipt-divider"></div>
          <div class="section-title">EN ÇOK SATAN İLK 5 ÜRÜN</div>
          ${topProductsHtml}
          `
              : ""
          }

          <div class="receipt-divider"></div>
          <div class="receipt-footer">
            <div style="font-size: 10px; font-weight: normal; margin-bottom: 4px;">MALİ DEĞERİ YOKTUR · BİLGİ AMAÇLIDIR</div>
            <div>MERGEN TEKNOLOJİ</div>
          </div>
        </div>
      </body>
    </html>
  `;
}

