"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useStaffSession } from "@/hooks/useStaffSession";
import { formatTry } from "@/lib/money";

type RangeKey = "today" | "week" | "month" | "custom";
type SortOption = "dateDesc" | "dateAsc" | "priceDesc" | "priceAsc";

type OrderRow = {
  id: string;
  order_number: number;
  total_amount: number;
  payment_method: string;
  status: string;
  created_at: string;
};

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
  
  const [sortBy, setSortBy] = useState<SortOption>("dateDesc");
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 50;

  const [allOrders, setAllOrders] = useState<OrderRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const { from, to } = useMemo(
    () => rangeFor(rangeKey, customFrom, customTo),
    [rangeKey, customFrom, customTo],
  );

  // Range değiştiğinde sayfayı 1'e al
  useEffect(() => {
    setPage(1);
  }, [rangeKey, customFrom, customTo]);

  useEffect(() => {
    if (!staff) return;

    async function run() {
      const supabase = createBrowserClient();
      setLoading(true);
      setError(null);

      const { data: orders, error: oe } = await supabase
        .from("orders")
        .select("id, order_number, total_amount, payment_method, status, created_at")
        .eq("restaurant_id", staff!.restaurant_id)
        .neq("status", "iptal")
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString());

      if (oe) {
        setError(oe.message);
        setLoading(false);
        return;
      }

      setAllOrders((orders as OrderRow[]) ?? []);
      setLoading(false);
    }

    void run();
  }, [staff, from, to]);

  const { sortedOrders, totalPages, currentOrders } = useMemo(() => {
    let sorted = [...allOrders];

    if (sortBy === "dateDesc") {
      sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortBy === "dateAsc") {
      sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else if (sortBy === "priceDesc") {
      sorted.sort((a, b) => Number(b.total_amount) - Number(a.total_amount));
    } else if (sortBy === "priceAsc") {
      sorted.sort((a, b) => Number(a.total_amount) - Number(b.total_amount));
    }

    const totalPages = Math.max(1, Math.ceil(sorted.length / ITEMS_PER_PAGE));
    const validPage = Math.min(page, totalPages);
    
    const startIndex = (validPage - 1) * ITEMS_PER_PAGE;
    const currentOrders = sorted.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    return { sortedOrders: sorted, totalPages, currentOrders };
  }, [allOrders, sortBy, page]);

  const revenue = useMemo(() => allOrders.reduce((s, o) => s + Number(o.total_amount), 0), [allOrders]);
  const cash = useMemo(() => allOrders.filter(o => o.payment_method === "cash").reduce((s, o) => s + Number(o.total_amount), 0), [allOrders]);
  const card = useMemo(() => allOrders.filter(o => o.payment_method === "card").reduce((s, o) => s + Number(o.total_amount), 0), [allOrders]);
  const orderCount = allOrders.length;

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

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.55rem" }}>
            <h2 className="order-category-title" style={{ margin: 0 }}>Siparişler ({orderCount})</h2>
            <select 
              className="login-input" 
              style={{ width: "auto", padding: "0.4rem 0.75rem" }}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
            >
              <option value="dateDesc">Yeniden Eskiye</option>
              <option value="dateAsc">Eskiden Yeniye</option>
              <option value="priceDesc">Fiyata Göre Azalan</option>
              <option value="priceAsc">Fiyata Göre Artan</option>
            </select>
          </div>

          {currentOrders.length === 0 ? (
            <p className="salon-muted">Bu aralıkta tamamlanan satış yok.</p>
          ) : (
            <div className="service-list">
              {currentOrders.map((o) => (
                <div key={o.id} className="service-card" style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center" }}>
                  <div>
                    <strong>Sipariş #{o.order_number ?? "-"}</strong>
                    <div className="salon-muted">
                      {new Date(o.created_at).toLocaleString("tr-TR")} • {o.payment_method === "cash" ? "Nakit" : o.payment_method === "card" ? "Kredi Kartı" : o.payment_method}
                    </div>
                  </div>
                  <strong style={{ fontSize: "1.1rem" }}>{formatTry(Number(o.total_amount))}</strong>
                </div>
              ))}
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  style={{
                    padding: "0.4rem 0.8rem",
                    borderRadius: "6px",
                    border: "1px solid var(--pos-line)",
                    background: p === page ? "var(--pos-teal)" : "#fff",
                    color: p === page ? "#fff" : "var(--pos-ink)",
                    fontWeight: "bold",
                    cursor: "pointer"
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
