"use client";

import type { KitchenTicket, OrderItemStatus } from "@/types/pos";
import { ORDER_ITEM_STATUS_LABEL } from "@/types/pos";

type Props = {
  ticket: KitchenTicket;
  busy: boolean;
  onSetStatus: (id: string, status: OrderItemStatus) => void;
};

function ageLabel(iso: string) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "az önce";
  return `${mins} dk`;
}

export function KitchenTicketCard({ ticket, busy, onSetStatus }: Props) {
  return (
    <article className={`kds-card kds-card--${ticket.status}`}>
      <header className="kds-card__head">
        <div>
          <p className="kds-card__table">{ticket.table_name ?? ticket.order_type}</p>
          <p className="kds-card__meta">
            {ORDER_ITEM_STATUS_LABEL[ticket.status]} · {ageLabel(ticket.order_created_at)}
          </p>
        </div>
        <span className="kds-card__qty">×{ticket.quantity}</span>
      </header>

      <h2 className="kds-card__item">{ticket.item_name}</h2>

      {ticket.note ? <p className="kds-card__note">Not: {ticket.note}</p> : null}

      <div className="kds-card__actions">
        <button
          type="button"
          className="kds-btn kds-btn--preparing"
          disabled={busy || ticket.status === "preparing"}
          onClick={(e) => {
            e.preventDefault();
            onSetStatus(ticket.id, "preparing");
          }}
        >
          Hazırlanıyor
        </button>
        <button
          type="button"
          className="kds-btn kds-btn--ready"
          disabled={busy}
          onClick={(e) => {
            e.preventDefault();
            onSetStatus(ticket.id, "ready");
          }}
        >
          Hazır
        </button>
      </div>
    </article>
  );
}
