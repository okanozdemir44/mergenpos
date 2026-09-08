"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useStaffSession } from "@/hooks/useStaffSession";
import { formatTry } from "@/lib/money";

type RangeKey = "today" | "week" | "month" | "custom";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function rangeFor(key: RangeKey, customFrom: string, customTo: string) {
  const now = new Date();
  if (key === "today") {
    return { from: startOfDay(now), to: now };
  }
  if (key === "week") {
    const from = startOfDay(now);
    from.setDate(from.getDate() - 6);
    return { from, to: now };
  }
  if (key === "month") {
    const from = startOfDay(now);
    from.setDate(1);
    return { from, to: now };
  }
  const from = customFrom ? new Date(`${customFrom}T00:00:00`) : startOfDay(now);
  const to = customTo ? new Date(`${customTo}T23:59:59`) : now;
  return { from, to };
}

export function ReportsPanel() {
  const { staff } = useStaffSession();
  const [rangeKey, setRangeKey] = useState<RangeKey>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [orderCount, setOrderCount] = useState(0);
  const [revenue, setRevenue] = useState(0);
  const [cash, setCash] = useState(0);
  const [card, setCard] = useState(0);
  const [products, setProducts] = useState<{ name: string; qty: number; revenue: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const { from, to } = useMemo(
    () => rangeFor(rangeKey, customFrom, customTo),
    [rangeKey, customFrom, customTo],
  );

  useEffect(() => {
    if (!staff) return;

    async function run() {
      const supabase = createBrowserClient();
      setLoading(true);
      setError(null);

      const { data: orders, error: oe } = await supabase
        .from("orders")
        .select("id, total_amount, payment_method, status")
        .eq("restaurant_id", staff!.restaurant_id)
        .eq("status", "teslim_edildi")
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString());

      if (oe) {
        setError(oe.message);
        setLoading(false);
        return;
      }

      const list = orders ?? [];
      setOrderCount(list.length);
      setRevenue(list.reduce((s, o) => s + Number(o.total_amount), 0));
      setCash(list.filter((o) => o.payment_method === "cash").reduce((s, o) => s + Number(o.total_amount), 0));
      setCard(list.filter((o) => o.payment_method === "card").reduce((s, o) => s + Number(o.total_amount), 0));

      const ids = list.map((o) => o.id);
      if (ids.length === 0) {
        setProducts([]);
        setLoading(false);
        return;
      }

      const { data: items, error: ie } = await supabase
        .from("order_items")
        .select("quantity, unit_price, menu_items(name)")
        .in("order_id", ids);

      if (ie) {
        setError(ie.message);
        setLoading(false);
        return;
      }

      const map = new Map<string, { qty: number; revenue: number }>();
      for (const row of items ?? []) {
        const mi = Array.isArray(row.menu_items) ? row.menu_items[0] : row.menu_items;
        const name = (mi as { name?: string } | null)?.name ?? "Ürün";
        const cur = map.get(name) ?? { qty: 0, revenue: 0 };
        cur.qty += row.quantity;
        cur.revenue += Number(row.unit_price) * row.quantity;
        map.set(name, cur);
      }

      setProducts(
        [...map.entries()]
          .map(([name, v]) => ({ name, qty: v.qty, revenue: v.revenue }))
          .sort((a, b) => b.qty - a.qty),
      );
      setLoading(false);
    }

    void run();
  }, [staff, from, to]);

  return (
    <div>
      <header className="salon-header">
        <div>
          <p className="salon-kicker">Raporlar</p>
          <h1 className="salon-title">Gün sonu / satış</h1>
        </div>
      </header>

      <div className="order-tabs">
        {(
          [
            ["today", "Bugün"],
            ["week", "Bu hafta"],
            ["month", "Bu ay"],
            ["custom", "Özel"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`order-tab ${rangeKey === key ? "order-tab--active" : ""}`}
            onClick={() => setRangeKey(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {rangeKey === "custom" && (
        <div className="service-create__grid" style={{ marginBottom: "1rem" }}>
          <input
            className="login-input"
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
          />
          <input
            className="login-input"
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
          />
        </div>
      )}

      {error && (
        <div className="salon-banner salon-banner--error">
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <p className="salon-muted">Rapor hesaplanıyor…</p>
      ) : (
        <>
          <div className="report-cards">
            <div className="report-card">
              <span>Sipariş</span>
              <strong>{orderCount}</strong>
            </div>
            <div className="report-card">
              <span>Ciro</span>
              <strong>{formatTry(revenue)}</strong>
            </div>
            <div className="report-card">
              <span>Nakit</span>
              <strong>{formatTry(cash)}</strong>
            </div>
            <div className="report-card">
              <span>Kart</span>
              <strong>{formatTry(card)}</strong>
            </div>
          </div>

          <h2 className="order-category-title">Ürün satışları</h2>
          {products.length === 0 ? (
            <p className="salon-muted">Bu aralıkta tamamlanan satış yok.</p>
          ) : (
            <div className="service-list">
              {products.map((p) => (
                <div key={p.name} className="service-card">
                  <div>
                    <strong>{p.name}</strong>
                    <div className="salon-muted">{p.qty} adet</div>
                  </div>
                  <strong>{formatTry(p.revenue)}</strong>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
