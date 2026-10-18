import { ReceiptSettingsView } from "@/components/settings/ReceiptSettingsView";

export const metadata = { title: "Fiş Ayarları · Mergen POS" };

export default function ReceiptSettingsPage() {
  return (
    <main className="page-shell page-shell--wide">
      <ReceiptSettingsView />
    </main>
  );
}
