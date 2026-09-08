"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useStaffSession } from "@/hooks/useStaffSession";
import { KitchenTicketCard } from "@/components/kitchen/KitchenTicketCard";
import type { KitchenTicket, OrderItemStatus } from "@/types/pos";

type RawRow = {
  id: string;
  order_id: string;
  restaurant_id: string;
  menu_item_id: string;
  quantity: number;
  note: string | null;
  unit_price: number;
  status: OrderItemStatus;
  menu_items: { name: string } | { name: string }[] | null;
  orders:
    | {
        id: string;
        created_at: string;
        order_type: "dine_in" | "takeaway" | "delivery";
        restaurant_tables: { name: string } | { name: string }[] | null;
      }
    | {
        id: string;
        created_at: string;
        order_type: "dine_in" | "takeaway" | "delivery";
        restaurant_tables: { name: string } | { name: string }[] | null;
      }[]
    | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapRow(row: RawRow): KitchenTicket {
  const order = one(row.orders);
  const table = one(order?.restaurant_tables ?? null);
  const menuItem = one(row.menu_items);

  return {
    id: row.id,
    order_id: row.order_id,
    restaurant_id: row.restaurant_id,
    menu_item_id: row.menu_item_id,
    quantity: row.quantity,
    note: row.note,
    unit_price: Number(row.unit_price),
    status: row.status,
    item_name: menuItem?.name ?? "Ürün",
    table_name: table?.name ?? null,
    order_created_at: order?.created_at ?? new Date().toISOString(),
    order_type: order?.order_type ?? "dine_in",
  };
}

function sortTickets(tickets: KitchenTicket[]) {
  return [...tickets].sort((a, b) => {
    const statusRank = (s: OrderItemStatus) => (s === "pending" ? 0 : s === "preparing" ? 1 : 2);
    const byStatus = statusRank(a.status) - statusRank(b.status);
    if (byStatus !== 0) return byStatus;
    return new Date(a.order_created_at).getTime() - new Date(b.order_created_at).getTime();
  });
}

export function KitchenBoard() {
  const router = useRouter();
  const { loading: staffLoading, staff, error: staffError, userId } = useStaffSession();
  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(0);

  const loadTickets = useCallback(async (restaurantId: string) => {
    const supabase = createBrowserClient();
    setLoading(true);
    setError(null);

    const { data, error: queryError } = await supabase
      .from("order_items")
      .select(
        `
        id,
        order_id,
        restaurant_id,
        menu_item_id,
        quantity,
        note,
        unit_price,
        status,
        menu_items ( name ),
        orders!inner (
          id,
          created_at,
          order_type,
          restaurant_tables ( name )
        )
      `,
      )
      .eq("restaurant_id", restaurantId)
      .in("status", ["pending", "preparing"])
      .order("id", { ascending: true });

    if (queryError) {
      setError(queryError.message);
      setTickets([]);
      setLoading(false);
      return;
    }

    setTickets(sortTickets((data as RawRow[] | null)?.map(mapRow) ?? []));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (staffLoading) return;
    if (!userId) {
      router.replace("/login?next=/kitchen");
      return;
    }
    if (!staff) return;
    void loadTickets(staff.restaurant_id);
  }, [staffLoading, userId, staff, loadTickets, router]);

  useEffect(() => {
    if (!staff?.restaurant_id) return;

    const supabase = createBrowserClient();
    const restaurantId = staff.restaurant_id;

    const channel = supabase
      .channel(`kitchen-items:${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "order_items",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => {
          void loadTickets(restaurantId);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [staff?.restaurant_id, loadTickets]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick((n) => n + 1), 30000);
    return () => window.clearInterval(id);
  }, []);

  async function setStatus(id: string, status: OrderItemStatus) {
    setBusyId(id);
    setError(null);

    // Optimistic UI: Update state immediately
    setTickets((prev) => {
      if (status === "ready") return prev.filter((t) => t.id !== id);
      return sortTickets(prev.map((t) => (t.id === id ? { ...t, status } : t)));
    });

    // Then update database
    const supabase = createBrowserClient();
    const { error: updateError } = await supabase
      .from("order_items")
      .update({ status })
      .eq("id", id);

    if (updateError) {
      setError(updateError.message);
      // Reload from DB to revert on error
      if (staff) void loadTickets(staff.restaurant_id);
    }

    setBusyId(null);
  }

  const counts = useMemo(() => {
    void nowTick;
    return {
      pending: tickets.filter((t) => t.status === "pending").length,
      preparing: tickets.filter((t) => t.status === "preparing").length,
    };
  }, [tickets, nowTick]);

  if (staffLoading || (userId && !staff && !staffError)) {
    return <p className="salon-muted">Mutfak yükleniyor…</p>;
  }

  if (!userId) {
    return <p className="salon-muted">Giriş sayfasına yönlendiriliyor…</p>;
  }

  if (staffError || !staff) {
    return (
      <div className="salon-banner salon-banner--error">
        <strong>Personel erişimi yok</strong>
        <p>{staffError ?? "Staff kaydı bulunamadı."}</p>
      </div>
    );
  }

  return (
    <div className="kds">
      <header className="kds-header">
        <div>
          <p className="salon-kicker">Kitchen Display</p>
          <h1 className="salon-title">Mutfak</h1>
          <p className="salon-muted">{staff.name} · canlı</p>
        </div>
        <div className="kds-stats">
          <span className="kds-stat kds-stat--pending">Bekleyen {counts.pending}</span>
          <span className="kds-stat kds-stat--preparing">Hazırlanan {counts.preparing}</span>
        </div>
      </header>

      {error && (
        <div className="salon-banner salon-banner--error">
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <p className="salon-muted">Siparişler yükleniyor…</p>
      ) : tickets.length === 0 ? (
        <div className="kds-empty">
          <p>Aktif mutfak kalemi yok.</p>
          <p className="salon-muted">Yeni sipariş gelince burada görünür.</p>
        </div>
      ) : (
        <div className="kds-grid">
          {tickets.map((ticket) => (
            <KitchenTicketCard
              key={ticket.id}
              ticket={ticket}
              busy={busyId === ticket.id}
              onSetStatus={(id, status) => void setStatus(id, status)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
