import { OrderEntryScreen } from "@/components/orders/OrderEntryScreen";

type Props = { params: Promise<{ tableId: string }> };

export default async function OrderPage({ params }: Props) {
  const { tableId } = await params;
  return (
    <main className="page-shell page-shell--pos">
      <OrderEntryScreen tableId={tableId} />
    </main>
  );
}
