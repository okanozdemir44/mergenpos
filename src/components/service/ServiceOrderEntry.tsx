"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useStaffSession } from "@/hooks/useStaffSession";
import { useBranding } from "@/context/BrandingContext";
import { MenuPanel } from "@/components/orders/MenuPanel";
import { ThermalReceipt, type ThermalReceiptProps } from "@/components/receipt/ThermalReceipt";
import { printReceiptHtml } from "@/lib/unified-printer";
import { generateCashierReceiptHtml, generateKitchenReceiptHtml } from "@/lib/receipt-generators";
import { formatTry } from "@/lib/money";
import { normalizePhone } from "@/lib/phone";
import type { CartLine, MenuCategory, MenuItem, OrderType, PaymentMethod } from "@/types/pos";
import { PAYMENT_METHOD_LABEL } from "@/types/pos";
import type { Customer, CustomerAddress } from "@/types/customer";

function newLineKey(menuItemId: string) {
  return `${menuItemId}-${crypto.randomUUID()}`;
}

export function ServiceOrderEntry() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderTypeParam = searchParams.get("type") as OrderType | null;
  const orderType: OrderType = orderTypeParam === "delivery" ? "delivery" : "takeaway";

  const { branding } = useBranding();

  // URL'den gelen Caller ID parametreleri
  const customerIdParam = searchParams.get("customerId");
  const addressIdParam = searchParams.get("addressId");
  const callerPhoneParam = searchParams.get("callerPhone");
  const repeatOrderIdParam = searchParams.get("repeatOrderId");

  const { loading: staffLoading, staff, error: staffError, userId } = useStaffSession();

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [repeatMessage, setRepeatMessage] = useState<{ type: "success" | "warning"; text: string } | null>(null);
  const [repeatProcessed, setRepeatProcessed] = useState(false);

  // Müşteri Bilgileri
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");

  // Caller ID ve Adres Seçimi State'leri
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerAddressId, setCustomerAddressId] = useState<string | null>(null);
  const [customerAddresses, setCustomerAddresses] = useState<CustomerAddress[]>([]);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [receiptData, setReceiptData] = useState<ThermalReceiptProps | null>(null);

  const rawTotal = useMemo(() => cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0), [cart]);
  const total = useMemo(() => (paymentMethod === "veresiye" ? 0 : rawTotal), [paymentMethod, rawTotal]);

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

  // URL'den gelen müşteri/telefon bilgilerini yükle
  useEffect(() => {
    if (!staff?.restaurant_id) return;
    const supabase = createBrowserClient();

    async function loadCallerIdCustomer() {
      if (customerIdParam) {
        setCustomerId(customerIdParam);
        const { data: cust } = await supabase
          .from("customers")
          .select("*")
          .eq("restaurant_id", staff!.restaurant_id)
          .eq("id", customerIdParam)
          .maybeSingle();

        if (cust) {
          setCustomerName(cust.name || "");
          setCustomerPhone(cust.phone || "");

          const { data: addrs } = await supabase
            .from("customer_addresses")
            .select("*")
            .eq("restaurant_id", staff!.restaurant_id)
            .eq("customer_id", cust.id)
            .order("created_at", { ascending: false });

          if (addrs && addrs.length > 0) {
            setCustomerAddresses(addrs as CustomerAddress[]);
            const targetAddr = addressIdParam
              ? addrs.find((a) => a.id === addressIdParam) || addrs[0]
              : addrs[0];
            setCustomerAddressId(targetAddr.id);
            setDeliveryAddress(targetAddr.address);
          }
        }
      } else if (callerPhoneParam) {
        const normalized = normalizePhone(callerPhoneParam);
        if (normalized) {
          setCustomerPhone(normalized);
          void searchCustomerByPhone(normalized);
        }
      }
    }

    void loadCallerIdCustomer();
  }, [staff?.restaurant_id, customerIdParam, addressIdParam, callerPhoneParam]);

  // Son siparişi tekrarlama efekti: items yüklendiğinde ve repeatOrderIdParam varsa sepeti doldur
  useEffect(() => {
    if (!repeatOrderIdParam || items.length === 0 || repeatProcessed || !staff?.restaurant_id) return;
    setRepeatProcessed(true);

    async function loadRepeatOrder() {
      try {
        const supabase = createBrowserClient();
        const { data: orderItems, error: itemsErr } = await supabase
          .from("order_items")
          .select("menu_item_id, quantity, note, unit_price")
          .eq("order_id", repeatOrderIdParam);

        if (itemsErr || !orderItems || orderItems.length === 0) return;

        const linesToAdd: CartLine[] = [];
        const skippedNames: string[] = [];

        for (const oi of orderItems) {
          const menuItem = items.find((i) => i.id === oi.menu_item_id && i.is_available);
          if (menuItem) {
            linesToAdd.push({
              key: `${menuItem.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              menuItemId: menuItem.id,
              name: menuItem.name,
              unitPrice: menuItem.price, // GÜNCEL menü fiyatından hesaplanır!
              quantity: Number(oi.quantity) || 1,
              note: oi.note || "",
            });
          } else {
            skippedNames.push(`Ürün (${oi.menu_item_id.slice(0, 6)})`);
          }
        }

        if (linesToAdd.length > 0) {
          setCart(linesToAdd);
        }

        if (skippedNames.length > 0) {
          setRepeatMessage({
            type: "warning",
            text: `⚠️ Son siparişteki bazı ürünler artık menüde mevcut olmadığı için sepete eklenemedi (${skippedNames.length} adet). Diğer ürünler güncel menü fiyatları ile sepete aktarıldı.`,
          });
        } else if (linesToAdd.length > 0) {
          setRepeatMessage({
            type: "success",
            text: "✓ Son siparişteki ürünler güncel menü fiyatlarıyla sepete başarıyla eklendi.",
          });
        }
      } catch (err) {
        console.warn("Tekrar sipariş yüklenirken hata:", err);
      }
    }

    void loadRepeatOrder();
  }, [repeatOrderIdParam, items, repeatProcessed, staff?.restaurant_id]);

  // Telefon girildiğinde müşteriyi otomatik ara (hem ana hem ek telefonlarda)
  const searchCustomerByPhone = useCallback(
    async (rawPhone: string) => {
      if (!staff?.restaurant_id) return;
      const normalized = normalizePhone(rawPhone);
      if (!normalized) return;

      setIsSearchingCustomer(true);
      try {
        const supabase = createBrowserClient();

        // 1. Ana telefonda ara
        const { data: cust } = await supabase
          .from("customers")
          .select("*")
          .eq("restaurant_id", staff.restaurant_id)
          .eq("phone", normalized)
          .maybeSingle();

        let matchedCustomer = cust;

        // 2. Bulunamadıysa ek telefonlarda (customer_phones) ara
        if (!matchedCustomer) {
          try {
            const { data: phoneRow } = await supabase
              .from("customer_phones")
              .select("customer_id")
              .eq("restaurant_id", staff.restaurant_id)
              .eq("phone", normalized)
              .maybeSingle();

            if (phoneRow?.customer_id) {
              const { data: parentCust } = await supabase
                .from("customers")
                .select("*")
                .eq("restaurant_id", staff.restaurant_id)
                .eq("id", phoneRow.customer_id)
                .maybeSingle();
              matchedCustomer = parentCust;
            }
          } catch {
            // customer_phones tablosu henüz yoksa yut
          }
        }

        if (matchedCustomer) {
          setCustomerId(matchedCustomer.id);
          if (!customerName.trim()) {
            setCustomerName(matchedCustomer.name || "");
          }

          const { data: addrs } = await supabase
            .from("customer_addresses")
            .select("*")
            .eq("restaurant_id", staff.restaurant_id)
            .eq("customer_id", matchedCustomer.id)
            .order("created_at", { ascending: false });

          if (addrs && addrs.length > 0) {
            setCustomerAddresses(addrs as CustomerAddress[]);
            if (!deliveryAddress.trim()) {
              setCustomerAddressId(addrs[0].id);
              setDeliveryAddress(addrs[0].address);
            }
          }
        } else {
          setCustomerId(null);
          setCustomerAddressId(null);
          setCustomerAddresses([]);
        }
      } catch {
        // Arama hatası akışı bozmaz
      } finally {
        setIsSearchingCustomer(false);
      }
    },
    [staff?.restaurant_id, customerName, deliveryAddress]
  );

  function handlePhoneChange(val: string) {
    setCustomerPhone(val);
    const normalized = normalizePhone(val);
    if (normalized) {
      void searchCustomerByPhone(normalized);
    }
  }

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

    let finalCustomerId = customerId;
    let finalAddressId = customerAddressId;

    // Paket siparişte yeni müşteri ise otomatik olarak customers ve customer_addresses'a ekle
    if (orderType === "delivery" && !finalCustomerId) {
      const normalized = normalizePhone(customerPhone);
      if (normalized) {
        try {
          const { data: newCust } = await supabase
            .from("customers")
            .insert({
              restaurant_id: staff.restaurant_id,
              phone: normalized,
              name: customerName.trim() || "",
            })
            .select("id")
            .maybeSingle();

          if (newCust) {
            finalCustomerId = newCust.id;
            if (deliveryAddress.trim()) {
              const { data: newAddr } = await supabase
                .from("customer_addresses")
                .insert({
                  restaurant_id: staff.restaurant_id,
                  customer_id: newCust.id,
                  title: "Adres",
                  address: deliveryAddress.trim(),
                })
                .select("id")
                .maybeSingle();
              if (newAddr) finalAddressId = newAddr.id;
            }
          }
        } catch {
          // Müşteri otomatik kaydı başarısız olursa sipariş kaydını aksatmayız
        }
      }
    } else if (orderType === "delivery" && finalCustomerId) {
      // Mevcut müşteri: Adres düzenlendiyse başlığı "Adres"e çevirip müşteriye geri yaz
      if (deliveryAddress.trim()) {
        try {
          if (finalAddressId) {
            await supabase
              .from("customer_addresses")
              .update({
                address: deliveryAddress.trim(),
                title: "Adres",
              })
              .eq("id", finalAddressId)
              .eq("restaurant_id", staff.restaurant_id);
          } else {
            const { data: newAddr } = await supabase
              .from("customer_addresses")
              .insert({
                restaurant_id: staff.restaurant_id,
                customer_id: finalCustomerId,
                title: "Adres",
                address: deliveryAddress.trim(),
              })
              .select("id")
              .maybeSingle();
            if (newAddr) finalAddressId = newAddr.id;
          }

          // Eğer isim girildiyse customers tablosundaki ismi de güncelle
          if (customerName.trim()) {
            await supabase
              .from("customers")
              .update({ name: customerName.trim() })
              .eq("id", finalCustomerId)
              .eq("restaurant_id", staff.restaurant_id);
          }
        } catch (updateCustErr) {
          console.warn("Mevcut müşteri/adres güncellenirken hata:", updateCustErr);
        }
      }
    }

    // orders tablosuna kayıt payload'ı
    const orderPayload: Record<string, unknown> = {
      restaurant_id: staff.restaurant_id,
      table_id: null,
      order_type: orderType,
      status: "hazirlaniyor", // Veritabanı kısıtlamasına (orders_status_check) uygun Türkçe durum
      total_amount: total,
      customer_name: customerName.trim() || null,
      customer_phone: customerPhone.trim() || null,
      delivery_address: orderType === "delivery" ? deliveryAddress.trim() || null : null,
      customer_id: finalCustomerId || null,
      customer_address_id: finalAddressId || null,
      payment_method: paymentMethod,
      paid_at: new Date().toISOString(),
    };

    let orderRes = await supabase
      .from("orders")
      .insert(orderPayload)
      .select("id, order_number")
      .single();

    // Fallback: customer_id sütununda bir veritabanı kısıt uyuşmazlığı olursa geriye dönük dene
    if (orderRes.error && /customer_id|customer_address_id/i.test(orderRes.error.message)) {
      delete orderPayload.customer_id;
      delete orderPayload.customer_address_id;
      orderRes = await supabase
        .from("orders")
        .insert(orderPayload)
        .select("id, order_number")
        .single();
    }

    // Fallback: payment_method constraint fallback (veresiye veritabanında constraint engeline takılırsa null fallback)
    if (orderRes.error && /payment_method/i.test(orderRes.error.message)) {
      orderPayload.payment_method = null;
      orderRes = await supabase
        .from("orders")
        .insert(orderPayload)
        .select("id, order_number")
        .single();
    }

    if (orderRes.error || !orderRes.data) {
      setError(orderRes.error?.message ?? "Sipariş oluşturulamadı");
      setSubmitting(false);
      return;
    }

    const orderId = orderRes.data.id;
    const orderNum = (orderRes.data as { order_number?: number })?.order_number ?? "—";

    const { error: itemsError } = await supabase.from("order_items").insert(
      cart.map((line) => ({
        restaurant_id: staff.restaurant_id,
        order_id: orderId,
        menu_item_id: line.menuItemId,
        quantity: line.quantity,
        note: line.note.trim() || null,
        unit_price: line.unitPrice,
        status: "ready", // hazır
      })),
    );

    if (itemsError) {
      setError(itemsError.message);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);

    // Fiş Verisini Hazırla ve Yazdır
    const receipt: ThermalReceiptProps = {
      branchName: branding.receipt_header || branding.display_name,
      receiptNo: String(Math.floor(100000000 + Math.random() * 900000000)),
      complimentText: branding.receipt_footer,
      dateStr: new Date().toLocaleString("tr-TR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      cashierName: staff.name,
      orderChannel: orderType === "delivery" ? "PAKET" : "GEL AL",
      customerName: customerName.trim() || null,
      customerPhone: customerPhone.trim() || null,
      deliveryAddress: orderType === "delivery" ? deliveryAddress.trim() || null : null,
      items: cart.map((line) => ({
        quantity: line.quantity,
        unit: "Tam",
        name: line.name,
        note: line.note.trim() || null,
        unitPrice: line.unitPrice,
        totalPrice: line.unitPrice * line.quantity,
      })),
      total,
      paymentMethod,
      paidAmount: total,
      changeAmount: 0,
      orderNumber: orderNum,
    };

    const kasaPrinter = typeof window !== "undefined" ? localStorage.getItem("PRINTER_KASA") : null;
    const mutfakPrinter = typeof window !== "undefined" ? localStorage.getItem("PRINTER_MUTFAK") : null;

    if (kasaPrinter || mutfakPrinter) {
      try {
        const { getOrFetchReceiptSettings } = await import("@/lib/unified-printer");
        const receiptSettings = await getOrFetchReceiptSettings(staff?.restaurant_id);

        if (kasaPrinter) {
          const kasaHtml = generateCashierReceiptHtml(receipt, receiptSettings);
          await printReceiptHtml(kasaPrinter, kasaHtml).catch((e) => console.error("Kasa yazıcı hatası:", e));
        }
        if (mutfakPrinter) {
          const mutfakHtml = generateKitchenReceiptHtml(receipt, receiptSettings);
          await printReceiptHtml(mutfakPrinter, mutfakHtml).catch((e) => console.error("Mutfak yazıcı hatası:", e));
        }
        router.push(`/service?tab=${orderType}`);
      } catch (printErr) {
        console.error("Yazıcı hatası:", printErr);
        // Fallback: browser print (yazdırma penceresi kapanana kadar sayfada kal)
        setReceiptData(receipt);
        const onAfterPrint = () => {
          window.removeEventListener("afterprint", onAfterPrint);
          router.push(`/service?tab=${orderType}`);
        };
        window.addEventListener("afterprint", onAfterPrint);
        setTimeout(() => {
          window.print();
          setTimeout(onAfterPrint, 3000);
        }, 200);
      }
    } else {
      // Yazıcı seçilmemişse tarayıcı yazdırmasına düş (unmount olmadan önce yazdır)
      setReceiptData(receipt);
      const onAfterPrint = () => {
        window.removeEventListener("afterprint", onAfterPrint);
        router.push(`/service?tab=${orderType}`);
      };
      window.addEventListener("afterprint", onAfterPrint);
      setTimeout(() => {
        window.print();
        setTimeout(onAfterPrint, 3000);
      }, 200);
    }
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

          {repeatMessage && (
            <div
              style={{
                background: repeatMessage.type === "warning" ? "#fffbeb" : "#f0fdf4",
                border: "1px solid " + (repeatMessage.type === "warning" ? "#fde68a" : "#bbf7d0"),
                color: repeatMessage.type === "warning" ? "#b45309" : "#166534",
                padding: "0.6rem 0.85rem",
                borderRadius: "8px",
                marginBottom: "0.75rem",
                fontSize: "0.82rem",
                fontWeight: 600,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>{repeatMessage.text}</span>
              <button
                type="button"
                onClick={() => setRepeatMessage(null)}
                style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700, color: "inherit", marginLeft: "0.5rem" }}
              >
                ✕
              </button>
            </div>
          )}

          <MenuPanel categories={categories} items={items} onAdd={addItem} />
        </div>

        <aside className="adisyon__cart">
          <div className="order-cart__head">
            <h2 className="order-cart__title">Sepet</h2>
            <span className="salon-muted">{cart.length} kalem</span>
          </div>

          <div className="order-cart__lines">
            {cart.length === 0 ? (
              <p className="salon-muted" style={{ padding: "1rem" }}>
                Ürün seçiniz.
              </p>
            ) : (
              cart.map((line) => (
                <div key={line.key} className="order-cart__line">
                  <div className="order-cart__line-main">
                    <div>
                      <div className="order-cart__line-name">{line.name}</div>
                      <div className="order-cart__line-price">
                        {formatTry(line.unitPrice * line.quantity)}
                      </div>
                    </div>
                    <div className="order-cart__line-qty">
                      <button
                        type="button"
                        className="order-cart__qty-btn"
                        onClick={() => {
                          setCart((prev) =>
                            prev
                              .map((l) =>
                                l.key === line.key ? { ...l, quantity: l.quantity - 1 } : l,
                              )
                              .filter((l) => l.quantity > 0),
                          );
                        }}
                      >
                        −
                      </button>
                      <span>{line.quantity}</span>
                      <button
                        type="button"
                        className="order-cart__qty-btn"
                        onClick={() => {
                          setCart((prev) =>
                            prev.map((l) =>
                              l.key === line.key ? { ...l, quantity: l.quantity + 1 } : l,
                            ),
                          );
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    className="order-cart__line-note"
                    placeholder="Sipariş notu…"
                    value={line.note}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCart((prev) =>
                        prev.map((l) => (l.key === line.key ? { ...l, note: v } : l)),
                      );
                    }}
                  />
                </div>
              ))
            )}
          </div>

          <div className="order-cart__foot">
            <div className="order-cart__total">
              <span>Toplam</span>
              <strong>{formatTry(rawTotal)}</strong>
            </div>

            <div style={{ marginTop: "1rem" }}>
              <button
                type="button"
                className="login-button"
                style={{ marginTop: 0 }}
                disabled={cart.length === 0}
                onClick={openCheckout}
              >
                Ödemeye Geç ({orderType === "delivery" ? "Paket" : "Gel Al"})
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* Ödeme & Müşteri Bilgileri Modalı */}
      {checkoutOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: "480px" }}>
            <div className="modal-header">
              <h2 className="modal-title">
                {orderType === "delivery" ? "Paket Sipariş ve Müşteri" : "Gel Al Sipariş"}
              </h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setCheckoutOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              {/* Telefon Girişi */}
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label className="login-label">Telefon *</label>
                  {isSearchingCustomer && (
                    <span style={{ fontSize: "0.75rem", color: "#059669" }}>Müşteri aranıyor…</span>
                  )}
                  {customerId && !isSearchingCustomer && (
                    <span style={{ fontSize: "0.75rem", color: "#059669", fontWeight: 600 }}>
                      ✓ Kayıtlı Müşteri
                    </span>
                  )}
                </div>
                <input
                  className="login-input"
                  value={customerPhone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  placeholder="0555 123 45 67"
                />
              </div>

              {/* İsim Girişi */}
              <div style={{ marginBottom: "1rem" }}>
                <label className="login-label">İsim {orderType === "delivery" ? "*" : ""}</label>
                <input
                  className="login-input"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Müşteri adı"
                />
              </div>

              {/* Teslimat Adresi (Sadece Paket) */}
              {orderType === "delivery" && (
                <div style={{ marginBottom: "1rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <label className="login-label">Adres *</label>
                    {customerAddresses.length > 1 && (
                      <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        ({customerAddresses.length} kayıtlı adres)
                      </span>
                    )}
                  </div>

                  {customerAddresses.length > 1 && (
                    <select
                      className="login-input"
                      value={customerAddressId ?? ""}
                      onChange={(e) => {
                        const sel = customerAddresses.find((a) => a.id === e.target.value);
                        if (sel) {
                          setCustomerAddressId(sel.id);
                          setDeliveryAddress(sel.address);
                        }
                      }}
                      style={{ marginBottom: "0.5rem" }}
                    >
                      {customerAddresses.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.title}: {a.address.length > 40 ? a.address.slice(0, 40) + "…" : a.address}
                        </option>
                      ))}
                    </select>
                  )}

                  <textarea
                    className="login-input"
                    rows={3}
                    value={deliveryAddress}
                    onChange={(e) => {
                      setDeliveryAddress(e.target.value);
                    }}
                    placeholder="Teslimat adresi"
                  />
                </div>
              )}

              {/* Ödeme Yöntemi */}
              <div style={{ marginBottom: "1rem" }}>
                <label className="login-label">Ödeme Yöntemi</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", marginTop: "4px" }}>
                  <button
                    type="button"
                    className={`channel-btn ${paymentMethod === "cash" ? "channel-btn--active" : ""}`}
                    onClick={() => setPaymentMethod("cash")}
                  >
                    💵 Nakit
                  </button>
                  <button
                    type="button"
                    className={`channel-btn ${paymentMethod === "card" ? "channel-btn--active" : ""}`}
                    onClick={() => setPaymentMethod("card")}
                  >
                    💳 Kredi Kartı
                  </button>
                  <button
                    type="button"
                    className={`channel-btn ${paymentMethod === "veresiye" ? "channel-btn--active" : ""}`}
                    onClick={() => setPaymentMethod("veresiye")}
                  >
                    📝 Veresiye
                  </button>
                </div>
              </div>

              <div className="order-cart__total" style={{ marginTop: "1.25rem" }}>
                <span>Toplam Ödenecek ({PAYMENT_METHOD_LABEL[paymentMethod]})</span>
                <strong>{formatTry(total)}</strong>
              </div>
              {paymentMethod === "veresiye" && (
                <div style={{ fontSize: "0.8rem", color: "#d97706", marginTop: "0.35rem", fontWeight: 600 }}>
                  ℹ️ Veresiye seçildi: Paket tutarı ₺0,00 olarak kaydedilecektir.
                </div>
              )}

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
                {submitting ? "İşleniyor…" : "Ödeme Al ve Fiş Çıkar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gizli Termal Fiş (Yazdırma sırasında aktif olur) */}
      {receiptData && <ThermalReceipt {...receiptData} />}
    </>
  );
}
