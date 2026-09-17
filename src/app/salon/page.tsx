import { SalonFloor } from "@/components/salon/SalonFloor";

export const metadata = { title: "Hızlı Satış · Mergen POS" };

export default function SalonPage() {
  return (
    <main className="page-shell page-shell--pos">
      <SalonFloor />
    </main>
  );
}
