import { SalonFloor } from "@/components/salon/SalonFloor";

export const metadata = { title: "Salon · Mergen POS" };

export default function SalonPage() {
  return (
    <main className="page-shell page-shell--wide">
      <SalonFloor />
    </main>
  );
}
