import { Suspense } from "react";
import { ServiceOrderEntry } from "@/components/service/ServiceOrderEntry";

export const metadata = { title: "Yeni Sipariş · Mergen POS" };

export default function ServiceNewOrderPage() {
  return (
    <main className="page-shell page-shell--pos">
      <Suspense fallback={<p className="salon-muted" style={{ padding: "1rem" }}>Yükleniyor…</p>}>
        <ServiceOrderEntry />
      </Suspense>
    </main>
  );
}
