"use client";

import type { CartLine, PaymentMethod } from "@/types/pos";
import { formatTry } from "@/lib/money";

export type OrderChannel = "TEZGAH" | "GEL AL";

type CartProps = {
  lines: CartLine[];
  total: number;
  submitting: boolean;
  error: string | null;
  orderChannel?: OrderChannel;
  onChangeOrderChannel?: (channel: OrderChannel) => void;
  paymentMethod?: PaymentMethod;
  onChangePaymentMethod?: (method: PaymentMethod) => void;
  onChangeQty: (key: string, delta: number) => void;
  onChangeNote: (key: string, note: string) => void;
  onRemove: (key: string) => void;
  onClear?: () => void;
  onSubmit: () => void;
};

export function CartPanel({
  lines,
  total,
  submitting,
  error,
  orderChannel = "GEL AL",
  onChangeOrderChannel,
  paymentMethod = "cash",
  onChangePaymentMethod,
  onChangeQty,
  onChangeNote,
  onRemove,
  onClear,
  onSubmit,
}: CartProps) {
  return (
    <aside className="order-cart adisyon__cart">
      <div className="order-cart__head">
        <div>
          <h2 className="order-cart__title">Adisyon / Sepet</h2>
          <span className="salon-muted">{lines.length} kalem ürün</span>
        </div>
        {lines.length > 0 && onClear && (
          <button
            type="button"
            className="order-cart__clear-btn"
            onClick={onClear}
            disabled={submitting}
          >
            Sepeti Temizle
          </button>
        )}
      </div>

      {/* Sipariş Kanalı Seçimi (Tezgah / Gel Al) */}
      {onChangeOrderChannel && (
        <div style={{ padding: "0.65rem 0.85rem 0" }}>
          <div className="order-cart__channel-select">
            <button
              type="button"
              className={`channel-btn ${orderChannel === "TEZGAH" ? "channel-btn--active" : ""}`}
              onClick={() => onChangeOrderChannel("TEZGAH")}
              disabled={submitting}
            >
              <span>🍔</span>
              <span>Tezgah</span>
            </button>
            <button
              type="button"
              className={`channel-btn ${orderChannel === "GEL AL" ? "channel-btn--active" : ""}`}
              onClick={() => onChangeOrderChannel("GEL AL")}
              disabled={submitting}
            >
              <span>🛍️</span>
              <span>Gel Al</span>
            </button>
          </div>
        </div>
      )}

      <div className="order-cart__list">
        {lines.length === 0 ? (
          <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "var(--pos-muted)" }}>
            <p style={{ fontSize: "2.2rem", margin: "0 0 0.5rem" }}>🛒</p>
            <p style={{ fontWeight: 600, margin: 0 }}>Sepetiniz boş</p>
            <p style={{ fontSize: "0.82rem", margin: "0.25rem 0 0" }}>
              Soldaki menüden ürün seçerek hızlı satışa başlayın.
            </p>
          </div>
        ) : (
          lines.map((line) => (
            <div key={line.key} className="cart-line">
              <div className="cart-line__top">
                <strong>{line.name}</strong>
                <button
                  type="button"
                  className="cart-line__remove"
                  onClick={() => onRemove(line.key)}
                  disabled={submitting}
                >
                  Sil
                </button>
              </div>
              <div className="cart-line__meta">
                <span>{formatTry(line.unitPrice)}</span>
                <div className="qty-control">
                  <button
                    type="button"
                    onClick={() => onChangeQty(line.key, -1)}
                    disabled={submitting}
                    aria-label="Azalt"
                  >
                    −
                  </button>
                  <span>{line.quantity}</span>
                  <button
                    type="button"
                    onClick={() => onChangeQty(line.key, 1)}
                    disabled={submitting}
                    aria-label="Artır"
                  >
                    +
                  </button>
                </div>
                <strong>{formatTry(line.unitPrice * line.quantity)}</strong>
              </div>
              <input
                className="cart-line__note"
                placeholder='Sipariş Notu (örn. "paket kola sadece et ekmek")'
                value={line.note}
                disabled={submitting}
                onChange={(e) => onChangeNote(line.key, e.target.value)}
              />
            </div>
          ))
        )}
      </div>

      <div className="order-cart__footer">
        <div className="order-cart__total">
          <span>Toplam Tutar</span>
          <strong style={{ fontSize: "1.35rem", color: "var(--pos-teal, #0f766e)" }}>
            {formatTry(total)}
          </strong>
        </div>

        {onChangePaymentMethod && (
          <div className="order-cart__payment-methods">
            <button
              type="button"
              className={`payment-method-btn ${paymentMethod === "cash" ? "payment-method-btn--active" : ""}`}
              onClick={() => onChangePaymentMethod("cash")}
              disabled={submitting}
            >
              <span>💵</span>
              <span>Nakit</span>
            </button>
            <button
              type="button"
              className={`payment-method-btn ${paymentMethod === "card" ? "payment-method-btn--active" : ""}`}
              onClick={() => onChangePaymentMethod("card")}
              disabled={submitting}
            >
              <span>💳</span>
              <span>Kredi Kartı</span>
            </button>
          </div>
        )}

        {error && <p className="salon-banner salon-banner--error">{error}</p>}

        <button
          type="button"
          className="order-cart__checkout-btn"
          disabled={lines.length === 0 || submitting}
          onClick={onSubmit}
          aria-label="Ödeme Al ve Fiş Yazdır"
        >
          {submitting ? (
            <span>İşleniyor & Yazdırılıyor…</span>
          ) : (
            <>
              <span>🖨️</span>
              <span>Ödeme Al & Fiş Bas</span>
              {lines.length > 0 && <span>({formatTry(total)})</span>}
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
