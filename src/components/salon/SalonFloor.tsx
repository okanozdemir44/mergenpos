"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useStaffSession } from "@/hooks/useStaffSession";
import { MenuPanel } from "@/components/orders/MenuPanel";
import { CartPanel, type OrderChannel } from "@/components/orders/CartPanel";
import { ThermalReceipt, type ThermalReceiptProps } from "@/components/receipt/ThermalReceipt";
import { ServiceKanban } from "@/components/service/ServiceKanban";
import type { CartLine, MenuCategory, MenuItem, PaymentMethod } from "@/types/pos";

type ActiveTab = "salon" | "service";

function newLineKey(menuItemId: string) {
  return `${menuItemId}-${crypto.randomUUID()}`;
}

export function SalonFloor() {
  const router = useRouter();
  const { loading: staffLoading, staff, error: staffError, userId } = useStaffSession();

  // ── Tab State ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>("salon");

  // ── Fast-Food / Hızlı Satış State ─────────────────────────────────────────
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderChannel, setOrderChannel] = useState<OrderChannel>("GEL AL");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastOrder, setLastOrder] = useState<{ orderNumber: number | string; time: string } | null>(null);
  const [receiptData, setReceiptData] = useState<ThermalReceiptProps | null>(null);

  const cartRef = useRef(cart);
  cartRef.current = cart;

  const total = useMemo(
    () => cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
    [cart],
  );

  const loadMenu = useCallback(async (restaurantId: string) => {
    const supabase = createBrowserClient();
    setLoading(true);
    setError(null);

    const [catRes, itemRes] = await Promise.all([
      supabase
        .from("menu_categories")
        .select("id, restaurant_id, name, sort_order")
        .eq("restaurant_id", restaurantId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("menu_items")
        .select("id, restaurant_id, category_id, name, price, description, is_available, sort_order")
        .eq("restaurant_id", restaurantId)
        .order("sort_order", { ascending: true }),
    ]);

    if (catRes.error || itemRes.error) {
      setError(catRes.error?.message ?? itemRes.error?.message ?? "Menü yüklenirken hata oluştu");
      setLoading(false);
      return;
    }

    setCategories((catRes.data ?? []) as MenuCategory[]);
    setItems(
      ((itemRes.data ?? []) as MenuItem[]).map((i) => ({ ...i, price: Number(i.price) })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (staffLoading) return;
    if (!userId) {
      router.replace("/login?next=/salon");
      return;
    }
    if (!staff) return;
    void loadMenu(staff.restaurant_id);
  }, [staffLoading, userId, staff, loadMenu, router]);

  // Bildirimi 8 saniye sonra otomatik gizle
  useEffect(() => {
    if (!lastOrder) return;
    const timer = setTimeout(() => {
      setLastOrder(null);
    }, 8000);
    return () => clearTimeout(timer);
  }, [lastOrder]);

  function handleAddItem(item: MenuItem) {
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

  function handleChangeQty(key: string, delta: number) {
    setCart((prev) =>
      prev
        .map((line) => (line.key === key ? { ...line, quantity: line.quantity + delta } : line))
        .filter((line) => line.quantity > 0),
    );
  }

  function handleChangeNote(key: string, note: string) {
    setCart((prev) =>
      prev.map((line) => (line.key === key ? { ...line, note } : line)),
    );
  }

  function handleRemove(key: string) {
    setCart((prev) => prev.filter((line) => line.key !== key));
  }

  function handleClear() {
    setCart([]);
  }

  function handleReprintLastReceipt() {
    if (receiptData) {
      window.print();
    }
  }

  /**
   * Fast-Food / Hızlı Satış & Termal Fiş Yazdırma Akışı:
   * 1. Sipariş Supabase'e kaydedilir.
   * 2. Sepetteki veriler <ThermalReceipt/> state'ine aktarılır.
   * 3. anında window.print() tetiklenir.
   * 4. Yazdırma penceresi kapandığı an (afterprint) sepet temizlenir ve ekran bir sonraki müşteri için hazır olur.
   */
  async function handleCheckout() {
    if (!staff || cart.length === 0 || submitting) return;

    const supabase = createBrowserClient();
    const cartSnapshot = [...cart];
    const orderTotal = total;
    const selectedMethod = paymentMethod;
    const selectedChannel = orderChannel;

    setSubmitting(true);
    setError(null);

    try {
      // Bugünün başlangıcı (UTC)
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      // Günlük fiş numarası hesabı
      const { count } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", staff.restaurant_id)
        .gte("created_at", todayStart.toISOString());

      const nextOrderNumber = (count ?? 0) + 1;
      const orderTypeDb = selectedChannel === "GEL AL" ? "takeaway" : "dine_in";

      // 1. orders tablosuna kayıt
      let insertPayload: Record<string, unknown> = {
        restaurant_id: staff.restaurant_id,
        table_id: null,
        order_type: orderTypeDb,
        status: "hazirlaniyor",
        total_amount: orderTotal,
        payment_method: selectedMethod,
        paid_at: new Date().toISOString(),
        order_number: nextOrderNumber,
      };

      let orderRes = await supabase.from("orders").insert(insertPayload).select("id, order_number").single();

      // Constraint fallback (table_id kısıtlaması henüz veritabanında silinmediyse takeaway olarak dene)
      if (orderRes.error && /table_id|orders_dine_in_requires_table/i.test(orderRes.error.message)) {
        insertPayload = {
          ...insertPayload,
          order_type: "takeaway",
        };
        orderRes = await supabase.from("orders").insert(insertPayload).select("id, order_number").single();
      }

      // order_number sütunu henüz yoksa fallback
      if (orderRes.error && /order_number/i.test(orderRes.error.message)) {
        delete insertPayload.order_number;
        orderRes = await supabase.from("orders").insert(insertPayload).select("id").single();
      }

      if (orderRes.error || !orderRes.data) {
        throw new Error(orderRes.error?.message ?? "Sipariş oluşturulamadı");
      }

      const orderId = orderRes.data.id;
      const assignedNumber = (orderRes.data as { order_number?: number })?.order_number ?? nextOrderNumber;

      // 2. order_items tablosuna kalemleri kaydet
      const { error: itemsError } = await supabase.from("order_items").insert(
        cartSnapshot.map((line) => ({
          restaurant_id: staff.restaurant_id,
          order_id: orderId,
          menu_item_id: line.menuItemId,
          quantity: line.quantity,
          note: line.note.trim() || null,
          unit_price: line.unitPrice,
          status: "pending",
        })),
      );

      if (itemsError) {
        throw new Error(`Sipariş ürünleri kaydedilemedi: ${itemsError.message}`);
      }

      // 3. Fiş Verisini Hazırla
      const generatedReceiptNo = String(Math.floor(100000000 + Math.random() * 900000000));
      const newReceipt: ThermalReceiptProps = {
        branchName: "SAMSUN / ÖKÜZ BURGER",
        receiptNo: generatedReceiptNo,
        dateStr: new Date().toLocaleString("tr-TR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        cashierName: staff.name,
        orderChannel: selectedChannel,
        items: cartSnapshot.map((line) => ({
          quantity: line.quantity,
          unit: "Tam",
          name: line.name,
          note: line.note.trim() || null,
          unitPrice: line.unitPrice,
          totalPrice: line.unitPrice * line.quantity,
        })),
        total: orderTotal,
        paymentMethod: selectedMethod,
        paidAmount: orderTotal,
        changeAmount: 0,
        orderNumber: assignedNumber,
      };

      // 4. QZ Tray Üzerinden Yazdırma İşlemi
      const kasaPrinter = localStorage.getItem("PRINTER_KASA");
      const mutfakPrinter = localStorage.getItem("PRINTER_MUTFAK");
      
      const resetAfterPrint = () => {
        setCart([]);
        setSubmitting(false);
        setLastOrder({
          orderNumber: assignedNumber,
          time: new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
        });
      };

      if (kasaPrinter || mutfakPrinter) {
        try {
          const { printHtml } = await import("../../lib/qz");
          const { generateCashierReceiptHtml, generateKitchenReceiptHtml } = await import("../../lib/receipt-generators");

          if (kasaPrinter) {
            const kasaHtml = generateCashierReceiptHtml(newReceipt);
            await printHtml(kasaPrinter, kasaHtml).catch(e => console.error("Kasa yazıcı hatası:", e));
          }
          
          if (mutfakPrinter) {
            const mutfakHtml = generateKitchenReceiptHtml(newReceipt);
            await printHtml(mutfakPrinter, mutfakHtml).catch(e => console.error("Mutfak yazıcı hatası:", e));
          }
          
          resetAfterPrint();
        } catch (error) {
          console.error("QZ Tray Hatası:", error);
          setError("Yazıcıya bağlanılamadı. QZ Tray açık mı?");
          resetAfterPrint();
        }
      } else {
        // Fallback: Eski tarayıcı yazdırma yöntemi
        setReceiptData(newReceipt);
        const onAfterPrint = () => {
          resetAfterPrint();
          window.removeEventListener("afterprint", onAfterPrint);
        };
        window.addEventListener("afterprint", onAfterPrint);
        setTimeout(() => {
          window.print();
          setTimeout(onAfterPrint, 1500); // fallback
        }, 150);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "İşlem sırasında bir hata oluştu";
      setError(msg);
      setSubmitting(false);
    }
  }

  if (staffLoading || loading) {
    return <p className="salon-muted" style={{ padding: "1.5rem" }}>Hızlı Satış ekranı yükleniyor…</p>;
  }

  if (!userId) return <p className="salon-muted" style={{ padding: "1.5rem" }}>Girişe yönlendiriliyor…</p>;

  if (staffError || !staff) {
    return (
      <div className="salon-banner salon-banner--error" style={{ margin: "1rem" }}>
        <strong>Personel erişimi yok</strong>
        <p>{staffError ?? "Staff kaydı bulunamadı."}</p>
      </div>
    );
  }

  return (
    <>
      {/* Gizli Termal Fiş (Yalnızca window.print() esnasında kağıda basılır) */}
      {receiptData && <ThermalReceipt {...receiptData} />}

      {/* ── Sekme Başlığı (Her iki tab için ortak) ─────────────────────── */}
      <div className="salon-tab-header">
        <div className="salon-tab-header__brand">
          <p className="salon-kicker">Öküz Burger · Kasa &amp; Tezgah</p>
          <p className="salon-muted" style={{ margin: 0 }}>Kasiyer: {staff.name}</p>
        </div>
        <div className="pos-tabs">
          <button
            type="button"
            className={`pos-tab${activeTab === "salon" ? " pos-tab--active" : ""}`}
            onClick={() => setActiveTab("salon")}
          >
            ⚡ Hızlı Satış
          </button>
          <button
            type="button"
            className={`pos-tab${activeTab === "service" ? " pos-tab--active" : ""}`}
            onClick={() => setActiveTab("service")}
          >
            🛵 Paket (Kurye)
          </button>
        </div>
      </div>

      {/* ── Hızlı Satış Sekmesi ────────────────────────────────────────── */}
      {activeTab === "salon" && (
        <div className="adisyon">
          {/* SOL ALAN: Menü ve Kategoriler */}
          <div className="adisyon__left">
            <div className="adisyon__top" style={{ paddingBottom: 0 }}>
              <h1 className="salon-title" style={{ marginTop: "0.2rem", fontSize: "1.5rem" }}>
                Hızlı Satış
              </h1>
            </div>

            {lastOrder && (
              <div style={{ padding: "0.75rem 1rem 0" }}>
                <div className="fast-food-toast" style={{ justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    <span style={{ fontSize: "1.4rem" }}>🧾</span>
                    <div>
                      <strong>Sipariş No: #{lastOrder.orderNumber} Alındı &amp; Fiş Basıldı!</strong>
                      <p style={{ margin: "0.15rem 0 0", fontSize: "0.82rem", opacity: 0.9 }}>
                        Saat {lastOrder.time} · Ekran bir sonraki müşteri için hazırlandı.
                      </p>
                    </div>
                  </div>
                  {receiptData && (
                    <button
                      type="button"
                      onClick={handleReprintLastReceipt}
                      style={{
                        border: "1px solid #059669",
                        background: "#fff",
                        color: "#059669",
                        padding: "0.35rem 0.65rem",
                        borderRadius: "6px",
                        fontWeight: 700,
                        fontSize: "0.8rem",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      🖨️ Fişi Tekrar Bas
                    </button>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div style={{ padding: "0.75rem 1rem 0" }}>
                <div className="salon-banner salon-banner--error">
                  <p>{error}</p>
                </div>
              </div>
            )}

            <MenuPanel categories={categories} items={items} onAdd={handleAddItem} />
          </div>

          {/* SAĞ ALAN: Sepet, Sipariş Kanalı ve Ödeme Al Butonu */}
          <CartPanel
            lines={cart}
            total={total}
            submitting={submitting}
            error={error}
            orderChannel={orderChannel}
            onChangeOrderChannel={setOrderChannel}
            paymentMethod={paymentMethod}
            onChangePaymentMethod={setPaymentMethod}
            onChangeQty={handleChangeQty}
            onChangeNote={handleChangeNote}
            onRemove={handleRemove}
            onClear={handleClear}
            onSubmit={() => void handleCheckout()}
          />
        </div>
      )}

      {/* ── Paket (Kurye) Sekmesi ──────────────────────────────────────── */}
      {activeTab === "service" && (
        <div style={{ padding: "0 1.25rem 1.25rem" }}>
          <ServiceKanban orderType="delivery" hideHeader />
        </div>
      )}
    </>
  );
}
