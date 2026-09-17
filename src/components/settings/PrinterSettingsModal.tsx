"use client";

import React, { useState, useEffect } from "react";
import { getPrinters } from "../../lib/qz";

interface PrinterSettingsModalProps {
  onClose: () => void;
}

export default function PrinterSettingsModal({ onClose }: PrinterSettingsModalProps) {
  const [printers, setPrinters] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [kasaPrinter, setKasaPrinter] = useState("");
  const [mutfakPrinter, setMutfakPrinter] = useState("");

  useEffect(() => {
    // Mevcut ayarları yükle
    const savedKasa = localStorage.getItem("PRINTER_KASA") || "";
    const savedMutfak = localStorage.getItem("PRINTER_MUTFAK") || "";
    setKasaPrinter(savedKasa);
    setMutfakPrinter(savedMutfak);

    loadPrinters();
  }, []);

  async function loadPrinters() {
    setLoading(true);
    setError(null);
    try {
      const list = await getPrinters();
      setPrinters(list);
    } catch (err: any) {
      setError(err.message || "Yazıcılar yüklenemedi. QZ Tray açık mı?");
    } finally {
      setLoading(false);
    }
  }

  function handleSave() {
    localStorage.setItem("PRINTER_KASA", kasaPrinter);
    localStorage.setItem("PRINTER_MUTFAK", mutfakPrinter);
    onClose();
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: "500px", padding: "1.5rem", borderRadius: "12px", background: "#fff" }}>
        <h2 style={{ marginBottom: "1rem", fontSize: "1.2rem", fontWeight: "bold" }}>🖨️ Yazıcı Ayarları (QZ Tray)</h2>
        
        {error && (
          <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "0.75rem", borderRadius: "8px", marginBottom: "1rem", fontSize: "0.9rem" }}>
            {error}
            <button onClick={loadPrinters} style={{ marginLeft: "1rem", textDecoration: "underline", background: "none", border: "none", color: "inherit", cursor: "pointer" }}>
              Tekrar Dene
            </button>
          </div>
        )}

        <div style={{ marginBottom: "1rem" }}>
          <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold", fontSize: "0.9rem" }}>
            Kasa Yazıcısı (Müşteri Fişi)
          </label>
          <select 
            value={kasaPrinter} 
            onChange={(e) => setKasaPrinter(e.target.value)}
            style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
            disabled={loading}
          >
            <option value="">-- Seçiniz --</option>
            {printers.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: "1.5rem" }}>
          <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold", fontSize: "0.9rem" }}>
            Mutfak Yazıcısı (Sipariş Fişi)
          </label>
          <select 
            value={mutfakPrinter} 
            onChange={(e) => setMutfakPrinter(e.target.value)}
            style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
            disabled={loading}
          >
            <option value="">-- Seçiniz --</option>
            {printers.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <button 
            onClick={onClose}
            style={{ padding: "0.5rem 1rem", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#f8fafc", cursor: "pointer" }}
          >
            İptal
          </button>
          <button 
            onClick={handleSave}
            style={{ padding: "0.5rem 1rem", borderRadius: "6px", border: "none", background: "#10b981", color: "#fff", fontWeight: "bold", cursor: "pointer" }}
          >
            Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}
