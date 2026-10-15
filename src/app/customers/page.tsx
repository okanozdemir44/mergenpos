import { ManagerGate } from "@/components/auth/ManagerGate";
import { CustomersPanel } from "@/components/customers/CustomersPanel";

export const metadata = { title: "Müşterilerim · Mergen POS" };

export default function CustomersPage() {
  return (
    <main className="page-shell page-shell--wide">
      <ManagerGate next="/customers">
        <CustomersPanel />
      </ManagerGate>
    </main>
  );
}
