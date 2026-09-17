"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useStaffSession } from "@/hooks/useStaffSession";

export function ManagerGate({
  children,
  next = "/reports",
}: {
  children: ReactNode;
  next?: string;
}) {
  const router = useRouter();
  const { loading, staff, error, userId } = useStaffSession();

  useEffect(() => {
    if (loading) return;
    if (!userId) router.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [loading, userId, router, next]);

  if (loading) return <p className="salon-muted">Yetki kontrol ediliyor…</p>;
  if (!userId) return <p className="salon-muted">Giriş sayfasına yönlendiriliyor…</p>;
  if (error || !staff) {
    return (
      <div className="salon-banner salon-banner--error">
        <p>{error ?? "Personel kaydı yok"}</p>
      </div>
    );
  }
  // Tüm personeller erişebilir (role kontrolü kaldırıldı)

  return <>{children}</>;
}
