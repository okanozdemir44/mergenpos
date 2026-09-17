"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStaffSession } from "@/hooks/useStaffSession";

const NAV = [
  { href: "/salon", label: "Hızlı Satış", icon: "⚡" },
  { href: "/salon", label: "Paket (Kurye)", icon: "🛵" },
  { href: "/reports", label: "Rapor", icon: "📊" },
  { href: "/stock", label: "Menü Yönetimi", icon: "🗂️" },
] as const;

export function PosShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { staff } = useStaffSession();
  const hideShell = pathname.startsWith("/login");

  if (hideShell) {
    return <>{children}</>;
  }

  return (
    <div className="pos-app">
      <aside className="pos-sidebar">
        <div className="pos-brand">
          <span className="pos-brand__mark">M</span>
          <span className="pos-brand__text">Mergen</span>
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
          <Link href="/login" className="pos-side-link pos-side-link--ghost">
            Çıkış
          </Link>
        </div>
      </aside>

      <div className="pos-main">{children}</div>
    </div>
  );
}
