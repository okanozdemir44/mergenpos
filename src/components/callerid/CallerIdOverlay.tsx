"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useCallerId } from "@/context/CallerIdContext";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useStaffSession } from "@/hooks/useStaffSession";
import type { Customer, CustomerAddress } from "@/types/customer";

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

/* ── Tiny copy button ────────────────────────────── */
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
        borderRadius: "6px",
        padding: "3px 8px",
        fontSize: "0.8rem",
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

export function CallerIdOverlay() {
  const {
    activeCall,
    dismissCall,
    registerAndLinkCustomer,
    linkPhoneToCustomer,
    startOrderForActiveCall,
    startRepeatOrder,
    hasLicense,
    enabled,
  } = useCallerId();
  const { staff } = useStaffSession();

  // Mode tab for unknown caller: 'new' | 'link'
  const [unknownMode, setUnknownMode] = useState<"new" | "link">("new");

  // Yeni müşteri form state'i
  const [newName, setNewName] = useState("");
  const [newTitle, setNewTitle] = useState("Adres");
  const [newAddress, setNewAddress] = useState("");
  const [newCustomerNote, setNewCustomerNote] = useState("");
  const [newAddressNote, setNewAddressNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Mevcut müşteriye bağla state'i
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<Customer & { addresses?: CustomerAddress[] }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedExistingCustomer, setSelectedExistingCustomer] = useState<Customer | null>(null);
  const [phoneLabel, setPhoneLabel] = useState("İş");

  // Kayıtlı müşteri için seçili adres id
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");

  // Copy all feedback
  const [allCopied, setAllCopied] = useState(false);

  // İlk adres id'sini veya en son sipariş verilen adresi varsayılan olarak seç
  useEffect(() => {
    if (!activeCall) return;
    if (activeCall.lastAddressId && activeCall.addresses.some(a => a.id === activeCall.lastAddressId)) {
      setSelectedAddressId(activeCall.lastAddressId);
    } else if (activeCall.addresses.length > 0) {
      setSelectedAddressId(activeCall.addresses[0].id);
    } else {
      setSelectedAddressId("");
    }
    setUnknownMode("new");
    setFormError(null);
  }, [activeCall]);

  // Mevcut müşteri arama debounced
  useEffect(() => {
    if (unknownMode !== "link" || !searchQuery.trim() || !staff?.restaurant_id) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const supabase = createBrowserClient();
        const q = searchQuery.trim();
        const normalized = normalizePhone(q);

        let query = supabase
          .from("customers")
          .select("id, name, phone, note, created_at")
          .eq("restaurant_id", staff.restaurant_id);

        if (normalized) {
          query = query.or(`phone.ilike.%${normalized}%,name.ilike.%${q}%`);
        } else {
          query = query.ilike("name", `%${q}%`);
        }

        const { data: custs } = await query.limit(5);

        const found = (custs ?? []) as Customer[];
        if (found.length > 0) {
          const { data: addrs } = await supabase
            .from("customer_addresses")
            .select("*")
            .eq("restaurant_id", staff.restaurant_id)
            .in("customer_id", found.map(c => c.id));

          const mapped = found.map(c => ({
            ...c,
            addresses: (addrs ?? []).filter((a: any) => a.customer_id === c.id) as CustomerAddress[],
          }));
          setSearchResults(mapped);
        } else {
          setSearchResults([]);
        }
      } catch (err) {
        console.warn("Müşteri arama hatası:", err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, unknownMode, staff?.restaurant_id]);

  if (!hasLicense || !enabled || !activeCall) {
    return null;
  }

  const currentSelectedAddr =
    selectedAddressId ||
    (activeCall.lastAddressId && activeCall.addresses.some(a => a.id === activeCall.lastAddressId)
      ? activeCall.lastAddressId
      : activeCall.addresses.length > 0
      ? activeCall.addresses[0].id
      : "");

  const selectedAddress = activeCall.addresses.find(a => a.id === currentSelectedAddr);

  async function handleCopyAll() {
    const parts: string[] = [];
    if (activeCall!.customer?.name) parts.push(activeCall!.customer.name);
    parts.push(phoneToDigits(activeCall!.phone));
    if (activeCall!.customer?.note) parts.push(`Müşteri Notu: ${activeCall!.customer.note}`);
    if (selectedAddress) {
      parts.push(`${selectedAddress.title}: ${selectedAddress.address}`);
      if (selectedAddress.note) parts.push(`Adres Notu: ${selectedAddress.note}`);
    } else if (activeCall!.addresses.length > 0) {
      parts.push(activeCall!.addresses[0].address);
      if (activeCall!.addresses[0].note) parts.push(`Adres Notu: ${activeCall!.addresses[0].note}`);
    }
    const ok = await copyText(parts.join("\n"));
    if (ok) {
      setAllCopied(true);
      setTimeout(() => setAllCopied(false), 1500);
    }
  }

  async function handleSaveNewCustomer(startOrderImmediately = false) {
    if (!newAddress.trim()) {
      setFormError("Adres alanı zorunludur.");
      return;
    }
    setSaving(true);
    setFormError(null);

    try {
      const res = await registerAndLinkCustomer({
        name: newName.trim(),
        phone: activeCall!.phone,
        title: newTitle.trim() || "Adres",
        address: newAddress.trim(),
        customerNote: newCustomerNote.trim() || undefined,
        addressNote: newAddressNote.trim() || undefined,
      });

      if (res && startOrderImmediately) {
        startOrderForActiveCall(res.address.id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleLinkExisting(startOrderImmediately = false) {
    if (!selectedExistingCustomer) {
      setFormError("Lütfen bağlanacak müşteriyi seçin.");
      return;
    }
    setSaving(true);
    setFormError(null);

    try {
      await linkPhoneToCustomer({
        customerId: selectedExistingCustomer.id,
        phone: activeCall!.phone,
        label: phoneLabel.trim() || "Diğer",
      });

      if (startOrderImmediately) {
        startOrderForActiveCall();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: "28px",
        right: "28px",
        width: "460px", // %20 büyütüldü (380px -> 460px)
        maxWidth: "calc(100vw - 40px)",
        background: "#ffffff",
        borderRadius: "16px",
        boxShadow: "0 25px 35px -5px rgba(0, 0, 0, 0.3), 0 12px 16px -6px rgba(0, 0, 0, 0.15)",
        border: "2.5px solid #059669",
        zIndex: 9999,
        overflow: "hidden",
        animation: "slideInRight 0.25s ease-out",
      }}
    >
      {/* Üst Bar */}
      <div
        style={{
          background: "linear-gradient(135deg, #059669 0%, #047857 100%)",
          color: "#ffffff",
          padding: "0.9rem 1.25rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span style={{ fontSize: "1.45rem", animation: "bounce 1s infinite" }}>📞</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: "1.15rem", lineHeight: 1.2 }}>
              Gelen Çağrı
            </div>
            <div style={{ fontSize: "0.88rem", opacity: 0.95 }}>
              {activeCall.isNew ? "Kayıtsız Numara" : "Kayıtlı Müşteri"}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={dismissCall}
          style={{
            background: "rgba(255, 255, 255, 0.25)",
            border: "none",
            color: "#fff",
            borderRadius: "50%",
            width: "30px",
            height: "30px",
            cursor: "pointer",
            fontSize: "1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.15s ease",
          }}
          title="Kapat"
        >
          ✕
        </button>
      </div>

      {/* İçerik Alanı */}
      <div style={{ padding: "1.2rem", maxHeight: "82vh", overflowY: "auto" }}>
        {/* Telefon Numarası */}
        <div style={{ marginBottom: "0.75rem" }}>
          <div style={{ fontSize: "0.82rem", color: "#64748b", fontWeight: 700, letterSpacing: "0.05em" }}>
            TELEFON NUMARASI
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "2px" }}>
            <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0f172a", userSelect: "text" }}>
              {formatPhone(activeCall.phone)}
            </div>
            <CopyBtn text={phoneToDigits(activeCall.phone)} />
          </div>
        </div>

        {/* KAYITLI MÜŞTERİ DURUMU */}
        {!activeCall.isNew && activeCall.customer && (
          <div>
            {/* Müşteri Adı */}
            <div style={{ marginBottom: "0.75rem" }}>
              <div style={{ fontSize: "0.82rem", color: "#64748b", fontWeight: 700, letterSpacing: "0.05em" }}>
                MÜŞTERİ ADI
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "2px" }}>
                <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#1e293b", userSelect: "text" }}>
                  {activeCall.customer.name.trim() || "İsimsiz müşteri"}
                </div>
                {activeCall.customer.name.trim() && (
                  <CopyBtn text={activeCall.customer.name.trim()} />
                )}
              </div>
            </div>

            {/* Müşteri Notu */}
            {activeCall.customer.note && (
              <div
                style={{
                  marginBottom: "0.75rem",
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                  borderRadius: "8px",
                  padding: "0.55rem 0.75rem",
                  fontSize: "0.92rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                }}
              >
                <div>
                  <strong style={{ color: "#b45309" }}>Müşteri Notu: </strong>
                  <span style={{ color: "#78350f" }}>{activeCall.customer.note}</span>
                </div>
                <CopyBtn text={activeCall.customer.note} />
              </div>
            )}

            {/* Özet: Toplam Sipariş ve Son Sipariş Ürünleri */}
            <div
              style={{
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: "10px",
                padding: "0.75rem",
                marginBottom: "0.9rem",
                fontSize: "0.92rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: "#166534", marginBottom: "0.25rem" }}>
                <span>📊 Toplam Sipariş: {activeCall.totalOrdersCount ?? 0}</span>
                {activeCall.lastOrderDateFormatted && (
                  <span style={{ fontSize: "0.85rem", opacity: 0.9 }}>Son: {activeCall.lastOrderDateFormatted}</span>
                )}
              </div>

              {activeCall.lastOrder ? (
                <div style={{ color: "#15803d", marginTop: "0.35rem", lineHeight: 1.4 }}>
                  <strong>Son Sipariş:</strong> {activeCall.lastOrder.itemsSummary}
                  <div style={{ fontSize: "0.85rem", color: "#166534", marginTop: "3px", fontWeight: 600 }}>
                    Tutar: ₺{activeCall.lastOrder.total_amount.toFixed(2)}
                  </div>
                </div>
              ) : (
                <div style={{ color: "#15803d", fontStyle: "italic", marginTop: "0.25rem" }}>
                  Henüz tamamlanan siparişi bulunmuyor.
                </div>
              )}
            </div>

            {/* Kayıtlı Adresler */}
            <div style={{ marginBottom: "0.9rem" }}>
              <div style={{ fontSize: "0.82rem", color: "#64748b", fontWeight: 700, marginBottom: "0.4rem", letterSpacing: "0.05em" }}>
                KAYITLI ADRESLER ({activeCall.addresses.length})
              </div>

              {activeCall.addresses.length === 0 ? (
                <div style={{ fontSize: "0.92rem", color: "#64748b", fontStyle: "italic" }}>
                  Kayıtlı adres bulunmuyor.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "185px", overflowY: "auto" }}>
                  {activeCall.addresses.map((addr) => {
                    const isSelected = currentSelectedAddr === addr.id;
                    const isLastOrderAddr = activeCall.lastAddressId === addr.id;
                    return (
                      <label
                        key={addr.id}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "0.6rem",
                          padding: "0.65rem 0.75rem",
                          borderRadius: "8px",
                          border: isSelected ? "2px solid #059669" : "1px solid #e2e8f0",
                          background: isSelected ? "#f0fdf4" : "#ffffff",
                          cursor: "pointer",
                          fontSize: "0.95rem",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <input
                          type="radio"
                          name="selectedAddr"
                          checked={isSelected}
                          onChange={() => setSelectedAddressId(addr.id)}
                          style={{ marginTop: "3px", accentColor: "#059669", width: "16px", height: "16px" }}
                        />
                        <div style={{ flex: 1, userSelect: "text" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "2px" }}>
                            <strong style={{ color: "#0f172a" }}>{addr.title}</strong>
                            {isLastOrderAddr && (
                              <span
                                style={{
                                  background: "#dbeafe",
                                  color: "#1e40af",
                                  fontSize: "0.75rem",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  fontWeight: 700,
                                }}
                              >
                                Son Sipariş {activeCall.lastOrderDateFormatted ? `(${activeCall.lastOrderDateFormatted})` : ""}
                              </span>
                            )}
                          </div>
                          <span style={{ color: "#334155", lineHeight: 1.35 }}>{addr.address}</span>
                          {addr.note && (
                            <div style={{ color: "#b45309", fontSize: "0.85rem", marginTop: "3px", fontWeight: 500 }}>
                              📌 Not: {addr.note}
                            </div>
                          )}
                        </div>
                        <CopyBtn text={addr.note ? `${addr.address} (Not: ${addr.note})` : addr.address} />
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Hepsini Kopyala */}
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.6rem" }}>
              <button
                type="button"
                onClick={() => void handleCopyAll()}
                style={{
                  flex: 1,
                  padding: "0.55rem 0.75rem",
                  borderRadius: "8px",
                  border: "1px solid " + (allCopied ? "#86efac" : "#cbd5e1"),
                  background: allCopied ? "#dcfce7" : "#f8fafc",
                  color: allCopied ? "#15803d" : "#334155",
                  fontSize: "0.92rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {allCopied ? "Kopyalandı ✓" : "📋 Adres ve Bilgileri Kopyala"}
              </button>
            </div>

            {/* Sipariş Butonları */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.6rem" }}>
              <div style={{ display: "flex", gap: "0.6rem" }}>
                <button
                  type="button"
                  onClick={dismissCall}
                  className="ghost-btn"
                  style={{
                    flex: 1,
                    padding: "0.7rem",
                    fontSize: "1rem",
                    borderRadius: "10px",
                    cursor: "pointer",
                  }}
                >
                  Kapat
                </button>
                <button
                  type="button"
                  onClick={() => startOrderForActiveCall(currentSelectedAddr)}
                  className="login-button"
                  style={{
                    flex: 2,
                    marginTop: 0,
                    padding: "0.7rem",
                    fontSize: "1rem",
                    borderRadius: "10px",
                    background: "#059669",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  🛵 Siparişe Başla
                </button>
              </div>

              {/* Son siparişi tekrarla butonu */}
              {activeCall.lastOrder && (
                <button
                  type="button"
                  onClick={() => startRepeatOrder(activeCall.lastOrder!.id, currentSelectedAddr)}
                  style={{
                    width: "100%",
                    padding: "0.7rem",
                    fontSize: "0.95rem",
                    borderRadius: "10px",
                    background: "#f0fdf4",
                    border: "1.5px solid #059669",
                    color: "#065f46",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.4rem",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                  }}
                >
                  🔄 Son Siparişi Sepete Aktar & Başla
                </button>
              )}
            </div>
          </div>
        )}

        {/* KAYITSIZ MÜŞTERİ DURUMU (2 SEÇENEK: YENİ MÜŞTERİ VEYA MEVCUT MÜŞTERİYE BAĞLA) */}
        {activeCall.isNew && (
          <div>
            {/* Sekmeler: Yeni Müşteri / Mevcut Müşteriye Bağla */}
            <div style={{ display: "flex", borderBottom: "2px solid #e2e8f0", marginBottom: "0.9rem" }}>
              <button
                type="button"
                onClick={() => { setUnknownMode("new"); setFormError(null); }}
                style={{
                  flex: 1,
                  padding: "0.6rem 0.3rem",
                  border: "none",
                  borderBottom: unknownMode === "new" ? "3px solid #059669" : "none",
                  background: "transparent",
                  color: unknownMode === "new" ? "#059669" : "#64748b",
                  fontWeight: unknownMode === "new" ? 700 : 500,
                  fontSize: "0.96rem",
                  cursor: "pointer",
                }}
              >
                + Yeni Müşteri
              </button>
              <button
                type="button"
                onClick={() => { setUnknownMode("link"); setFormError(null); }}
                style={{
                  flex: 1,
                  padding: "0.6rem 0.3rem",
                  border: "none",
                  borderBottom: unknownMode === "link" ? "3px solid #059669" : "none",
                  background: "transparent",
                  color: unknownMode === "link" ? "#059669" : "#64748b",
                  fontWeight: unknownMode === "link" ? 700 : 500,
                  fontSize: "0.96rem",
                  cursor: "pointer",
                }}
              >
                🔗 Mevcut Müşteriye Bağla
              </button>
            </div>

            {/* 1. SEÇENEK: YENİ MÜŞTERİ OLUŞTUR */}
            {unknownMode === "new" && (
              <div>
                <div style={{ marginBottom: "0.6rem" }}>
                  <label style={{ display: "block", fontSize: "0.85rem", color: "#64748b", fontWeight: 600, marginBottom: "3px" }}>
                    İSİM (OPSİYONEL)
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Müşteri Adı Soyadı"
                    style={{
                      width: "100%",
                      padding: "0.55rem 0.75rem",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.95rem",
                    }}
                  />
                </div>

                <div style={{ marginBottom: "0.6rem" }}>
                  <label style={{ display: "block", fontSize: "0.85rem", color: "#64748b", fontWeight: 600, marginBottom: "3px" }}>
                    ADRES BAŞLIĞI
                  </label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Ev, İş, Sanayi vb."
                    style={{
                      width: "100%",
                      padding: "0.55rem 0.75rem",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.95rem",
                    }}
                  />
                </div>

                <div style={{ marginBottom: "0.6rem" }}>
                  <label style={{ display: "block", fontSize: "0.85rem", color: "#64748b", fontWeight: 600, marginBottom: "3px" }}>
                    TESLİMAT ADRESİ *
                  </label>
                  <textarea
                    rows={2}
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    placeholder="Mahalle, Cadde, Sokak, No, Daire..."
                    style={{
                      width: "100%",
                      padding: "0.55rem 0.75rem",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.95rem",
                      resize: "vertical",
                    }}
                  />
                </div>

                <div style={{ marginBottom: "0.6rem" }}>
                  <label style={{ display: "block", fontSize: "0.85rem", color: "#64748b", fontWeight: 600, marginBottom: "3px" }}>
                    ADRES NOTU (OPSİYONEL)
                  </label>
                  <input
                    type="text"
                    value={newAddressNote}
                    onChange={(e) => setNewAddressNote(e.target.value)}
                    placeholder="Zil bozuk, kapıda ara vb."
                    style={{
                      width: "100%",
                      padding: "0.55rem 0.75rem",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.95rem",
                    }}
                  />
                </div>

                <div style={{ marginBottom: "0.6rem" }}>
                  <label style={{ display: "block", fontSize: "0.85rem", color: "#64748b", fontWeight: 600, marginBottom: "3px" }}>
                    MÜŞTERİ NOTU (GENEL)
                  </label>
                  <input
                    type="text"
                    value={newCustomerNote}
                    onChange={(e) => setNewCustomerNote(e.target.value)}
                    placeholder="Sanayi 3. blok esnafı vb."
                    style={{
                      width: "100%",
                      padding: "0.55rem 0.75rem",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.95rem",
                    }}
                  />
                </div>

                {formError && (
                  <div style={{ color: "#b91c1c", fontSize: "0.85rem", marginBottom: "0.6rem", fontWeight: 600 }}>
                    {formError}
                  </div>
                )}

                <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.9rem" }}>
                  <button
                    type="button"
                    onClick={dismissCall}
                    className="ghost-btn"
                    style={{
                      flex: 1,
                      padding: "0.65rem 1rem",
                      fontSize: "0.95rem",
                      borderRadius: "10px",
                      cursor: "pointer",
                    }}
                  >
                    Kapat
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleSaveNewCustomer(true)}
                    className="login-button"
                    style={{
                      flex: 2,
                      marginTop: 0,
                      padding: "0.65rem 1rem",
                      fontSize: "0.98rem",
                      borderRadius: "10px",
                      background: "#059669",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {saving ? "Kaydediliyor…" : "🛵 Kaydet ve Başla"}
                  </button>
                </div>
              </div>
            )}

            {/* 2. SEÇENEK: MEVCUT MÜŞTERİYE BAĞLA */}
            {unknownMode === "link" && (
              <div>
                <p style={{ fontSize: "0.88rem", color: "#64748b", marginBottom: "0.6rem", lineHeight: 1.4 }}>
                  Bu arayan numarayı mevcut bir müşterinizin ek hattı olarak kaydedin:
                </p>

                <div style={{ marginBottom: "0.6rem" }}>
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="🔍 İsim veya telefonla müşteri ara..."
                    style={{
                      width: "100%",
                      padding: "0.55rem 0.75rem",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.95rem",
                    }}
                  />
                </div>

                {/* Arama Sonuçları */}
                <div style={{ maxHeight: "170px", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "8px", marginBottom: "0.6rem" }}>
                  {isSearching ? (
                    <div style={{ padding: "0.6rem", fontSize: "0.88rem", color: "#64748b" }}>Aranıyor…</div>
                  ) : searchResults.length === 0 ? (
                    <div style={{ padding: "0.6rem", fontSize: "0.88rem", color: "#64748b" }}>
                      {searchQuery.trim() ? "Eşleşen müşteri bulunamadı." : "Aramak için müşteri adı veya telefon yazın."}
                    </div>
                  ) : (
                    searchResults.map((cust) => {
                      const isSel = selectedExistingCustomer?.id === cust.id;
                      return (
                        <div
                          key={cust.id}
                          onClick={() => setSelectedExistingCustomer(cust)}
                          style={{
                            padding: "0.55rem 0.75rem",
                            cursor: "pointer",
                            background: isSel ? "#f0fdf4" : "#ffffff",
                            borderBottom: "1px solid #f1f5f9",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "#0f172a" }}>
                              {cust.name || "İsimsiz"}
                            </div>
                            <div style={{ fontSize: "0.82rem", color: "#475569" }}>
                              {formatPhone(cust.phone)} {cust.addresses && cust.addresses[0] ? `· ${cust.addresses[0].address.slice(0, 26)}...` : ""}
                            </div>
                          </div>
                          {isSel && <span style={{ color: "#059669", fontWeight: 700, fontSize: "0.9rem" }}>✓ Seçildi</span>}
                        </div>
                      );
                    })
                  )}
                </div>

                {selectedExistingCustomer && (
                  <div style={{ marginBottom: "0.75rem" }}>
                    <label style={{ display: "block", fontSize: "0.85rem", color: "#64748b", fontWeight: 600, marginBottom: "4px" }}>
                      BU NUMARA İÇİN ETİKET
                    </label>
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      {["İş", "Ev", "Cep", "Diğer"].map((lbl) => (
                        <button
                          key={lbl}
                          type="button"
                          onClick={() => setPhoneLabel(lbl)}
                          style={{
                            flex: 1,
                            padding: "5px 0",
                            fontSize: "0.88rem",
                            borderRadius: "6px",
                            border: phoneLabel === lbl ? "2px solid #059669" : "1px solid #cbd5e1",
                            background: phoneLabel === lbl ? "#f0fdf4" : "#f8fafc",
                            color: phoneLabel === lbl ? "#059669" : "#475569",
                            fontWeight: phoneLabel === lbl ? 700 : 500,
                            cursor: "pointer",
                          }}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {formError && (
                  <div style={{ color: "#b91c1c", fontSize: "0.85rem", marginBottom: "0.6rem", fontWeight: 600 }}>
                    {formError}
                  </div>
                )}

                <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.9rem" }}>
                  <button
                    type="button"
                    onClick={dismissCall}
                    className="ghost-btn"
                    style={{
                      flex: 1,
                      padding: "0.65rem 1rem",
                      fontSize: "0.95rem",
                      borderRadius: "10px",
                      cursor: "pointer",
                    }}
                  >
                    Kapat
                  </button>
                  <button
                    type="button"
                    disabled={saving || !selectedExistingCustomer}
                    onClick={() => void handleLinkExisting(true)}
                    className="login-button"
                    style={{
                      flex: 2,
                      marginTop: 0,
                      padding: "0.65rem 1rem",
                      fontSize: "0.98rem",
                      borderRadius: "10px",
                      background: selectedExistingCustomer ? "#059669" : "#94a3b8",
                      fontWeight: 700,
                      cursor: selectedExistingCustomer ? "pointer" : "not-allowed",
                    }}
                  >
                    {saving ? "Bağlanıyor…" : "🔗 Bağla ve Başla"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
