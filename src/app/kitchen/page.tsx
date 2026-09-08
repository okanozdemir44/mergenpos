import { KitchenBoard } from "@/components/kitchen/KitchenBoard";

export const metadata = {
  title: "Mutfak · Mergen POS",
};

export default function KitchenPage() {
  return (
    <main className="page-shell page-shell--wide">
      <KitchenBoard />
    </main>
  );
}
