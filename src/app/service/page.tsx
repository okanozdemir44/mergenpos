import { Suspense } from "react";
import { ServiceKanban } from "@/components/service/ServiceKanban";

export const metadata = { title: "Gel-Al / Paket · Mergen POS" };

type Props = {
  searchParams: Promise<{ tab?: string }>;
};

export default async function ServicePage({ searchParams }: Props) {
  const { tab } = await searchParams;
  const orderType = tab === "delivery" ? "delivery" : "takeaway";

  return (
    <main className="page-shell page-shell--wide">
      <Suspense fallback={<p className="salon-muted">Yükleniyor…</p>}>
        <ServiceKanban orderType={orderType} />
      </Suspense>
    </main>
  );
}
