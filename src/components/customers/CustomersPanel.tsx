"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useStaffSession } from "@/hooks/useStaffSession";
import { useRestaurantFeatures } from "@/hooks/useRestaurantFeatures";
import { normalizePhone, formatPhone } from "@/lib/phone";
import type {
  Customer,
  CustomerAddress,
  CustomerPhone,
  CustomerOrderStats,
  CustomerWithDetails,
} from "@/types/customer";

/* ── Copy helper ─────────────────────────────────── */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function phoneToDigits(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) return `0${cleaned}`;
  if (cleaned.length === 11 && cleaned.startsWith("0")) return cleaned;
  return `0${cleaned}`;
}

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={label || "Kopyala"}
      style={{
        background: copied ? "#dcfce7" : "#f1f5f9",
        border: "1px solid " + (copied ? "#86efac" : "#cbd5e1"),
        borderRadius: "5px",
        padding: "2px 6px",
        fontSize: "0.7rem",
        cursor: "pointer",
        color: copied ? "#15803d" : "#475569",
        fontWeight: 600,
        whiteSpace: "nowrap",
        transition: "all 0.15s ease",
        flexShrink: 0,
      }}
    >
      {copied ? "Kopyalandı ✓" : "📋"}
    </button>
  );
}

function formatTry(val: number): string {
  return "₺" + Number(val || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type SortOption = "last_order" | "order_count" | "total_spent" | "name";

export function CustomersPanel() {
  const router = useRouter();
  const { staff } = useStaffSession();
  const { callerIdEnabled, loading: featureLoading } = useRestaurantFeatures();

  const [customers, setCustomers] = useState<CustomerWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search, Sort & Pagination
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("last_order");
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 15;

  // Selected customer for Detail Modal
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addCustNote, setAddCustNote] = useState("");
  const [addAddrTitle, setAddAddrTitle] = useState("Adres");
  const [addAddress, setAddAddress] = useState("");
  const [addAddrNote, setAddAddrNote] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Edit modal state
  const [editingCustomer, setEditingCustomer] = useState<CustomerWithDetails | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCustNote, setEditCustNote] = useState("");
  const [editNewPhone, setEditNewPhone] = useState("");
  const [editNewPhoneLabel, setEditNewPhoneLabel] = useState("İş");
  const [editNewAddrTitle, setEditNewAddrTitle] = useState("Adres");
  const [editNewAddrText, setEditNewAddrText] = useState("");
  const [editNewAddrNote, setEditNewAddrNote] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<CustomerWithDetails | null>(null);
  const [deleting, setDeleting] = useState(false);

  // License check
  if (!featureLoading && !callerIdEnabled) {
    return (
      <div>
        <header className="salon-header">
          <div>
            <p className="salon-kicker">Müşterilerim</p>
            <h1 className="salon-title">Müşteri Kayıtları</h1>
          </div>
        </header>
        <div className="salon-banner salon-banner--error">
          <p>Caller ID lisansı aktif olmadığı için bu sayfa kullanılamaz.</p>
        </div>
      </div>
    );
  }

  /* ── Fetch Customers, Phones, Addresses & Stats ── */
  const fetchCustomers = useCallback(async () => {
    if (!staff?.restaurant_id) return;
    setLoading(true);
    setError(null);

    const supabase = createBrowserClient();

    // 1. Fetch customers
    const { data: custs, error: ce } = await supabase
      .from("customers")
      .select("*")
      .eq("restaurant_id", staff.restaurant_id)
      .order("created_at", { ascending: false });

    if (ce) {
      setError(ce.message);
      setLoading(false);
      return;
    }

    const customerIds = (custs ?? []).map((c) => c.id);

    // 2. Fetch addresses in chunks
    let allAddresses: CustomerAddress[] = [];
    if (customerIds.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < customerIds.length; i += chunkSize) {
        const chunk = customerIds.slice(i, i + chunkSize);
        const { data: addrs } = await supabase
          .from("customer_addresses")
          .select("*")
          .eq("restaurant_id", staff.restaurant_id)
          .in("customer_id", chunk);
        if (addrs) allAddresses = allAddresses.concat(addrs as CustomerAddress[]);
      }
    }

    // 3. Fetch secondary phones (customer_phones)
    let allPhones: CustomerPhone[] = [];
    if (customerIds.length > 0) {
      try {
        const { data: phones } = await supabase
          .from("customer_phones")
          .select("*")
          .eq("restaurant_id", staff.restaurant_id)
          .in("customer_id", customerIds);
        if (phones) allPhones = phones as CustomerPhone[];
      } catch {
        // Tablo henüz SQL çalıştırılmadıysa boş kalır
      }
    }

    // 4. Fetch customer statistics (from view or fallback)
    const statsMap: Record<string, CustomerOrderStats> = {};
    if (customerIds.length > 0) {
      try {
        const { data: statsData } = await supabase
          .from("customer_order_stats")
          .select("*")
          .eq("restaurant_id", staff.restaurant_id);

        if (statsData) {
          for (const s of statsData) {
            statsMap[s.customer_id] = {
              customer_id: s.customer_id,
              total_orders: Number(s.total_orders) || 0,
              total_spent: Number(s.total_spent) || 0,
              last_order_at: s.last_order_at || null,
              first_order_at: s.first_order_at || null,
            };
          }
        }
      } catch {
        // View henüz oluşturulmadıysa orders tablosundan temel veriler çekilebilir veya boş kalır
      }
    }

    const merged: CustomerWithDetails[] = ((custs ?? []) as Customer[]).map((c) => ({
      ...c,
      addresses: allAddresses.filter((a) => a.customer_id === c.id),
      phones: allPhones.filter((p) => p.customer_id === c.id),
      stats: statsMap[c.id] || {
        customer_id: c.id,
        total_orders: 0,
        total_spent: 0,
        last_order_at: null,
        first_order_at: null,
      },
    }));

    setCustomers(merged);
    setLoading(false);
  }, [staff?.restaurant_id]);

  useEffect(() => {
    if (staff?.restaurant_id && callerIdEnabled) {
      void fetchCustomers();
    }
  }, [staff?.restaurant_id, callerIdEnabled, fetchCustomers]);

  /* ── Filtered & Sorted Customers ───────────────── */
  const filteredAndSorted = useMemo(() => {
    let list = customers.filter((c) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      if (c.name.toLowerCase().includes(q)) return true;
      if (c.phone.includes(q) || formatPhone(c.phone).includes(q)) return true;
      if (c.note && c.note.toLowerCase().includes(q)) return true;
      if (c.phones.some((p) => p.phone.includes(q) || formatPhone(p.phone).includes(q) || p.label.toLowerCase().includes(q))) {
        return true;
      }
      if (c.addresses.some((a) => a.address.toLowerCase().includes(q) || a.title.toLowerCase().includes(q) || (a.note && a.note.toLowerCase().includes(q)))) {
        return true;
      }
      return false;
    });

    list = [...list].sort((a, b) => {
      if (sortBy === "last_order") {
        const dateA = a.stats?.last_order_at ? new Date(a.stats.last_order_at).getTime() : 0;
        const dateB = b.stats?.last_order_at ? new Date(b.stats.last_order_at).getTime() : 0;
        if (dateA !== dateB) return dateB - dateA; // en son sipariş en üstte
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (sortBy === "order_count") {
        const countA = a.stats?.total_orders || 0;
        const countB = b.stats?.total_orders || 0;
        return countB - countA;
      }
      if (sortBy === "total_spent") {
        const spentA = a.stats?.total_spent || 0;
        const spentB = b.stats?.total_spent || 0;
        return spentB - spentA;
      }
      if (sortBy === "name") {
        return (a.name || "").localeCompare(b.name || "", "tr");
      }
      return 0;
    });

    return list;
  }, [customers, search, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / ITEMS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageCustomers = filteredAndSorted.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  /* ── Add Customer ──────────────────────────────── */
  async function handleAdd() {
    setAddError(null);
    const normalized = normalizePhone(addPhone);
    if (!normalized) {
      setAddError("Geçerli bir telefon numarası girin (10 hane).");
      return;
    }
    if (!addAddress.trim()) {
      setAddError("Adres alanı zorunludur.");
      return;
    }
    if (!staff?.restaurant_id) return;
    setSaving(true);

    const supabase = createBrowserClient();

    // Çakışma kontrolü (ana telefon veya ek telefon)
    const { data: existingPrimary } = await supabase
      .from("customers")
      .select("id, name, phone")
      .eq("restaurant_id", staff.restaurant_id)
      .eq("phone", normalized)
      .maybeSingle();

    if (existingPrimary) {
      setAddError(`Bu numara zaten kayıtlı: ${existingPrimary.name || "İsimsiz"} (${formatPhone(existingPrimary.phone)}).`);
      setSaving(false);
      return;
    }

    try {
      const { data: existingSec } = await supabase
        .from("customer_phones")
        .select("id, phone")
        .eq("restaurant_id", staff.restaurant_id)
        .eq("phone", normalized)
        .maybeSingle();

      if (existingSec) {
        setAddError("Bu telefon numarası başka bir müşterinin ek telefonu olarak kayıtlı.");
        setSaving(false);
        return;
      }
    } catch {}

    // Insert customer
    const custPayload: Record<string, unknown> = {
      restaurant_id: staff.restaurant_id,
      name: addName.trim() || "",
      phone: normalized,
    };
    if (addCustNote.trim()) custPayload.note = addCustNote.trim();

    let newCust: any = null;
    const { data: insertedCust, error: ce } = await supabase
      .from("customers")
      .insert(custPayload)
      .select("*")
      .single();

    if (ce) {
      if (custPayload.note) {
        delete custPayload.note;
        const { data: retryCust, error: retryErr } = await supabase
          .from("customers")
          .insert(custPayload)
          .select("*")
          .single();
        if (retryErr || !retryCust) {
          setAddError(retryErr?.message ?? "Müşteri kaydedilemedi.");
          setSaving(false);
          return;
        }
        newCust = retryCust;
      } else {
        setAddError(ce.message);
        setSaving(false);
        return;
      }
    } else {
      newCust = insertedCust;
    }

    // Insert address
    const addrPayload: Record<string, unknown> = {
      restaurant_id: staff.restaurant_id,
      customer_id: newCust.id,
      title: addAddrTitle.trim() || "Adres",
      address: addAddress.trim(),
    };
    if (addAddrNote.trim()) addrPayload.note = addAddrNote.trim();

    const { error: ae } = await supabase.from("customer_addresses").insert(addrPayload);
    if (ae) {
      if (addrPayload.note) {
        delete addrPayload.note;
        await supabase.from("customer_addresses").insert(addrPayload);
      }
    }

    // Clear form
    setAddName("");
    setAddPhone("");
    setAddCustNote("");
    setAddAddrTitle("Adres");
    setAddAddress("");
    setAddAddrNote("");
    setSessionCount((prev) => prev + 1);
    setSaving(false);
    setShowAddForm(false);
    void fetchCustomers();
  }

  /* ── Open Edit Modal ───────────────────────────── */
  function openEdit(c: CustomerWithDetails, e?: React.MouseEvent) {
    e?.stopPropagation();
    setEditingCustomer(c);
    setEditName(c.name);
    setEditPhone(formatPhone(c.phone));
    setEditCustNote(c.note || "");
    setEditNewPhone("");
    setEditNewPhoneLabel("İş");
    setEditNewAddrTitle("Adres");
    setEditNewAddrText("");
    setEditNewAddrNote("");
    setEditError(null);
  }

  async function handleEditSave() {
    if (!editingCustomer || !staff?.restaurant_id) return;
    setEditError(null);
    const normalized = normalizePhone(editPhone);
    if (!normalized) {
      setEditError("Geçerli bir ana telefon numarası girin.");
      return;
    }
    setEditSaving(true);

    const supabase = createBrowserClient();

    const updatePayload: Record<string, unknown> = {
      name: editName.trim(),
      phone: normalized,
      note: editCustNote.trim() || null,
    };

    const { error: ue } = await supabase
      .from("customers")
      .update(updatePayload)
      .eq("id", editingCustomer.id)
      .eq("restaurant_id", staff.restaurant_id);

    if (ue) {
      if (updatePayload.note) {
        delete updatePayload.note;
        const { error: retryErr } = await supabase
          .from("customers")
          .update(updatePayload)
          .eq("id", editingCustomer.id)
          .eq("restaurant_id", staff.restaurant_id);
        if (retryErr) {
          setEditError(retryErr.message);
          setEditSaving(false);
          return;
        }
      } else {
        setEditError(ue.message);
        setEditSaving(false);
        return;
      }
    }

    setEditSaving(false);
    setEditingCustomer(null);
    void fetchCustomers();
  }

  /* ── Add Secondary Phone in Edit ───────────────── */
  async function handleAddSecondaryPhone() {
    if (!editingCustomer || !staff?.restaurant_id) return;
    const normalized = normalizePhone(editNewPhone);
    if (!normalized) {
      setEditError("Geçerli bir ek telefon numarası girin.");
      return;
    }
    setEditSaving(true);
    const supabase = createBrowserClient();

    try {
      const { data: newPhone, error: pe } = await supabase
        .from("customer_phones")
        .insert({
          restaurant_id: staff.restaurant_id,
          customer_id: editingCustomer.id,
          phone: normalized,
          label: editNewPhoneLabel.trim() || "Diğer",
        })
        .select("*")
        .single();

      if (pe) {
        setEditError(pe.message);
        setEditSaving(false);
        return;
      }

      setEditNewPhone("");
      setEditNewPhoneLabel("İş");
      setEditingCustomer((prev) =>
        prev
          ? {
              ...prev,
              phones: [...prev.phones, newPhone as CustomerPhone],
            }
          : null
      );
      void fetchCustomers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setEditError(msg);
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDeleteSecondaryPhone(phoneId: string) {
    if (!editingCustomer || !staff?.restaurant_id) return;
    const supabase = createBrowserClient();
    try {
      await supabase
        .from("customer_phones")
        .delete()
        .eq("id", phoneId)
        .eq("restaurant_id", staff.restaurant_id);

      setEditingCustomer((prev) =>
        prev
          ? {
              ...prev,
              phones: prev.phones.filter((p) => p.id !== phoneId),
            }
          : null
      );
      void fetchCustomers();
    } catch {}
  }

  /* ── Add Address in Edit ───────────────────────── */
  async function handleAddAddressToEdit() {
    if (!editingCustomer || !staff?.restaurant_id) return;
    if (!editNewAddrText.trim()) {
      setEditError("Adres alanı boş olamaz.");
      return;
    }
    setEditSaving(true);
    const supabase = createBrowserClient();

    const addrPayload: Record<string, unknown> = {
      restaurant_id: staff.restaurant_id,
      customer_id: editingCustomer.id,
      title: editNewAddrTitle.trim() || "Adres",
      address: editNewAddrText.trim(),
    };
    if (editNewAddrNote.trim()) addrPayload.note = editNewAddrNote.trim();

    const { data: newAddr, error: ae } = await supabase
      .from("customer_addresses")
      .insert(addrPayload)
      .select("*")
      .single();

    if (ae) {
      if (addrPayload.note) {
        delete addrPayload.note;
        const { data: retryAddr, error: rErr } = await supabase
          .from("customer_addresses")
          .insert(addrPayload)
          .select("*")
          .single();
        if (rErr || !retryAddr) {
          setEditError(rErr?.message ?? "Adres eklenemedi.");
          setEditSaving(false);
          return;
        }
        setEditingCustomer((prev) =>
          prev ? { ...prev, addresses: [...prev.addresses, retryAddr as CustomerAddress] } : null
        );
      } else {
        setEditError(ae.message);
        setEditSaving(false);
        return;
      }
    } else if (newAddr) {
      setEditingCustomer((prev) =>
        prev ? { ...prev, addresses: [...prev.addresses, newAddr as CustomerAddress] } : null
      );
    }

    setEditNewAddrTitle("Adres");
    setEditNewAddrText("");
    setEditNewAddrNote("");
    setEditSaving(false);
    void fetchCustomers();
  }

  async function handleDeleteAddress(addrId: string) {
    if (!editingCustomer || !staff?.restaurant_id) return;
    const supabase = createBrowserClient();
    await supabase
      .from("customer_addresses")
      .delete()
      .eq("id", addrId)
      .eq("restaurant_id", staff.restaurant_id);

    setEditingCustomer((prev) =>
      prev ? { ...prev, addresses: prev.addresses.filter((a) => a.id !== addrId) } : null
    );
    void fetchCustomers();
  }

  /* ── Delete Customer ───────────────────────────── */
  async function handleDelete() {
    if (!deleteTarget || !staff?.restaurant_id) return;
    setDeleting(true);
    const supabase = createBrowserClient();

    try {
      await supabase
        .from("customer_phones")
        .delete()
        .eq("customer_id", deleteTarget.id)
        .eq("restaurant_id", staff.restaurant_id);
    } catch {}

    await supabase
      .from("customer_addresses")
      .delete()
      .eq("customer_id", deleteTarget.id)
      .eq("restaurant_id", staff.restaurant_id);

    await supabase
      .from("customers")
      .delete()
      .eq("id", deleteTarget.id)
      .eq("restaurant_id", staff.restaurant_id);

    setDeleting(false);
    setDeleteTarget(null);
    if (selectedCustomerId === deleteTarget.id) setSelectedCustomerId(null);
    void fetchCustomers();
  }

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  return (
    <div className="customers-panel" style={{ paddingBottom: "2rem" }}>
      {/* ── Üst Başlık & Butonlar ───────────────────── */}
      <header
        className="salon-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          marginBottom: "1.25rem",
        }}
      >
        <div>
          <p className="salon-kicker">Mergen POS</p>
          <h1 className="salon-title" style={{ fontSize: "1.6rem", fontWeight: 800 }}>
            Müşterilerim ({filteredAndSorted.length})
          </h1>
        </div>
        <button
          type="button"
          className="login-button"
          style={{
            marginTop: 0,
            padding: "0.6rem 1.25rem",
            borderRadius: "10px",
            fontWeight: 700,
            cursor: "pointer",
            background: "#059669",
          }}
          onClick={() => {
            setShowAddForm((prev) => !prev);
            setAddError(null);
          }}
        >
          {showAddForm ? "✕ Formu Kapat" : "+ Yeni Müşteri Ekle"}
        </button>
      </header>

      {/* ── Yeni Müşteri Ekleme Formu ──────────────── */}
      {showAddForm && (
        <div
          style={{
            background: "#ffffff",
            border: "2px solid #059669",
            borderRadius: "12px",
            padding: "1.25rem",
            marginBottom: "1.5rem",
            boxShadow: "0 10px 15px -3px rgba(0,0,0,0.08)",
          }}
        >
          <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.1rem", fontWeight: 700, color: "#065f46" }}>
            Yeni Müşteri Kaydı
          </h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "0.85rem",
            }}
          >
            <div>
              <label className="cust-label">Müşteri Adı (opsiyonel)</label>
              <input
                ref={nameInputRef}
                className="login-input"
                type="text"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="Örn. Mehmet Yılmaz"
              />
            </div>

            <div>
              <label className="cust-label">Telefon Numarası *</label>
              <input
                className="login-input"
                type="tel"
                value={addPhone}
                onChange={(e) => setAddPhone(e.target.value)}
                placeholder="05XX XXX XX XX"
              />
            </div>

            <div>
              <label className="cust-label">Müşteri Notu (Genel)</label>
              <input
                className="login-input"
                type="text"
                value={addCustNote}
                onChange={(e) => setAddCustNote(e.target.value)}
                placeholder="Örn. Sanayi 3. blok esnafı"
              />
            </div>

            <div>
              <label className="cust-label">Adres Başlığı</label>
              <input
                className="login-input"
                type="text"
                value={addAddrTitle}
                onChange={(e) => setAddAddrTitle(e.target.value)}
                placeholder="Ev, İş, Dükkan vb."
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label className="cust-label">Teslimat Adresi *</label>
              <textarea
                className="login-input"
                rows={2}
                value={addAddress}
                onChange={(e) => setAddAddress(e.target.value)}
                placeholder="Mahalle, Cadde, Sokak, No, Daire..."
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label className="cust-label">Adres Notu (opsiyonel)</label>
              <input
                className="login-input"
                type="text"
                value={addAddrNote}
                onChange={(e) => setAddAddrNote(e.target.value)}
                placeholder="Örn. Zil bozuk, kapıda ara"
              />
            </div>
          </div>

          {addError && (
            <div style={{ color: "#b91c1c", fontSize: "0.85rem", marginTop: "0.75rem", fontWeight: 600 }}>
              {addError}
            </div>
          )}

          <div style={{ marginTop: "1rem", display: "flex", gap: "0.75rem" }}>
            <button
              type="button"
              className="login-button"
              style={{
                marginTop: 0,
                padding: "0.55rem 1.5rem",
                borderRadius: "8px",
                background: "#059669",
                fontWeight: 700,
                cursor: "pointer",
              }}
              disabled={saving}
              onClick={() => void handleAdd()}
            >
              {saving ? "Kaydediliyor…" : "✓ Müşteriyi Kaydet"}
            </button>
            <button
              type="button"
              className="ghost-btn"
              style={{ padding: "0.55rem 1rem", borderRadius: "8px", cursor: "pointer" }}
              onClick={() => setShowAddForm(false)}
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}

      {/* ── Arama ve Sıralama Çubuğu ───────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.75rem",
          marginBottom: "1rem",
        }}
      >
        <div style={{ flex: 1, minWidth: "260px", maxWidth: "450px" }}>
          <input
            className="login-input"
            type="search"
            placeholder="🔍 İsim, ana/ek telefon, adres veya not ara..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            style={{ width: "100%", borderRadius: "8px" }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.82rem", color: "#64748b", fontWeight: 600 }}>Sıralama:</span>
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as SortOption);
              setPage(1);
            }}
            style={{
              padding: "0.45rem 0.75rem",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              fontSize: "0.85rem",
              background: "#ffffff",
              color: "#0f172a",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <option value="last_order">Son Siparişe Göre (Varsayılan)</option>
            <option value="order_count">En Çok Sipariş Verene Göre</option>
            <option value="total_spent">En Çok Harcama Yapana Göre</option>
            <option value="name">Müşteri Adına Göre (A-Z)</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="salon-banner salon-banner--error" style={{ marginBottom: "1rem" }}>
          <p>{error}</p>
        </div>
      )}

      {/* ── Müşteri Tablosu / Listesi ─────────────── */}
      {loading ? (
        <p className="salon-muted">Müşteri verileri yükleniyor…</p>
      ) : filteredAndSorted.length === 0 ? (
        <div
          style={{
            padding: "2rem",
            textAlign: "center",
            background: "#f8fafc",
            borderRadius: "12px",
            border: "1px dashed #cbd5e1",
            color: "#64748b",
          }}
        >
          {search ? "Aramanızla eşleşen müşteri kaydı bulunamadı." : "Henüz kayıtlı müşteri bulunmuyor."}
        </div>
      ) : (
        <>
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              overflowX: "auto",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", color: "#475569" }}>
                  <th style={{ padding: "0.75rem 1rem", fontWeight: 700 }}>Müşteri</th>
                  <th style={{ padding: "0.75rem 1rem", fontWeight: 700 }}>Telefon(lar)</th>
                  <th style={{ padding: "0.75rem 1rem", fontWeight: 700 }}>Adres Sayısı</th>
                  <th style={{ padding: "0.75rem 1rem", fontWeight: 700 }}>Sipariş</th>
                  <th style={{ padding: "0.75rem 1rem", fontWeight: 700 }}>Toplam Harcama</th>
                  <th style={{ padding: "0.75rem 1rem", fontWeight: 700 }}>Son Sipariş</th>
                  <th style={{ padding: "0.75rem 1rem", fontWeight: 700, textAlign: "right" }}>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {pageCustomers.map((c) => {
                  const lastOrderFormatted = c.stats?.last_order_at
                    ? new Date(c.stats.last_order_at).toLocaleDateString("tr-TR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—";

                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedCustomerId(c.id)}
                      style={{
                        borderBottom: "1px solid #f1f5f9",
                        cursor: "pointer",
                        transition: "background 0.15s ease",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f0fdf4")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      {/* Müşteri Adı & Not */}
                      <td style={{ padding: "0.75rem 1rem", verticalAlign: "middle" }}>
                        <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.9rem" }}>
                          {c.name || "İsimsiz Müşteri"}
                        </div>
                        {c.note && (
                          <div style={{ fontSize: "0.75rem", color: "#b45309", marginTop: "2px" }}>
                            📌 {c.note}
                          </div>
                        )}
                      </td>

                      {/* Telefonlar */}
                      <td style={{ padding: "0.75rem 1rem", verticalAlign: "middle" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                            <span style={{ fontWeight: 600, color: "#1e293b" }}>{formatPhone(c.phone)}</span>
                            <span style={{ fontSize: "0.68rem", background: "#e2e8f0", padding: "1px 5px", borderRadius: "4px" }}>
                              Ana
                            </span>
                            <CopyBtn text={phoneToDigits(c.phone)} />
                          </div>
                          {c.phones.slice(0, 2).map((p) => (
                            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.78rem" }}>
                              <span style={{ color: "#475569" }}>{formatPhone(p.phone)}</span>
                              <span style={{ fontSize: "0.68rem", background: "#fef3c7", color: "#92400e", padding: "1px 4px", borderRadius: "4px" }}>
                                {p.label}
                              </span>
                              <CopyBtn text={phoneToDigits(p.phone)} />
                            </div>
                          ))}
                          {c.phones.length > 2 && (
                            <span style={{ fontSize: "0.72rem", color: "#059669", fontWeight: 600 }}>
                              +{c.phones.length - 2} diğer numara
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Adres Sayısı */}
                      <td style={{ padding: "0.75rem 1rem", verticalAlign: "middle", color: "#334155" }}>
                        <span style={{ fontWeight: 600 }}>{c.addresses.length}</span> adres
                      </td>

                      {/* Toplam Sipariş */}
                      <td style={{ padding: "0.75rem 1rem", verticalAlign: "middle" }}>
                        <span
                          style={{
                            background: c.stats?.total_orders ? "#dbeafe" : "#f1f5f9",
                            color: c.stats?.total_orders ? "#1e40af" : "#64748b",
                            padding: "2px 8px",
                            borderRadius: "12px",
                            fontWeight: 700,
                            fontSize: "0.8rem",
                          }}
                        >
                          {c.stats?.total_orders || 0} sipariş
                        </span>
                      </td>

                      {/* Toplam Harcama */}
                      <td style={{ padding: "0.75rem 1rem", verticalAlign: "middle", fontWeight: 700, color: "#065f46" }}>
                        {formatTry(c.stats?.total_spent || 0)}
                      </td>

                      {/* Son Sipariş Tarihi */}
                      <td style={{ padding: "0.75rem 1rem", verticalAlign: "middle", color: "#475569" }}>
                        {lastOrderFormatted}
                      </td>

                      {/* İşlem Butonları */}
                      <td style={{ padding: "0.75rem 1rem", verticalAlign: "middle", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            title="Müşteri Detayı ve Sipariş Geçmişi"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCustomerId(c.id);
                            }}
                            style={{
                              padding: "4px 8px",
                              borderRadius: "6px",
                              border: "1px solid #cbd5e1",
                              background: "#ffffff",
                              cursor: "pointer",
                              fontSize: "0.8rem",
                            }}
                          >
                            👁️ Detay
                          </button>
                          <button
                            type="button"
                            title="Düzenle"
                            onClick={(e) => openEdit(c, e)}
                            style={{
                              padding: "4px 8px",
                              borderRadius: "6px",
                              border: "1px solid #cbd5e1",
                              background: "#ffffff",
                              cursor: "pointer",
                              fontSize: "0.8rem",
                            }}
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            title="Sil"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(c);
                            }}
                            style={{
                              padding: "4px 8px",
                              borderRadius: "6px",
                              border: "1px solid #fecaca",
                              background: "#fef2f2",
                              color: "#dc2626",
                              cursor: "pointer",
                              fontSize: "0.8rem",
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Sayfalama */}
          {totalPages > 1 && (
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{
                  padding: "0.4rem 0.8rem",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  cursor: currentPage <= 1 ? "not-allowed" : "pointer",
                  opacity: currentPage <= 1 ? 0.5 : 1,
                  fontWeight: 600,
                }}
              >
                ← Önceki
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  style={{
                    padding: "0.4rem 0.8rem",
                    borderRadius: "6px",
                    border: "1px solid " + (p === currentPage ? "#059669" : "#cbd5e1"),
                    background: p === currentPage ? "#059669" : "#ffffff",
                    color: p === currentPage ? "#ffffff" : "#0f172a",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {p}
                </button>
              ))}
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                style={{
                  padding: "0.4rem 0.8rem",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  cursor: currentPage >= totalPages ? "not-allowed" : "pointer",
                  opacity: currentPage >= totalPages ? 0.5 : 1,
                  fontWeight: 600,
                }}
              >
                Sonraki →
              </button>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════ */}
      {/* ── 5. MÜŞTERİ DETAY MODALI ─────────────────── */}
      {/* ═══════════════════════════════════════════════ */}
      {selectedCustomer && (
        <CustomerDetailModal
          customer={selectedCustomer}
          onClose={() => setSelectedCustomerId(null)}
          onEdit={() => {
            const c = selectedCustomer;
            setSelectedCustomerId(null);
            openEdit(c);
          }}
          onRepeatOrder={(orderId, addressId) => {
            const query = new URLSearchParams({
              type: "delivery",
              customerId: selectedCustomer.id,
              repeatOrderId: orderId,
            });
            if (addressId) query.set("addressId", addressId);
            router.push(`/service/new?${query.toString()}`);
          }}
        />
      )}

      {/* ═══════════════════════════════════════════════ */}
      {/* ── MÜŞTERİ DÜZENLEME MODALI ────────────────── */}
      {/* ═══════════════════════════════════════════════ */}
      {editingCustomer && (
        <div className="salon-modal-backdrop" onClick={() => setEditingCustomer(null)}>
          <div
            className="salon-modal"
            style={{ maxWidth: "600px", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "#0f172a" }}>
                Müşteri Bilgilerini Düzenle
              </h3>
              <button
                type="button"
                onClick={() => setEditingCustomer(null)}
                style={{ background: "none", border: "none", fontSize: "1.2rem", cursor: "pointer", color: "#64748b" }}
              >
                ✕
              </button>
            </div>

            {/* Temel Bilgiler */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.25rem" }}>
              <div>
                <label className="cust-label">Müşteri Adı</label>
                <input
                  className="login-input"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Müşteri Adı Soyadı"
                />
              </div>

              <div>
                <label className="cust-label">Ana Telefon Numarası *</label>
                <input
                  className="login-input"
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="05XX XXX XX XX"
                />
              </div>

              <div>
                <label className="cust-label">Genel Müşteri Notu</label>
                <input
                  className="login-input"
                  type="text"
                  value={editCustNote}
                  onChange={(e) => setEditCustNote(e.target.value)}
                  placeholder="Örn. Sanayi 3. blok esnafı, rica üzerine hızlı gönderim"
                />
              </div>
            </div>

            {/* Ek Telefonlar Bölümü */}
            <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "1rem", marginBottom: "1.25rem" }}>
              <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "0.95rem", fontWeight: 700, color: "#1e293b" }}>
                Ek Telefon Numaraları ({editingCustomer.phones.length})
              </h4>

              {editingCustomer.phones.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "0.75rem" }}>
                  {editingCustomer.phones.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: "#f8fafc",
                        padding: "0.4rem 0.6rem",
                        borderRadius: "6px",
                        border: "1px solid #e2e8f0",
                        fontSize: "0.85rem",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontWeight: 600 }}>{formatPhone(p.phone)}</span>
                        <span style={{ fontSize: "0.72rem", background: "#fef3c7", color: "#92400e", padding: "1px 6px", borderRadius: "4px" }}>
                          {p.label}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDeleteSecondaryPhone(p.id)}
                        style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: "0.8rem", fontWeight: 700 }}
                      >
                        Sil ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Yeni Ek Telefon Ekle */}
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <input
                  className="login-input"
                  type="tel"
                  value={editNewPhone}
                  onChange={(e) => setEditNewPhone(e.target.value)}
                  placeholder="Yeni Ek Telefon (05XX...)"
                  style={{ flex: 2 }}
                />
                <select
                  value={editNewPhoneLabel}
                  onChange={(e) => setEditNewPhoneLabel(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "0.5rem",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.85rem",
                    background: "#ffffff",
                  }}
                >
                  <option value="İş">İş</option>
                  <option value="Ev">Ev</option>
                  <option value="Cep">Cep</option>
                  <option value="Diğer">Diğer</option>
                </select>
                <button
                  type="button"
                  onClick={() => void handleAddSecondaryPhone()}
                  style={{
                    padding: "0.5rem 0.8rem",
                    borderRadius: "6px",
                    background: "#f1f5f9",
                    border: "1px solid #cbd5e1",
                    fontWeight: 700,
                    cursor: "pointer",
                    fontSize: "0.8rem",
                  }}
                >
                  + Ekle
                </button>
              </div>
            </div>

            {/* Adresler Bölümü */}
            <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "1rem", marginBottom: "1rem" }}>
              <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "0.95rem", fontWeight: 700, color: "#1e293b" }}>
                Kayıtlı Adresler ({editingCustomer.addresses.length})
              </h4>

              {editingCustomer.addresses.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.75rem" }}>
                  {editingCustomer.addresses.map((a) => (
                    <div
                      key={a.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        background: "#f8fafc",
                        padding: "0.5rem 0.75rem",
                        borderRadius: "6px",
                        border: "1px solid #e2e8f0",
                        fontSize: "0.85rem",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <strong>{a.title}:</strong> {a.address}
                        {a.note && (
                          <div style={{ color: "#b45309", fontSize: "0.78rem", marginTop: "2px" }}>
                            📌 Not: {a.note}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDeleteAddress(a.id)}
                        style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: "0.8rem", fontWeight: 700, marginLeft: "0.5rem" }}
                      >
                        Sil ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Yeni Adres Ekle */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", background: "#f8fafc", padding: "0.6rem", borderRadius: "6px", border: "1px dashed #cbd5e1" }}>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    className="login-input"
                    type="text"
                    value={editNewAddrTitle}
                    onChange={(e) => setEditNewAddrTitle(e.target.value)}
                    placeholder="Başlık (Ev, İş vb.)"
                    style={{ flex: 1 }}
                  />
                  <input
                    className="login-input"
                    type="text"
                    value={editNewAddrNote}
                    onChange={(e) => setEditNewAddrNote(e.target.value)}
                    placeholder="Adres Notu (Zil bozuk vb.)"
                    style={{ flex: 2 }}
                  />
                </div>
                <textarea
                  className="login-input"
                  rows={2}
                  value={editNewAddrText}
                  onChange={(e) => setEditNewAddrText(e.target.value)}
                  placeholder="Adres Detayı (Mahalle, Cadde, No, Daire...)"
                />
                <button
                  type="button"
                  onClick={() => void handleAddAddressToEdit()}
                  style={{
                    alignSelf: "flex-end",
                    padding: "0.4rem 1rem",
                    borderRadius: "6px",
                    background: "#059669",
                    color: "#ffffff",
                    border: "none",
                    fontWeight: 700,
                    cursor: "pointer",
                    fontSize: "0.8rem",
                  }}
                >
                  + Bu Adresi Ekle
                </button>
              </div>
            </div>

            {editError && (
              <div style={{ color: "#b91c1c", fontSize: "0.85rem", marginBottom: "1rem", fontWeight: 600 }}>
                {editError}
              </div>
            )}

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", borderTop: "1px solid #e2e8f0", paddingTop: "1rem" }}>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setEditingCustomer(null)}
                style={{ padding: "0.55rem 1.25rem", borderRadius: "8px", cursor: "pointer" }}
              >
                Kapat
              </button>
              <button
                type="button"
                className="login-button"
                style={{ marginTop: 0, padding: "0.55rem 1.5rem", borderRadius: "8px", background: "#059669", fontWeight: 700, cursor: "pointer" }}
                disabled={editSaving}
                onClick={() => void handleEditSave()}
              >
                {editSaving ? "Kaydediliyor…" : "✓ Değişiklikleri Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Müşteri Silme Onay Modalı ─────────────── */}
      {deleteTarget && (
        <div className="salon-modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="salon-modal" style={{ maxWidth: "420px" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 0.5rem 0", color: "#dc2626", fontSize: "1.2rem", fontWeight: 700 }}>
              Müşteriyi Sil
            </h3>
            <p style={{ color: "#475569", fontSize: "0.9rem", lineHeight: 1.5 }}>
              <strong>{deleteTarget.name || "İsimsiz Müşteri"}</strong> ({formatPhone(deleteTarget.phone)}) kaydı ve bağlı tüm adresler ile ek telefonlar silinecektir.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1.25rem" }}>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setDeleteTarget(null)}
                style={{ padding: "0.5rem 1rem", borderRadius: "8px", cursor: "pointer" }}
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleDelete()}
                style={{
                  padding: "0.5rem 1.25rem",
                  borderRadius: "8px",
                  background: "#dc2626",
                  color: "#fff",
                  border: "none",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {deleting ? "Siliniyor…" : "Evet, Sil"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════ */
/* ── Müşteri Detay ve Sipariş Geçmişi Modalı (Requirement 5) ── */
/* ═════════════════════════════════════════════════════════════ */
function CustomerDetailModal({
  customer,
  onClose,
  onEdit,
  onRepeatOrder,
}: {
  customer: CustomerWithDetails;
  onClose: () => void;
  onEdit: () => void;
  onRepeatOrder: (orderId: string, addressId?: string) => void;
}) {
  const { staff } = useStaffSession();
  const [orders, setOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [topProducts, setTopProducts] = useState<Array<{ name: string; quantity: number }>>([]);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Müşterinin son 15 siparişi ve en çok satan ürünleri
  useEffect(() => {
    if (!staff?.restaurant_id || !customer.id) return;
    let active = true;

    async function loadCustomerOrders() {
      setLoadingOrders(true);
      const supabase = createBrowserClient();

      try {
        // Son 15 sipariş
        const { data: ords } = await supabase
          .from("orders")
          .select("id, created_at, order_type, payment_method, status, total_amount, delivery_address, customer_address_id")
          .eq("restaurant_id", staff!.restaurant_id)
          .eq("customer_id", customer.id)
          .order("created_at", { ascending: false })
          .limit(15);

        if (!active) return;
        const list = ords ?? [];
        setOrders(list);

        // En çok sipariş edilen 5 ürün
        if (list.length > 0) {
          const orderIds = list.map((o: any) => o.id);
          const { data: orderItems } = await supabase
            .from("order_items")
            .select("quantity, menu_items(name)")
            .in("order_id", orderIds);

          if (orderItems && active) {
            const productAgg: Record<string, number> = {};
            for (const item of orderItems) {
              const rawName = Array.isArray(item.menu_items)
                ? (item.menu_items[0] as any)?.name
                : (item.menu_items as any)?.name;
              const name = rawName || "Bilinmeyen Ürün";
              productAgg[name] = (productAgg[name] || 0) + (Number(item.quantity) || 1);
            }
            const sorted = Object.entries(productAgg)
              .map(([name, quantity]) => ({ name, quantity }))
              .sort((a, b) => b.quantity - a.quantity)
              .slice(0, 5);
            setTopProducts(sorted);
          }
        }
      } catch (err) {
        console.warn("Müşteri siparişleri çekilemedi:", err);
      } finally {
        if (active) setLoadingOrders(false);
      }
    }

    void loadCustomerOrders();
    return () => {
      active = false;
    };
  }, [staff?.restaurant_id, customer.id]);

  const stats = customer.stats || {
    total_orders: orders.length,
    total_spent: orders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0),
    first_order_at: null,
    last_order_at: null,
  };

  const avgOrderValue = stats.total_orders > 0 ? stats.total_spent / stats.total_orders : 0;

  return (
    <div className="salon-modal-backdrop" onClick={onClose}>
      <div
        className="salon-modal"
        style={{
          maxWidth: "800px",
          width: "95vw",
          maxHeight: "92vh",
          overflowY: "auto",
          padding: "1.5rem",
          borderRadius: "14px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Üst Başlık & Eylemler */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800, color: "#0f172a" }}>
                {customer.name || "İsimsiz Müşteri"}
              </h2>
              <button
                type="button"
                onClick={onEdit}
                style={{
                  background: "#f1f5f9",
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  padding: "2px 8px",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                ✏️ Düzenle
              </button>
            </div>
            <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "2px" }}>
              Kayıt Tarihi: {new Date(customer.created_at).toLocaleDateString("tr-TR")}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: "1.4rem", cursor: "pointer", color: "#64748b" }}
          >
            ✕
          </button>
        </div>

        {/* Müşteri Notu */}
        {customer.note && (
          <div
            style={{
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: "8px",
              padding: "0.5rem 0.75rem",
              marginBottom: "1rem",
              fontSize: "0.85rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <strong style={{ color: "#b45309" }}>📌 Müşteri Notu: </strong>
              <span style={{ color: "#78350f" }}>{customer.note}</span>
            </div>
            <CopyBtn text={customer.note} />
          </div>
        )}

        {/* ── İstatistik Kartları (4 KPI) ─────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "0.75rem",
            marginBottom: "1.25rem",
          }}
        >
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "0.75rem" }}>
            <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>TOPLAM SİPARİŞ</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#0f172a", marginTop: "2px" }}>
              {stats.total_orders} adet
            </div>
          </div>
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "0.75rem" }}>
            <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>TOPLAM HARCAMA</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#059669", marginTop: "2px" }}>
              {formatTry(stats.total_spent)}
            </div>
          </div>
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "0.75rem" }}>
            <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>ORTALAMA SEPET</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#0284c7", marginTop: "2px" }}>
              {formatTry(avgOrderValue)}
            </div>
          </div>
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "0.75rem" }}>
            <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>SON SİPARİŞ</div>
            <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#334155", marginTop: "4px" }}>
              {stats.last_order_at
                ? new Date(stats.last_order_at).toLocaleDateString("tr-TR")
                : "Henüz yok"}
            </div>
          </div>
        </div>

        {/* ── Telefonlar & Adresler Grid ─────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem", marginBottom: "1.25rem" }}>
          {/* Telefonlar */}
          <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "0.85rem" }}>
            <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "0.9rem", fontWeight: 700, color: "#1e293b" }}>
              📞 Telefon Numaraları ({1 + customer.phones.length})
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {/* Ana Telefon */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.4rem 0.6rem",
                  background: "#f0fdf4",
                  borderRadius: "6px",
                  border: "1px solid #bbf7d0",
                }}
              >
                <div>
                  <span style={{ fontWeight: 700, color: "#166534" }}>{formatPhone(customer.phone)}</span>
                  <span style={{ marginLeft: "0.4rem", fontSize: "0.68rem", background: "#86efac", color: "#14532d", padding: "1px 5px", borderRadius: "4px", fontWeight: 700 }}>
                    Ana Hat
                  </span>
                </div>
                <CopyBtn text={phoneToDigits(customer.phone)} />
              </div>

              {/* Ek Telefonlar */}
              {customer.phones.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.4rem 0.6rem",
                    background: "#f8fafc",
                    borderRadius: "6px",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600, color: "#334155" }}>{formatPhone(p.phone)}</span>
                    <span style={{ marginLeft: "0.4rem", fontSize: "0.68rem", background: "#fef3c7", color: "#92400e", padding: "1px 5px", borderRadius: "4px", fontWeight: 700 }}>
                      {p.label}
                    </span>
                  </div>
                  <CopyBtn text={phoneToDigits(p.phone)} />
                </div>
              ))}
            </div>
          </div>

          {/* Adresler */}
          <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "0.85rem" }}>
            <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "0.9rem", fontWeight: 700, color: "#1e293b" }}>
              📍 Kayıtlı Adresler ({customer.addresses.length})
            </h4>
            {customer.addresses.length === 0 ? (
              <div style={{ color: "#64748b", fontSize: "0.85rem", fontStyle: "italic" }}>Adres kaydı yok.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem", maxHeight: "170px", overflowY: "auto" }}>
                {customer.addresses.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: "6px",
                      padding: "0.45rem 0.6rem",
                      fontSize: "0.82rem",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "0.4rem",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <strong style={{ color: "#0f172a" }}>{a.title}:</strong>{" "}
                      <span style={{ color: "#334155" }}>{a.address}</span>
                      {a.note && (
                        <div style={{ color: "#b45309", fontSize: "0.75rem", marginTop: "2px" }}>
                          📌 Not: {a.note}
                        </div>
                      )}
                    </div>
                    <CopyBtn text={a.note ? `${a.address} (Not: ${a.note})` : a.address} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── En Çok Sipariş Ettiği 5 Ürün ───────────── */}
        {topProducts.length > 0 && (
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "0.85rem", marginBottom: "1.25rem" }}>
            <h4 style={{ margin: "0 0 0.6rem 0", fontSize: "0.9rem", fontWeight: 700, color: "#1e293b" }}>
              🏆 En Çok Sipariş Ettiği 5 Ürün
            </h4>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {topProducts.map((p, idx) => (
                <div
                  key={p.name}
                  style={{
                    background: "#ffffff",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px",
                    padding: "0.35rem 0.65rem",
                    fontSize: "0.82rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                  }}
                >
                  <span style={{ fontWeight: 800, color: "#059669" }}>#{idx + 1}</span>
                  <span style={{ fontWeight: 600, color: "#0f172a" }}>{p.name}</span>
                  <span style={{ background: "#e0f2fe", color: "#0369a1", fontSize: "0.72rem", padding: "1px 6px", borderRadius: "4px", fontWeight: 700 }}>
                    {p.quantity} Adet
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Son 15 Sipariş ─────────────────────────── */}
        <div>
          <h4 style={{ margin: "0 0 0.6rem 0", fontSize: "0.95rem", fontWeight: 700, color: "#1e293b" }}>
            🛍️ Son Siparişler ({orders.length})
          </h4>

          {loadingOrders ? (
            <p className="salon-muted">Sipariş geçmişi yükleniyor…</p>
          ) : orders.length === 0 ? (
            <div style={{ padding: "1rem", textAlign: "center", background: "#f8fafc", borderRadius: "8px", color: "#64748b", fontStyle: "italic" }}>
              Bu müşteriye ait tamamlanmış sipariş kaydı bulunmuyor.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {orders.map((o) => {
                const isExpanded = expandedOrderId === o.id;
                const dateStr = new Date(o.created_at).toLocaleString("tr-TR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <div
                    key={o.id}
                    style={{
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      onClick={() => setExpandedOrderId((prev) => (prev === o.id ? null : o.id))}
                      style={{
                        padding: "0.6rem 0.85rem",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        cursor: "pointer",
                        background: isExpanded ? "#f8fafc" : "#ffffff",
                        fontSize: "0.85rem",
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 700, color: "#0f172a" }}>{dateStr}</span>
                        <span style={{ margin: "0 0.4rem", color: "#cbd5e1" }}>·</span>
                        <span style={{ textTransform: "capitalize", color: "#475569" }}>
                          {o.order_type === "delivery" ? "Paket Servis" : "Gel Al"}
                        </span>
                        <span style={{ margin: "0 0.4rem", color: "#cbd5e1" }}>·</span>
                        <span style={{ color: "#64748b", fontSize: "0.78rem" }}>
                          Ödeme: {o.payment_method || "Nakit"}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <span style={{ fontWeight: 800, color: "#059669", fontSize: "0.95rem" }}>
                          {formatTry(Number(o.total_amount) || 0)}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRepeatOrder(o.id, o.customer_address_id);
                          }}
                          style={{
                            padding: "3px 8px",
                            borderRadius: "5px",
                            background: "#f0fdf4",
                            border: "1px solid #86efac",
                            color: "#15803d",
                            fontWeight: 700,
                            fontSize: "0.75rem",
                            cursor: "pointer",
                          }}
                        >
                          🔄 Tekrarla
                        </button>
                        <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>{isExpanded ? "▲" : "▼"}</span>
                      </div>
                    </div>

                    {/* Akordeon: Sipariş Kalemleri */}
                    {isExpanded && <OrderItemsInline orderId={o.id} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="ghost-btn"
            onClick={onClose}
            style={{ padding: "0.55rem 1.5rem", borderRadius: "8px", cursor: "pointer", fontWeight: 700 }}
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Inline Order Items Accordion Component ───────── */
function OrderItemsInline({ orderId }: { orderId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function fetchItems() {
      const supabase = createBrowserClient();
      const { data } = await supabase
        .from("order_items")
        .select("id, quantity, unit_price, note, menu_items(name)")
        .eq("order_id", orderId);

      if (active) {
        setItems(data ?? []);
        setLoading(false);
      }
    }
    void fetchItems();
    return () => {
      active = false;
    };
  }, [orderId]);

  if (loading) {
    return <div style={{ padding: "0.5rem 1rem", fontSize: "0.8rem", color: "#64748b" }}>Yükleniyor…</div>;
  }

  if (items.length === 0) {
    return <div style={{ padding: "0.5rem 1rem", fontSize: "0.8rem", color: "#64748b" }}>Ürün bilgisi yok.</div>;
  }

  return (
    <div style={{ background: "#f8fafc", padding: "0.5rem 1rem", borderTop: "1px solid #f1f5f9", fontSize: "0.82rem" }}>
      {items.map((it) => {
        const rawName = Array.isArray(it.menu_items)
          ? (it.menu_items[0] as any)?.name
          : (it.menu_items as any)?.name;
        const name = rawName || "Ürün";
        return (
          <div key={it.id} style={{ display: "flex", justifyContent: "space-between", padding: "0.2rem 0", borderBottom: "1px dashed #e2e8f0" }}>
            <div>
              <span style={{ fontWeight: 600 }}>{it.quantity}x {name}</span>
              {it.note && <span style={{ color: "#b45309", marginLeft: "0.4rem", fontSize: "0.75rem" }}>({it.note})</span>}
            </div>
            <span style={{ color: "#475569" }}>
              {formatTry(Number(it.unit_price) * Number(it.quantity))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
