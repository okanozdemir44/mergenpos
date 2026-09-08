"use client";

import Link from "next/link";
import type { RestaurantTable } from "@/types/pos";
import { TABLE_STATUS_LABEL } from "@/types/pos";

const STATUS_CLASS: Record<RestaurantTable["status"], string> = {
  empty: "table-card--empty",
  occupied: "table-card--occupied",
};

export function TableCard({ table }: { table: RestaurantTable }) {
  return (
    <Link
      href={`/orders/${table.id}`}
      className={`table-card ${STATUS_CLASS[table.status]}`}
      aria-label={`${table.name}, ${TABLE_STATUS_LABEL[table.status]}`}
    >
      <span className="table-card__name">{table.name}</span>
      <span className="table-card__status">{TABLE_STATUS_LABEL[table.status]}</span>
    </Link>
  );
}
