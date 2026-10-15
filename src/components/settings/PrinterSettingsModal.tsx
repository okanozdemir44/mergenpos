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

export default function PrinterSettingsModal({ onClose }: PrinterSettingsModalProps) {
  const [printers, setPrinters] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [kasaPrinter, setKasaPrinter] = useState("");
  const [mutfakPrinter, setMutfakPrinter] = useState("");

  const [isDesktop, setIsDesktop] = useState(false);
  const [useDesktopPrint, setUseDesktopPrint] = useState(false);
  const [autoPrintEnabled, setAutoPrintEnabledState] = useState(false);
  const [paperWidth, setPaperWidth] = useState<number>(80);

  const [testPrinting, setTestPrinting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  useEffect(() => {
    // Mevcut ayarları yükle
    const savedKasa = localStorage.getItem("PRINTER_KASA") || "";
    const savedMutfak = localStorage.getItem("PRINTER_MUTFAK") || "";
    setKasaPrinter(savedKasa);
    setMutfakPrinter(savedMutfak);

    const desktopAvailable = isDesktopPrinterAvailable();
    setIsDesktop(desktopAvailable);
    setUseDesktopPrint(getDesktopPrinterSetting());
    setAutoPrintEnabledState(isAutoPrintEnabled());
    setPaperWidth(getPrinterPaperWidth());

    loadPrinters(desktopAvailable);
  }, []);

  async function loadPrinters(desktopAvailable?: boolean) {
    setLoading(true);
    setError(null);
    try {
      // Masaüstü kabuğundaysa doğrudan Windows yazıcılarını al
      if (typeof window !== "undefined" && window.desktopAPI?.print) {
        const desktopList = await window.desktopAPI.print.listPrinters();
        const names = desktopList.map((p) => p.name);
        setPrinters(names);
        return;
      }

      // Tarayıcı ortamındaysa QZ Tray üzerinden al
      const list = await getPrinters();
      setPrinters(list);
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
    setPrinterPaperWidth(paperWidth);
    onClose();
  }

  async function handlePrintTestReceipt(targetPrinter: string) {
    if (!targetPrinter) {
      setTestMessage("Lütfen önce bir yazıcı seçin.");
      return;
    }
    setTestPrinting(true);
    setTestMessage(null);
    try {
      const html = generateTestReceiptHtml("Mergen POS Restoran", paperWidth);
      await printReceiptHtml({
        printerName: targetPrinter,
        html,
        copies: 1,
        paperWidthMm: paperWidth,
      });
      setTestMessage(`✓ Test fişi "${targetPrinter}" yazıcısına başarıyla gönderildi.`);
    } catch (err: any) {
      setTestMessage(`❌ Test fişi basılamadı: ${err?.message || String(err)}`);
    } finally {
      setTestPrinting(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: "520px", padding: "1.5rem", borderRadius: "12px", background: "#fff" }}>
        <h2 style={{ marginBottom: "1rem", fontSize: "1.2rem", fontWeight: "bold", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span>🖨️</span> Yazıcı Ayarları {isDesktop ? "(Masaüstü Kabuğu)" : "(QZ Tray)"}
        </h2>
        
        {error && (
          <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "0.75rem", borderRadius: "8px", marginBottom: "1rem", fontSize: "0.9rem" }}>
            {error}
            <button onClick={() => loadPrinters(isDesktop)} style={{ marginLeft: "1rem", textDecoration: "underline", background: "none", border: "none", color: "inherit", cursor: "pointer" }}>
              Tekrar Dene
            </button>
          </div>
        )}

        {/* Masaüstü Kabuğu Özel Ayarları (Yalnızca masaüstünde görünür) */}
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
                <option value={80}>80 mm (Standart POS Fişi)</option>
                <option value={58}>58 mm (Küçük Termal)</option>
              </select>
            </div>
          </div>
        )}

        <div style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
            <label style={{ fontWeight: "bold", fontSize: "0.9rem", color: "#1e293b" }}>
              Kasa Yazıcısı (Müşteri Fişi)
            </label>
            {kasaPrinter && (
              <button
                type="button"
                disabled={testPrinting}
                onClick={() => handlePrintTestReceipt(kasaPrinter)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#0284c7",
                  fontSize: "0.78rem",
                  cursor: "pointer",
                  textDecoration: "underline",
                  padding: 0,
                }}
              >
                {testPrinting ? "Basılıyor…" : "Test fişi yazdır"}
              </button>
            )}
          </div>
          <select 
            value={kasaPrinter} 
            onChange={(e) => setKasaPrinter(e.target.value)}
            style={{ width: "100%", padding: "0.55rem", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.9rem" }}
            disabled={loading}
          >
            <option value="">-- Seçiniz --</option>
            {printers.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
            <label style={{ fontWeight: "bold", fontSize: "0.9rem", color: "#1e293b" }}>
              Mutfak Yazıcısı (Sipariş Fişi)
            </label>
            {mutfakPrinter && (
              <button
                type="button"
                disabled={testPrinting}
                onClick={() => handlePrintTestReceipt(mutfakPrinter)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#0284c7",
                  fontSize: "0.78rem",
                  cursor: "pointer",
                  textDecoration: "underline",
                  padding: 0,
                }}
              >
                {testPrinting ? "Basılıyor…" : "Test fişi yazdır"}
              </button>
            )}
          </div>
          <select 
            value={mutfakPrinter} 
            onChange={(e) => setMutfakPrinter(e.target.value)}
            style={{ width: "100%", padding: "0.55rem", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.9rem" }}
            disabled={loading}
          >
            <option value="">-- Seçiniz --</option>
            {printers.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {/* Otomatik Fiş Yazdırma Seçeneği (Varsayılan Kapalı) */}
        <div
          style={{
            padding: "0.85rem",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            marginBottom: "1.25rem",
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
              Sipariş onayında ve mutfağa gönderimde fişleri otomatik yazdırır (Varsayılan: Kapalı)
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
              padding: "0.6rem 0.8rem",
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
