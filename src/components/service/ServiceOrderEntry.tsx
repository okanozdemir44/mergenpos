"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useStaffSession } from "@/hooks/useStaffSession";
import { MenuPanel } from "@/components/orders/MenuPanel";
import { formatTry } from "@/lib/money";
import type { CartLine, MenuCategory, MenuItem, OrderType } from "@/types/pos";

function newLineKey(menuItemId: string) {
  return `${menuItemId}-${crypto.randomUUID()}`;
}

export function ServiceOrderEntry() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderTypeParam = searchParams.get("type") as OrderType | null;
  const orderType: OrderType = orderTypeParam === "delivery" ? "delivery" : "takeaway";

  const { loading: staffLoading, staff, error: staffError, userId } = useStaffSession();

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");

  const total = useMemo(() => cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0), [cart]);

  const load = useCallback(async (restaurantId: string) => {
    const supabase = createBrowserClient();
    setLoading(true);
    setLoadError(null);

    const [catRes, itemRes] = await Promise.all([
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
    ]);

    setCategories((catRes.data ?? []) as MenuCategory[]);
    setItems(
      ((itemRes.data ?? []) as MenuItem[]).map((i) => ({ ...i, price: Number(i.price) })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (staffLoading) return;
    if (!userId) {
      router.replace(`/login?next=/service/new?type=${orderType}`);
      return;
    }
    if (!staff) return;
    void load(staff.restaurant_id);
  }, [staffLoading, userId, staff, load, router, orderType]);

  function addItem(item: MenuItem) {
    setCart((prev) => {
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

  function openCheckout() {
    if (cart.length === 0) return;
    setCheckoutOpen(true);
  }

  async function confirmOrder() {
    if (!staff || cart.length === 0) return;

    if (orderType === "delivery") {
      if (!customerName.trim() || !customerPhone.trim() || !deliveryAddress.trim()) {
        setError("Paket siparişi için İsim, Telefon ve Adres gerekli");
        return;
      }
    } else {
      if (!customerName.trim() && !customerPhone.trim()) {
        setError("Gel Al için en az İsim veya Telefon gerekli");
        return;
      }
    }

    const supabase = createBrowserClient();
    setSubmitting(true);
    setError(null);

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        restaurant_id: staff.restaurant_id,
        table_id: null,
        order_type: orderType,
        status: "hazirlaniyor",
        total_amount: total,
        customer_name: customerName.trim() || null,
        customer_phone: customerPhone.trim() || null,
        delivery_address: orderType === "delivery" ? deliveryAddress.trim() || null : null,
      })
      .select("id")
      .single();

    if (orderError || !order) {
      setError(orderError?.message ?? "Sipariş oluşturulamadı");
      setSubmitting(false);
      return;
    }

    const { error: itemsError } = await supabase.from("order_items").insert(
      cart.map((line) => ({
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

    setSubmitting(false);
    router.push(`/service?tab=${orderType}`);
  }

  if (staffLoading || loading) {
    return <p className="salon-muted" style={{ padding: "1rem" }}>Yükleniyor…</p>;
  }
  if (!userId) {
    return <p className="salon-muted" style={{ padding: "1rem" }}>Girişe yönlendiriliyor…</p>;
  }
  if (staffError || !staff) {
    return (
      <div className="salon-banner salon-banner--error" style={{ margin: "1rem" }}>
        <p>{staffError ?? "Staff yok"}</p>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="salon-banner salon-banner--error" style={{ margin: "1rem" }}>
        <p>{loadError}</p>
        <Link href={`/service?tab=${orderType}`} className="salon-link">
          Geri dön
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="adisyon">
        <div className="adisyon__left">
          <div className="adisyon__top">
            <div>
              <Link
                href={`/service?tab=${orderType}`}
                className="salon-link"
              >
                ← {orderType === "takeaway" ? "Gel Al" : "Paket"}
              </Link>
              <h1 className="salon-title" style={{ marginTop: "0.35rem" }}>
                Yeni Sipariş
              </h1>
            </div>
          </div>

          <MenuPanel categories={categories} items={items} onAdd={addItem} />
        </div>

        <aside className="adisyon__cart">
          <div className="order-cart__head">
            <h2 className="order-cart__title">Sepet</h2>
            <span className="salon-muted">{cart.length} kalem</span>
          </div>

          <div className="order-cart__list">
            {cart.length === 0 ? (
              <p className="salon-muted">Ürüne dokunarak sepete ekle.</p>
            ) : (
              cart.map((line) => (
                <div key={line.key} className="cart-line">
                  <div className="cart-line__top">
                    <strong>{line.name}</strong>
                    <button
                      type="button"
                      className="cart-line__remove"
                      onClick={() => setCart((p) => p.filter((x) => x.key !== line.key))}
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
                          setCart((p) =>
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
                          setCart((p) =>
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
                      setCart((p) =>
                        p.map((x) => (x.key === line.key ? { ...x, note: e.target.value } : x)),
                      )
                    }
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
            <button
              type="button"
              className="login-button"
              style={{ marginTop: 0, width: "100%" }}
              disabled={cart.length === 0}
              onClick={openCheckout}
            >
              Ödeme Al
            </button>
          </div>
        </aside>
      </div>

      {checkoutOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            e.preventDefault();
            setCheckoutOpen(false);
          }}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="salon-title">Müşteri Bilgileri</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setCheckoutOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div style={{ marginBottom: "1rem" }}>
                <label className="login-label">İsim *</label>
                <input
                  className="login-input"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Müşteri adı"
                />
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label className="login-label">Telefon *</label>
                <input
                  className="login-input"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="0555 123 45 67"
                />
              </div>

              {orderType === "delivery" && (
                <div style={{ marginBottom: "1rem" }}>
                  <label className="login-label">Adres *</label>
                  <textarea
                    className="login-input"
                    rows={3}
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="Teslimat adresi"
                  />
                </div>
              )}

              <div className="order-cart__total" style={{ marginTop: "1.5rem" }}>
                <span>Toplam</span>
                <strong>{formatTry(total)}</strong>
              </div>

              {error && (
                <div className="salon-banner salon-banner--error" style={{ marginTop: "1rem" }}>
                  {error}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="ghost-btn"
                onClick={(e) => {
                  e.preventDefault();
                  setCheckoutOpen(false);
                }}
              >
                İptal
              </button>
              <button
                type="button"
                className="login-button"
                style={{ marginTop: 0 }}
                disabled={submitting}
                onClick={(e) => {
                  e.preventDefault();
                  void confirmOrder();
                }}
              >
                {submitting ? "Kaydediliyor…" : "Siparişi Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
