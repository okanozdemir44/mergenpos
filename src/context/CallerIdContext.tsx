"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { normalizePhone, formatPhone } from "@/lib/phone";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useStaffSession } from "@/hooks/useStaffSession";
import { useRestaurantFeatures } from "@/hooks/useRestaurantFeatures";
import type {
  Customer,
  CustomerAddress,
  CustomerPhone,
  CallerIdActiveCall,
  CallerIdLogEntry,
  CallerIdLastOrder,
} from "@/types/customer";

type CallerIdContextType = {
  // Lisans ve Ayar State
  hasLicense: boolean;
  licenseLoading: boolean;
  enabled: boolean;
  setEnabled: (val: boolean) => void;
  comPort: string;
  setComPort: (val: string) => void;
  baudRate: number;
  setBaudRate: (val: number) => void;
  modemMode: boolean;
  setModemMode: (val: boolean) => void;
  reconnectSerial: () => Promise<void>;

  // Çağrı & Panel State
  activeCall: CallerIdActiveCall | null;
  dismissCall: () => void;
  incomingCall: (rawNumber: string) => Promise<boolean>;

  // Loglar
  logs: CallerIdLogEntry[];
  addLog: (text: string, type?: CallerIdLogEntry["type"]) => void;
  clearLogs: () => void;

  // Müşteri İşlemleri
  registerAndLinkCustomer: (data: {
    name: string;
    phone: string;
    title?: string;
    address: string;
    customerNote?: string;
    addressNote?: string;
  }) => Promise<{ customer: Customer; address: CustomerAddress } | null>;
  linkPhoneToCustomer: (data: {
    customerId: string;
    phone: string;
    label?: string;
  }) => Promise<CustomerPhone | null>;
  startOrderForActiveCall: (selectedAddressId?: string) => void;
  startRepeatOrder: (repeatOrderId: string, selectedAddressId?: string) => void;
};

const CallerIdContext = createContext<CallerIdContextType | null>(null);

function playChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(784, now); // G5
    osc.frequency.setValueAtTime(1046.5, now + 0.14); // C6
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.5);
  } catch (err) {
    console.warn("Caller ID ses çalınamadı:", err);
  }
}

export function CallerIdProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { staff } = useStaffSession();
  const { callerIdEnabled: hasLicense, loading: licenseLoading } = useRestaurantFeatures();

  // Local settings - Lisansı aktif restoranlar için varsayılan olarak açık başlar
  const [enabled, setEnabledState] = useState<boolean>(true);
  const [comPort, setComPortState] = useState<string>("COM1");
  const [baudRate, setBaudRateState] = useState<number>(9600);
  const [modemMode, setModemModeState] = useState<boolean>(false);

  // Active call
  const [activeCall, setActiveCall] = useState<CallerIdActiveCall | null>(null);
  const [logs, setLogs] = useState<CallerIdLogEntry[]>([]);

  // Deduplication ref: son aranan numara ve zaman
  const lastCallRef = useRef<{ phone: string; timestamp: number } | null>(null);

  // LocalStorage yükle
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const savedEnabled = localStorage.getItem("mergen_callerid_enabled");
      if (savedEnabled !== null) {
        setEnabledState(savedEnabled === "true");
      }
      const savedPort = localStorage.getItem("mergen_callerid_com_port");
      if (savedPort) setComPortState(savedPort);
      const savedBaud = localStorage.getItem("mergen_callerid_baud_rate");
      if (savedBaud) setBaudRateState(Number(savedBaud) || 9600);
      const savedModem = localStorage.getItem("mergen_callerid_modem_mode");
      if (savedModem !== null) setModemModeState(savedModem === "true");
    } catch {
      // LocalStorage erişim hatası olursa yut
    }
  }, []);

  // Lisansı aktif olan restoranlar giriş yaptığında bu özellik otomatik olarak açık olsun
  useEffect(() => {
    if (licenseLoading) return;
    if (hasLicense) {
      setEnabledState(true);
      try {
        localStorage.setItem("mergen_callerid_enabled", "true");
      } catch {}
    } else {
      setEnabledState(false);
      try {
        localStorage.setItem("mergen_callerid_enabled", "false");
      } catch {}
    }
  }, [hasLicense, licenseLoading, staff?.restaurant_id]);

  const setEnabled = useCallback((val: boolean) => {
    setEnabledState(val);
    try {
      localStorage.setItem("mergen_callerid_enabled", String(val));
    } catch {}

    // Kullanıcı ilk defa açtığında masaüstü bildirim izni iste
    if (val && typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    }
  }, []);

  const setComPort = useCallback((val: string) => {
    setComPortState(val);
    try {
      localStorage.setItem("mergen_callerid_com_port", val);
    } catch {}
  }, []);

  const setBaudRate = useCallback((val: number) => {
    setBaudRateState(val);
    try {
      localStorage.setItem("mergen_callerid_baud_rate", String(val));
    } catch {}
  }, []);

  const setModemMode = useCallback((val: boolean) => {
    setModemModeState(val);
    try {
      localStorage.setItem("mergen_callerid_modem_mode", String(val));
    } catch {}
  }, []);

  const addLog = useCallback((text: string, type: CallerIdLogEntry["type"] = "info") => {
    const entry: CallerIdLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString("tr-TR"),
      text,
      type,
    };
    setLogs((prev) => [entry, ...prev.slice(0, 199)]);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const dismissCall = useCallback(() => {
    setActiveCall(null);
  }, []);

  // Merkezi gelen çağrı fonksiyonu
  const incomingCall = useCallback(
    async (rawNumber: string): Promise<boolean> => {
      // Lisans yoksa veya toggle kapalıysa hiçbir şey çalıştırma
      if (!hasLicense || !enabled || !staff?.restaurant_id) {
        return false;
      }

      const normalized = normalizePhone(rawNumber);
      if (!normalized) {
        addLog(`Geçersiz numara biçimi: ${rawNumber}`, "warn");
        return false;
      }

      // 10 saniye içindeki mükerrer çağrıları yok say
      const now = Date.now();
      if (
        lastCallRef.current &&
        lastCallRef.current.phone === normalized &&
        now - lastCallRef.current.timestamp < 10000
      ) {
        addLog(`Mükerrer çağrı engellendi (10 sn kuralı): ${formatPhone(normalized)}`, "info");
        return false;
      }
      lastCallRef.current = { phone: normalized, timestamp: now };

      addLog(`Gelen çağrı alındı: ${formatPhone(normalized)}`, "call");

      // Zil sesi çal
      playChime();

      try {
        const supabase = createBrowserClient();

        // 1. Önce customers tablosunda ana telefonda ara
        let customer: Customer | null = null;
        const { data: mainCust, error: custErr } = await supabase
          .from("customers")
          .select("*")
          .eq("restaurant_id", staff.restaurant_id)
          .eq("phone", normalized)
          .maybeSingle();

        if (custErr) {
          addLog(`Müşteri sorgulanırken hata: ${custErr.message}`, "error");
        }
        if (mainCust) {
          customer = mainCust as Customer;
        }

        // 2. Ana telefonda bulunamadıysa customer_phones (ek telefonlar) tablosunda ara
        if (!customer) {
          try {
            const { data: phoneMatch } = await supabase
              .from("customer_phones")
              .select("customer_id")
              .eq("restaurant_id", staff.restaurant_id)
              .eq("phone", normalized)
              .maybeSingle();

            if (phoneMatch?.customer_id) {
              const { data: parentCust } = await supabase
                .from("customers")
                .select("*")
                .eq("restaurant_id", staff.restaurant_id)
                .eq("id", phoneMatch.customer_id)
                .maybeSingle();

              if (parentCust) {
                customer = parentCust as Customer;
              }
            }
          } catch {
            // customer_phones tablosu henüz yoksa yut
          }
        }

        let addresses: CustomerAddress[] = [];
        let totalOrdersCount = 0;
        let lastOrder: CallerIdLastOrder | null = null;
        let lastAddressId: string | null = null;
        let lastOrderDateFormatted: string | null = null;

        if (customer) {
          // 3. Müşterinin ek telefonlarını getir
          try {
            const { data: phonesData } = await supabase
              .from("customer_phones")
              .select("*")
              .eq("customer_id", customer.id)
              .eq("restaurant_id", staff.restaurant_id)
              .order("created_at", { ascending: true });

            if (phonesData) {
              customer.phones = phonesData as CustomerPhone[];
            }
          } catch {
            // Tablo henüz yoksa devam et
          }

          // 4. Adresleri getir
          const { data: addrData } = await supabase
            .from("customer_addresses")
            .select("*")
            .eq("restaurant_id", staff.restaurant_id)
            .eq("customer_id", customer.id)
            .order("created_at", { ascending: false });

          addresses = (addrData ?? []) as CustomerAddress[];

          // 5. Müşterinin son siparişini ve toplam sipariş sayısını getir
          try {
            const { data: ordersData, count } = await supabase
              .from("orders")
              .select("id, created_at, total_amount, customer_address_id, status", { count: "exact" })
              .eq("restaurant_id", staff.restaurant_id)
              .eq("customer_id", customer.id)
              .neq("status", "cancelled")
              .order("created_at", { ascending: false })
              .limit(1);

            totalOrdersCount = count ?? (ordersData ? ordersData.length : 0);

            if (ordersData && ordersData.length > 0) {
              const latestOrder = ordersData[0];
              lastAddressId = latestOrder.customer_address_id || null;
              lastOrderDateFormatted = new Date(latestOrder.created_at).toLocaleDateString("tr-TR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              });

              // Son siparişin kalemlerini al
              const { data: itemsData } = await supabase
                .from("order_items")
                .select("menu_item_id, quantity, unit_price, note, menu_items(name)")
                .eq("order_id", latestOrder.id);

              const items = (itemsData ?? []).map((it: any) => {
                const rawName = Array.isArray(it.menu_items)
                  ? it.menu_items[0]?.name
                  : it.menu_items?.name;
                return {
                  menu_item_id: it.menu_item_id,
                  name: rawName || "Ürün",
                  quantity: Number(it.quantity) || 1,
                  unit_price: Number(it.unit_price) || 0,
                  note: it.note || null,
                };
              });

              const summaryText = items
                .slice(0, 4)
                .map((it) => `${it.quantity}x ${it.name}`)
                .join(", ") + (items.length > 4 ? ` (+${items.length - 4} ürün)` : "");

              lastOrder = {
                id: latestOrder.id,
                created_at: latestOrder.created_at,
                total_amount: Number(latestOrder.total_amount) || 0,
                customer_address_id: latestOrder.customer_address_id,
                itemsSummary: summaryText || "Ürün listesi",
                items,
              };
            }
          } catch (ordErr) {
            console.warn("Son sipariş çekilemedi:", ordErr);
          }
        }

        const isNew = !customer;
        const callState: CallerIdActiveCall = {
          phone: normalized,
          customer,
          addresses,
          isNew,
          receivedAt: new Date(),
          totalOrdersCount,
          lastOrder,
          lastAddressId,
          lastOrderDateFormatted,
        };

        // Kartı aç (yeni çağrı eskisin yerine geçer)
        setActiveCall(callState);

        // Masaüstü bildirimi (sayfa arka plandaysa)
        if (
          typeof window !== "undefined" &&
          document.hidden &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          const title = customer?.name
            ? `📞 Çağrı: ${customer.name}`
            : `📞 Çağrı: ${formatPhone(normalized)}`;
          const body = customer?.name
            ? `Tel: ${formatPhone(normalized)}${addresses[0] ? `\nAdres: ${addresses[0].address}` : ""}`
            : "Yeni Müşteri (Kayıtsız Numara)";

          const notif = new Notification(title, {
            body,
            icon: "/logo.png",
          });
          notif.onclick = () => {
            window.focus();
            notif.close();
          };
        }

        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        addLog(`Çağrı işlenirken hata: ${msg}`, "error");
        return false;
      }
    },
    [hasLicense, enabled, staff?.restaurant_id, addLog]
  );

  // Electron Masaüstü Kabuğu: Seri port yönetimi ve çağrı aboneliği (Tarayıcıda hiçbir şey yapmaz)
  useEffect(() => {
    if (typeof window === "undefined" || !window.desktopAPI?.serial) return;

    const desktop = window.desktopAPI;

    // 1. Ham veri aboneliği (ayarlar modalı loglarına kaçış karakterleriyle yansır)
    const unsubData = desktop.serial.onData(({ escaped }) => {
      addLog(`[HAM] ${escaped}`, "info");
    });

    // 2. Durum aboneliği
    const unsubStatus = desktop.serial.onStatus((status) => {
      if (status.error) {
        addLog(`[PORT HATA] ${status.error}`, "error");
      } else if (status.isOpen) {
        addLog(`[PORT BAĞLANDI] ${status.port} (${status.baudRate} baud)`, "info");
      } else if (!status.isOpen && !status.reconnecting) {
        addLog(`[PORT KAPANDI] Seri port bağlantısı kapalı`, "warn");
      }
    });

    // 3. Çağrı yakalama aboneliği (kabuk tarafından ayıklanan numara)
    const unsubCall = desktop.onIncomingCall((phone) => {
      addLog(`[ÇAĞRI AYIKLANDI] Tel: ${phone}`, "call");
      incomingCall(phone);
    });

    // 4. Lisansa ve Toggle durumuna bağlı olarak portu aç/kapat (Lisans yoksa veya toggle kapalıysa port kesinlikle açılmaz)
    if (hasLicense && enabled && comPort) {
      desktop.serial.open(comPort, baudRate, modemMode).then((res) => {
        if (!res.success && res.error) {
          addLog(`[BAĞLANTI BAŞARISIZ] ${res.error}`, "error");
        }
      });
    } else {
      desktop.serial.close().catch(() => {});
    }

    return () => {
      unsubData();
      unsubStatus();
      unsubCall();
      desktop.serial.close().catch(() => {});
    };
  }, [hasLicense, enabled, comPort, baudRate, modemMode, incomingCall, addLog]);

  const reconnectSerial = useCallback(async () => {
    if (typeof window === "undefined" || !window.desktopAPI?.serial) return;
    if (!comPort) return;
    addLog(`[MANUEL YENİDEN BAĞLAN] Port: ${comPort}, Baud: ${baudRate}`, "info");
    try {
      await window.desktopAPI.serial.close();
      const res = await window.desktopAPI.serial.open(comPort, baudRate, modemMode);
      if (!res.success && res.error) {
        addLog(`[BAĞLANTI BAŞARISIZ] ${res.error}`, "error");
      } else {
        addLog(`[BAĞLANTI BAŞARILI] Port ${comPort} açıldı`, "info");
      }
    } catch (err: any) {
      addLog(`[BAĞLANTI HATASI] ${err?.message || String(err)}`, "error");
    }
  }, [comPort, baudRate, modemMode, addLog]);

  // Kayıtsız müşteriyi doğrudan kaydet
  const registerAndLinkCustomer = useCallback(
    async ({
      name,
      phone,
      title = "Adres",
      address,
      customerNote,
      addressNote,
    }: {
      name: string;
      phone: string;
      title?: string;
      address: string;
      customerNote?: string;
      addressNote?: string;
    }): Promise<{ customer: Customer; address: CustomerAddress } | null> => {
      if (!staff?.restaurant_id) return null;
      const normalized = normalizePhone(phone);
      if (!normalized) throw new Error("Geçersiz telefon numarası");
      if (!address.trim()) throw new Error("Adres alanı zorunludur");

      const supabase = createBrowserClient();

      // 1. customers tablosuna ekle
      const custPayload: Record<string, unknown> = {
        restaurant_id: staff.restaurant_id,
        name: name.trim() || "",
        phone: normalized,
      };
      if (customerNote?.trim()) {
        custPayload.note = customerNote.trim();
      }

      let newCust: any = null;
      const { data: insertedCust, error: custErr } = await supabase
        .from("customers")
        .insert(custPayload)
        .select("*")
        .single();

      if (custErr) {
        // Eğer note kolonu henüz yoksa note olmadan tekrar dene
        if (custPayload.note) {
          delete custPayload.note;
          const { data: retryCust, error: retryErr } = await supabase
            .from("customers")
            .insert(custPayload)
            .select("*")
            .single();
          if (retryErr || !retryCust) throw new Error(retryErr?.message ?? "Müşteri kaydedilemedi");
          newCust = retryCust;
        } else {
          throw new Error(custErr.message);
        }
      } else {
        newCust = insertedCust;
      }

      // 2. customer_addresses tablosuna ekle
      const addrPayload: Record<string, unknown> = {
        restaurant_id: staff.restaurant_id,
        customer_id: newCust.id,
        title: title.trim() || "Adres",
        address: address.trim(),
      };
      if (addressNote?.trim()) {
        addrPayload.note = addressNote.trim();
      }

      let newAddr: any = null;
      const { data: insertedAddr, error: addrErr } = await supabase
        .from("customer_addresses")
        .insert(addrPayload)
        .select("*")
        .single();

      if (addrErr) {
        if (addrPayload.note) {
          delete addrPayload.note;
          const { data: retryAddr, error: retryAddrErr } = await supabase
            .from("customer_addresses")
            .insert(addrPayload)
            .select("*")
            .single();
          if (retryAddrErr || !retryAddr) throw new Error(retryAddrErr?.message ?? "Adres kaydedilemedi");
          newAddr = retryAddr;
        } else {
          throw new Error(addrErr.message);
        }
      } else {
        newAddr = insertedAddr;
      }

      const createdCustomer = newCust as Customer;
      const createdAddress = newAddr as CustomerAddress;

      // Active call state'ini güncelle
      setActiveCall((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          customer: createdCustomer,
          addresses: [createdAddress],
          isNew: false,
          totalOrdersCount: 0,
          lastOrder: null,
          lastAddressId: createdAddress.id,
        };
      });

      addLog(`Yeni müşteri kaydedildi: ${createdCustomer.name || "İsimsiz"} (${formatPhone(normalized)})`, "info");

      return { customer: createdCustomer, address: createdAddress };
    },
    [staff?.restaurant_id, addLog]
  );

  // Mevcut müşteriye yeni bir telefon numarası bağla
  const linkPhoneToCustomer = useCallback(
    async ({
      customerId,
      phone,
      label = "Diğer",
    }: {
      customerId: string;
      phone: string;
      label?: string;
    }): Promise<CustomerPhone | null> => {
      if (!staff?.restaurant_id) return null;
      const normalized = normalizePhone(phone);
      if (!normalized) throw new Error("Geçersiz telefon numarası");

      const supabase = createBrowserClient();

      // customer_phones tablosuna ekle
      const { data: newPhone, error: phoneErr } = await supabase
        .from("customer_phones")
        .insert({
          restaurant_id: staff.restaurant_id,
          customer_id: customerId,
          phone: normalized,
          label: label.trim() || "Diğer",
        })
        .select("*")
        .single();

      if (phoneErr) {
        throw new Error(phoneErr.message || "Ek telefon numarası eklenemedi");
      }

      // Müşteriyi, adresleri ve tüm telefonları tazele
      const { data: cust } = await supabase
        .from("customers")
        .select("*")
        .eq("restaurant_id", staff.restaurant_id)
        .eq("id", customerId)
        .maybeSingle();

      const { data: addrData } = await supabase
        .from("customer_addresses")
        .select("*")
        .eq("restaurant_id", staff.restaurant_id)
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });

      const { data: phonesData } = await supabase
        .from("customer_phones")
        .select("*")
        .eq("restaurant_id", staff.restaurant_id)
        .eq("customer_id", customerId)
        .order("created_at", { ascending: true });

      if (cust) {
        const fullCust: Customer = {
          ...(cust as Customer),
          phones: (phonesData ?? []) as CustomerPhone[],
        };

        setActiveCall((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            customer: fullCust,
            addresses: (addrData ?? []) as CustomerAddress[],
            isNew: false,
          };
        });

        addLog(`Telefon (${formatPhone(normalized)}), ${fullCust.name || "Müşteri"} kaydına bağlandı.`, "info");
      }

      return newPhone as CustomerPhone;
    },
    [staff?.restaurant_id, addLog]
  );

  // Siparişe başla: müşteriyi ve seçilen adresi paket sipariş ekranına aktar
  const startOrderForActiveCall = useCallback(
    (selectedAddressId?: string) => {
      if (!activeCall) return;

      const customerId = activeCall.customer?.id ?? "";
      const addressId =
        selectedAddressId ||
        (activeCall.addresses.length > 0 ? activeCall.addresses[0].id : "");

      // Panel kartını kapat
      setActiveCall(null);

      // Paket sipariş ekranına yönlendir
      const query = new URLSearchParams({
        type: "delivery",
        callerPhone: activeCall.phone,
      });
      if (customerId) query.set("customerId", customerId);
      if (addressId) query.set("addressId", addressId);

      router.push(`/service/new?${query.toString()}`);
    },
    [activeCall, router]
  );

  // Son siparişi tekrarla
  const startRepeatOrder = useCallback(
    (repeatOrderId: string, selectedAddressId?: string) => {
      if (!activeCall) return;

      const customerId = activeCall.customer?.id ?? "";
      const addressId =
        selectedAddressId ||
        activeCall.lastAddressId ||
        (activeCall.addresses.length > 0 ? activeCall.addresses[0].id : "");

      // Panel kartını kapat
      setActiveCall(null);

      const query = new URLSearchParams({
        type: "delivery",
        callerPhone: activeCall.phone,
        repeatOrderId,
      });
      if (customerId) query.set("customerId", customerId);
      if (addressId) query.set("addressId", addressId);

      router.push(`/service/new?${query.toString()}`);
    },
    [activeCall, router]
  );

  const value: CallerIdContextType = {
    hasLicense,
    licenseLoading,
    enabled,
    setEnabled,
    comPort,
    setComPort,
    baudRate,
    setBaudRate,
    modemMode,
    setModemMode,
    reconnectSerial,
    activeCall,
    dismissCall,
    incomingCall,
    logs,
    addLog,
    clearLogs,
    registerAndLinkCustomer,
    linkPhoneToCustomer,
    startOrderForActiveCall,
    startRepeatOrder,
  };

  return (
    <CallerIdContext.Provider value={value}>
      {children}
    </CallerIdContext.Provider>
  );
}

export function useCallerId() {
  const ctx = useContext(CallerIdContext);
  if (!ctx) {
    throw new Error("useCallerId must be used within CallerIdProvider");
  }
  return ctx;
}
