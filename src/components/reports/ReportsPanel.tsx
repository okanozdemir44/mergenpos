"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useStaffSession } from "@/hooks/useStaffSession";
import { formatTry } from "@/lib/money";
import { PAYMENT_METHOD_LABEL, PaymentMethod } from "@/types/pos";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type RangeKey = "today" | "week" | "month" | "custom";
type SortOption = "dateDesc" | "dateAsc" | "priceDesc" | "priceAsc";

type OrderRow = {
  id: string;
  order_number: number;
  total_amount: number;
  payment_method: string;
  status: string;
  order_type: string;
  created_at: string;
};

type TopProduct = {
  name: string;
  quantity: number;
  revenue: number;
};

const PAYMENT_COLORS: Record<string, string> = {
  cash: "#10b981",        // Yeşil
  card: "#3b82f6",        // Mavi
  pluxee: "#f59e0b",      // Amber
  multinet: "#8b5cf6",    // Mor
  edered: "#ef4444",      // Kırmızı
  metropolcard: "#06b6d4",// Camgöbeği
  tokenflex: "#ec4899",   // Pembe
  setcard: "#14b8a6",     // Turkuaz
  other: "#94a3b8",       // Gri
};

const ORDER_TYPE_COLORS: Record<string, string> = {
  dine_in: "var(--pos-teal, #f59e0b)",
  takeaway: "#3b82f6",
  delivery: "#10b981",
};

const ORDER_TYPE_NAMES: Record<string, string> = {
  dine_in: "Salon",
  takeaway: "Paket (Gel-Al)",
  delivery: "Kurye",
};

const MONTHS_TR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

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

/* ── SVG Icons ── */
function CurrencyIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M6 12h.01M18 12h.01" />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

function ChartTrendIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
    </svg>
  );
}

function EmptyChartIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

/* ── Main Component ── */
export function ReportsPanel() {
  const { staff } = useStaffSession();
  const [rangeKey, setRangeKey] = useState<RangeKey>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const [sortBy, setSortBy] = useState<SortOption>("dateDesc");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 50;

  const [allOrders, setAllOrders] = useState<OrderRow[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>("");
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  const [trendMetric, setTrendMetric] = useState<"revenue" | "count">("revenue");
  const [distributionMode, setDistributionMode] = useState<"payment" | "orderType">("payment");
  const [isMounted, setIsMounted] = useState(false);
  const [isPrintingZReport, setIsPrintingZReport] = useState(false);
  const [zReportMessage, setZReportMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    setIsMounted(true);
    setLastRefreshedAt(new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }));
  }, []);

  const { from, to } = useMemo(
    () => rangeFor(rangeKey, customFrom, customTo),
    [rangeKey, customFrom, customTo],
  );

  useEffect(() => {
    setPage(1);
  }, [rangeKey, customFrom, customTo, paymentFilter]);

  const fetchReportData = useCallback(async (isManualRefresh = false) => {
    if (!staff?.restaurant_id) return;
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    const supabase = createBrowserClient();

    try {
      const { data: orders, error: oe } = await supabase
        .from("orders")
        .select("id, order_number, total_amount, payment_method, status, order_type, created_at")
        .eq("restaurant_id", staff.restaurant_id)
        .neq("status", "iptal")
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString())
        .order("created_at", { ascending: false });

      if (oe) {
        setError(oe.message);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const ordersList = (orders as OrderRow[]) ?? [];
      setAllOrders(ordersList);

      // Fetch top selling products if there are orders
      if (ordersList.length > 0) {
        const orderIds = ordersList.map((o) => o.id);
        const chunkSize = 80;
        const allItems: { quantity: number; unit_price: number; menu_items: unknown }[] = [];

        for (let i = 0; i < orderIds.length; i += chunkSize) {
          const chunk = orderIds.slice(i, i + chunkSize);
          const { data } = await supabase
            .from("order_items")
            .select("quantity, unit_price, menu_items(name)")
            .in("order_id", chunk);
          if (data) allItems.push(...(data as unknown as typeof allItems));
        }

        const agg: Record<string, { quantity: number; revenue: number }> = {};
        for (const item of allItems) {
          const raw = item.menu_items as { name?: string } | { name?: string }[] | null | undefined;
          const name = (Array.isArray(raw) ? raw[0]?.name : raw?.name) || "Bilinmeyen Ürün";
          if (!agg[name]) agg[name] = { quantity: 0, revenue: 0 };
          agg[name].quantity += Number(item.quantity) || 1;
          agg[name].revenue += (Number(item.unit_price) || 0) * (Number(item.quantity) || 1);
        }

        const sorted = Object.entries(agg)
          .map(([name, v]) => ({ name, ...v }))
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 5);

        setTopProducts(sorted);
      } else {
        setTopProducts([]);
      }

      setLastRefreshedAt(new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Rapor verileri alınırken bir hata oluştu.";
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [staff?.restaurant_id, from, to]);

  useEffect(() => {
    void fetchReportData(false);
  }, [fetchReportData]);

  /* ── Computed Metrics ── */
  const orderCount = allOrders.length;
  const revenue = useMemo(() => allOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0), [allOrders]);
  const avgBasket = useMemo(() => (orderCount > 0 ? revenue / orderCount : 0), [orderCount, revenue]);

  // Peak Hour
  const peakHourStats = useMemo(() => {
    if (allOrders.length === 0) return { hour: "-", count: 0 };
    const hourBuckets: Record<number, number> = {};
    for (const o of allOrders) {
      const h = new Date(o.created_at).getHours();
      hourBuckets[h] = (hourBuckets[h] || 0) + 1;
    }
    let maxHour = -1;
    let maxCount = 0;
    for (const [h, count] of Object.entries(hourBuckets)) {
      if (count > maxCount) {
        maxCount = count;
        maxHour = Number(h);
      }
    }
    return {
      hour: maxHour >= 0 ? `${String(maxHour).padStart(2, "0")}:00` : "-",
      count: maxCount,
    };
  }, [allOrders]);

  // Payment Breakdown
  const paymentBreakdown = useMemo(() => {
    const methods: Record<string, { count: number; amount: number }> = {};
    for (const o of allOrders) {
      const m = o.payment_method || "other";
      if (!methods[m]) methods[m] = { count: 0, amount: 0 };
      methods[m].count += 1;
      methods[m].amount += Number(o.total_amount || 0);
    }
    return methods;
  }, [allOrders]);

  // Timeline / Trend Data
  const trendChartData = useMemo(() => {
    if (rangeKey === "today") {
      // 08:00 - 23:00 hourly distribution
      const buckets: Record<number, { revenue: number; count: number }> = {};
      for (let h = 8; h <= 23; h++) {
        buckets[h] = { revenue: 0, count: 0 };
      }
      for (const o of allOrders) {
        const h = new Date(o.created_at).getHours();
        if (!buckets[h]) {
          buckets[h] = { revenue: 0, count: 0 };
        }
        buckets[h].revenue += Number(o.total_amount || 0);
        buckets[h].count += 1;
      }
      return Object.entries(buckets)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([h, v]) => ({
          label: `${String(h).padStart(2, "0")}:00`,
          revenue: Math.round(v.revenue * 100) / 100,
          count: v.count,
        }));
    }

    // Daily distribution for Week, Month, Custom
    const buckets: Record<string, { revenue: number; count: number }> = {};
    for (const o of allOrders) {
      const d = new Date(o.created_at);
      const key = `${d.getDate()} ${MONTHS_TR[d.getMonth()]}`;
      if (!buckets[key]) buckets[key] = { revenue: 0, count: 0 };
      buckets[key].revenue += Number(o.total_amount || 0);
      buckets[key].count += 1;
    }

    return Object.entries(buckets).map(([label, v]) => ({
      label,
      revenue: Math.round(v.revenue * 100) / 100,
      count: v.count,
    }));
  }, [allOrders, rangeKey]);

  // Payment Donut Data
  const paymentDonutData = useMemo(() => {
    return Object.entries(paymentBreakdown).map(([method, data]) => ({
      key: method,
      name: PAYMENT_METHOD_LABEL[method as PaymentMethod] || method,
      value: Math.round(data.amount * 100) / 100,
      count: data.count,
      color: PAYMENT_COLORS[method] || PAYMENT_COLORS.other,
    }));
  }, [paymentBreakdown]);

  // Order Type Donut Data
  const orderTypeDonutData = useMemo(() => {
    const buckets: Record<string, { count: number; amount: number }> = {};
    for (const o of allOrders) {
      const t = o.order_type || "dine_in";
      if (!buckets[t]) buckets[t] = { count: 0, amount: 0 };
      buckets[t].count += 1;
      buckets[t].amount += Number(o.total_amount || 0);
    }
    return Object.entries(buckets).map(([type, data]) => ({
      key: type,
      name: ORDER_TYPE_NAMES[type] || type,
      value: Math.round(data.amount * 100) / 100,
      count: data.count,
      color: ORDER_TYPE_COLORS[type] || "#6366f1",
    }));
  }, [allOrders]);

  // Filtered & Sorted Orders
  const { currentOrders, totalPages, filteredCount } = useMemo(() => {
    let list = [...allOrders];

    if (paymentFilter !== "all") {
      list = list.filter((o) => (o.payment_method || "other") === paymentFilter);
    }

    if (sortBy === "dateDesc") {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortBy === "dateAsc") {
      list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else if (sortBy === "priceDesc") {
      list.sort((a, b) => Number(b.total_amount) - Number(a.total_amount));
    } else if (sortBy === "priceAsc") {
      list.sort((a, b) => Number(a.total_amount) - Number(b.total_amount));
    }

    const totalPages = Math.max(1, Math.ceil(list.length / ITEMS_PER_PAGE));
    const validPage = Math.min(page, totalPages);
    const startIndex = (validPage - 1) * ITEMS_PER_PAGE;
    const currentOrders = list.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    return { currentOrders, totalPages, filteredCount: list.length };
  }, [allOrders, paymentFilter, sortBy, page]);

  // Period title helper
  const periodLabel = useMemo(() => {
    const now = new Date();
    if (rangeKey === "today") {
      return `${now.getDate()} ${MONTHS_TR[now.getMonth()]} ${now.getFullYear()} (Bugün)`;
    }
    if (rangeKey === "week") {
      const past = new Date(now);
      past.setDate(past.getDate() - 6);
      return `${past.getDate()} ${MONTHS_TR[past.getMonth()]} - ${now.getDate()} ${MONTHS_TR[now.getMonth()]} ${now.getFullYear()} (Son 7 Gün)`;
    }
    if (rangeKey === "month") {
      return `${MONTHS_TR[now.getMonth()]} ${now.getFullYear()} (Bu Ay)`;
    }
    return `${from.toLocaleDateString("tr-TR")} - ${to.toLocaleDateString("tr-TR")}`;
  }, [rangeKey, from, to]);

  const maxTopQty = topProducts.length > 0 ? Math.max(...topProducts.map((p) => p.quantity)) : 1;

  const handlePrintZReport = async () => {
    setIsPrintingZReport(true);
    setZReportMessage(null);
    try {
      const kasaPrinter = typeof window !== "undefined" ? localStorage.getItem("PRINTER_KASA") : null;
      if (!kasaPrinter) {
        setZReportMessage({
          type: "error",
          text: "Kasa yazıcısı seçilmemiş. Lütfen sol menüden 'Yazıcılar' sekmesine gidip bir Kasa yazıcısı seçin.",
        });
        setIsPrintingZReport(false);
        return;
      }

      const { printReceiptHtml, getOrFetchReceiptSettings } = await import("@/lib/unified-printer");
      const { generateZReportHtml } = await import("@/lib/receipt-generators");
      const settings = await getOrFetchReceiptSettings(staff?.restaurant_id);

      const branchName = staff?.restaurant_id === "8c3d0702-06fd-43f1-809a-062153bf7486" ? "Öküz Burger" : "Mergen POS";

      const zHtml = generateZReportHtml(
        {
          branchName,
          dateStr: new Date().toLocaleString("tr-TR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
          periodLabel,
          cashierName: staff?.name,
          orderCount,
          totalRevenue: revenue,
          avgBasket,
          payments: paymentDonutData.map((p) => ({
            label: p.name,
            amount: p.value,
            count: p.count || 0,
          })),
          orderTypes: orderTypeDonutData.map((o) => ({
            label: o.name,
            amount: o.value,
            count: o.count || 0,
          })),
          topProducts: topProducts.map((tp) => ({
            name: tp.name,
            quantity: tp.quantity,
            revenue: tp.revenue,
          })),
        },
        settings
      );

      await printReceiptHtml(kasaPrinter, zHtml, {
        paperWidthMm: settings.cashier.paperWidthMm,
      });

      setZReportMessage({
        type: "success",
        text: `Gün sonu fişi "${kasaPrinter}" yazıcısına gönderildi.`,
      });
    } catch (err: any) {
      console.error("Gün sonu fişi yazdırma hatası:", err);
      setZReportMessage({
        type: "error",
        text: `Yazdırma başarısız: ${err?.message || "Yazıcı yanıt vermedi"}`,
      });
    } finally {
      setIsPrintingZReport(false);
    }
  };

  return (
    <div>
      {/* ── Header ── */}
      <header className="salon-header">
        <div>
          <p className="salon-kicker">Raporlar & Analiz</p>
          <h1 className="salon-title" style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            Gün sonu / satış
          </h1>
          <p style={{ margin: "0.2rem 0 0", fontSize: "0.85rem", color: "var(--pos-muted)", fontWeight: 500 }}>
            {periodLabel}
          </p>
        </div>

        <div className="report-header-actions">
          {lastRefreshedAt && (
            <span style={{ fontSize: "0.8rem", color: "var(--pos-muted)", fontWeight: 600 }}>
              Son güncelleme: {lastRefreshedAt}
            </span>
          )}
          <button
            type="button"
            className="report-refresh-btn"
            style={{
              background: "#059669",
              color: "#fff",
              border: "none",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.5rem 0.9rem",
              borderRadius: "8px",
              cursor: isPrintingZReport ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
            onClick={handlePrintZReport}
            disabled={isPrintingZReport || loading}
            title="Gün Sonu / Z-Raporunu termal fiş olarak yazdır"
          >
            <span>🧾</span>
            <span>{isPrintingZReport ? "Yazdırılıyor..." : "Gün Sonu Fişi Yazdır"}</span>
          </button>
          <button
            type="button"
            className={`report-refresh-btn ${refreshing ? "report-refresh-btn--loading" : ""}`}
            onClick={() => void fetchReportData(true)}
            disabled={refreshing || loading}
            title="Verileri yeniden yükle"
          >
            <RefreshIcon />
            <span>{refreshing ? "Yenileniyor..." : "Yenile"}</span>
          </button>
        </div>
      </header>

      {zReportMessage && (
        <div
          style={{
            margin: "0.75rem 0 1rem 0",
            padding: "0.65rem 1rem",
            borderRadius: "8px",
            background: zReportMessage.type === "success" ? "#ecfdf5" : "#fef2f2",
            border: `1px solid ${zReportMessage.type === "success" ? "#a7f3d0" : "#fecaca"}`,
            color: zReportMessage.type === "success" ? "#065f46" : "#991b1b",
            fontSize: "0.85rem",
            fontWeight: 600,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{zReportMessage.text}</span>
          <button
            onClick={() => setZReportMessage(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Time Filter Tabs ── */}
      <div className="order-tabs" style={{ marginBottom: rangeKey === "custom" ? "0.65rem" : "1.25rem", borderRadius: "12px", border: "1px solid var(--pos-line)" }}>
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
        <div className="service-create__grid" style={{ marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--pos-muted)" }}>Başlangıç Tarihi</span>
            <input
              className="login-input"
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--pos-muted)" }}>Bitiş Tarihi</span>
            <input
              className="login-input"
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="salon-banner salon-banner--error" style={{ marginBottom: "1rem" }}>
          <p>⚠️ {error}</p>
        </div>
      )}

      {/* ── Top 4 KPI Metric Cards ── */}
      <div className="report-stat-grid">
        <div className="report-stat-card report-stat-card--primary">
          <div className="report-stat-card__body">
            <span className="report-stat-card__label">Toplam Ciro</span>
            <span className="report-stat-card__value" style={{ color: "var(--pos-teal, #d97706)" }}>
              {formatTry(revenue)}
            </span>
            <span className="report-stat-card__sub">
              {orderCount > 0 ? `${orderCount} tamamlanan sipariş` : "Tamamlanan satış yok"}
            </span>
          </div>
          <div className="report-stat-card__icon report-stat-card__icon--primary">
            <CurrencyIcon />
          </div>
        </div>

        <div className="report-stat-card report-stat-card--blue">
          <div className="report-stat-card__body">
            <span className="report-stat-card__label">Toplam Sipariş</span>
            <span className="report-stat-card__value">{orderCount}</span>
            <span className="report-stat-card__sub">Seçilen aralıkta tamamlanan</span>
          </div>
          <div className="report-stat-card__icon report-stat-card__icon--blue">
            <BagIcon />
          </div>
        </div>

        <div className="report-stat-card report-stat-card--green">
          <div className="report-stat-card__body">
            <span className="report-stat-card__label">Ortalama Sepet</span>
            <span className="report-stat-card__value">{formatTry(avgBasket)}</span>
            <span className="report-stat-card__sub">Sipariş başı ortalama tutar</span>
          </div>
          <div className="report-stat-card__icon report-stat-card__icon--green">
            <ChartTrendIcon />
          </div>
        </div>

        <div className="report-stat-card report-stat-card--purple">
          <div className="report-stat-card__body">
            <span className="report-stat-card__label">En Yoğun Saat</span>
            <span className="report-stat-card__value">{peakHourStats.hour}</span>
            <span className="report-stat-card__sub">
              {peakHourStats.count > 0 ? `${peakHourStats.count} sipariş ile zirve` : "Veri bekleniyor"}
            </span>
          </div>
          <div className="report-stat-card__icon report-stat-card__icon--purple">
            <ClockIcon />
          </div>
        </div>
      </div>

      {/* ── Payment Methods Pill Breakdown Bar ── */}
      {Object.keys(paymentBreakdown).length > 0 && (
        <div className="report-methods-bar">
          <span className="report-methods-bar__title">Ödeme Dağılımı:</span>
          {Object.entries(paymentBreakdown).map(([method, data]) => {
            const label = PAYMENT_METHOD_LABEL[method as PaymentMethod] || method;
            const color = PAYMENT_COLORS[method] || PAYMENT_COLORS.other;
            const percent = revenue > 0 ? Math.round((data.amount / revenue) * 100) : 0;
            return (
              <div key={method} className="report-method-chip" title={`${data.count} işlem`}>
                <span className="report-method-dot" style={{ backgroundColor: color }} />
                <span>{label}:</span>
                <strong style={{ color: "var(--pos-ink)" }}>{formatTry(data.amount)}</strong>
                <span style={{ color: "var(--pos-muted)", fontSize: "0.75rem" }}>({percent}%)</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Visual Charts Grid ── */}
      <div className="report-charts-grid">
        {/* Left Chart: Time Trend (Hourly / Daily) */}
        <div className="report-chart-card">
          <div className="report-chart-header">
            <h3 className="report-chart-title">
              <ChartTrendIcon />
              {rangeKey === "today" ? "Saatlik Satış Akışı" : "Zaman Bazlı Satış Trendi"}
            </h3>
            <div className="report-pill-group">
              <button
                type="button"
                className={`report-pill-btn ${trendMetric === "revenue" ? "report-pill-btn--active" : ""}`}
                onClick={() => setTrendMetric("revenue")}
              >
                Ciro (₺)
              </button>
              <button
                type="button"
                className={`report-pill-btn ${trendMetric === "count" ? "report-pill-btn--active" : ""}`}
                onClick={() => setTrendMetric("count")}
              >
                Sipariş Sayısı
              </button>
            </div>
          </div>

          {orderCount === 0 ? (
            <div className="report-empty-placeholder">
              <div className="report-empty-placeholder__icon">
                <EmptyChartIcon />
              </div>
              <strong className="report-empty-placeholder__title">Henüz Satış Verisi Yok</strong>
              <p className="report-empty-placeholder__desc">
                Seçilen tarih aralığında tamamlanmış sipariş bulunmuyor. Siparişler kapatıldıkça saatlik akış grafiğe yansıyacaktır.
              </p>
            </div>
          ) : isMounted ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trendChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--pos-teal, #f59e0b)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--pos-teal, #f59e0b)" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => (trendMetric === "revenue" ? `₺${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}` : `${v}`)}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div
                          style={{
                            background: "rgba(15, 23, 42, 0.94)",
                            color: "#fff",
                            padding: "0.6rem 0.85rem",
                            borderRadius: "10px",
                            boxShadow: "0 4px 14px rgba(0,0,0,0.2)",
                            fontSize: "0.82rem",
                          }}
                        >
                          <div style={{ fontWeight: 800, marginBottom: "0.3rem", color: "#f8fafc" }}>
                            {label}
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                            <span style={{ color: "#94a3b8" }}>Ciro:</span>
                            <strong>{formatTry(data.revenue)}</strong>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                            <span style={{ color: "#94a3b8" }}>Sipariş:</span>
                            <strong>{data.count} adet</strong>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey={trendMetric}
                  stroke="var(--pos-teal, #f59e0b)"
                  strokeWidth={2.5}
                  fill="url(#trendGradient)"
                  dot={{ r: 3, fill: "var(--pos-teal, #f59e0b)", strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: "var(--pos-teal, #f59e0b)", stroke: "#fff", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 260 }} />
          )}
        </div>

        {/* Right Chart: Donut Distribution */}
        <div className="report-chart-card">
          <div className="report-chart-header">
            <h3 className="report-chart-title">Dağılım Analizi</h3>
            <div className="report-pill-group">
              <button
                type="button"
                className={`report-pill-btn ${distributionMode === "payment" ? "report-pill-btn--active" : ""}`}
                onClick={() => setDistributionMode("payment")}
              >
                Ödeme Türü
              </button>
              <button
                type="button"
                className={`report-pill-btn ${distributionMode === "orderType" ? "report-pill-btn--active" : ""}`}
                onClick={() => setDistributionMode("orderType")}
              >
                Sipariş Tipi
              </button>
            </div>
          </div>

          {orderCount === 0 ? (
            <div className="report-empty-placeholder">
              <div className="report-empty-placeholder__icon">
                <CurrencyIcon />
              </div>
              <strong className="report-empty-placeholder__title">Dağılım Bekleniyor</strong>
              <p className="report-empty-placeholder__desc">
                Ödeme yöntemi ve sipariş kanalı oranları siparişler alındığında burada gösterilecektir.
              </p>
            </div>
          ) : isMounted ? (
            <div>
              <ResponsiveContainer width="100%" height={175}>
                <PieChart>
                  <Pie
                    data={distributionMode === "payment" ? paymentDonutData : orderTypeDonutData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={3}
                  >
                    {(distributionMode === "payment" ? paymentDonutData : orderTypeDonutData).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const item = payload[0].payload;
                        const pct = revenue > 0 ? ((item.value / revenue) * 100).toFixed(1) : "0";
                        return (
                          <div
                            style={{
                              background: "rgba(15, 23, 42, 0.94)",
                              color: "#fff",
                              padding: "0.5rem 0.75rem",
                              borderRadius: "8px",
                              fontSize: "0.8rem",
                            }}
                          >
                            <div style={{ fontWeight: 800 }}>{item.name}</div>
                            <div>{formatTry(item.value)} ({pct}%)</div>
                            <div style={{ color: "#94a3b8" }}>{item.count} işlem</div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Custom Legend */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", justifyContent: "center", marginTop: "0.25rem" }}>
                {(distributionMode === "payment" ? paymentDonutData : orderTypeDonutData).map((entry) => (
                  <div
                    key={entry.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      fontSize: "0.75rem",
                      background: "#f8fafc",
                      padding: "0.25rem 0.5rem",
                      borderRadius: "6px",
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: entry.color }} />
                    <span style={{ color: "var(--pos-ink)", fontWeight: 600 }}>{entry.name}</span>
                    <span style={{ color: "var(--pos-muted)" }}>
                      ({revenue > 0 ? `${Math.round((entry.value / revenue) * 100)}%` : "0%"})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ height: 260 }} />
          )}
        </div>
      </div>

      {/* ── Top Selling Products Ranking (if orders exist) ── */}
      {topProducts.length > 0 && (
        <div className="report-chart-card report-chart-card--wide" style={{ marginBottom: "1.25rem" }}>
          <div className="report-chart-header">
            <h3 className="report-chart-title">
              🏆 En Çok Satan 5 Ürün
            </h3>
            <span style={{ fontSize: "0.8rem", color: "var(--pos-muted)", fontWeight: 600 }}>
              Adet ve Ciroya Göre
            </span>
          </div>

          <div className="report-products-list">
            {topProducts.map((p, idx) => {
              const rank = idx + 1;
              const fillPct = Math.round((p.quantity / maxTopQty) * 100);
              const rankBadgeClass =
                rank === 1
                  ? "report-rank-badge--1"
                  : rank === 2
                  ? "report-rank-badge--2"
                  : rank === 3
                  ? "report-rank-badge--3"
                  : "report-rank-badge--other";

              return (
                <div key={p.name} className="report-product-item">
                  <div className={`report-rank-badge ${rankBadgeClass}`}>
                    #{rank}
                  </div>
                  <div className="report-product-info">
                    <div className="report-product-name">{p.name}</div>
                    <div className="report-product-bar-bg">
                      <div className="report-product-bar-fill" style={{ width: `${fillPct}%` }} />
                    </div>
                  </div>
                  <div className="report-product-meta">
                    <div className="report-product-qty">{p.quantity} Adet</div>
                    <div className="report-product-rev">{formatTry(p.revenue)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Order List Header & Controls ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.65rem",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <h2 className="order-category-title" style={{ margin: 0, fontSize: "1.05rem" }}>
          Siparişler ({filteredCount})
        </h2>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {/* Payment filter */}
          <select
            className="login-input"
            style={{ width: "auto", padding: "0.38rem 0.75rem", fontSize: "0.85rem" }}
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
          >
            <option value="all">Tüm Ödeme Türleri</option>
            {Object.keys(paymentBreakdown).map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABEL[m as PaymentMethod] || m}
              </option>
            ))}
          </select>

          {/* Sort order */}
          <select
            className="login-input"
            style={{ width: "auto", padding: "0.38rem 0.75rem", fontSize: "0.85rem" }}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
          >
            <option value="dateDesc">Yeniden Eskiye</option>
            <option value="dateAsc">Eskiden Yeniye</option>
            <option value="priceDesc">Fiyata Göre Azalan</option>
            <option value="priceAsc">Fiyata Göre Artan</option>
          </select>
        </div>
      </div>

      {/* ── Order List ── */}
      {currentOrders.length === 0 ? (
        <div
          style={{
            background: "#fff",
            border: "1px dashed var(--pos-line)",
            borderRadius: "14px",
            padding: "2.5rem 1.5rem",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📋</div>
          <strong style={{ display: "block", color: "var(--pos-ink)", marginBottom: "0.25rem" }}>
            Bu aralıkta tamamlanan satış yok
          </strong>
          <p className="salon-muted" style={{ margin: 0, fontSize: "0.85rem" }}>
            Seçilen filtrelerde satış yapıldığında sipariş detayları burada listelenecektir.
          </p>
        </div>
      ) : (
        <div className="service-list">
          {currentOrders.map((o) => (
            <div key={o.id} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div
                className="service-card"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  alignItems: "center",
                  cursor: "pointer",
                  transition: "background 0.12s",
                }}
                onClick={() => setExpandedOrderId((prev) => (prev === o.id ? null : o.id))}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <strong>Sipariş #{o.order_number ?? "-"}</strong>
                    {o.order_type && (
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          padding: "0.15rem 0.45rem",
                          borderRadius: "4px",
                          background: "#f1f5f9",
                          color: "var(--pos-ink)",
                        }}
                      >
                        {ORDER_TYPE_NAMES[o.order_type] || o.order_type}
                      </span>
                    )}
                  </div>
                  <div className="salon-muted" style={{ fontSize: "0.82rem", marginTop: "0.15rem" }}>
                    {new Date(o.created_at).toLocaleString("tr-TR")} •{" "}
                    {PAYMENT_METHOD_LABEL[o.payment_method as PaymentMethod] || o.payment_method}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <strong style={{ fontSize: "1.15rem", color: "var(--pos-ink)" }}>
                    {formatTry(Number(o.total_amount))}
                  </strong>
                  <div style={{ fontSize: "0.75rem", color: "var(--pos-muted)" }}>
                    {expandedOrderId === o.id ? "Detayları gizle ▲" : "Detayları gör ▼"}
                  </div>
                </div>
              </div>

              {expandedOrderId === o.id && <OrderDetailsFetcher orderId={o.id} />}
            </div>
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1.25rem", justifyContent: "center", flexWrap: "wrap" }}>
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
                cursor: "pointer",
              }}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function OrderDetailsFetcher({ orderId }: { orderId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchItems = async () => {
      setLoading(true);
      const supabase = createBrowserClient();
      const { data, error } = await supabase
        .from("order_items")
        .select("id, quantity, unit_price, note, menu_items(name)")
        .eq("order_id", orderId);

      if (active) {
        if (data && !error) {
          setItems(data);
        }
        setLoading(false);
      }
    };
    void fetchItems();
    return () => {
      active = false;
    };
  }, [orderId]);

  if (loading) {
    return <div className="salon-muted" style={{ padding: "0.5rem 1rem" }}>Ürünler yükleniyor...</div>;
  }

  if (items.length === 0) {
    return <div className="salon-muted" style={{ padding: "0.5rem 1rem" }}>Bu siparişte ürün bulunamadı.</div>;
  }

  return (
    <div style={{ padding: "0.65rem 1rem", backgroundColor: "#f9fafb", borderRadius: "10px", border: "1px solid var(--pos-line)" }}>
      {items.map((item) => (
        <div key={item.id} style={{ display: "flex", justifyContent: "space-between", padding: "0.35rem 0", borderBottom: "1px solid #e5e7eb" }}>
          <div>
            <span style={{ fontWeight: 600 }}>{item.quantity}x {item.menu_items?.name || "Bilinmeyen Ürün"}</span>
            {item.note && <div className="salon-muted" style={{ fontSize: "0.82rem" }}>Not: {item.note}</div>}
          </div>
          <span style={{ fontWeight: 700 }}>{formatTry(Number(item.unit_price) * Number(item.quantity))}</span>
        </div>
      ))}
    </div>
  );
}
