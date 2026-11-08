"use client";

import React, { useState } from "react";

export interface PrintFailureModalProps {
  isOpen: boolean;
  message?: string;
  onRetry: () => Promise<void> | void;
  onBrowserPrint: () => void;
  onClose: () => void;
}

export function PrintFailureModal({
  isOpen,
  message = "Fiş yazıcısına ulaşılamadı: QZ Tray çalışmıyor.",
  onRetry,
  onBrowserPrint,
  onClose,
}: PrintFailureModalProps) {
  const [retrying, setRetrying] = useState(false);

  if (!isOpen) return null;

  async function handleRetry() {
    try {
      setRetrying(true);
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        backgroundColor: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          padding: "1.75rem",
          maxWidth: "440px",
          width: "100%",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          textAlign: "center",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            width: "52px",
            height: "52px",
            borderRadius: "50%",
            background: "#fee2e2",
            color: "#dc2626",
            display: "grid",
            placeItems: "center",
            margin: "0 auto 1rem",
            fontSize: "1.6rem",
          }}
        >
          ⚠️
        </div>

        <h3
          style={{
            margin: "0 0 0.5rem",
            fontSize: "1.2rem",
            fontWeight: 800,
            color: "#0f172a",
          }}
        >
          Yazıcı Bağlantı Hatası
        </h3>

        <p
          style={{
            margin: "0 0 1.5rem",
            fontSize: "0.95rem",
            color: "#475569",
            lineHeight: 1.5,
          }}
        >
          {message}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          <button
            type="button"
            disabled={retrying}
            onClick={handleRetry}
            style={{
              padding: "0.75rem 1rem",
              background: "#0f172a",
              color: "#ffffff",
              border: "none",
              borderRadius: "10px",
              fontWeight: 700,
              cursor: retrying ? "not-allowed" : "pointer",
              fontSize: "0.92rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              opacity: retrying ? 0.7 : 1,
            }}
          >
            <span>🔄</span>
            <span>{retrying ? "Yeniden deneniyor…" : "Tekrar dene"}</span>
          </button>

          <button
            type="button"
            onClick={onBrowserPrint}
            style={{
              padding: "0.75rem 1rem",
              background: "#f8fafc",
              color: "#334155",
              border: "1px solid #cbd5e1",
              borderRadius: "10px",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: "0.92rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
            }}
          >
            <span>🖨️</span>
            <span>Tarayıcıdan yazdır</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "0.5rem",
              background: "transparent",
              color: "#94a3b8",
              border: "none",
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: 500,
            }}
          >
            Kapat (Fişsiz Devam Et)
          </button>
        </div>
      </div>
    </div>
  );
}
