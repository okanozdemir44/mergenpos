"use client";

import React, { useState } from "react";
import { useCallerId } from "@/context/CallerIdContext";
import { formatPhone } from "@/lib/phone";

export function CallerIdOverlay() {
  const {
    activeCall,
    dismissCall,
    registerAndLinkCustomer,
    startOrderForActiveCall,
    hasLicense,
    enabled,
  } = useCallerId();

  // Yeni müşteri form state'i
  const [newName, setNewName] = useState("");
  const [newTitle, setNewTitle] = useState("Adres");
  const [newAddress, setNewAddress] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Kayıtlı müşteri için seçili adres id
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");

  if (!hasLicense || !enabled || !activeCall) {
    return null;
  }

  // İlk adres id'sini varsayılan olarak seç
  const currentSelectedAddr =
    selectedAddressId ||
    (activeCall.addresses.length > 0 ? activeCall.addresses[0].id : "");

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

  return (
    <div
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        width: "360px",
        maxWidth: "calc(100vw - 48px)",
        background: "#ffffff",
        borderRadius: "14px",
        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
        border: "2px solid #059669",
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
          padding: "0.75rem 1rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "1.2rem", animation: "bounce 1s infinite" }}>📞</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", lineHeight: 1.2 }}>
              Gelen Çağrı
            </div>
            <div style={{ fontSize: "0.75rem", opacity: 0.9 }}>
              {activeCall.isNew ? "Kayıtsız Müşteri" : "Kayıtlı Müşteri"}
            </div>
          </div>
        </div>

        <button
          onClick={dismissCall}
          style={{
            background: "rgba(255, 255, 255, 0.2)",
            border: "none",
            color: "#fff",
            borderRadius: "50%",
            width: "26px",
            height: "26px",
            cursor: "pointer",
            fontSize: "0.85rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title="Kapat"
        >
          ✕
        </button>
      </div>

      {/* İçerik Alanı */}
      <div style={{ padding: "1rem" }}>
        {/* Telefon Numarası */}
        <div style={{ marginBottom: "0.75rem" }}>
          <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>TELEFON</div>
          <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f172a" }}>
            {formatPhone(activeCall.phone)}
          </div>
        </div>

        {/* KAYITLI MÜŞTERİ DURUMU */}
        {!activeCall.isNew && activeCall.customer && (
          <div>
            <div style={{ marginBottom: "0.75rem" }}>
              <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>MÜŞTERİ ADI</div>
              <div style={{ fontSize: "1rem", fontWeight: 700, color: "#1e293b" }}>
                {activeCall.customer.name.trim() || "İsimsiz müşteri"}
              </div>
            </div>

            {/* Adresler */}
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600, marginBottom: "0.3rem" }}>
                KAYITLI ADRESLER ({activeCall.addresses.length})
              </div>

              {activeCall.addresses.length === 0 ? (
                <div style={{ fontSize: "0.85rem", color: "#64748b", fontStyle: "italic" }}>
                  Kayıtlı adres bulunmuyor.
                </div>
              ) : activeCall.addresses.length === 1 ? (
                <div
                  style={{
                    background: "#f8fafc",
                    padding: "0.6rem 0.75rem",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    fontSize: "0.85rem",
                  }}
                >
                  <strong style={{ color: "#0f172a" }}>{activeCall.addresses[0].title}:</strong>{" "}
                  <span style={{ color: "#334155" }}>{activeCall.addresses[0].address}</span>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", maxHeight: "140px", overflowY: "auto" }}>
                  {activeCall.addresses.map((addr) => (
                    <label
                      key={addr.id}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "0.5rem",
                        padding: "0.5rem 0.6rem",
                        borderRadius: "6px",
                        border: currentSelectedAddr === addr.id ? "1.5px solid #059669" : "1px solid #e2e8f0",
                        background: currentSelectedAddr === addr.id ? "#f0fdf4" : "#ffffff",
                        cursor: "pointer",
                        fontSize: "0.82rem",
                      }}
                    >
                      <input
                        type="radio"
                        name="selectedAddr"
                        checked={currentSelectedAddr === addr.id}
                        onChange={() => setSelectedAddressId(addr.id)}
                        style={{ marginTop: "2px", accentColor: "#059669" }}
                      />
                      <div style={{ flex: 1 }}>
                        <strong style={{ color: "#0f172a" }}>{addr.title}:</strong>{" "}
                        <span style={{ color: "#475569" }}>{addr.address}</span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Butonlar */}
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
              <button
                onClick={dismissCall}
                className="ghost-btn"
                style={{
                  flex: 1,
                  padding: "0.55rem",
                  fontSize: "0.85rem",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                Kapat
              </button>
              <button
                onClick={() => startOrderForActiveCall(currentSelectedAddr)}
                className="login-button"
                style={{
                  flex: 2,
                  marginTop: 0,
                  padding: "0.55rem",
                  fontSize: "0.85rem",
                  borderRadius: "8px",
                  background: "#059669",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                🛵 Siparişe Başla
              </button>
            </div>
          </div>
        )}

        {/* YENİ MÜŞTERİ FORMU */}
        {activeCall.isNew && (
          <div>
            <div style={{ marginBottom: "0.6rem" }}>
              <label style={{ display: "block", fontSize: "0.75rem", color: "#64748b", fontWeight: 600, marginBottom: "2px" }}>
                İSİM (OPSİYONEL)
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Müşteri Adı Soyadı"
                style={{
                  width: "100%",
                  padding: "0.45rem 0.6rem",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.85rem",
                }}
              />
            </div>

            <div style={{ marginBottom: "0.6rem" }}>
              <label style={{ display: "block", fontSize: "0.75rem", color: "#64748b", fontWeight: 600, marginBottom: "2px" }}>
                ADRES BAŞLIĞI
              </label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Ev, İş, Dükkan (boşsa 'Adres')"
                style={{
                  width: "100%",
                  padding: "0.45rem 0.6rem",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.85rem",
                }}
              />
            </div>

            <div style={{ marginBottom: "0.6rem" }}>
              <label style={{ display: "block", fontSize: "0.75rem", color: "#64748b", fontWeight: 600, marginBottom: "2px" }}>
                TESLİMAT ADRESİ *
              </label>
              <textarea
                rows={2}
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="Mahalle, Cadde, Sokak, No, Daire..."
                style={{
                  width: "100%",
                  padding: "0.45rem 0.6rem",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.85rem",
                  resize: "vertical",
                }}
              />
            </div>

            {formError && (
              <div style={{ color: "#b91c1c", fontSize: "0.78rem", marginBottom: "0.5rem" }}>
                {formError}
              </div>
            )}

            {/* Butonlar */}
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
              <button
                type="button"
                onClick={dismissCall}
                className="ghost-btn"
                style={{
                  flex: 1,
                  padding: "0.5rem",
                  fontSize: "0.82rem",
                  borderRadius: "8px",
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
                  padding: "0.5rem",
                  fontSize: "0.82rem",
                  borderRadius: "8px",
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
      </div>
    </div>
  );
}
