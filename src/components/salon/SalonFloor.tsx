"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useStaffSession } from "@/hooks/useStaffSession";
import { TableCard } from "@/components/salon/TableCard";
import type { RestaurantTable, TableStatus } from "@/types/pos";
import { TABLE_STATUS_LABEL } from "@/types/pos";

function sortTables(tables: RestaurantTable[]) {
  return [...tables].sort((a, b) =>
    a.name.localeCompare(b.name, "tr", { numeric: true, sensitivity: "base" }),
  );
}

export function SalonFloor() {
  const router = useRouter();
  const { loading: staffLoading, staff, error: staffError, userId } = useStaffSession();
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTables = useCallback(async (restaurantId: string) => {
    const supabase = createBrowserClient();
    setLoading(true);
    setError(null);

    const { data, error: queryError } = await supabase
      .from("restaurant_tables")
      .select("id, restaurant_id, name, status, created_at")
      .eq("restaurant_id", restaurantId)
      .order("name", { ascending: true });

    if (queryError) {
      setError(queryError.message);
      setTables([]);
      setLoading(false);
      return;
    }

    setTables(sortTables((data ?? []) as RestaurantTable[]));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (staffLoading) return;
    if (!userId) {
      router.replace("/login?next=/salon");
      return;
    }
    if (!staff) return;
    void loadTables(staff.restaurant_id);
  }, [staffLoading, userId, staff, loadTables, router]);

  useEffect(() => {
    if (!staff?.restaurant_id) return;
    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`salon-tables:${staff.restaurant_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "restaurant_tables",
          filter: `restaurant_id=eq.${staff.restaurant_id}`,
        },
        (payload) => {
          setTables((prev) => {
            if (payload.eventType === "DELETE") {
              const oldRow = payload.old as { id?: string };
              if (!oldRow.id) return prev;
              return prev.filter((t) => t.id !== oldRow.id);
            }
            const row = payload.new as RestaurantTable;
            if (!row?.id) return prev;
            return sortTables([...prev.filter((t) => t.id !== row.id), row]);
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [staff?.restaurant_id]);

  const counts = useMemo(() => {
    const base: Record<TableStatus, number> = {
      empty: 0,
      occupied: 0,
    };
    for (const t of tables) base[t.status] += 1;
    return base;
  }, [tables]);

  if (staffLoading || (userId && !staff && !staffError)) {
    return <p className="salon-muted">Salon yükleniyor…</p>;
  }
  if (!userId) return <p className="salon-muted">Girişe yönlendiriliyor…</p>;
  if (staffError || !staff) {
    return (
      <div className="salon-banner salon-banner--error">
        <strong>Personel erişimi yok</strong>
        <p>{staffError ?? "Staff kaydı bulunamadı."}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="salon-top">
        <div>
          <p className="salon-kicker">Adisyon</p>
          <h1 className="salon-title">Salon</h1>
          <p className="salon-muted">{staff.name}</p>
        </div>

        <div className="pos-tabs">
          <Link href="/salon" className="pos-tab pos-tab--active">
            Salon
          </Link>
          <Link href="/service?tab=takeaway" className="pos-tab">
            Gel Al
          </Link>
          <Link href="/service?tab=delivery" className="pos-tab">
            Paket
          </Link>
        </div>

        <div className="salon-legend">
          <span className="salon-chip salon-chip--empty">
            Boş · {counts.empty}
          </span>
          <span className="salon-chip salon-chip--occupied">
            Dolu · {counts.occupied}
          </span>
        </div>
      </div>

      {error && (
        <div className="salon-banner salon-banner--error">
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <p className="salon-muted">Masalar yükleniyor…</p>
      ) : (
        <div className="salon-grid">
          {tables.map((table) => (
            <TableCard key={table.id} table={table} />
          ))}
        </div>
      )}
    </div>
  );
}
