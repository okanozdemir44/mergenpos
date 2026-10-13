"use client";

import React, { useState } from "react";
import { useCallerId } from "@/context/CallerIdContext";

interface CallerIdSettingsModalProps {
  onClose: () => void;
}

export default function CallerIdSettingsModal({ onClose }: CallerIdSettingsModalProps) {
  const {
    hasLicense,
    licenseLoading,
    enabled,
    setEnabled,
    comPort,
    setComPort,
    baudRate,
    setBaudRate,
    incomingCall,
    logs,
    clearLogs,
    addLog,
  } = useCallerId();

  const [simPhone, setSimPhone] = useState("05551234567");
  const [simulating, setSimulating] = useState(false);
  const [simMessage, setSimMessage] = useState<string | null>(null);

  async function handleSimulate() {
    if (!simPhone.trim()) return;
    setSimulating(true);
    setSimMessage(null);

    try {
      const ok = await incomingCall(simPhone);
      if (ok) {
        setSimMessage("Çağrı simülasyonu başarıyla tetiklendi!");
      } else {
        if (!hasLicense) {
          setSimMessage("Çağrı tetiklenemedi: Lisans aktif değil.");
        } else if (!enabled) {
          setSimMessage("Çağrı tetiklenemedi: Caller ID toggle kapalı.");
        } else {
          setSimMessage("Çağrı tetiklenemedi (geçersiz numara veya mükerrer çağrı filtresi).");
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSimMessage(`Hata: ${msg}`);
    } finally {
      setSimulating(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div
        className="modal-content"
        style={{
          maxWidth: "560px",
          width: "100%",
          padding: "1.5rem",
          borderRadius: "12px",
          background: "#fff",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: "bold", margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span>📞</span> Caller ID (Arayan Numara) Ayarları
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "1.25rem",
              cursor: "pointer",
              color: "#64748b",
            }}
          >
            ✕
          </button>
        </div>

        {/* Lisans & Aç/Kapat Toggle */}
        <div
          style={{
            padding: "1rem",
            borderRadius: "8px",
            marginBottom: "1.25rem",
            background: hasLicense ? "#f0fdf4" : "#f1f5f9",
            border: `1px solid ${hasLicense ? "#bbf7d0" : "#e2e8f0"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.95rem", color: hasLicense ? "#166534" : "#475569" }}>
              Caller ID Hizmeti
            </div>
            {!hasLicense && !licenseLoading && (
              <div style={{ fontSize: "0.85rem", color: "#dc2626", marginTop: "2px" }}>
                🔒 Bu özellik için lisans gerekli
              </div>
            )}
            {hasLicense && (
              <div style={{ fontSize: "0.85rem", color: "#15803d", marginTop: "2px" }}>
                ✓ Lisans Doğrulandı (Aktif)
              </div>
            )}
          </div>

          <div>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                cursor: hasLicense ? "pointer" : "not-allowed",
                opacity: hasLicense ? 1 : 0.6,
              }}
            >
              <input
                type="checkbox"
                disabled={!hasLicense}
                checked={hasLicense && enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                style={{ width: "20px", height: "20px", accentColor: "#059669" }}
              />
              <span style={{ marginLeft: "8px", fontSize: "0.9rem", fontWeight: 600 }}>
                {enabled && hasLicense ? "Açık" : "Kapalı"}
              </span>
            </label>
          </div>
        </div>

        {/* Seri Port & Baud Rate Ayarları */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.25rem" }}>
          <div>
            <label style={{ display: "block", marginBottom: "0.4rem", fontWeight: 600, fontSize: "0.85rem", color: "#334155" }}>
              COM Port
            </label>
            <input
              type="text"
              value={comPort}
              onChange={(e) => setComPort(e.target.value)}
              placeholder="Örn: COM1"
              style={{
                width: "100%",
                padding: "0.55rem 0.75rem",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                fontSize: "0.9rem",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "0.4rem", fontWeight: 600, fontSize: "0.85rem", color: "#334155" }}>
              Baud Rate (Hız)
            </label>
            <select
              value={baudRate}
              onChange={(e) => setBaudRate(Number(e.target.value))}
              style={{
                width: "100%",
                padding: "0.55rem 0.75rem",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                fontSize: "0.9rem",
                background: "#fff",
              }}
            >
              <option value={9600}>9600 (Varsayılan)</option>
              <option value={19200}>19200</option>
              <option value={38400}>38400</option>
              <option value={57600}>57600</option>
              <option value={115200}>115200</option>
            </select>
          </div>
        </div>

        {/* Çağrı Simülasyonu */}
        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            padding: "1rem",
            marginBottom: "1.25rem",
          }}
        >
          <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.5rem", color: "#1e293b" }}>
            🧪 Çağrıyı Simüle Et (Test)
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              type="text"
              value={simPhone}
              onChange={(e) => setSimPhone(e.target.value)}
              placeholder="Telefon numarası (Örn: 05551234567)"
              style={{
                flex: 1,
                padding: "0.55rem 0.75rem",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                fontSize: "0.9rem",
              }}
            />
            <button
              onClick={handleSimulate}
              disabled={simulating}
              className="login-button"
              style={{
                marginTop: 0,
                padding: "0.55rem 1rem",
                fontSize: "0.85rem",
                whiteSpace: "nowrap",
                cursor: "pointer",
              }}
            >
              {simulating ? "Gönderiliyor…" : "Çağrı Simüle Et"}
            </button>
          </div>
          {simMessage && (
            <div
              style={{
                marginTop: "0.5rem",
                fontSize: "0.85rem",
                color: simMessage.startsWith("Hata") || simMessage.includes("tetiklenemedi") ? "#b91c1c" : "#15803d",
              }}
            >
              {simMessage}
            </div>
          )}
        </div>

        {/* Ham Veri Log Alanı */}
        <div style={{ marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
            <label style={{ fontWeight: 600, fontSize: "0.85rem", color: "#334155" }}>
              Ham Veri Log Kayıtları ({logs.length})
            </label>
            {logs.length > 0 && (
              <button
                onClick={clearLogs}
                style={{
                  background: "none",
                  border: "none",
                  color: "#64748b",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Logları Temizle
              </button>
            )}
          </div>
          <div
            style={{
              height: "120px",
              overflowY: "auto",
              background: "#0f172a",
              color: "#94a3b8",
              fontFamily: "monospace",
              fontSize: "0.78rem",
              padding: "0.6rem 0.75rem",
              borderRadius: "6px",
              border: "1px solid #1e293b",
            }}
          >
            {logs.length === 0 ? (
              <div style={{ color: "#64748b", fontStyle: "italic" }}>
                Henüz log kaydı yok. Gelen veya simüle edilen çağrılar burada listelenir.
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} style={{ marginBottom: "2px", lineHeight: "1.3" }}>
                  <span style={{ color: "#64748b" }}>[{log.timestamp}]</span>{" "}
                  <span
                    style={{
                      color:
                        log.type === "call"
                          ? "#38bdf8"
                          : log.type === "error"
                          ? "#f87171"
                          : log.type === "warn"
                          ? "#fbbf24"
                          : "#cbd5e1",
                    }}
                  >
                    {log.text}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Alt buton */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            className="ghost-btn"
            style={{
              padding: "0.55rem 1.25rem",
              borderRadius: "6px",
              fontSize: "0.9rem",
              cursor: "pointer",
            }}
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
