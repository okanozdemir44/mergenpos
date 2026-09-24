"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStaffSession } from "@/hooks/useStaffSession";

import { useState } from "react";
import PrinterSettingsModal from "../settings/PrinterSettingsModal";

const NAV = [
  { href: "/salon", label: "Hızlı Satış", icon: "⚡" },
  { href: "/salon", label: "Paket (Kurye)", icon: "🛵" },
  { href: "/reports", label: "Rapor", icon: "📊" },
  { href: "/stock", label: "Menü Yönetimi", icon: "🗂️" },
] as const;

export function PosShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { staff } = useStaffSession();
  const [showPrinterSettings, setShowPrinterSettings] = useState(false);
  const hideShell = pathname.startsWith("/login");

  if (hideShell) {
    return <>{children}</>;
  }

  return (
    <div className="pos-app">
      <aside className="pos-sidebar">
        <div className="pos-brand" style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "0.5rem" }}>
          <img src="/logo.png" alt="Öküz Burger" style={{ maxWidth: "100%", height: "auto", objectFit: "contain", filter: "drop-shadow(0 2px 4px rgba(245, 158, 11, 0.2))" }} />
        </div>

        <nav className="pos-side-nav">
          {NAV.map((item) => {
            const matchPath = "match" in item ? item.match : item.href;
            const active =
              pathname === matchPath ||
              pathname.startsWith(`${matchPath}/`) ||
              (matchPath === "/service" && pathname.startsWith("/service"));
            // Gel Al vs Paket: both match /service — highlight both when on service; refine with search later
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
      {showPrinterSettings && <PrinterSettingsModal onClose={() => setShowPrinterSettings(false)} />}
    </div>
  );
}
