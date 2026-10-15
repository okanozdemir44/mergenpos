import { ManagerGate } from "@/components/auth/ManagerGate";
import { DetailedReportsPanel } from "@/components/reports/DetailedReportsPanel";

export const metadata = { title: "Detaylı Raporlar · Mergen POS" };

export default function DetailedReportsPage() {
  return (
    <main className="page-shell page-shell--wide">
      <ManagerGate next="/reports/detailed">
        <DetailedReportsPanel />
      </ManagerGate>
    </main>
  );
}
