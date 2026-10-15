"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useCallerId } from "@/context/CallerIdContext";
import type { DesktopSerialPortInfo } from "@/types/desktop";

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
    modemMode,
    setModemMode,
    reconnectSerial,
    incomingCall,
    logs,
    clearLogs,
    addLog,
  } = useCallerId();

  const isDesktop = typeof window !== "undefined" && Boolean(window.desktopAPI?.serial);
  const [ports, setPorts] = useState<DesktopSerialPortInfo[]>([]);
  const [refreshingPorts, setRefreshingPorts] = useState(false);
  const [desktopConfig, setDesktopConfig] = useState<{ mockSerial?: boolean } | null>(null);

  useEffect(() => {
    if (isDesktop && window.desktopAPI?.getConfig) {
      window.desktopAPI.getConfig().then((cfg) => setDesktopConfig(cfg)).catch(() => {});
    }
  }, [isDesktop]);

  const refreshPorts = useCallback(async () => {
    if (typeof window !== "undefined" && window.desktopAPI?.serial) {
      setRefreshingPorts(true);
      try {
        const list = await window.desktopAPI.serial.listPorts();
        setPorts(list);
        // Eğer port seçilmemişse ve liste doluysa ilk portu seç
        if (list.length > 0 && !comPort) {
          setComPort(list[0].path);
        }
      } catch (err) {
        console.warn("Port listesi alınamadı:", err);
      } finally {
        setRefreshingPorts(false);
      }
    }
  }, [comPort, setComPort]);

  useEffect(() => {
    if (isDesktop) {
      refreshPorts();
    }
  }, [isDesktop, refreshPorts]);

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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
              <label style={{ fontWeight: 600, fontSize: "0.85rem", color: "#334155" }}>
                COM Port {isDesktop && <span style={{ color: "#0284c7", fontSize: "0.75rem" }}>(Masaüstü Otomatik)</span>}
              </label>
              {isDesktop && (
                <button
                  type="button"
                  onClick={refreshPorts}
                  title="Port Listesini Yenile"
                  style={{
                    background: "none",
                    border: "none",
                    color: "#0284c7",
                    fontSize: "0.75rem",
                    cursor: "pointer",
                    padding: 0,
                    textDecoration: "underline",
                  }}
                >
                  {refreshingPorts ? "Taranıyor…" : "Yenile"}
                </button>
              )}
            </div>

            {isDesktop ? (
              <select
                value={comPort}
                onChange={(e) => setComPort(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.55rem 0.75rem",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.9rem",
                  background: "#fff",
                }}
              >
                {ports.map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.path} {p.manufacturer ? `(${p.manufacturer})` : ""}
                  </option>
                ))}
                {comPort && !ports.some((p) => p.path === comPort) && (
                  <option value={comPort}>{comPort} (Kayıtlı Port)</option>
                )}
                {ports.length === 0 && !comPort && (
                  <option value="">Port Bulunamadı (Cihazı bağlayın)</option>
                )}
              </select>
            ) : (
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
            )}
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

        {/* Masaüstü Mod Seçenekleri: Modem Modu & Yeniden Bağlan */}
        {isDesktop && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              marginBottom: "1.25rem",
              padding: "0.6rem 0.8rem",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "6px",
            }}
          >
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                cursor: "pointer",
                fontSize: "0.82rem",
                color: "#334155",
                fontWeight: 500,
              }}
              title="Açıkken AT+VCID=1 / AT+CLIP=1 komutları gönderilir. Düz USB Caller ID kutuları için kapalı tutunuz."
            >
              <input
                type="checkbox"
                checked={modemMode}
                onChange={(e) => setModemMode(e.target.checked)}
                style={{ width: "16px", height: "16px", marginRight: "8px", accentColor: "#0284c7" }}
              />
              Modem modu (AT komutu gönder)
            </label>

            <button
              type="button"
              onClick={() => reconnectSerial()}
              style={{
                background: "#0284c7",
                color: "#fff",
                border: "none",
                borderRadius: "5px",
                padding: "0.35rem 0.75rem",
                fontSize: "0.8rem",
                fontWeight: 500,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <span>🔄</span> Yeniden Bağlan
            </button>
          </div>
        )}

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

          {/* Sahte Cihaz Modu (Yalnızca config.json'da mockSerial: true ise görünür) */}
          {isDesktop && Boolean(desktopConfig?.mockSerial) && (
            <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px dashed #cbd5e1" }}>
              <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "#475569", marginBottom: "0.4rem" }}>
                🤖 Sahte Seri Port Cihazı (Parçalanmış Veri ve CRLF Format Testleri):
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                {(
                  [
                    { id: "a", label: "(a) Düz Numara" },
                    { id: "b", label: "(b) NMBR = ..." },
                    { id: "c", label: "(c) +CLIP Modem" },
                    { id: "d", label: "(d) Bell202 Çok Satırlı" },
                    { id: "e", label: "(e) CALLER ID: ..." },
                  ] as const
                ).map((fmt) => (
                  <button
                    key={fmt.id}
                    type="button"
                    onClick={async () => {
                      if (window.desktopAPI?.serial) {
                        await window.desktopAPI.serial.triggerMock(fmt.id);
                        setSimMessage(`Sahte donanım verisi gönderildi [Format ${fmt.id.toUpperCase()}]. Ham loglara ve ekrana bakın.`);
                      }
                    }}
                    style={{
                      fontSize: "0.75rem",
                      padding: "0.3rem 0.6rem",
                      borderRadius: "4px",
                      border: "1px solid #94a3b8",
                      background: "#f1f5f9",
                      cursor: "pointer",
                      color: "#0f172a",
                    }}
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

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
