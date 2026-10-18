"use client";

import { useEffect } from "react";

export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[AppError] İstemci çalışma zamanı hatası:", error);
  }, [error]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "#0f172a",
        color: "#f8fafc",
        padding: "2rem",
        textAlign: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: "16px",
          padding: "2.5rem 2rem",
          maxWidth: "520px",
          width: "100%",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
        }}
      >
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>⚠️</div>
        <h2 style={{ fontSize: "1.4rem", fontWeight: 700, margin: "0 0 0.75rem 0", color: "#f1f5f9" }}>
          Bir Yükleme Hatası Oluştu
        </h2>
        <p style={{ color: "#94a3b8", fontSize: "0.95rem", lineHeight: 1.5, margin: "0 0 1.5rem 0" }}>
          Uygulama yüklenirken geçici bir sorun meydana geldi. Sayfayı yenileyerek veya aşağıdaki butona tıklayarak tekrar deneyebilirsiniz.
        </p>

        {error?.message && (
          <div
            style={{
              background: "#0f172a",
              padding: "0.75rem 1rem",
              borderRadius: "8px",
              fontFamily: "monospace",
              fontSize: "0.8rem",
              color: "#f87171",
              textAlign: "left",
              marginBottom: "1.5rem",
              overflowX: "auto",
              border: "1px solid #7f1d1d",
            }}
          >
            {error.message}
          </div>
        )}

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "0.75rem 1.5rem",
              fontSize: "0.95rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Tekrar Dene
          </button>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.href = "/salon";
              }
            }}
            style={{
              background: "#334155",
              color: "#f8fafc",
              border: "none",
              borderRadius: "8px",
              padding: "0.75rem 1.5rem",
              fontSize: "0.95rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Ana Ekrana Dön
          </button>
        </div>
      </div>
    </div>
  );
}
