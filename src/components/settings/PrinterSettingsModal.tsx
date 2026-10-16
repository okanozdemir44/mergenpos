"use client";

import React, { useState, useEffect } from "react";
import { getPrinters } from "../../lib/qz";
import {
  printReceiptHtml,
  generateTestReceiptHtml,
  isDesktopPrinterAvailable,
  getDesktopPrinterSetting,
  setDesktopPrinterSetting,
  getPrinterPaperWidth,
  setPrinterPaperWidth,
  isAutoPrintEnabled,
  setAutoPrintEnabled,
} from "../../lib/unified-printer";

interface PrinterSettingsModalProps {
  onClose: () => void;
}

interface PrinterItem {
  name: string;
  displayName?: string;
  status?: number;
  isDefault?: boolean;
}

export default function PrinterSettingsModal({ onClose }: PrinterSettingsModalProps) {
  const [printers, setPrinters] = useState<PrinterItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [kasaPrinter, setKasaPrinter] = useState("");
  const [mutfakPrinter, setMutfakPrinter] = useState("");

  const [isDesktop, setIsDesktop] = useState(false);
  const [useDesktopPrint, setUseDesktopPrint] = useState(false);
  const [autoPrintEnabled, setAutoPrintEnabledState] = useState(false);
  const [paperWidth, setPaperWidth] = useState<number>(80);

  const [testPrintingRole, setTestPrintingRole] = useState<"kasa" | "mutfak" | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  useEffect(() => {
    // Mevcut ayarları yükle (PRINTER_KASA ve PRINTER_MUTFAK korunur)
    const savedKasa = localStorage.getItem("PRINTER_KASA") || "";
    const savedMutfak = localStorage.getItem("PRINTER_MUTFAK") || "";
    setKasaPrinter(savedKasa);
    setMutfakPrinter(savedMutfak);

    const desktopAvailable = isDesktopPrinterAvailable();
    setIsDesktop(desktopAvailable);
    setUseDesktopPrint(getDesktopPrinterSetting());
    setAutoPrintEnabledState(isAutoPrintEnabled());
    
    // Varsayılan kağıt genişliği: 80mm
    const currentWidth = getPrinterPaperWidth();
    setPaperWidth(currentWidth || 80);
    if (!localStorage.getItem("mergen_printer_paper_width")) {
      setPrinterPaperWidth(80);
    }

    loadPrinters(desktopAvailable);
  }, []);

  async function loadPrinters(desktopAvailable?: boolean) {
    setLoading(true);
    setError(null);
    try {
      // Masaüstü kabuğundaysa doğrudan Windows yazıcılarını ve durumlarını al
      if (typeof window !== "undefined" && window.desktopAPI?.print) {
        const desktopList = await window.desktopAPI.print.listPrinters();
        setPrinters(desktopList);
        return;
      }

      // Tarayıcı ortamındaysa QZ Tray üzerinden al
      const list = await getPrinters();
      setPrinters(list.map((name) => ({ name, status: 0 })));
    } catch (err: any) {
      if (desktopAvailable || (typeof window !== "undefined" && window.desktopAPI?.print)) {
        setError(`Masaüstü yazıcı listesi alınamadı: ${err.message || String(err)}`);
      } else {
        setError(err.message || "Yazıcılar yüklenemedi. QZ Tray açık mı?");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleSave() {
    localStorage.setItem("PRINTER_KASA", kasaPrinter);
    localStorage.setItem("PRINTER_MUTFAK", mutfakPrinter);
    setDesktopPrinterSetting(useDesktopPrint);
    setAutoPrintEnabled(autoPrintEnabled);
    setPrinterPaperWidth(paperWidth || 80);
    onClose();
  }

  function getPrinterStatus(name: string): "ready" | "offline" | "not_found" | "none" {
    if (!name) return "none";
    const found = printers.find(
      (p) => p.name.toLowerCase() === name.toLowerCase() || (p.displayName && p.displayName.toLowerCase() === name.toLowerCase())
    );
    if (!found) return "not_found";
    // Windows status 0 = hazır
    if (found.status === undefined || found.status === 0) return "ready";
    return "offline";
  }

  function renderStatusBadge(status: "ready" | "offline" | "not_found" | "none") {
    if (status === "none") return null;
    if (status === "ready") {
      return (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "0.74rem",
            fontWeight: 700,
            color: "#16a34a",
            background: "#dcfce7",
            border: "1px solid #bbf7d0",
            padding: "0.15rem 0.5rem",
            borderRadius: "999px",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#16a34a" }} />
          Hazır
        </span>
      );
    }
    if (status === "offline") {
      return (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "0.74rem",
            fontWeight: 700,
            color: "#d97706",
            background: "#fef3c7",
            border: "1px solid #fde68a",
            padding: "0.15rem 0.5rem",
            borderRadius: "999px",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#d97706" }} />
          Çevrimdışı
        </span>
      );
    }
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          fontSize: "0.74rem",
          fontWeight: 700,
          color: "#dc2626",
          background: "#fee2e2",
          border: "1px solid #fecaca",
          padding: "0.15rem 0.5rem",
          borderRadius: "999px",
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#dc2626" }} />
        Listede yok
      </span>
    );
  }

  async function handlePrintTestReceipt(targetPrinter: string, roleName: "Kasa Yazıcısı" | "Mutfak Yazıcısı") {
    if (!targetPrinter) {
      setTestMessage(`Lütfen önce ${roleName} için bir yazıcı seçin.`);
      return;
    }
    const roleKey = roleName === "Kasa Yazıcısı" ? "kasa" : "mutfak";
    setTestPrintingRole(roleKey);
    setTestMessage(null);
    try {
      const html = generateTestReceiptHtml("Mergen POS Restoran", paperWidth || 80, `${roleName} Test Fişi`);
      await printReceiptHtml({
        printerName: targetPrinter,
        html,
        copies: 1,
        paperWidthMm: paperWidth || 80,
      });
      setTestMessage(`✓ ${roleName} test fişi "${targetPrinter}" yazıcısına başarıyla gönderildi.`);
    } catch (err: any) {
      setTestMessage(`❌ ${roleName} test fişi basılamadı: ${err?.message || String(err)}`);
    } finally {
      setTestPrintingRole(null);
    }
  }

  const kasaStatus = getPrinterStatus(kasaPrinter);
  const mutfakStatus = getPrinterStatus(mutfakPrinter);

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: "560px", padding: "1.5rem", borderRadius: "12px", background: "#fff" }}>
        <h2 style={{ marginBottom: "1rem", fontSize: "1.2rem", fontWeight: "bold", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span>🖨️</span> Yazıcı Ayarları {isDesktop ? "(Masaüstü Kabuğu)" : "(QZ Tray)"}
        </h2>

        {error && (
          <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "0.75rem", borderRadius: "8px", marginBottom: "1rem", fontSize: "0.88rem" }}>
            {error}
            <button
              onClick={() => loadPrinters(isDesktop)}
              style={{ marginLeft: "1rem", textDecoration: "underline", background: "none", border: "none", color: "inherit", cursor: "pointer", fontWeight: "bold" }}
            >
              Tekrar Dene
            </button>
          </div>
        )}

        {/* Masaüstü Kabuğu Özel Ayarları */}
        {isDesktop && (
          <div
            style={{
              padding: "0.9rem",
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: "8px",
              marginBottom: "1.25rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.92rem", color: "#166534" }}>
                  Masaüstü Doğrudan Yazdırma
                </div>
                <div style={{ fontSize: "0.78rem", color: "#15803d" }}>
                  QZ Tray gerektirmeden Windows sürücüsü üzerinden sessizce basar
                </div>
              </div>
              <label style={{ display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={useDesktopPrint}
                  onChange={(e) => setUseDesktopPrint(e.target.checked)}
                  style={{ width: "18px", height: "18px", accentColor: "#16a34a" }}
                />
                <span style={{ marginLeft: "6px", fontSize: "0.85rem", fontWeight: 600, color: "#166534" }}>
                  {useDesktopPrint ? "Açık" : "Kapalı"}
                </span>
              </label>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.5rem", borderTop: "1px dashed #bbf7d0", paddingTop: "0.5rem" }}>
              <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "#166534" }}>
                Termal Kağıt Genişliği:
              </label>
              <select
                value={paperWidth}
                onChange={(e) => setPaperWidth(Number(e.target.value) || 80)}
                style={{
                  padding: "0.25rem 0.5rem",
                  fontSize: "0.82rem",
                  borderRadius: "4px",
                  border: "1px solid #86efac",
                  background: "#fff",
                }}
              >
                <option value={80}>80 mm (Standart POS Fişi - DKT-B823)</option>
                <option value={58}>58 mm (Küçük Termal)</option>
              </select>
            </div>
          </div>
        )}

        {/* 1. Kasa / Hesap Yazıcısı Rolü */}
        <div style={{ marginBottom: "1.2rem", padding: "0.85rem", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.45rem", flexWrap: "wrap", gap: "0.4rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
              <label style={{ fontWeight: "bold", fontSize: "0.9rem", color: "#1e293b" }}>
                Kasa / Hesap Yazıcısı
              </label>
              {renderStatusBadge(kasaStatus)}
            </div>

            {kasaPrinter && (
              <button
                type="button"
                disabled={testPrintingRole !== null}
                onClick={() => handlePrintTestReceipt(kasaPrinter, "Kasa Yazıcısı")}
                style={{
                  background: "#e0f2fe",
                  border: "1px solid #bae6fd",
                  borderRadius: "5px",
                  color: "#0369a1",
                  fontSize: "0.76rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: "0.2rem 0.55rem",
                }}
              >
                {testPrintingRole === "kasa" ? "Basılıyor…" : "Kasa Test Fişi Yazdır"}
              </button>
            )}
          </div>

          <select
            value={kasaPrinter}
            onChange={(e) => setKasaPrinter(e.target.value)}
            style={{ width: "100%", padding: "0.55rem", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.88rem", background: "#fff" }}
            disabled={loading}
          >
            <option value="">-- Seçiniz --</option>
            {printers.map((p) => {
              const st = p.status === undefined || p.status === 0 ? "Hazır" : "Çevrimdışı";
              return (
                <option key={p.name} value={p.name}>
                  {p.name} [{st}]{p.isDefault ? " (Varsayılan)" : ""}
                </option>
              );
            })}
            {kasaPrinter && !printers.some((p) => p.name.toLowerCase() === kasaPrinter.toLowerCase()) && (
              <option value={kasaPrinter}>{kasaPrinter} [Listede yok]</option>
            )}
          </select>

          {/* Kayıtlı yazıcı adı Windows listesinde yoksa kırmızı uyarı */}
          {kasaStatus === "not_found" && (
            <div
              style={{
                marginTop: "0.45rem",
                padding: "0.5rem 0.75rem",
                background: "#fef2f2",
                color: "#b91c1c",
                border: "1px solid #fecaca",
                borderRadius: "6px",
                fontSize: "0.8rem",
                lineHeight: "1.4",
              }}
            >
              ⚠️ Kayıtlı kasa yazıcısı (<strong>"{kasaPrinter}"</strong>) Windows yazıcı listesinde bulunamadı! Yazıcının açık olduğunu ve USB/LAN kablosunun bağlı olduğunu kontrol edin.
            </div>
          )}
        </div>

        {/* 2. Mutfak Yazıcısı Rolü */}
        <div style={{ marginBottom: "1.2rem", padding: "0.85rem", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.45rem", flexWrap: "wrap", gap: "0.4rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
              <label style={{ fontWeight: "bold", fontSize: "0.9rem", color: "#1e293b" }}>
                Mutfak Yazıcısı (Sipariş Fişi)
              </label>
              {renderStatusBadge(mutfakStatus)}
            </div>

            {mutfakPrinter && (
              <button
                type="button"
                disabled={testPrintingRole !== null}
                onClick={() => handlePrintTestReceipt(mutfakPrinter, "Mutfak Yazıcısı")}
                style={{
                  background: "#e0f2fe",
                  border: "1px solid #bae6fd",
                  borderRadius: "5px",
                  color: "#0369a1",
                  fontSize: "0.76rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: "0.2rem 0.55rem",
                }}
              >
                {testPrintingRole === "mutfak" ? "Basılıyor…" : "Mutfak Test Fişi Yazdır"}
              </button>
            )}
          </div>

          <select
            value={mutfakPrinter}
            onChange={(e) => setMutfakPrinter(e.target.value)}
            style={{ width: "100%", padding: "0.55rem", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.88rem", background: "#fff" }}
            disabled={loading}
          >
            <option value="">-- Seçiniz --</option>
            {printers.map((p) => {
              const st = p.status === undefined || p.status === 0 ? "Hazır" : "Çevrimdışı";
              return (
                <option key={p.name} value={p.name}>
                  {p.name} [{st}]{p.isDefault ? " (Varsayılan)" : ""}
                </option>
              );
            })}
            {mutfakPrinter && !printers.some((p) => p.name.toLowerCase() === mutfakPrinter.toLowerCase()) && (
              <option value={mutfakPrinter}>{mutfakPrinter} [Listede yok]</option>
            )}
          </select>

          {/* Kayıtlı yazıcı adı Windows listesinde yoksa kırmızı uyarı */}
          {mutfakStatus === "not_found" && (
            <div
              style={{
                marginTop: "0.45rem",
                padding: "0.5rem 0.75rem",
                background: "#fef2f2",
                color: "#b91c1c",
                border: "1px solid #fecaca",
                borderRadius: "6px",
                fontSize: "0.8rem",
                lineHeight: "1.4",
              }}
            >
              ⚠️ Kayıtlı mutfak yazıcısı (<strong>"{mutfakPrinter}"</strong>) Windows yazıcı listesinde bulunamadı! LAN/Ağ kablosunun takılı olduğunu veya Standart TCP/IP bağlantı noktasının (Port 9100) ekli olduğunu kontrol edin.
            </div>
          )}
        </div>

        {/* Otomatik Fiş Yazdırma Seçeneği */}
        <div
          style={{
            padding: "0.85rem",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            marginBottom: "1.2rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "#1e293b" }}>
              Otomatik Fiş Yazdır
            </div>
            <div style={{ fontSize: "0.78rem", color: "#64748b" }}>
              Sipariş onayında ve mutfağa gönderimde fişleri otomatik yazdırır
            </div>
          </div>
          <label style={{ display: "inline-flex", alignItems: "center", cursor: "pointer", marginLeft: "1rem" }}>
            <input
              type="checkbox"
              checked={autoPrintEnabled}
              onChange={(e) => setAutoPrintEnabledState(e.target.checked)}
              style={{ width: "18px", height: "18px", accentColor: "#059669" }}
            />
            <span style={{ marginLeft: "6px", fontSize: "0.85rem", fontWeight: 600, color: autoPrintEnabled ? "#15803d" : "#64748b" }}>
              {autoPrintEnabled ? "Açık" : "Kapalı"}
            </span>
          </label>
        </div>

        {testMessage && (
          <div
            style={{
              padding: "0.6rem 0.85rem",
              borderRadius: "6px",
              marginBottom: "1rem",
              fontSize: "0.85rem",
              background: testMessage.startsWith("✓") ? "#ecfdf5" : "#fef2f2",
              color: testMessage.startsWith("✓") ? "#047857" : "#b91c1c",
              border: `1px solid ${testMessage.startsWith("✓") ? "#a7f3d0" : "#fecaca"}`,
            }}
          >
            {testMessage}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => loadPrinters(isDesktop)}
            disabled={loading}
            style={{
              background: "none",
              border: "none",
              color: "#64748b",
              fontSize: "0.82rem",
              cursor: "pointer",
              textDecoration: "underline",
              padding: 0,
            }}
          >
            {loading ? "Yenileniyor…" : "Yazıcı Listesini Yenile"}
          </button>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={onClose}
              style={{ padding: "0.5rem 1rem", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#f8fafc", cursor: "pointer", fontSize: "0.9rem" }}
            >
              İptal
            </button>
            <button
              onClick={handleSave}
              style={{ padding: "0.5rem 1rem", borderRadius: "6px", border: "none", background: "#10b981", color: "#fff", fontWeight: "bold", cursor: "pointer", fontSize: "0.9rem" }}
            >
              Kaydet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
