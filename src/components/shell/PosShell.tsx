"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStaffSession } from "@/hooks/useStaffSession";
import { useRestaurantFeatures } from "@/hooks/useRestaurantFeatures";
import { useState } from "react";
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
            onClick={() => setShowCallerIdSettings(true)} 
            className="pos-side-link pos-side-link--ghost"
            style={{ textAlign: "left", width: "100%", cursor: "pointer", border: "none", background: "none" }}
          >
            📞 Caller ID
          </button>
          <button 
            onClick={() => setShowPrinterSettings(true)} 
            className="pos-side-link pos-side-link--ghost"
            style={{ textAlign: "left", width: "100%", cursor: "pointer", border: "none", background: "none" }}
          >
            🖨️ Yazıcılar
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
