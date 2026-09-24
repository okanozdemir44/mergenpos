import type { ThermalReceiptProps } from "../components/receipt/ThermalReceipt";
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from "@/types/pos";

/**
 * Format a number as TRY (e.g. 150.00)
 */
function formatTRY(amount: number) {
  return amount.toFixed(2);
}

/**
 * Kasa Fişi (Müşteri için fiyata ve logoya sahip fiş)
 */
export function generateCashierReceiptHtml(data: ThermalReceiptProps): string {
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
      <td class="col-qty">${item.quantity} ${item.unit}</td>
      <td class="col-name">
        ${item.name}
        ${item.note ? `<span class="receipt-item-note">- ${item.note}</span>` : ""}
      </td>
      <td class="col-price">*${formatTRY(item.totalPrice || 0)}</td>
    </tr>
  `
    )
    .join("");

  return `
    <html>
      <head><style>${css}</style></head>
      <body>
        <div class="receipt-container">
          <div class="receipt-header">
            <div class="receipt-brand">MERGEN POS</div>
            <div class="receipt-branch">${data.branchName}</div>
          </div>
          
          <div class="receipt-info">
            <div class="receipt-row"><span>Tarih:</span><span>${data.dateStr}</span></div>
            <div class="receipt-row"><span>Fiş No:</span><span>${data.receiptNo}</span></div>
            <div class="receipt-row"><span>Kasiyer:</span><span>${data.cashierName}</span></div>
            <div class="receipt-row"><span>Kanal:</span><span>${data.orderChannel}</span></div>
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
              <span>${formatTRY(data.paidAmount || 0)}</span>
            </div>
            <div class="receipt-row" style="margin-top: 2px;">
              <span>Kalan</span>
              <span>${formatTRY(data.changeAmount || 0)}</span>
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
            <div class="receipt-compliment">Afiyet Olsun.</div>
            <div class="receipt-logo">MERGEN TEKNOLOJİ</div>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Mutfak Fişi (Fiyat yok, büyük punto, notlar belirgin)
 */
export function generateKitchenReceiptHtml(data: ThermalReceiptProps): string {
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
