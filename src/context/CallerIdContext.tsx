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
  CallerIdActiveCall,
  CallerIdLogEntry,
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
  }) => Promise<{ customer: Customer; address: CustomerAddress } | null>;
  startOrderForActiveCall: (selectedAddressId?: string) => void;
};

const CallerIdContext = createContext<CallerIdContextType | null>(null);

function playChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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

  // Local settings
  const [enabled, setEnabledState] = useState<boolean>(false);
  const [comPort, setComPortState] = useState<string>("COM1");
  const [baudRate, setBaudRateState] = useState<number>(9600);

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
    } catch {
      // LocalStorage erişim hatası olursa yut
    }
  }, []);

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

  const addLog = useCallback((text: string, type: CallerIdLogEntry["type"] = "info") => {
    const entry: CallerIdLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString("tr-TR"),
      text,
      type,
    };
    setLogs((prev) => [entry, ...prev.slice(0, 99)]);
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

        // 1. customers tablosunda ara
        const { data: customer, error: custErr } = await supabase
          .from("customers")
          .select("*")
          .eq("restaurant_id", staff.restaurant_id)
          .eq("phone", normalized)
          .maybeSingle();

        if (custErr) {
          addLog(`Müşteri sorgulanırken hata: ${custErr.message}`, "error");
        }

        let addresses: CustomerAddress[] = [];
        if (customer) {
          // 2. Adresleri getir
          const { data: addrData } = await supabase
            .from("customer_addresses")
            .select("*")
            .eq("restaurant_id", staff.restaurant_id)
            .eq("customer_id", customer.id)
            .order("created_at", { ascending: false });

          addresses = (addrData ?? []) as CustomerAddress[];
        }

        const isNew = !customer;
        const callState: CallerIdActiveCall = {
          phone: normalized,
          customer: customer ? (customer as Customer) : null,
          addresses,
          isNew,
          receivedAt: new Date(),
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

  // Kayıtsız müşteriyi doğrudan kaydet
  const registerAndLinkCustomer = useCallback(
    async ({
      name,
      phone,
      title = "Adres",
      address,
    }: {
      name: string;
      phone: string;
      title?: string;
      address: string;
    }): Promise<{ customer: Customer; address: CustomerAddress } | null> => {
      if (!staff?.restaurant_id) return null;
      const normalized = normalizePhone(phone);
      if (!normalized) throw new Error("Geçersiz telefon numarası");
      if (!address.trim()) throw new Error("Adres alanı zorunludur");

      const supabase = createBrowserClient();

      // 1. customers tablosuna ekle
      const { data: newCust, error: custErr } = await supabase
        .from("customers")
        .insert({
          restaurant_id: staff.restaurant_id,
          name: name.trim() || "",
          phone: normalized,
        })
        .select("*")
        .single();

      if (custErr || !newCust) {
        throw new Error(custErr?.message ?? "Müşteri kaydedilemedi");
      }

      // 2. customer_addresses tablosuna ekle
      const { data: newAddr, error: addrErr } = await supabase
        .from("customer_addresses")
        .insert({
          restaurant_id: staff.restaurant_id,
          customer_id: newCust.id,
          title: title.trim() || "Adres",
          address: address.trim(),
        })
        .select("*")
        .single();

      if (addrErr || !newAddr) {
        throw new Error(addrErr?.message ?? "Adres kaydedilemedi");
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
        };
      });

      addLog(`Yeni müşteri kaydedildi: ${createdCustomer.name || "İsimsiz"} (${formatPhone(normalized)})`, "info");

      return { customer: createdCustomer, address: createdAddress };
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

  const value: CallerIdContextType = {
    hasLicense,
    licenseLoading,
    enabled,
    setEnabled,
    comPort,
    setComPort,
    baudRate,
    setBaudRate,
    activeCall,
    dismissCall,
    incomingCall,
    logs,
    addLog,
    clearLogs,
    registerAndLinkCustomer,
    startOrderForActiveCall,
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
