import { Suspense } from "react";
import { ServiceKanban } from "@/components/service/ServiceKanban";

export const metadata = { title: "Paket Servis (Kurye) · Mergen POS" };

export default function ServicePage() {
  return (
    <main className="page-shell page-shell--wide">
      <Suspense fallback={<p className="salon-muted">Yükleniyor…</p>}>
        <ServiceKanban orderType="delivery" />
      </Suspense>
    </main>
  );
}
