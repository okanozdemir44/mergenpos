"use client";

import { useMemo, useState } from "react";
import type { MenuCategory, MenuItem } from "@/types/pos";
import { formatTry } from "@/lib/money";

type Props = {
  categories: MenuCategory[];
  items: MenuItem[];
  onAdd: (item: MenuItem) => void;
};

export function MenuPanel({ categories, items, onAdd }: Props) {
  const [activeCategoryId, setActiveCategoryId] = useState<string | "all">("all");

  const filtered = useMemo(() => {
    const available = items.filter((i) => i.is_available);
    if (activeCategoryId === "all") return available;
    return available.filter((i) => i.category_id === activeCategoryId);
  }, [items, activeCategoryId]);

  const grouped = useMemo(() => {
    const byCat = new Map<string, MenuItem[]>();
    for (const item of filtered) {
      const list = byCat.get(item.category_id) ?? [];
      list.push(item);
      byCat.set(item.category_id, list);
    }
    return categories
      .filter((c) => byCat.has(c.id))
      .map((c) => ({
        category: c,
        items: (byCat.get(c.id) ?? []).sort((a, b) => a.sort_order - b.sort_order),
      }));
  }, [categories, filtered]);

  return (
    <>
      <div className="order-tabs" role="tablist" aria-label="Menü kategorileri">
        <button
          type="button"
          role="tab"
          aria-selected={activeCategoryId === "all"}
          className={`order-tab ${activeCategoryId === "all" ? "order-tab--active" : ""}`}
          onClick={() => setActiveCategoryId("all")}
        >
          Tümü
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={activeCategoryId === c.id}
            className={`order-tab ${activeCategoryId === c.id ? "order-tab--active" : ""}`}
            onClick={() => setActiveCategoryId(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="order-menu-body">
        {grouped.length === 0 ? (
          <p className="salon-muted">Bu kategoride ürün yok.</p>
        ) : (
          grouped.map(({ category, items: catItems }) => (
            <div key={category.id} className="order-category-block">
              <h2 className="order-category-title">{category.name}</h2>
              <div className="order-item-grid">
                {catItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="order-item-card"
                    onClick={() => onAdd(item)}
                  >
                    <span className="order-item-card__name">{item.name}</span>
                    {item.description && (
                      <span className="order-item-card__desc">{item.description}</span>
                    )}
                    <span className="order-item-card__price">{formatTry(Number(item.price))}</span>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
