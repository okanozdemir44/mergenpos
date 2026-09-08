"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useStaffSession } from "@/hooks/useStaffSession";
import type { StockItem } from "@/types/pos";

export function StockPanel() {
  const { staff } = useStaffSession();
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("adet");
  const [quantity, setQuantity] = useState("0");
  const [threshold, setThreshold] = useState("5");

  const load = useCallback(async () => {
    if (!staff) return;
    const supabase = createBrowserClient();
    setLoading(true);
    const { data, error: qe } = await supabase
      .from("stock_items")
      .select("id, restaurant_id, name, unit, quantity, critical_threshold, created_at")
      .eq("restaurant_id", staff.restaurant_id)
      .order("name");

    if (qe) {
      setError(qe.message);
      setItems([]);
    } else {
      setError(null);
      setItems(
        ((data ?? []) as StockItem[]).map((i) => ({
          ...i,
          quantity: Number(i.quantity),
          critical_threshold: Number(i.critical_threshold),
        })),
      );
    }
    setLoading(false);
  }, [staff]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!staff) return;
    const supabase = createBrowserClient();
    const { error: ie } = await supabase.from("stock_items").insert({
      restaurant_id: staff.restaurant_id,
      name: name.trim(),
      unit: unit.trim() || "adet",
      quantity: Number(quantity) || 0,
      critical_threshold: Number(threshold) || 0,
    });
    if (ie) {
      setError(ie.message);
      return;
    }
    setName("");
    setQuantity("0");
    void load();
  }

  async function updateQty(id: string, next: number) {
    if (!staff) return;
    const supabase = createBrowserClient();
    const { error: ue } = await supabase
      .from("stock_items")
      .update({ quantity: next })
      .eq("id", id)
      .eq("restaurant_id", staff.restaurant_id);
    if (ue) setError(ue.message);
    else void load();
  }

  return (
    <div>
      <header className="salon-header">
        <div>
          <p className="salon-kicker">Stok</p>
          <h1 className="salon-title">Stok takibi</h1>
          <p className="salon-muted">
            Sipariş tamamlanınca reçeteye göre stok DB trigger ile düşer.
          </p>
        </div>
      </header>

      <form className="service-create" onSubmit={onCreate}>
        <div className="service-create__grid">
          <input
            className="login-input"
            placeholder="Kalem adı"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className="login-input"
            placeholder="Birim"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
          <input
            className="login-input"
            placeholder="Miktar"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          <input
            className="login-input"
            placeholder="Kritik eşik"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
          />
          <button className="login-button" style={{ marginTop: 0 }}>
            Ekle
          </button>
        </div>
      </form>

      {error && (
        <div className="salon-banner salon-banner--error">
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <p className="salon-muted">Stok yükleniyor…</p>
      ) : items.length === 0 ? (
        <div className="salon-banner">
          <p>Stok kalemi yok. Önce ekleyin, sonra `menu_item_ingredients` ile bağlayın.</p>
        </div>
      ) : (
        <div className="service-list">
          {items.map((item) => {
            const critical = item.quantity <= item.critical_threshold;
            return (
              <article
                key={item.id}
                className={`service-card ${critical ? "service-card--critical" : ""}`}
              >
                <div>
                  <strong>{item.name}</strong>
                  <div className={critical ? "stock-critical" : "salon-muted"}>
                    {item.quantity} {item.unit}
                    {critical ? " · KRİTİK" : ""}
                    {" · eşik "}
                    {item.critical_threshold}
                  </div>
                </div>
                <div className="qty-control">
                  <button type="button" onClick={() => void updateQty(item.id, item.quantity - 1)}>
                    −
                  </button>
                  <span>{item.quantity}</span>
                  <button type="button" onClick={() => void updateQty(item.id, item.quantity + 1)}>
                    +
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
