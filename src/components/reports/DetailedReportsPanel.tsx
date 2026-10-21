"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useStaffSession } from "@/hooks/useStaffSession";
import { formatTry } from "@/lib/money";
import { PAYMENT_METHOD_LABEL, PaymentMethod, ORDER_STATUS_LABEL, OrderStatus } from "@/types/pos";
import {
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

/* ── Helpers ────────────────────────────────────────── */

type OrderRow = {
  id: string;
  order_number: number;
  total_amount: number;
  payment_method: string;
  status: string;
  order_type: string;
  created_at: string;
};

const CHART_COLORS = [
  "var(--pos-teal)", "#6366f1", "#ec4899", "#10b981",
  "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6",
  "#14b8a6", "#f97316",
];

function istanbulDateRange(
  sd: number, sm: number, sy: number,
  ed: number, em: number, ey: number,
) {
  // Europe/Istanbul offset: +03:00
  const from = new Date(`${sy}-${String(sm).padStart(2, "0")}-${String(sd).padStart(2, "0")}T00:00:00+03:00`);
  const to = new Date(`${ey}-${String(em).padStart(2, "0")}-${String(ed).padStart(2, "0")}T23:59:59+03:00`);
  return { from, to };
}

function range(start: number, end: number) {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

const MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

const ORDER_TYPE_LABEL: Record<string, string> = {
  dine_in: "Salon",
  takeaway: "Paket (Gel-Al)",
  delivery: "Kurye",
};

/* ── Component ──────────────────────────────────────── */

export function DetailedReportsPanel() {
  const { staff } = useStaffSession();
  const now = new Date();

  // Date selectors
  const [startDay, setStartDay] = useState(now.getDate());
  const [startMonth, setStartMonth] = useState(now.getMonth() + 1);
  const [startYear, setStartYear] = useState(now.getFullYear());
  const [endDay, setEndDay] = useState(now.getDate());
  const [endMonth, setEndMonth] = useState(now.getMonth() + 1);
  const [endYear, setEndYear] = useState(now.getFullYear());

  // Data
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  // Order list & pagination (50'şer)
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const ITEMS_PER_PAGE = 50;

  // Order actions & cancellation
  const [activeActionMenuId, setActiveActionMenuId] = useState<string | null>(null);
  const [confirmCancelOrder, setConfirmCancelOrder] = useState<OrderRow | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [cancelSuccessMsg, setCancelSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".order-action-container")) {
        setActiveActionMenuId(null);
      }
    };
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, []);

  // Date range validation
  const dateWarning = useMemo(() => {
    const s = new Date(startYear, startMonth - 1, startDay);
    const e = new Date(endYear, endMonth - 1, endDay);
    return s > e ? "Başlangıç tarihi bitiş tarihinden büyük olamaz!" : null;
  }, [startDay, startMonth, startYear, endDay, endMonth, endYear]);

  const fetchOrders = useCallback(async () => {
    if (!staff?.restaurant_id || dateWarning) return;
    setLoading(true);
    setError(null);
    setPage(1);

    const { from, to } = istanbulDateRange(startDay, startMonth, startYear, endDay, endMonth, endYear);
    const supabase = createBrowserClient();

    const { data, error: oe } = await supabase
      .from("orders")
      .select("id, order_number, total_amount, payment_method, status, order_type, created_at")
      .eq("restaurant_id", staff.restaurant_id)
      .neq("status", "iptal")
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: false });

    if (oe) {
      setError(oe.message);
    } else {
      setOrders((data as OrderRow[]) ?? []);
    }
    setLoading(false);
    setHasFetched(true);
  }, [staff?.restaurant_id, startDay, startMonth, startYear, endDay, endMonth, endYear, dateWarning]);

  const handleCancelOrder = async (order: OrderRow) => {
    if (!staff?.restaurant_id) return;
    setCancellingOrderId(order.id);
    setError(null);

    try {
      const supabase = createBrowserClient();
      const { error: cancelErr } = await supabase
        .from("orders")
        .update({
          status: "iptal",
          total_amount: 0,
        })
        .eq("id", order.id)
        .eq("restaurant_id", staff.restaurant_id);

      if (cancelErr) {
        throw new Error(cancelErr.message);
      }

      // Siparişi listeden tamamen çıkar; ciro, ortalama sepet, grafikler ve ürünler bu sipariş yok sayılarak anında güncellenir
      setOrders(prev => prev.filter(o => o.id !== order.id));
      if (expandedId === order.id) setExpandedId(null);
      setConfirmCancelOrder(null);
      setActiveActionMenuId(null);
      setCancelSuccessMsg(`Sipariş #${order.order_number ?? "-"} başarıyla iptal edildi ve tüm hesaplamalardan çıkarıldı.`);
      setTimeout(() => setCancelSuccessMsg(null), 5000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sipariş iptal edilirken bir hata oluştu.";
      setError(msg);
    } finally {
      setCancellingOrderId(null);
    }
  };

  // Auto-fetch on mount (today)
  useEffect(() => {
    if (staff?.restaurant_id && !hasFetched) {
      void fetchOrders();
    }
  }, [staff?.restaurant_id, hasFetched, fetchOrders]);

  /* ── Computed stats ────────────────────────────────── */
  const stats = useMemo(() => {
    const totalRevenue = orders.reduce((s, o) => s + Number(o.total_amount), 0);
    const avgCart = orders.length > 0 ? totalRevenue / orders.length : 0;

    // Peak hour
    const hourBuckets: Record<number, number> = {};
    for (const o of orders) {
      const h = new Date(o.created_at).getHours();
      hourBuckets[h] = (hourBuckets[h] || 0) + 1;
    }
    let peakHour = "-";
    let peakCount = 0;
    for (const [h, c] of Object.entries(hourBuckets)) {
      if (c > peakCount) { peakCount = c; peakHour = `${h}:00`; }
    }

    // Revenue by payment method
    const paymentBreakdown: Record<string, number> = {};
    for (const o of orders) {
      const m = o.payment_method || "other";
      paymentBreakdown[m] = (paymentBreakdown[m] || 0) + Number(o.total_amount);
    }

    return { totalRevenue, avgCart, peakHour, peakCount, paymentBreakdown };
  }, [orders]);

  /* ── Chart data ───────────────────────────────────── */

  // Revenue by time (area chart)
  const revenueByTime = useMemo(() => {
    const buckets: Record<string, number> = {};
    for (const o of orders) {
      const d = new Date(o.created_at);
      const key = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets[key] = (buckets[key] || 0) + Number(o.total_amount);
    }
    return Object.entries(buckets).map(([date, total]) => ({ date, total }));
  }, [orders]);

  // Hourly distribution (bar chart)
  const hourlyData = useMemo(() => {
    const buckets: Record<number, number> = {};
    for (const o of orders) {
      const h = new Date(o.created_at).getHours();
      buckets[h] = (buckets[h] || 0) + 1;
    }
    return range(0, 23).map(h => ({
      hour: `${String(h).padStart(2, "0")}:00`,
      count: buckets[h] || 0,
    }));
  }, [orders]);

  // Payment method pie
  const paymentPie = useMemo(() => {
    return Object.entries(stats.paymentBreakdown).map(([method, amount]) => ({
      name: PAYMENT_METHOD_LABEL[method as PaymentMethod] || method,
      value: amount,
    }));
  }, [stats.paymentBreakdown]);

  // Order type distribution
  const orderTypePie = useMemo(() => {
    const buckets: Record<string, number> = {};
    for (const o of orders) {
      const t = o.order_type || "dine_in";
      buckets[t] = (buckets[t] || 0) + 1;
    }
    return Object.entries(buckets).map(([type, count]) => ({
      name: ORDER_TYPE_LABEL[type] || type,
      value: count,
    }));
  }, [orders]);

  // Top 10 products (horizontal bar)
  const [topProducts, setTopProducts] = useState<{ name: string; quantity: number; revenue: number }[]>([]);
  useEffect(() => {
    if (orders.length === 0 || !staff?.restaurant_id) {
      setTopProducts([]);
      return;
    }
    let active = true;
    const fetchTop = async () => {
      const supabase = createBrowserClient();
      const orderIds = orders.map(o => o.id);
      // Fetch in chunks to avoid URL length limits
      const chunkSize = 100;
      const allItems: { quantity: number; unit_price: number; menu_items: unknown }[] = [];
      for (let i = 0; i < orderIds.length; i += chunkSize) {
        const chunk = orderIds.slice(i, i + chunkSize);
        const { data } = await supabase
          .from("order_items")
          .select("quantity, unit_price, menu_items(name)")
          .in("order_id", chunk);
        if (data) allItems.push(...(data as unknown as typeof allItems));
      }
      if (!active) return;
      const agg: Record<string, { quantity: number; revenue: number }> = {};
      for (const item of allItems) {
        const raw = item.menu_items as { name?: string } | { name?: string }[] | null | undefined;
        const name = (Array.isArray(raw) ? raw[0]?.name : raw?.name) || "Bilinmeyen";
        if (!agg[name]) agg[name] = { quantity: 0, revenue: 0 };
        agg[name].quantity += Number(item.quantity);
        agg[name].revenue += Number(item.unit_price) * Number(item.quantity);
      }
      const sorted = Object.entries(agg)
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10);
      setTopProducts(sorted);
    };
    void fetchTop();
    return () => { active = false; };
  }, [orders, staff?.restaurant_id]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(orders.length / ITEMS_PER_PAGE));
  const currentOrders = orders.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const currentYear = now.getFullYear();
  const years = range(currentYear - 3, currentYear + 1);
  const days = range(1, 31);

  return (
    <div className="detailed-reports">
      <header className="salon-header">
        <div>
          <p className="salon-kicker">Detaylı Raporlar</p>
          <h1 className="salon-title">İstatistik & Analiz</h1>
        </div>
      </header>

      {/* ── Date filter ───────────────────────── */}
      <div className="dr-filter-row">
        <div className="dr-date-box">
          <span className="dr-date-label">Başlangıç</span>
          <div className="dr-selects">
            <select className="dr-select" value={startDay} onChange={e => setStartDay(+e.target.value)}>
              {days.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select className="dr-select" value={startMonth} onChange={e => setStartMonth(+e.target.value)}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select className="dr-select" value={startYear} onChange={e => setStartYear(+e.target.value)}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        <div className="dr-date-box">
          <span className="dr-date-label">Bitiş</span>
          <div className="dr-selects">
            <select className="dr-select" value={endDay} onChange={e => setEndDay(+e.target.value)}>
              {days.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select className="dr-select" value={endMonth} onChange={e => setEndMonth(+e.target.value)}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select className="dr-select" value={endYear} onChange={e => setEndYear(+e.target.value)}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        <button
          className="dr-filter-btn"
          onClick={fetchOrders}
          disabled={loading || !!dateWarning}
        >
          {loading ? "Yükleniyor…" : "🔍 Filtrele"}
        </button>
      </div>

      {dateWarning && (
        <div className="salon-banner salon-banner--error" style={{ marginTop: "0.5rem" }}>
          <p>⚠️ {dateWarning}</p>
        </div>
      )}
      {error && (
        <div className="salon-banner salon-banner--error" style={{ marginTop: "0.5rem" }}>
          <p>{error}</p>
        </div>
      )}
      {cancelSuccessMsg && (
        <div
          style={{
            marginTop: "0.5rem",
            padding: "0.75rem 1rem",
            borderRadius: "10px",
            background: "#ecfdf5",
            border: "1px solid #a7f3d0",
            color: "#065f46",
            fontSize: "0.9rem",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>✓ {cancelSuccessMsg}</span>
          <button
            type="button"
            onClick={() => setCancelSuccessMsg(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {!hasFetched && !loading && (
        <p className="salon-muted" style={{ marginTop: "1rem" }}>Tarih aralığı seçip "Filtrele" butonuna basın.</p>
      )}

      {loading && <p className="salon-muted" style={{ marginTop: "1rem" }}>Veriler yükleniyor…</p>}

      {hasFetched && !loading && (
        <>
          {/* ── Summary cards ──────────────────── */}
          <div className="dr-summary-cards">
            <div className="dr-card dr-card--primary">
              <div className="dr-card__label">Toplam Sipariş</div>
              <div className="dr-card__value">{orders.length}</div>
            </div>
            <div className="dr-card dr-card--success">
              <div className="dr-card__label">Toplam Ciro</div>
              <div className="dr-card__value">{formatTry(stats.totalRevenue)}</div>
            </div>
            <div className="dr-card dr-card--info">
              <div className="dr-card__label">Ortalama Sepet</div>
              <div className="dr-card__value">{formatTry(stats.avgCart)}</div>
            </div>
            <div className="dr-card dr-card--warn">
              <div className="dr-card__label">En Yoğun Saat</div>
              <div className="dr-card__value">{stats.peakHour} <span className="dr-card__sub">({stats.peakCount} sipariş)</span></div>
            </div>
            {Object.entries(stats.paymentBreakdown).map(([method, amount]) => (
              <div className="dr-card" key={method}>
                <div className="dr-card__label">{PAYMENT_METHOD_LABEL[method as PaymentMethod] || method}</div>
                <div className="dr-card__value">{formatTry(amount)}</div>
              </div>
            ))}
          </div>

          {orders.length > 0 && (
            <>
              {/* ── Charts grid ────────────────── */}
              <div className="dr-charts-grid">
                {/* Revenue Area Chart */}
                {revenueByTime.length > 1 && (
                  <div className="dr-chart-card">
                    <h3 className="dr-chart-title">Günlük Ciro</h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={revenueByTime}>
                        <defs>
                          <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--pos-teal)" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="var(--pos-teal)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₺${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v: any) => [formatTry(Number(v) || 0), "Ciro"]} />
                        <Area type="monotone" dataKey="total" stroke="var(--pos-teal)" fill="url(#colorRevenue)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Hourly Bar Chart */}
                <div className="dr-chart-card">
                  <h3 className="dr-chart-title">Saatlik Sipariş Dağılımı</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={hourlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={1} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="count" name="Sipariş" fill="var(--pos-teal)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Payment Method Pie */}
                {paymentPie.length > 0 && (
                  <div className="dr-chart-card">
                    <h3 className="dr-chart-title">Ödeme Yöntemleri</h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie data={paymentPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                          {paymentPie.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: any) => formatTry(Number(v) || 0)} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Order Type Pie */}
                {orderTypePie.length > 0 && (
                  <div className="dr-chart-card">
                    <h3 className="dr-chart-title">Sipariş Türü Dağılımı</h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie data={orderTypePie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                          {orderTypePie.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[(i + 3) % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Top 10 Products */}
                {topProducts.length > 0 && (
                  <div className="dr-chart-card dr-chart-card--wide">
                    <h3 className="dr-chart-title">En Çok Satan 10 Ürün</h3>
                    <ResponsiveContainer width="100%" height={Math.max(280, topProducts.length * 36)}>
                      <BarChart data={topProducts} layout="vertical" margin={{ left: 100 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={90} />
                        <Tooltip formatter={(v: any, name: any) => name === "revenue" ? formatTry(Number(v) || 0) : v} />
                        <Bar dataKey="quantity" name="Adet" fill="#6366f1" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* ── Order List ─────────────────── */}
              <div style={{ marginTop: "1.5rem" }}>
                <h2 className="order-category-title">
                  Tüm Siparişler ({orders.length})
                </h2>

                {currentOrders.length === 0 ? (
                  <p className="salon-muted">Bu aralıkta sipariş yok.</p>
                ) : (
                  <div className="service-list">
                    {currentOrders.map((o) => (
                      <div key={o.id} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        <div
                          className="service-card"
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr auto auto",
                            alignItems: "center",
                            gap: "0.75rem",
                            cursor: "pointer",
                            position: "relative",
                          }}
                          onClick={() => setExpandedId(prev => prev === o.id ? null : o.id)}
                        >
                          <div>
                            <strong>Sipariş #{o.order_number ?? "-"}</strong>
                            <div className="salon-muted" style={{ fontSize: "0.85rem" }}>
                              {new Date(o.created_at).toLocaleString("tr-TR")} •{" "}
                              {PAYMENT_METHOD_LABEL[o.payment_method as PaymentMethod] || o.payment_method} •{" "}
                              {ORDER_TYPE_LABEL[o.order_type] || o.order_type} •{" "}
                              <span style={{ color: o.status === "iptal" ? "var(--danger)" : "inherit" }}>
                                {ORDER_STATUS_LABEL[o.status as OrderStatus] || o.status}
                              </span>
                            </div>
                          </div>

                          <strong style={{ fontSize: "1.1rem" }}>{formatTry(Number(o.total_amount))}</strong>

                          {/* 3 Nokta İşlem Menüsü */}
                          <div
                            className="order-action-container"
                            style={{ position: "relative" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="order-dots-btn"
                              onClick={() => setActiveActionMenuId(prev => prev === o.id ? null : o.id)}
                              title="İşlemler"
                              aria-label="İşlemler"
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                <circle cx="12" cy="5" r="2.2" />
                                <circle cx="12" cy="12" r="2.2" />
                                <circle cx="12" cy="19" r="2.2" />
                              </svg>
                            </button>

                            {activeActionMenuId === o.id && (
                              <div className="order-action-dropdown">
                                <button
                                  type="button"
                                  className="order-action-dropdown__item order-action-dropdown__item--danger"
                                  onClick={() => {
                                    setActiveActionMenuId(null);
                                    setConfirmCancelOrder(o);
                                  }}
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="15" y1="9" x2="9" y2="15" />
                                    <line x1="9" y1="9" x2="15" y2="15" />
                                  </svg>
                                  <span>Siparişi İptal Et</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        {expandedId === o.id && <OrderDetailInline orderId={o.id} />}
                      </div>
                    ))}
                  </div>
                )}

                {totalPages > 1 && (
                  <div style={{ display: "flex", gap: "0.5rem", marginTop: "1.25rem", justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      style={{
                        padding: "0.45rem 0.9rem",
                        borderRadius: "8px",
                        border: "1px solid var(--pos-line)",
                        background: "#fff",
                        color: page <= 1 ? "var(--pos-muted)" : "var(--pos-ink)",
                        fontWeight: 600,
                        cursor: page <= 1 ? "not-allowed" : "pointer",
                      }}
                    >
                      ‹ Önceki
                    </button>

                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPage(p)}
                        style={{
                          padding: "0.45rem 0.9rem",
                          borderRadius: "8px",
                          border: "1px solid var(--pos-line)",
                          background: p === page ? "var(--pos-teal)" : "#fff",
                          color: p === page ? "#fff" : "var(--pos-ink)",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {p}
                      </button>
                    ))}

                    <button
                      type="button"
                      disabled={page >= totalPages}
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      style={{
                        padding: "0.45rem 0.9rem",
                        borderRadius: "8px",
                        border: "1px solid var(--pos-line)",
                        background: "#fff",
                        color: page >= totalPages ? "var(--pos-muted)" : "var(--pos-ink)",
                        fontWeight: 600,
                        cursor: page >= totalPages ? "not-allowed" : "pointer",
                      }}
                    >
                      Sonraki ›
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {orders.length === 0 && (
            <p className="salon-muted" style={{ marginTop: "1.5rem" }}>Bu tarih aralığında tamamlanan sipariş bulunamadı.</p>
          )}
        </>
      )}

      {/* İptal Onay Modalı */}
      {confirmCancelOrder && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-content" style={{ maxWidth: "420px", textAlign: "center", padding: "1.5rem" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#fee2e2", color: "#dc2626", display: "grid", placeItems: "center", margin: "0 auto 1rem" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h3 style={{ fontSize: "1.2rem", fontWeight: 700, margin: "0 0 0.5rem" }}>
              Siparişi İptal Et
            </h3>
            <p style={{ color: "#64748b", fontSize: "0.9rem", lineHeight: 1.5, margin: "0 0 1.25rem" }}>
              <strong>Sipariş #{confirmCancelOrder.order_number ?? "-"}</strong> ({formatTry(Number(confirmCancelOrder.total_amount))}) iptal edilsin mi?
              <br />
              İptal edilen sipariş cirolardan, grafiklerden ve tüm raporlardan tamamen çıkarılacaktır.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <button
                type="button"
                className="ghost-btn"
                disabled={cancellingOrderId === confirmCancelOrder.id}
                onClick={() => setConfirmCancelOrder(null)}
              >
                Vazgeç
              </button>
              <button
                type="button"
                style={{
                  background: "#dc2626",
                  color: "#fff",
                  border: "none",
                  padding: "0.6rem 1rem",
                  borderRadius: "8px",
                  fontWeight: 700,
                  cursor: cancellingOrderId === confirmCancelOrder.id ? "not-allowed" : "pointer",
                }}
                disabled={cancellingOrderId === confirmCancelOrder.id}
                onClick={() => void handleCancelOrder(confirmCancelOrder)}
              >
                {cancellingOrderId === confirmCancelOrder.id ? "İptal Ediliyor…" : "Evet, İptal Et"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

  );
}

/* ── Inline order detail ──────────────────────────── */
function OrderDetailInline({ orderId }: { orderId: string }) {
  const [items, setItems] = useState<{ id: string; quantity: number; unit_price: number; note: string | null; menu_items: unknown }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetch = async () => {
      const supabase = createBrowserClient();
      const { data } = await supabase
        .from("order_items")
        .select("id, quantity, unit_price, note, menu_items(name)")
        .eq("order_id", orderId);
      if (active && data) {
        setItems(data as unknown as typeof items);
        setLoading(false);
      }
    };
    void fetch();
    return () => { active = false; };
  }, [orderId]);

  if (loading) return <div className="salon-muted" style={{ padding: "0.5rem 1rem" }}>Ürünler yükleniyor...</div>;
  if (items.length === 0) return <div className="salon-muted" style={{ padding: "0.5rem 1rem" }}>Bu siparişte ürün bulunamadı.</div>;

  return (
    <div style={{ padding: "0.5rem 1rem", backgroundColor: "#f9fafb", borderRadius: "8px", border: "1px solid var(--pos-line)" }}>
      {items.map(item => {
        const raw = item.menu_items as { name?: string } | { name?: string }[] | null | undefined;
        const name = (Array.isArray(raw) ? raw[0]?.name : raw?.name) || "Bilinmeyen";
        return (
          <div key={item.id} style={{ display: "flex", justifyContent: "space-between", padding: "0.25rem 0", borderBottom: "1px solid #e5e7eb" }}>
            <div>
              <span>{item.quantity}x {name}</span>
              {item.note && <div className="salon-muted" style={{ fontSize: "0.85rem" }}>Not: {item.note}</div>}
            </div>
            <span>{formatTry(Number(item.unit_price) * Number(item.quantity))}</span>
          </div>
        );
      })}
    </div>
  );
}
