"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useStaffSession } from "@/hooks/useStaffSession";
import { formatTry } from "@/lib/money";
import type { OrderRow, OrderStatus, OrderType } from "@/types/pos";

type Column = {
  id: string;
  title: string;
  statuses: OrderStatus[];
};

const COLUMNS: Column[] = [
  { id: "hazirlaniyor", title: "Hazırlanıyor", statuses: ["hazirlaniyor"] },
  { id: "hazir", title: "Bekleyen Siparişler", statuses: ["hazir"] },
  { id: "yolda", title: "Teslimata Çıkanlar", statuses: ["yolda"] },
  { id: "teslim_edildi", title: "Tamamlanan Siparişler", statuses: ["teslim_edildi"] },
];

type Props = {
  orderType: OrderType;
};

function formatElapsedTime(createdAt: string): string {
  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now.getTime() - created.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Az önce";
  if (diffMins < 60) return `${diffMins} dk önce`;
  const diffHours = Math.floor(diffMins / 60);
  return `${diffHours} saat önce`;
}

export function ServiceKanban({ orderType }: Props) {
  const router = useRouter();
  const { loading: staffLoading, staff, error: staffError, userId } = useStaffSession();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (restaurantId: string) => {
      const supabase = createBrowserClient();
      setLoading(true);
      setError(null);
      const { data, error: qe } = await supabase
        .from("orders")
        .select(
          "id, restaurant_id, table_id, order_type, status, total_amount, customer_name, customer_phone, delivery_address, payment_method, paid_at, courier_status, created_at",
        )
        .eq("restaurant_id", restaurantId)
        .eq("order_type", orderType)
        .order("created_at", { ascending: false })
        .limit(100);

      if (qe) {
        setError(qe.message);
        setOrders([]);
      } else {
        setOrders(
          ((data ?? []) as OrderRow[]).map((o) => ({
            ...o,
            total_amount: Number(o.total_amount),
          })),
        );
      }
      setLoading(false);
    },
    [orderType],
  );

  useEffect(() => {
    if (staffLoading) return;
    if (!userId) {
      router.replace("/login?next=/service");
      return;
    }
    if (!staff) return;
    void load(staff.restaurant_id);
  }, [staffLoading, userId, staff, load, router]);

  useEffect(() => {
    if (!staff?.restaurant_id) return;
    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`service-orders:${staff.restaurant_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${staff.restaurant_id}`,
        },
        () => void load(staff.restaurant_id),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [staff?.restaurant_id, load]);

  const columnOrders = useMemo(() => {
    const map = new Map<string, OrderRow[]>();
    for (const col of COLUMNS) {
      map.set(col.id, []);
    }
    for (const order of orders) {
      const col = COLUMNS.find((c) => c.statuses.includes(order.status));
      if (col) {
        map.get(col.id)!.push(order);
      }
    }
    return map;
  }, [orders]);

  async function patchOrder(id: string, patch: Record<string, unknown>) {
    if (!staff) return;
    
    // Optimistic UI: Update state immediately
    setOrders((prev) =>
      prev.map((o) =>
        o.id === id ? { ...o, ...patch, status: patch.status as OrderStatus } : o,
      ),
    );

    // Then update database
    const supabase = createBrowserClient();
    const { error: ue } = await supabase
      .from("orders")
      .update(patch)
      .eq("id", id)
      .eq("restaurant_id", staff.restaurant_id);

    // If error, revert and show error
    if (ue) {
      setError(ue.message);
      void load(staff.restaurant_id); // Reload from DB to revert
    }
  }

  function newOrder() {
    router.push(`/service/new?type=${orderType}`);
  }

  if (staffLoading) return <p className="salon-muted">Yükleniyor…</p>;
  if (!userId) return <p className="salon-muted">Girişe yönlendiriliyor…</p>;
  if (staffError || !staff) {
    return (
      <div className="salon-banner salon-banner--error">
        <p>{staffError ?? "Staff yok"}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="salon-top">
        <div>
          <p className="salon-kicker">Servis</p>
          <h1 className="salon-title">{orderType === "takeaway" ? "Gel Al" : "Paket"}</h1>
        </div>
        <div className="pos-tabs">
          <Link href="/salon" className="pos-tab">
            Salon
          </Link>
          <Link
            href="/service?tab=takeaway"
            className={`pos-tab ${orderType === "takeaway" ? "pos-tab--active" : ""}`}
          >
            Gel Al
          </Link>
          <Link
            href="/service?tab=delivery"
            className={`pos-tab ${orderType === "delivery" ? "pos-tab--active" : ""}`}
          >
            Paket
          </Link>
        </div>
        <div>
          <button
            type="button"
            className="login-button"
            style={{ marginTop: 0 }}
            onClick={newOrder}
          >
            + Yeni Sipariş Ekle
          </button>
        </div>
      </div>

      {error && <div className="salon-banner salon-banner--error">{error}</div>}

      {loading ? (
        <p className="salon-muted">Yükleniyor…</p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((col) => {
            const colOrders = columnOrders.get(col.id) ?? [];
            return (
              <div
                key={col.id}
                className="flex-shrink-0 w-80 bg-white border border-gray-200 rounded-2xl p-4"
              >
                <h2 className="text-base font-extrabold mb-3 pb-2 border-b-2 border-gray-200 flex items-center justify-between">
                  <span>{col.title}</span>
                  <span className="text-sm font-bold text-gray-500">({colOrders.length})</span>
                </h2>
                <div className="space-y-3 max-h-[calc(100vh-240px)] overflow-y-auto">
                  {colOrders.map((o) => (
                    <article
                      key={o.id}
                      className="bg-gray-50 border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-bold text-gray-500 uppercase">
                              {o.order_type === "delivery" ? "Paket" : "Gel Al"}
                            </span>
                            <strong className="text-base">
                              {o.customer_name || "Müşteri"}
                            </strong>
                          </div>
                          <div className="text-xs text-gray-500 mb-1">
                            Sipariş #{o.id.slice(0, 8)}
                          </div>
                          <div className="text-xs text-gray-600 font-semibold">
                            {formatElapsedTime(o.created_at)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-black text-teal-700">
                            {formatTry(o.total_amount)}
                          </div>
                        </div>
                      </div>

                      {o.customer_phone && (
                        <div className="text-sm text-gray-600 mb-2">Tel: {o.customer_phone}</div>
                      )}
                      {o.delivery_address && (
                        <div className="text-sm text-gray-600 mb-2 line-clamp-2">
                          Adres: {o.delivery_address}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 mt-3">
                        {o.status === "hazirlaniyor" && (
                          <button
                            type="button"
                            className="flex-1 bg-orange-500 text-white font-bold py-2 px-3 rounded-lg text-sm hover:bg-orange-600 transition-colors"
                            onClick={(e) => {
                              e.preventDefault();
                              void patchOrder(o.id, { 
                                status: "hazir",
                                payment_method: "cash",
                                paid_at: new Date().toISOString(),
                              });
                            }}
                          >
                            Hazır
                          </button>
                        )}
                        {o.status === "hazir" && orderType === "delivery" && (
                          <button
                            type="button"
                            className="flex-1 bg-blue-500 text-white font-bold py-2 px-3 rounded-lg text-sm hover:bg-blue-600 transition-colors"
                            onClick={(e) => {
                              e.preventDefault();
                              void patchOrder(o.id, { status: "yolda" });
                            }}
                          >
                            Kuryeye Ver
                          </button>
                        )}
                        {o.status === "yolda" && (
                          <button
                            type="button"
                            className="flex-1 bg-green-600 text-white font-bold py-2 px-3 rounded-lg text-sm hover:bg-green-700 transition-colors"
                            onClick={(e) => {
                              e.preventDefault();
                              void patchOrder(o.id, { status: "teslim_edildi" });
                            }}
                          >
                            Teslim Edildi
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
