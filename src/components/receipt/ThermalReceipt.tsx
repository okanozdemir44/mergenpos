"use client";

import React from "react";

export type ReceiptItem = {
  quantity: number;
  unit?: string; // default "Tam"
  name: string;
  note?: string | null;
  unitPrice: number;
  totalPrice?: number;
};

export type ThermalReceiptProps = {
  branchName?: string;
  receiptNo?: string;
  dateStr?: string;
  cashierName?: string;
  orderChannel?: "GEL AL" | "PAKET" | "TEZGAH" | "SALON";
  items: ReceiptItem[];
  total: number;
  paymentMethod?: "cash" | "card";
  paidAmount?: number;
  changeAmount?: number;
  orderNumber: number | string;
};

export function ThermalReceipt({
  branchName = "SAMSUN / ÖKÜZ BURGER",
  receiptNo = "457021369",
  dateStr,
  cashierName = "KASİYER",
  orderChannel = "GEL AL",
  items,
  total,
  paymentMethod = "cash",
  paidAmount,
  changeAmount = 0,
  orderNumber,
}: ThermalReceiptProps) {
  const currentDate =
    dateStr ??
    new Date().toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  const paymentLabel = paymentMethod === "card" ? "Kredi Kartı" : "Nakit";
  const actualPaid = paidAmount ?? total;

  return (
    <div className="thermal-receipt" aria-hidden="true">
      {/* Şube Adı */}
      <div className="receipt-header">
        <h1 className="receipt-branch">{branchName}</h1>
      </div>

      {/* Meta Bilgiler */}
      <div className="receipt-meta">
        <div className="receipt-row">
          <span>{currentDate}</span>
          <span>Adisyon No: {receiptNo}</span>
        </div>
        <div className="receipt-row" style={{ marginTop: "2px" }}>
          <strong className="receipt-cashier">{cashierName.toUpperCase()}</strong>
        </div>
        <div className="receipt-row" style={{ marginTop: "3px" }}>
          <span>
            Sipariş Kanalı: <strong>{orderChannel}</strong>
          </span>
        </div>
      </div>

      <div className="receipt-divider" />

      {/* Ürün Listesi Tablosu */}
      <table className="receipt-table">
        <thead>
          <tr>
            <th style={{ width: "12%", textAlign: "left" }}>Adet</th>
            <th style={{ width: "14%", textAlign: "left" }}>Birim</th>
            <th style={{ width: "52%", textAlign: "left" }}>Ürün Adı</th>
            <th style={{ width: "22%", textAlign: "right" }}>Fiyat</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const lineTotal = item.totalPrice ?? item.quantity * item.unitPrice;
            return (
              <React.Fragment key={index}>
                <tr>
                  <td style={{ textAlign: "left", verticalAlign: "top" }}>{item.quantity}</td>
                  <td style={{ textAlign: "left", verticalAlign: "top" }}>{item.unit ?? "Tam"}</td>
                  <td style={{ textAlign: "left", verticalAlign: "top", fontWeight: 700 }}>
                    {item.name.toUpperCase()}
                  </td>
                  <td style={{ textAlign: "right", verticalAlign: "top" }}>
                    {lineTotal.toFixed(2)}
                  </td>
                </tr>
                {item.note && (
                  <tr>
                    <td></td>
                    <td></td>
                    <td colSpan={2} className="receipt-item-note">
                      [ {item.note.toLowerCase()} ]
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>

      <div className="receipt-divider" />

      {/* Toplam Alanı */}
      <div className="receipt-total-section">
        <div className="receipt-row receipt-grand-total">
          <span>TOPLAM</span>
          <span>₺ {total.toFixed(2)}</span>
        </div>
        <div className="receipt-row receipt-sub-row" style={{ marginTop: "4px" }}>
          <span>Tahsil Edilen</span>
          <span>{actualPaid.toFixed(2)}</span>
        </div>
      </div>

      <div className="receipt-divider" />

      {/* Ödeme Detayı */}
      <div className="receipt-payment-section">
        <div style={{ textAlign: "center", fontWeight: 700, marginBottom: "4px" }}>
          Ödeme Detayı
        </div>
        <div className="receipt-row receipt-payment-header">
          <span style={{ width: "30%", textAlign: "left" }}>Ödeme Tipi</span>
          <span style={{ width: "25%", textAlign: "right" }}>Ödeme</span>
          <span style={{ width: "22%", textAlign: "right" }}>Para Üstü</span>
          <span style={{ width: "23%", textAlign: "right" }}>Tutar</span>
        </div>
        <div className="receipt-row receipt-payment-row">
          <span style={{ width: "30%", textAlign: "left" }}>{paymentLabel}</span>
          <span style={{ width: "25%", textAlign: "right" }}>₺ {actualPaid.toFixed(2)}</span>
          <span style={{ width: "22%", textAlign: "right" }}>₺ {changeAmount.toFixed(2)}</span>
          <span style={{ width: "23%", textAlign: "right" }}>₺ {total.toFixed(2)}</span>
        </div>
      </div>

      <div className="receipt-divider" />

      {/* Tahsil Edilen / Kalan */}
      <div className="receipt-summary">
        <div className="receipt-row">
          <span>Tahsil Edilen</span>
          <span>{actualPaid.toFixed(2)}</span>
        </div>
        <div className="receipt-row" style={{ marginTop: "2px" }}>
          <span>Kalan</span>
          <span>0.00</span>
        </div>
      </div>

      <div className="receipt-divider" />

      {/* Sipariş No / Sıra No */}
      <div className="receipt-order-number-box">
        <span>Sipariş No: {orderNumber}</span>
      </div>

      <div className="receipt-divider" />

      {/* Alt Bilgi */}
      <div className="receipt-footer">
        <div className="receipt-compliment">Afiyet Olsun.</div>
        <div className="receipt-logo">MERGEN TEKNOLOJİ</div>
      </div>
    </div>
  );
}
