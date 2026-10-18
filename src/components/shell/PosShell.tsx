"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStaffSession } from "@/hooks/useStaffSession";
import { useRestaurantFeatures } from "@/hooks/useRestaurantFeatures";
import { useState, useEffect } from "react";
import PrinterSettingsModal from "../settings/PrinterSettingsModal";
import CallerIdSettingsModal from "../settings/CallerIdSettingsModal";
import { CallerIdOverlay } from "../callerid/CallerIdOverlay";
import { CallerIdProvider } from "@/context/CallerIdContext";

import { BrandingProvider, useBranding } from "@/context/BrandingContext";

type NavItem = { href: string; label: string; icon: string; match?: string };

const NAV: NavItem[] = [
  { href: "/salon", label: "Hızlı Satış", icon: "⚡" },
  { href: "/salon", label: "Paket (Kurye)", icon: "🛵" },
  { href: "/reports", label: "Rapor", icon: "📊" },
  { href: "/reports/detailed", label: "Detaylı Raporlar", icon: "📈", match: "/reports/detailed" },
  { href: "/stock", label: "Menü Yönetimi", icon: "🗂️" },
];

function PosShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { staff } = useStaffSession();
  const { branding } = useBranding();
  const { callerIdEnabled } = useRestaurantFeatures();
  const [showPrinterSettings, setShowPrinterSettings] = useState(false);
  const [showCallerIdSettings, setShowCallerIdSettings] = useState(false);
  const [printerWarning, setPrinterWarning] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<{ printerName: string; message: string }>;
      if (customEvent.detail?.message) {
        setPrinterWarning(customEvent.detail.message);
      }
    };
    window.addEventListener("mergen-printer-warning", handler);
    return () => window.removeEventListener("mergen-printer-warning", handler);
  }, []);

  useEffect(() => {
    if (!printerWarning) return;
    const t = setTimeout(() => setPrinterWarning(null), 6000);
    return () => clearTimeout(t);
  }, [printerWarning]);

  const hideShell = pathname.startsWith("/login");

  if (hideShell) {
    return <>{children}</>;
  }

  // Build nav items: conditionally add Müşterilerim if caller ID license is active
  const navItems: NavItem[] = [...NAV];
  if (callerIdEnabled) {
    navItems.push({ href: "/customers", label: "Müşterilerim", icon: "👥" });
  }

  return (
    <div className="pos-app">
      <aside className="pos-sidebar">
        <div className="pos-brand" style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "0.5rem 0.25rem" }}>
          <img
            src={branding.logo_url}
            alt={branding.display_name}
            style={{
              width: "100%",
              maxWidth: "100%",
              height: "auto",
              maxHeight: "64px",
              objectFit: "contain",
              filter: "drop-shadow(0 2px 6px rgba(0, 0, 0, 0.3))",
            }}
          />
        </div>

        <nav className="pos-side-nav">
          {navItems.map((item) => {
            const matchPath = item.match || item.href;
            const active =
              pathname === matchPath ||
              (matchPath !== "/reports" && pathname.startsWith(`${matchPath}/`)) ||
              (matchPath === "/service" && pathname.startsWith("/service"));
            return (
              <Link
                key={item.href + item.label}
                href={item.href}
                className={`pos-side-link ${active ? "pos-side-link--active" : ""}`}
              >
                <span className="pos-side-link__icon" aria-hidden>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="pos-side-foot">
          <div className="pos-user">
            <strong>{staff?.name ?? "Personel"}</strong>
            <span>{staff?.role ?? "—"}</span>
          </div>
          <button 
            type="button"
            onClick={() => setShowCallerIdSettings(true)} 
            className="pos-side-action-btn"
            title="Caller ID Ayarları"
          >
            <span className="pos-side-action-btn__icon">📞</span>
            <span className="pos-side-action-btn__label">Caller ID</span>
          </button>
          <Link
            href="/receipt-settings"
            className="pos-side-action-btn"
            style={{ textDecoration: "none", ...(pathname === "/receipt-settings" ? { background: "rgba(255, 255, 255, 0.35)", borderColor: "#fff" } : {}) }}
            title="Fiş Ayarları"
          >
            <span className="pos-side-action-btn__icon">🧾</span>
            <span className="pos-side-action-btn__label">Fiş Ayarları</span>
          </Link>
          <button 
            type="button"
            onClick={() => setShowPrinterSettings(true)} 
            className="pos-side-action-btn"
            title="Yazıcı Ayarları"
          >
            <span className="pos-side-action-btn__icon">🖨️</span>
            <span className="pos-side-action-btn__label">Yazıcılar</span>
          </button>
          <Link href="/login" className="pos-side-link pos-side-link--ghost">
            Çıkış
          </Link>
        </div>
      </aside>

      <div className="pos-main">{children}</div>
      <CallerIdOverlay />
      {showCallerIdSettings && <CallerIdSettingsModal onClose={() => setShowCallerIdSettings(false)} />}
      {showPrinterSettings && <PrinterSettingsModal onClose={() => setShowPrinterSettings(false)} />}

      {/* Yazdırma Hata / Uyarı Bildirimi */}
      {printerWarning && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            maxWidth: "420px",
            background: "#fff",
            border: "1px solid #fecaca",
            borderLeft: "5px solid #dc2626",
            borderRadius: "10px",
            padding: "0.85rem 1rem",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.15)",
            zIndex: 9999,
            display: "flex",
            alignItems: "flex-start",
            gap: "0.75rem",
          }}
        >
          <span style={{ fontSize: "1.2rem", lineHeight: 1 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#991b1b", marginBottom: "0.2rem" }}>
              Yazdırma Uyarısı
            </div>
            <div style={{ fontSize: "0.82rem", color: "#374151", lineHeight: 1.35 }}>
              {printerWarning}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: "0.25rem" }}>
              Siparişiniz sisteme kaydedildi. Fişi Paket Servis ekranından dilediğiniz zaman tekrar yazdırabilirsiniz.
            </div>
          </div>
          <button
            onClick={() => setPrinterWarning(null)}
            style={{
              background: "none",
              border: "none",
              color: "#9ca3af",
              fontSize: "1rem",
              cursor: "pointer",
              padding: "0 4px",
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

export function PosShell({ children }: { children: React.ReactNode }) {
  return (
    <BrandingProvider>
      <CallerIdProvider>
        <PosShellInner>{children}</PosShellInner>
      </CallerIdProvider>
    </BrandingProvider>
  );
}
