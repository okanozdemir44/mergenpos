"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useStaffSession } from "@/hooks/useStaffSession";
import { MenuPanel } from "@/components/orders/MenuPanel";
import { BillCloseModal } from "@/components/billing/BillCloseModal";
import { formatTry } from "@/lib/money";
import { TABLE_STATUS_LABEL } from "@/types/pos";
import type {
  BillLine,
  CartLine,
  MenuCategory,
  MenuItem,
  PaymentMethod,
  RestaurantTable,
} from "@/types/pos";

type Props = { tableId: string };

type SentLine = BillLine & { locked: true };

function newLineKey(menuItemId: string) {
  return `${menuItemId}-${crypto.randomUUID()}`;
}

export function OrderEntryScreen({ tableId }: Props) {
  const router = useRouter();
  const { loading: staffLoading, staff, error: staffError, userId } = useStaffSession();

  const [table, setTable] = useState<RestaurantTable | null>(null);
  const [restaurantName, setRestaurantName] = useState("Restoran");
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [draft, setDraft] = useState<CartLine[]>([]);
  const [sent, setSent] = useState<SentLine[]>([]);
  const [openOrderIds, setOpenOrderIds] = useState<string[]>([]);
  const [billOpen, setBillOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draftTotal = useMemo(
    () => draft.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
    [draft],
  );
  const sentTotal = useMemo(
    () => sent.reduce((s, l) => s + l.unit_price * l.quantity, 0),
    [sent],
  );
  const grandTotal = draftTotal + sentTotal;

  const loadAdisyon = useCallback(
    async (restaurantId: string) => {
      const supabase = createBrowserClient();

      const { data: orders } = await supabase
        .from("orders")
        .select("id")
        .eq("restaurant_id", restaurantId)
        .eq("table_id", tableId)
        .eq("order_type", "dine_in")
        .not("status", "in", "(teslim_edildi,iptal)");

      const ids = (orders ?? []).map((o) => o.id);
      setOpenOrderIds(ids);

      if (ids.length === 0) {
        setSent([]);
        return;
      }

      const { data: rows } = await supabase
        .from("order_items")
        .select("id, order_id, quantity, note, unit_price, status, menu_items(name)")
        .in("order_id", ids);

      type Raw = {
        id: string;
        order_id: string;
        quantity: number;
        note: string | null;
        unit_price: number;
        status: BillLine["status"];
        menu_items: { name: string } | { name: string }[] | null;
      };

      setSent(
        ((rows ?? []) as Raw[]).map((row) => {
          const mi = Array.isArray(row.menu_items) ? row.menu_items[0] : row.menu_items;
          return {
            id: row.id,
            order_id: row.order_id,
            name: mi?.name ?? "Ürün",
            quantity: row.quantity,
            unit_price: Number(row.unit_price),
            note: row.note,
            status: row.status,
            locked: true as const,
          };
        }),
      );
    },
    [tableId],
  );

  const load = useCallback(
    async (restaurantId: string) => {
      const supabase = createBrowserClient();
      setLoading(true);
      setLoadError(null);

      const [tableRes, catRes, itemRes, restRes] = await Promise.all([
        supabase
          .from("restaurant_tables")
          .select("id, restaurant_id, name, status, created_at")
          .eq("id", tableId)
          .eq("restaurant_id", restaurantId)
          .maybeSingle(),
        supabase
          .from("menu_categories")
          .select("id, restaurant_id, name, sort_order")
          .eq("restaurant_id", restaurantId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("menu_items")
          .select(
            "id, restaurant_id, category_id, name, price, description, is_available, sort_order",
          )
          .eq("restaurant_id", restaurantId)
          .order("sort_order", { ascending: true }),
        supabase.from("restaurants").select("name").eq("id", restaurantId).maybeSingle(),
      ]);

      if (tableRes.error || !tableRes.data) {
        setLoadError(tableRes.error?.message ?? "Masa bulunamadı");
        setLoading(false);
        return;
      }

      setTable(tableRes.data as RestaurantTable);
      setRestaurantName(restRes.data?.name ?? "Restoran");
      setCategories((catRes.data ?? []) as MenuCategory[]);
      setItems(
        ((itemRes.data ?? []) as MenuItem[]).map((i) => ({ ...i, price: Number(i.price) })),
      );
      await loadAdisyon(restaurantId);
      setLoading(false);
    },
    [tableId, loadAdisyon],
  );

  useEffect(() => {
    if (staffLoading) return;
    if (!userId) {
      router.replace(`/login?next=/orders/${tableId}`);
      return;
    }
    if (!staff) return;
    void load(staff.restaurant_id);
  }, [staffLoading, userId, staff, load, router, tableId]);

  function addItem(item: MenuItem) {
    setDraft((prev) => {
      const existing = prev.find((l) => l.menuItemId === item.id && !l.note);
      if (existing) {
        return prev.map((l) =>
          l.key === existing.key ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [
        ...prev,
        {
          key: newLineKey(item.id),
          menuItemId: item.id,
          name: item.name,
          unitPrice: Number(item.price),
          quantity: 1,
          note: "",
        },
      ];
    });
  }

  const hasUnsentItems = draft.length > 0;
  const canSendToKitchen = hasUnsentItems && !submitting;

  async function sendToKitchen() {
    if (!staff || !table || !hasUnsentItems) return;
    const supabase = createBrowserClient();
    setSubmitting(true);
    setError(null);

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        restaurant_id: staff.restaurant_id,
        table_id: table.id,
        order_type: "dine_in",
        status: "hazirlaniyor",
        total_amount: draftTotal,
      })
      .select("id")
      .single();

    if (orderError || !order) {
      setError(orderError?.message ?? "Sipariş oluşturulamadı");
      setSubmitting(false);
      return;
    }

    const { error: itemsError } = await supabase.from("order_items").insert(
      draft.map((line) => ({
        restaurant_id: staff.restaurant_id,
        order_id: order.id,
        menu_item_id: line.menuItemId,
        quantity: line.quantity,
        note: line.note.trim() || null,
        unit_price: line.unitPrice,
        status: "pending",
      })),
    );

    if (itemsError) {
      setError(itemsError.message);
      setSubmitting(false);
      return;
    }

    await supabase
      .from("restaurant_tables")
      .update({ status: "occupied" })
      .eq("id", table.id)
      .eq("restaurant_id", staff.restaurant_id);

    setDraft([]);
    setTable((t) => (t ? { ...t, status: "occupied" } : t));
    await loadAdisyon(staff.restaurant_id);
    setSubmitting(false);
  }

  async function openBill() {
    setError(null);
    setBillOpen(true);
  }

  async function confirmPayment(method: PaymentMethod) {
    if (!staff || !table) return;
    const supabase = createBrowserClient();
    setBillingBusy(true);
    setError(null);

    const ids = openOrderIds.length
      ? openOrderIds
      : [...new Set(sent.map((l) => l.order_id))];

    if (ids.length > 0) {
      let { error: oe } = await supabase
        .from("orders")
        .update({
          status: "teslim_edildi",
          payment_method: method,
          paid_at: new Date().toISOString(),
        })
        .in("id", ids)
        .eq("restaurant_id", staff.restaurant_id);

      if (oe && /payment_method|paid_at/i.test(oe.message)) {
        const fb = await supabase
          .from("orders")
          .update({ status: "teslim_edildi" })
          .in("id", ids)
          .eq("restaurant_id", staff.restaurant_id);
        oe = fb.error;
      }

      if (oe) {
        setError(oe.message);
        setBillingBusy(false);
        return;
      }
    }

    const { error: te } = await supabase
      .from("restaurant_tables")
      .update({ status: "empty" })
      .eq("id", table.id);

    setBillingBusy(false);
    if (te) {
      setError(te.message);
      return;
    }

    setBillOpen(false);
    router.push("/salon");
  }

  if (staffLoading || loading) return <p className="salon-muted" style={{ padding: "1rem" }}>Adisyon yükleniyor…</p>;
  if (!userId) return <p className="salon-muted" style={{ padding: "1rem" }}>Girişe yönlendiriliyor…</p>;
  if (staffError || !staff) {
    return (
      <div className="salon-banner salon-banner--error" style={{ margin: "1rem" }}>
        <p>{staffError ?? "Staff yok"}</p>
      </div>
    );
  }
  if (loadError || !table) {
    return (
      <div className="salon-banner salon-banner--error" style={{ margin: "1rem" }}>
        <p>{loadError}</p>
        <Link href="/salon" className="salon-link">
          Salon’a dön
        </Link>
      </div>
    );
  }

  const billLines: BillLine[] = sent.map(({ locked: _l, ...rest }) => rest);

  return (
    <div className="adisyon">
      <div className="adisyon__left">
        <div className="adisyon__top">
          <div>
            <Link href="/salon" className="salon-link">
              ← Salon
            </Link>
            <h1 className="salon-title" style={{ marginTop: "0.35rem" }}>
              {table.name}
            </h1>
            <p className="salon-muted">{TABLE_STATUS_LABEL[table.status]}</p>
          </div>
          <div className="adisyon__top-actions">
            <button type="button" className="login-button" style={{ marginTop: 0 }} onClick={openBill}>
              Hesabı Kapat
            </button>
          </div>
        </div>

        <MenuPanel categories={categories} items={items} onAdd={addItem} />
      </div>

      <aside className="adisyon__cart">
        <div className="order-cart__head">
          <h2 className="order-cart__title">Adisyon</h2>
          <span className="salon-muted">{sent.length + draft.length} kalem</span>
        </div>

        <div className="order-cart__list">
          {sent.length === 0 && draft.length === 0 && (
            <p className="salon-muted">Ürüne dokunarak adisyona ekle.</p>
          )}

          {sent.map((line) => (
            <div key={line.id} className="cart-line cart-line--sent">
              <div className="cart-line__top">
                <strong>
                  {line.quantity}× {line.name}
                </strong>
                <span className="salon-muted">Mutfakta</span>
              </div>
              {line.note ? <div className="salon-muted">{line.note}</div> : null}
              <div style={{ textAlign: "right", fontWeight: 800 }}>
                {formatTry(line.unit_price * line.quantity)}
              </div>
            </div>
          ))}

          {draft.map((line) => (
            <div key={line.key} className="cart-line">
              <div className="cart-line__top">
                <strong>{line.name}</strong>
                <button
                  type="button"
                  className="cart-line__remove"
                  onClick={() => setDraft((p) => p.filter((x) => x.key !== line.key))}
                >
                  Sil
                </button>
              </div>
              <div className="cart-line__meta">
                <span>{formatTry(line.unitPrice)}</span>
                <div className="qty-control">
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((p) =>
                        p
                          .map((x) =>
                            x.key === line.key ? { ...x, quantity: x.quantity - 1 } : x,
                          )
                          .filter((x) => x.quantity > 0),
                      )
                    }
                  >
                    −
                  </button>
                  <span>{line.quantity}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((p) =>
                        p.map((x) =>
                          x.key === line.key ? { ...x, quantity: x.quantity + 1 } : x,
                        ),
                      )
                    }
                  >
                    +
                  </button>
                </div>
                <strong>{formatTry(line.unitPrice * line.quantity)}</strong>
              </div>
              <input
                className="cart-line__note"
                placeholder='Not (örn. "acısız")'
                value={line.note}
                onChange={(e) =>
                  setDraft((p) =>
                    p.map((x) => (x.key === line.key ? { ...x, note: e.target.value } : x)),
                  )
                }
              />
            </div>
          ))}
        </div>

        <div className="order-cart__footer">
          <div className="order-cart__total">
            <span>Toplam</span>
            <strong>{formatTry(grandTotal)}</strong>
          </div>
          {error && <div className="salon-banner salon-banner--error">{error}</div>}
          <button
            type="button"
            className="login-button"
            style={{ marginTop: 0, width: "100%" }}
            disabled={!canSendToKitchen}
            onClick={() => void sendToKitchen()}
          >
            {submitting ? "Gönderiliyor…" : "Mutfağa Gönder"}
          </button>
        </div>
      </aside>

        <BillCloseModal
        restaurantName={restaurantName}
        tableName={table.name}
        lines={billLines}
        open={billOpen}
        submitting={billingBusy}
        error={error}
        allowEmptyClose={openOrderIds.length === 0 && sent.length === 0}
        onClose={() => setBillOpen(false)}
        onConfirm={(m) => void confirmPayment(m)}
      />
    </div>
  );
}
