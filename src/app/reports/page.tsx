import { ManagerGate } from "@/components/auth/ManagerGate";
import { ReportsPanel } from "@/components/reports/ReportsPanel";

export const metadata = { title: "Raporlar · Mergen POS" };

export default function ReportsPage() {
  return (
    <main className="page-shell page-shell--wide">
      <ManagerGate>
        <ReportsPanel />
      </ManagerGate>
    </main>
  );
}
