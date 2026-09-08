"use client";

import type { CartLine } from "@/types/pos";
import { formatTry } from "@/lib/money";

type CartProps = {
  lines: CartLine[];
  total: number;
  submitting: boolean;
  error: string | null;
  onChangeQty: (key: string, delta: number) => void;
  onChangeNote: (key: string, note: string) => void;
  onRemove: (key: string) => void;
  onSubmit: () => void;
};

export function CartPanel({
  lines,
  total,
  submitting,
  error,
  onChangeQty,
  onChangeNote,
  onRemove,
  onSubmit,
}: CartProps) {
  return (
    <aside className="order-cart">
      <div className="order-cart__head">
        <h2 className="order-cart__title">Sepet</h2>
        <span className="salon-muted">{lines.length} kalem</span>
      </div>

      <div className="order-cart__list">
        {lines.length === 0 ? (
          <p className="salon-muted">Ürüne tıklayarak sepete ekleyin.</p>
        ) : (
          lines.map((line) => (
            <div key={line.key} className="cart-line">
              <div className="cart-line__top">
                <strong>{line.name}</strong>
                <button type="button" className="cart-line__remove" onClick={() => onRemove(line.key)}>
                  Sil
                </button>
              </div>
              <div className="cart-line__meta">
                <span>{formatTry(line.unitPrice)}</span>
                <div className="qty-control">
                  <button type="button" onClick={() => onChangeQty(line.key, -1)} aria-label="Azalt">
                    −
                  </button>
                  <span>{line.quantity}</span>
                  <button type="button" onClick={() => onChangeQty(line.key, 1)} aria-label="Artır">
                    +
                  </button>
                </div>
                <strong>{formatTry(line.unitPrice * line.quantity)}</strong>
              </div>
              <input
                className="cart-line__note"
                placeholder='Not (örn. "acısız olsun")'
                value={line.note}
                onChange={(e) => onChangeNote(line.key, e.target.value)}
              />
            </div>
          ))
        )}
      </div>

      <div className="order-cart__footer">
        <div className="order-cart__total">
          <span>Toplam</span>
          <strong>{formatTry(total)}</strong>
        </div>
        {error && <p className="salon-banner salon-banner--error">{error}</p>}
        <button
          type="button"
          className="login-button"
          disabled={lines.length === 0 || submitting}
          onClick={onSubmit}
        >
          {submitting ? "Gönderiliyor…" : "Siparişi Gönder"}
        </button>
      </div>
    </aside>
  );
}
