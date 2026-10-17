"use client";

import React from "react";
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from "@/types/pos";

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
  customerName?: string | null;
  customerPhone?: string | null;
  deliveryAddress?: string | null;
  items: ReceiptItem[];
  total: number;
  paymentMethod?: PaymentMethod | string;
  paidAmount?: number;
  changeAmount?: number;
  orderNumber: number | string;
  complimentText?: string;
};

export function ThermalReceipt({
  branchName = "MERGEN POS",
  receiptNo = "457021369",
  dateStr,
  cashierName = "KASİYER",
  orderChannel = "GEL AL",
  customerName,
  customerPhone,
  deliveryAddress,
  items = [],
  total = 0,
  paymentMethod = "cash",
  paidAmount,
  changeAmount = 0,
  orderNumber = "",
  complimentText = "Afiyet Olsun.",
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

  const paymentLabel = paymentMethod ? PAYMENT_METHOD_LABEL[paymentMethod as PaymentMethod] || paymentMethod : "Belirsiz";
  const numTotal = Number(total) || 0;
  const actualPaid = Number(paidAmount ?? numTotal) || 0;
  const safeItems = Array.isArray(items) ? items : [];

  return (
    <div className="thermal-receipt" aria-hidden="true">
      {/* Şube Adı */}
      <div className="receipt-header">
        <h1 className="receipt-branch">{branchName || "MERGEN POS"}</h1>
      </div>

      {/* Meta Bilgiler */}
      <div className="receipt-meta">
        <div className="receipt-row">
          <span>{currentDate}</span>
          <span>Adisyon No: {receiptNo || "-"}</span>
        </div>
        <div className="receipt-row" style={{ marginTop: "2px" }}>
          <strong className="receipt-cashier">{(cashierName || "KASİYER").toUpperCase()}</strong>
        </div>
        <div className="receipt-row" style={{ marginTop: "3px" }}>
          <span>
            Sipariş Kanalı: <strong>{orderChannel || "GEL AL"}</strong>
          </span>
        </div>
        {orderChannel === "PAKET" && (customerName || customerPhone || deliveryAddress) && (
          <div style={{ marginTop: "6px", paddingTop: "4px", borderTop: "1px dashed #cbd5e1" }}>
            {customerName && (
              <div className="receipt-row">
                <span>Müşteri:</span>
                <strong>{String(customerName).toUpperCase()}</strong>
              </div>
            )}
            {customerPhone && (
              <div className="receipt-row" style={{ marginTop: "2px" }}>
                <span>Telefon:</span>
                <strong>{String(customerPhone)}</strong>
              </div>
            )}
            {deliveryAddress && (
              <div style={{ marginTop: "3px", textAlign: "left" }}>
                <span>Adres:</span>
                <div style={{ fontWeight: 700, fontSize: "11px", lineHeight: "1.3", marginTop: "1px" }}>
                  {String(deliveryAddress)}
                </div>
              </div>
            )}
          </div>
        )}
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
          {safeItems.map((item, index) => {
            const lineTotal = item.totalPrice ?? (Number(item.quantity) || 1) * (Number(item.unitPrice) || 0);
            return (
              <React.Fragment key={index}>
                <tr>
                  <td style={{ textAlign: "left", verticalAlign: "top" }}>{item.quantity}</td>
                  <td style={{ textAlign: "left", verticalAlign: "top" }}>{item.unit ?? "Tam"}</td>
                  <td style={{ textAlign: "left", verticalAlign: "top", fontWeight: 700 }}>
                    {String(item.name || "").toUpperCase()}
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
                      [ {String(item.note).toLowerCase()} ]
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
          <span>₺ {numTotal.toFixed(2)}</span>
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
          <span style={{ width: "22%", textAlign: "right" }}>₺ {Number(changeAmount || 0).toFixed(2)}</span>
          <span style={{ width: "23%", textAlign: "right" }}>₺ {numTotal.toFixed(2)}</span>
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
        <div className="receipt-compliment">{complimentText}</div>
        <div className="receipt-logo">MERGEN TEKNOLOJİ</div>
      </div>
    </div>
  );
}
