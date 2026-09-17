import { ManagerGate } from "@/components/auth/ManagerGate";
import { MenuManagementPanel } from "@/components/stock/MenuManagementPanel";

export const metadata = { title: "Menü Yönetimi · Mergen POS" };

export default function StockPage() {
  return (
    <main className="page-shell page-shell--wide">
      <ManagerGate next="/stock">
        <MenuManagementPanel />
      </ManagerGate>
    </main>
  );
}
