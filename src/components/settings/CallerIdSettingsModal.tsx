"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useCallerId } from "@/context/CallerIdContext";
import type {
  DesktopSerialPortInfo,
  DesktopSignalOption,
  DesktopBaudScanItem,
} from "@/types/desktop";

interface CallerIdSettingsModalProps {
  onClose: () => void;
}

const ALL_BAUD_RATES = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];

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
    dtr,
    setDtr,
    rts,
    setRts,
    signals,
    serialStatus,
    reconnectSerial,
    incomingCall,
    logs,
    clearLogs,
  } = useCallerId();

  const isDesktop = typeof window !== "undefined" && Boolean(window.desktopAPI?.serial);
  const [ports, setPorts] = useState<DesktopSerialPortInfo[]>([]);
  const [refreshingPorts, setRefreshingPorts] = useState(false);
  const [desktopConfig, setDesktopConfig] = useState<{ mockSerial?: boolean } | null>(null);

  // Baud Tarama State
  const [baudScanActive, setBaudScanActive] = useState(false);
  const [baudScanItems, setBaudScanItems] = useState<Record<number, DesktopBaudScanItem>>({});
  const [baudScanError, setBaudScanError] = useState<string | null>(null);
  const [showBaudScanTable, setShowBaudScanTable] = useState(false);

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

  // Baud Tarama İlerleme Dinleyicisi
  useEffect(() => {
    if (!isDesktop || !window.desktopAPI?.serial?.onBaudScanProgress) return;
    const unsub = window.desktopAPI.serial.onBaudScanProgress((item) => {
      setBaudScanItems((prev) => ({
        ...prev,
        [item.baudRate]: item,
      }));
    });
    return () => {
      unsub();
    };
  }, [isDesktop]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleStartBaudScan = async () => {
    if (!isDesktop || !window.desktopAPI?.serial?.startBaudScan) return;
    if (!comPort) {
      setBaudScanError("Lütfen önce taranacak COM portu seçin.");
      return;
    }
    setBaudScanActive(true);
    setBaudScanError(null);
    setShowBaudScanTable(true);

    const initial: Record<number, DesktopBaudScanItem> = {};
    ALL_BAUD_RATES.forEach((rate) => {
      initial[rate] = {
        baudRate: rate,
        status: "pending",
        byteCount: 0,
        printableCount: 0,
        printableRatio: 0,
        secondsLeft: 8,
      };
    });
    setBaudScanItems(initial);

    try {
      const res = await window.desktopAPI.serial.startBaudScan(comPort, { dtr, rts });
      if (!res.success && res.error) {
        setBaudScanError(res.error);
      }
    } catch (err: any) {
      setBaudScanError(err?.message || "Tarama sırasında bir hata oluştu.");
    } finally {
      setBaudScanActive(false);
    }
  };

  const handleStopBaudScan = async () => {
    if (!isDesktop || !window.desktopAPI?.serial?.stopBaudScan) return;
    await window.desktopAPI.serial.stopBaudScan();
    setBaudScanActive(false);
  };

  // Bağlantı durumunu hesapla (bağlı / bağlı değil / meşgul)
  const connectionState = React.useMemo(() => {
    if (!isDesktop) {
      return { status: "not_desktop", label: "Tarayıcı Modu (Masaüstü gerekli)", color: "#64748b", bg: "#f1f5f9" };
    }
    if (serialStatus?.isOpen) {
      return { status: "connected", label: "Bağlı", color: "#16a34a", bg: "#dcfce7" };
    }
    const err = (serialStatus?.error || "").toLowerCase();
    if (
      err.includes("kullanılıyor") ||
      err.includes("busy") ||
      err.includes("ebusy") ||
      err.includes("access is denied") ||
      err.includes("permission denied")
    ) {
      return { status: "busy", label: "Meşgul (Vega veya başka program açık)", color: "#dc2626", bg: "#fee2e2" };
    }
    return { status: "disconnected", label: "Bağlı değil", color: "#64748b", bg: "#f1f5f9" };
  }, [isDesktop, serialStatus]);

  const selectedPortInfo = ports.find((p) => p.path.toUpperCase() === (comPort || "").toUpperCase());

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
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "640px",
          width: "100%",
          maxHeight: "92vh",
          overflowY: "auto",
          padding: "1.5rem",
          borderRadius: "12px",
          background: "#fff",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: "bold", margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span>📞</span> Caller ID (Arayan Numara) & COM Port Ayarları
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
            padding: "0.85rem 1rem",
            borderRadius: "8px",
            marginBottom: "1rem",
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
              <div style={{ fontSize: "0.82rem", color: "#dc2626", marginTop: "2px" }}>
                🔒 Bu özellik için lisans gerekli
              </div>
            )}
            {hasLicense && (
              <div style={{ fontSize: "0.82rem", color: "#15803d", marginTop: "2px" }}>
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

        {/* Bağlantı Durumu Rozeti */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.6rem 0.85rem",
            background: connectionState.bg,
            border: `1px solid ${connectionState.color}33`,
            borderRadius: "8px",
            marginBottom: "1rem",
            fontSize: "0.85rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontWeight: 600, color: "#334155" }}>Bağlantı Durumu:</span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.2rem 0.55rem",
                borderRadius: "999px",
                background: "#fff",
                border: `1px solid ${connectionState.color}44`,
                fontWeight: 700,
                color: connectionState.color,
                fontSize: "0.8rem",
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: connectionState.color }} />
              {connectionState.label}
            </span>
          </div>

          {serialStatus?.port && (
            <span style={{ fontSize: "0.8rem", color: "#64748b", fontFamily: "monospace" }}>
              {serialStatus.port} ({serialStatus.baudRate || baudRate} baud)
            </span>
          )}
        </div>

        {/* Seri Port & Baud Rate Ayarları */}
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "1rem", marginBottom: "0.75rem" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
              <label style={{ fontWeight: 600, fontSize: "0.85rem", color: "#334155" }}>
                COM Port {isDesktop && <span style={{ color: "#0284c7", fontSize: "0.75rem" }}>(Otomatik)</span>}
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
                  fontSize: "0.85rem",
                  background: "#fff",
                }}
              >
                {ports.map((p) => {
                  const vidPid = p.vendorId || p.productId ? ` [VID:${p.vendorId || "-"} PID:${p.productId || "-"}]` : "";
                  const mfg = p.manufacturer ? ` - ${p.manufacturer}` : "";
                  return (
                    <option key={p.path} value={p.path}>
                      {p.path}{mfg}{vidPid}
                    </option>
                  );
                })}
                {comPort && !ports.some((p) => p.path === comPort) && (
                  <option value={comPort}>{comPort} (Kayıtlı Port - Bağlı Değil)</option>
                )}
                {ports.length === 0 && !comPort && (
                  <option value="">COM port bulunamadı</option>
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
              {ALL_BAUD_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {rate} {rate === 9600 ? "(Varsayılan)" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Seçili Port Ayrıntıları */}
        {isDesktop && selectedPortInfo && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.5rem 1rem",
              padding: "0.45rem 0.75rem",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "6px",
              marginBottom: "0.75rem",
              fontSize: "0.78rem",
              color: "#475569",
            }}
          >
            <span><strong>Port:</strong> {selectedPortInfo.path}</span>
            <span><strong>Üretici:</strong> {selectedPortInfo.manufacturer || "Standart Seri Cihaz"}</span>
            <span><strong>Vendor ID:</strong> {selectedPortInfo.vendorId || "—"}</span>
            <span><strong>Product ID:</strong> {selectedPortInfo.productId || "—"}</span>
          </div>
        )}

        {/* Sinyal Kontrolleri: DTR ve RTS Seçimi + Pin İzleme */}
        {isDesktop && (
          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              padding: "0.75rem 0.9rem",
              marginBottom: "0.85rem",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "#1e293b", marginBottom: "0.5rem" }}>
              ⚡ Donanım Sinyal Seviyeleri (DTR / RTS) & Pin Durumları
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "0.6rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#475569", marginBottom: "0.25rem" }}>
                  DTR (Data Terminal Ready)
                </label>
                <select
                  value={dtr}
                  onChange={(e) => setDtr(e.target.value as DesktopSignalOption)}
                  style={{
                    width: "100%",
                    padding: "0.4rem 0.6rem",
                    borderRadius: "5px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.82rem",
                    background: "#fff",
                  }}
                >
                  <option value="default">Varsayılan (Sürücü Varsayılanı)</option>
                  <option value="on">Açık (High / +12V)</option>
                  <option value="off">Kapalı (Low / -12V)</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#475569", marginBottom: "0.25rem" }}>
                  RTS (Request To Send)
                </label>
                <select
                  value={rts}
                  onChange={(e) => setRts(e.target.value as DesktopSignalOption)}
                  style={{
                    width: "100%",
                    padding: "0.4rem 0.6rem",
                    borderRadius: "5px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.82rem",
                    background: "#fff",
                  }}
                >
                  <option value="default">Varsayılan (Sürücü Varsayılanı)</option>
                  <option value="on">Açık (High / +12V)</option>
                  <option value="off">Kapalı (Low / -12V)</option>
                </select>
              </div>
            </div>

            {/* 500ms Pin Durum Göstergeleri */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1.25rem",
                flexWrap: "wrap",
                padding: "0.4rem 0.6rem",
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                fontSize: "0.78rem",
              }}
            >
              <span style={{ fontWeight: 600, color: "#334155" }}>Pin Durumu (500 ms):</span>

              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: signals?.cts ? "#16a34a" : "#94a3b8",
                  }}
                />
                CTS: <strong>{signals ? (signals.cts ? "AÇIK" : "KAPALI") : "—"}</strong>
              </span>

              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: signals?.dsr ? "#16a34a" : "#94a3b8",
                  }}
                />
                DSR: <strong>{signals ? (signals.dsr ? "AÇIK" : "KAPALI") : "—"}</strong>
              </span>

              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: signals?.cd ? "#16a34a" : "#94a3b8",
                  }}
                />
                CD: <strong>{signals ? (signals.cd ? "AÇIK" : "KAPALI") : "—"}</strong>
              </span>

              {signals?.ri !== null && signals?.ri !== undefined && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: "50%",
                      background: signals.ri ? "#16a34a" : "#94a3b8",
                    }}
                  />
                  RI: <strong>{signals.ri ? "AÇIK" : "KAPALI"}</strong>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Masaüstü Mod Seçenekleri: Modem Modu & Baud Tarama Butonu & Yeniden Bağlan */}
        {isDesktop && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.6rem",
              marginBottom: "0.85rem",
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
              title="Açıkken AT+VCID=1 komutu gönderilir. Düz DB9 / USB Caller ID kutuları için kapalı tutunuz."
            >
              <input
                type="checkbox"
                checked={modemMode}
                onChange={(e) => setModemMode(e.target.checked)}
                style={{ width: "16px", height: "16px", marginRight: "8px", accentColor: "#0284c7" }}
              />
              Modem modu (AT komutu)
            </label>

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={baudScanActive ? handleStopBaudScan : handleStartBaudScan}
                style={{
                  background: baudScanActive ? "#dc2626" : "#475569",
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
                <span>{baudScanActive ? "⏹️" : "🔍"}</span>{" "}
                {baudScanActive ? "Taramayı Durdur" : "Baud Hızlarını Tara (8 sn/hız)"}
              </button>

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
          </div>
        )}

        {/* Baud Tarama Sonuç Tablosu */}
        {isDesktop && showBaudScanTable && (
          <div
            style={{
              background: "#f1f5f9",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              padding: "0.75rem",
              marginBottom: "0.85rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#1e293b" }}>
                📊 Baud Hızı Tarama Sonuçları {baudScanActive && "(Taranıyor...)"}
              </span>
              <button
                type="button"
                onClick={() => setShowBaudScanTable(false)}
                style={{ background: "none", border: "none", fontSize: "0.75rem", color: "#64748b", cursor: "pointer" }}
              >
                Kapat
              </button>
            </div>

            {baudScanError && (
              <div style={{ color: "#dc2626", fontSize: "0.8rem", marginBottom: "0.4rem" }}>
                Hata: {baudScanError}
              </div>
            )}

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
              <thead>
                <tr style={{ background: "#e2e8f0", textAlign: "left", color: "#334155" }}>
                  <th style={{ padding: "4px 8px" }}>Baud Rate</th>
                  <th style={{ padding: "4px 8px" }}>Durum</th>
                  <th style={{ padding: "4px 8px" }}>Gelen Bayt</th>
                  <th style={{ padding: "4px 8px" }}>Yazdırılabilir (%)</th>
                  <th style={{ padding: "4px 8px", textAlign: "right" }}>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {ALL_BAUD_RATES.map((rate) => {
                  const item = baudScanItems[rate];
                  const hasData = (item?.byteCount || 0) > 0;
                  const isScanningThis = item?.status === "scanning";

                  return (
                    <tr
                      key={rate}
                      style={{
                        background: isScanningThis ? "#e0f2fe" : hasData ? "#dcfce7" : "#fff",
                        borderBottom: "1px solid #e2e8f0",
                      }}
                    >
                      <td style={{ padding: "4px 8px", fontWeight: 600 }}>{rate}</td>
                      <td style={{ padding: "4px 8px" }}>
                        {isScanningThis ? (
                          <span style={{ color: "#0284c7", fontWeight: 600 }}>
                            Dinleniyor ({item.secondsLeft} sn)...
                          </span>
                        ) : item?.status === "completed" ? (
                          <span style={{ color: hasData ? "#15803d" : "#64748b" }}>
                            {hasData ? "✓ Veri Alındı" : "Sessiz"}
                          </span>
                        ) : item?.status === "failed" ? (
                          <span style={{ color: "#dc2626" }}>Açılamadı</span>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>Bekliyor</span>
                        )}
                      </td>
                      <td style={{ padding: "4px 8px", fontFamily: "monospace" }}>
                        {item ? `${item.byteCount} B` : "0 B"}
                      </td>
                      <td style={{ padding: "4px 8px" }}>
                        {item && item.byteCount > 0 ? (
                          <span style={{ fontWeight: 600, color: item.printableRatio > 70 ? "#15803d" : "#b45309" }}>
                            %{item.printableRatio}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ padding: "4px 8px", textAlign: "right" }}>
                        <button
                          type="button"
                          disabled={baudRate === rate}
                          onClick={() => {
                            setBaudRate(rate);
                            reconnectSerial();
                          }}
                          style={{
                            fontSize: "0.72rem",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            border: "1px solid #cbd5e1",
                            background: baudRate === rate ? "#94a3b8" : "#fff",
                            color: baudRate === rate ? "#fff" : "#0284c7",
                            cursor: baudRate === rate ? "default" : "pointer",
                          }}
                        >
                          {baudRate === rate ? "Seçili" : "Bu Hızı Seç"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Çağrı Simülasyonu */}
        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            padding: "0.85rem",
            marginBottom: "0.85rem",
          }}
        >
          <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.4rem", color: "#1e293b" }}>
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
                padding: "0.45rem 0.65rem",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                fontSize: "0.85rem",
              }}
            />
            <button
              onClick={handleSimulate}
              disabled={simulating}
              className="login-button"
              style={{
                marginTop: 0,
                padding: "0.45rem 0.85rem",
                fontSize: "0.82rem",
                whiteSpace: "nowrap",
                cursor: "pointer",
              }}
            >
              {simulating ? "Gönderiliyor…" : "Çağrı Simüle Et"}
            </button>
          </div>

          {/* Sahte Cihaz Modu (Yalnızca config.json'da mockSerial: true ise görünür) */}
          {isDesktop && Boolean(desktopConfig?.mockSerial) && (
            <div style={{ marginTop: "0.6rem", paddingTop: "0.6rem", borderTop: "1px dashed #cbd5e1" }}>
              <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#475569", marginBottom: "0.35rem" }}>
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
                      fontSize: "0.72rem",
                      padding: "0.25rem 0.5rem",
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
                marginTop: "0.4rem",
                fontSize: "0.8rem",
                color: simMessage.startsWith("Hata") || simMessage.includes("tetiklenemedi") ? "#b91c1c" : "#15803d",
              }}
            >
              {simMessage}
            </div>
          )}
        </div>

        {/* Ham Veri Log Alanı (500 Satır, Anında ms HEX/ASCII & Kırmızı Hatalar) */}
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
            <label style={{ fontWeight: 600, fontSize: "0.85rem", color: "#334155" }}>
              Ham Veri Log Kayıtları ({logs.length} / 500 satır)
            </label>
            {logs.length > 0 && (
              <button
                onClick={clearLogs}
                style={{
                  background: "none",
                  border: "none",
                  color: "#64748b",
                  fontSize: "0.78rem",
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
              height: "160px",
              overflowY: "auto",
              background: "#0f172a",
              color: "#94a3b8",
              fontFamily: "monospace",
              fontSize: "0.76rem",
              padding: "0.6rem 0.75rem",
              borderRadius: "6px",
              border: "1px solid #1e293b",
            }}
          >
            {logs.length === 0 ? (
              <div style={{ color: "#64748b", fontStyle: "italic" }}>
                Henüz log kaydı yok. COM porttan gelen ham baytlar anında ms zaman damgası, HEX ve ASCII olarak buraya düşer.
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} style={{ marginBottom: "2px", lineHeight: "1.35", wordBreak: "break-all" }}>
                  <span style={{ color: "#64748b" }}>[{log.timestamp}]</span>{" "}
                  <span
                    style={{
                      color:
                        log.type === "error"
                          ? "#ef4444" // Hata kırmızı
                          : log.type === "raw"
                          ? "#34d399" // Ham bayt chunk yeşilimsi
                          : log.type === "call"
                          ? "#38bdf8" // Çağrı mavi
                          : log.type === "warn"
                          ? "#fbbf24" // Uyarı sarı
                          : "#cbd5e1", // Info gri
                      fontWeight: log.type === "error" || log.type === "call" ? 600 : 400,
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
