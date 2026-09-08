import { ManagerGate } from "@/components/auth/ManagerGate";
import { StockPanel } from "@/components/stock/StockPanel";

export const metadata = { title: "Stok · Mergen POS" };

export default function StockPage() {
  return (
    <main className="page-shell page-shell--wide">
      <ManagerGate next="/stock">
        <StockPanel />
      </ManagerGate>
    </main>
  );
}
