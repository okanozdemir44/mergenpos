"use client";

import { useMemo, useState } from "react";
import type { BillLine, PaymentMethod } from "@/types/pos";
import { PAYMENT_METHOD_LABEL } from "@/types/pos";
import { formatTry } from "@/lib/money";

type Props = {
  restaurantName: string;
  tableName: string;
  lines: BillLine[];
  open: boolean;
  submitting: boolean;
  error: string | null;
  allowEmptyClose?: boolean;
  onClose: () => void;
  onConfirm: (method: PaymentMethod) => void;
};

export function BillCloseModal({
  restaurantName,
  tableName,
  lines,
  open,
  submitting,
  error,
  allowEmptyClose = false,
  onClose,
  onConfirm,
}: Props) {
  const [method, setMethod] = useState<PaymentMethod>("cash");

  const total = useMemo(
    () => lines.reduce((sum, l) => sum + l.unit_price * l.quantity, 0),
    [lines],
  );

  const canConfirm = !submitting && (lines.length > 0 || allowEmptyClose);

  if (!open) return null;

  function printInfoSlip() {
    const now = new Date();
    const rows = lines
      .map(
        (l) =>
          `<tr>
            <td>${l.name}${l.note ? `<br/><small>${l.note}</small>` : ""}</td>
            <td style="text-align:center">${l.quantity}</td>
            <td style="text-align:right">${formatTry(l.unit_price)}</td>
            <td style="text-align:right">${formatTry(l.unit_price * l.quantity)}</td>
          </tr>`,
      )
      .join("");

    const html = `<!doctype html>
<html><head><meta charset="utf-8"/><title>Bilgi Fişi</title>
<style>
  body{font-family:ui-monospace,Consolas,monospace;padding:16px;color:#111}
  h1{font-size:16px;margin:0 0 4px}
  h2{font-size:14px;margin:0 0 12px;font-weight:600}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th,td{padding:6px 4px;border-bottom:1px solid #ddd;vertical-align:top}
  .total{font-size:16px;font-weight:700;margin-top:12px;display:flex;justify-content:space-between}
  .disclaimer{margin-top:18px;font-size:13px;font-weight:800;text-align:center;border-top:2px dashed #333;padding-top:12px}
</style></head><body>
  <h1>${restaurantName}</h1>
  <h2>${tableName} · ${now.toLocaleString("tr-TR")}</h2>
  <table>
    <thead><tr><th align="left">Ürün</th><th>Adet</th><th align="right">Birim</th><th align="right">Tutar</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="total"><span>Genel Toplam</span><span>${formatTry(total)}</span></div>
  <div class="disclaimer">BİLGİ FİŞİDİR, MALİ DEĞERİ YOKTUR</div>
  <script>window.onload=()=>{window.print();}</script>
</body></html>`;

    const w = window.open("", "_blank", "noopener,noreferrer,width=420,height=640");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <header className="modal-card__head">
          <div>
            <p className="salon-kicker">Hesap</p>
            <h2 className="salon-title" style={{ fontSize: "1.5rem" }}>
              {tableName}
            </h2>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onClose();
            }}
            className="cart-line__remove"
          >
            Kapat
          </button>
        </header>

        <div className="bill-lines">
          {lines.length === 0 ? (
            <p className="salon-muted">
              {allowEmptyClose
                ? "Açık kalem yok. Yine de masayı boşaltıp hesabı kapatabilirsiniz."
                : "Bu masada açık kalem yok."}
            </p>
          ) : (
            lines.map((l) => (
              <div key={l.id} className="bill-line">
                <div>
                  <strong>
                    {l.quantity}× {l.name}
                  </strong>
                  {l.note ? <div className="salon-muted">{l.note}</div> : null}
                </div>
                <strong>{formatTry(l.unit_price * l.quantity)}</strong>
              </div>
            ))
          )}
        </div>

        <div className="order-cart__total">
          <span>Toplam</span>
          <strong>{formatTry(total)}</strong>
        </div>

        <div className="pay-methods">
          {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => (
            <button
              key={m}
              type="button"
              className={`pay-chip ${method === m ? "pay-chip--active" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                setMethod(m);
              }}
            >
              {PAYMENT_METHOD_LABEL[m]}
            </button>
          ))}
        </div>

        {error && <p className="salon-banner salon-banner--error">{error}</p>}

        <div className="modal-actions">
          <button
            type="button"
            className="ghost-btn"
            onClick={(e) => {
              e.preventDefault();
              printInfoSlip();
            }}
            disabled={lines.length === 0}
          >
            Yazdır (bilgi fişi)
          </button>
          <button
            type="button"
            className="login-button"
            disabled={!canConfirm}
            onClick={(e) => {
              e.preventDefault();
              onConfirm(method);
            }}
          >
            {submitting
              ? "Kapatılıyor…"
              : lines.length === 0
                ? "Masayı Boşalt"
                : "Ödemeyi Onayla"}
          </button>
        </div>
      </div>
    </div>
  );
}
