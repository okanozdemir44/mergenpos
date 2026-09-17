"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useStaffSession } from "@/hooks/useStaffSession";
import type { MenuCategory, MenuItem } from "@/types/pos";
import { formatTry } from "@/lib/money";

type ActivePanel = "categories" | "products";

type EditingProduct = {
  id: string;
  name: string;
  category_id: string;
  description: string;
  price: string;
  is_available: boolean;
} | null;

export function MenuManagementPanel() {
  const { staff } = useStaffSession();
  const [activePanel, setActivePanel] = useState<ActivePanel>("categories");

  // ── Categories State ───────────────────────────────────────────────────────
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [catLoading, setCatLoading] = useState(true);
  const [catError, setCatError] = useState<string | null>(null);
  const [catName, setCatName] = useState("");
  const [catSortOrder, setCatSortOrder] = useState("0");
  const [catSaving, setCatSaving] = useState(false);

  // ── Products State ─────────────────────────────────────────────────────────
  const [items, setItems] = useState<MenuItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingProduct>(null);

  // New product form
  const [newName, setNewName] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newSortOrder, setNewSortOrder] = useState("0");
  const [productSaving, setProductSaving] = useState(false);
  const [productError, setProductError] = useState<string | null>(null);

  // ── Data Loaders ───────────────────────────────────────────────────────────
  const loadCategories = useCallback(async () => {
    if (!staff) return;
    const supabase = createBrowserClient();
    setCatLoading(true);
    setCatError(null);
    const { data, error } = await supabase
      .from("menu_categories")
      .select("id, restaurant_id, name, sort_order")
      .eq("restaurant_id", staff.restaurant_id)
      .order("sort_order", { ascending: true });

    if (error) {
      setCatError(error.message);
    } else {
      setCategories((data ?? []) as MenuCategory[]);
    }
    setCatLoading(false);
  }, [staff]);

  const loadItems = useCallback(async () => {
    if (!staff) return;
    const supabase = createBrowserClient();
    setItemsLoading(true);
    setItemsError(null);
    const { data, error } = await supabase
      .from("menu_items")
      .select("id, restaurant_id, category_id, name, price, description, is_available, sort_order")
      .eq("restaurant_id", staff.restaurant_id)
      .order("sort_order", { ascending: true });

    if (error) {
      setItemsError(error.message);
    } else {
      setItems(
        ((data ?? []) as MenuItem[]).map((i) => ({ ...i, price: Number(i.price) })),
      );
    }
    setItemsLoading(false);
  }, [staff]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  // ── Category CRUD ──────────────────────────────────────────────────────────
  async function handleAddCategory(e: FormEvent) {
    e.preventDefault();
    if (!staff || !catName.trim()) return;
    const supabase = createBrowserClient();
    setCatSaving(true);
    setCatError(null);

    const optimisticCat: MenuCategory = {
      id: `temp-${Date.now()}`,
      restaurant_id: staff.restaurant_id,
      name: catName.trim(),
      sort_order: Number(catSortOrder) || 0,
    };

    // Optimistic UI
    setCategories((prev) => [...prev, optimisticCat].sort((a, b) => a.sort_order - b.sort_order));
    setCatName("");
    setCatSortOrder("0");

    const { data, error } = await supabase
      .from("menu_categories")
      .insert({
        restaurant_id: staff.restaurant_id,
        name: optimisticCat.name,
        sort_order: optimisticCat.sort_order,
      })
      .select("id, restaurant_id, name, sort_order")
      .single();

    if (error) {
      setCatError(error.message);
      // Revert optimistic update
      setCategories((prev) => prev.filter((c) => c.id !== optimisticCat.id));
    } else if (data) {
      // Replace temp entry with real one
      setCategories((prev) =>
        prev.map((c) => (c.id === optimisticCat.id ? (data as MenuCategory) : c)),
      );
    }
    setCatSaving(false);
  }

  async function handleDeleteCategory(catId: string) {
    if (!staff) return;
    const supabase = createBrowserClient();

    // Check if any items exist
    const itemCount = items.filter((i) => i.category_id === catId).length;
    if (itemCount > 0) {
      setCatError(`Bu kategoride ${itemCount} ürün var. Önce ürünleri silin veya başka kategoriye taşıyın.`);
      return;
    }

    // Optimistic UI
    setCategories((prev) => prev.filter((c) => c.id !== catId));
    const { error } = await supabase
      .from("menu_categories")
      .delete()
      .eq("id", catId)
      .eq("restaurant_id", staff.restaurant_id);

    if (error) {
      setCatError(error.message);
      void loadCategories(); // Revert
    }
  }

  // ── Product CRUD ───────────────────────────────────────────────────────────
  async function handleAddProduct(e: FormEvent) {
    e.preventDefault();
    if (!staff || !newName.trim() || !newCategoryId || !newPrice) return;
    const supabase = createBrowserClient();
    setProductSaving(true);
    setProductError(null);

    const optimisticItem: MenuItem = {
      id: `temp-${Date.now()}`,
      restaurant_id: staff.restaurant_id,
      category_id: newCategoryId,
      name: newName.trim(),
      description: newDescription.trim() || null,
      price: Number(newPrice),
      is_available: true,
      sort_order: Number(newSortOrder) || 0,
    };

    // Optimistic UI
    setItems((prev) => [...prev, optimisticItem]);
    setNewName("");
    setNewDescription("");
    setNewPrice("");
    setNewSortOrder("0");

    const { data, error } = await supabase
      .from("menu_items")
      .insert({
        restaurant_id: staff.restaurant_id,
        category_id: optimisticItem.category_id,
        name: optimisticItem.name,
        description: optimisticItem.description,
        price: optimisticItem.price,
        is_available: true,
        sort_order: optimisticItem.sort_order,
      })
      .select("id, restaurant_id, category_id, name, price, description, is_available, sort_order")
      .single();

    if (error) {
      setProductError(error.message);
      setItems((prev) => prev.filter((i) => i.id !== optimisticItem.id));
    } else if (data) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === optimisticItem.id ? { ...(data as MenuItem), price: Number((data as MenuItem).price) } : i,
        ),
      );
    }
    setProductSaving(false);
  }

  async function handleToggleAvailable(item: MenuItem) {
    if (!staff) return;
    const supabase = createBrowserClient();
    const next = !item.is_available;

    // Optimistic UI
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_available: next } : i)));

    const { error } = await supabase
      .from("menu_items")
      .update({ is_available: next })
      .eq("id", item.id)
      .eq("restaurant_id", staff.restaurant_id);

    if (error) {
      setItemsError(error.message);
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_available: item.is_available } : i)));
    }
  }

  async function handleDeleteProduct(itemId: string) {
    if (!staff) return;
    const supabase = createBrowserClient();

    // Optimistic UI
    setItems((prev) => prev.filter((i) => i.id !== itemId));

    const { error } = await supabase
      .from("menu_items")
      .delete()
      .eq("id", itemId)
      .eq("restaurant_id", staff.restaurant_id);

    if (error) {
      setItemsError(error.message);
      void loadItems(); // Revert
    }
  }

  async function handleSaveEdit() {
    if (!staff || !editing) return;
    const supabase = createBrowserClient();
    setProductSaving(true);

    const patch = {
      name: editing.name.trim(),
      category_id: editing.category_id,
      description: editing.description.trim() || null,
      price: Number(editing.price),
      is_available: editing.is_available,
    };

    // Optimistic UI
    setItems((prev) =>
      prev.map((i) => (i.id === editing.id ? { ...i, ...patch, price: Number(patch.price) } : i)),
    );
    setEditing(null);

    const { error } = await supabase
      .from("menu_items")
      .update(patch)
      .eq("id", editing.id)
      .eq("restaurant_id", staff.restaurant_id);

    if (error) {
      setProductError(error.message);
      void loadItems(); // Revert
    }
    setProductSaving(false);
  }

  // ── Category name lookup ───────────────────────────────────────────────────
  function catName_(catId: string) {
    return categories.find((c) => c.id === catId)?.name ?? "?";
  }

  return (
    <div className="menu-mgmt">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <header className="salon-header">
        <div>
          <p className="salon-kicker">Öküz Burger · Yönetim Paneli</p>
          <h1 className="salon-title">Menü &amp; Kategori Yönetimi</h1>
          <p className="salon-muted">
            Burada eklediğiniz kategori ve ürünler anında Kasa ekranına yansır.
          </p>
        </div>
      </header>

      {/* ── Tab Switcher ─────────────────────────────────────────────── */}
      <div className="menu-mgmt__tabs">
        <button
          type="button"
          className={`menu-mgmt__tab${activePanel === "categories" ? " menu-mgmt__tab--active" : ""}`}
          onClick={() => setActivePanel("categories")}
        >
          🗂️ Kategoriler
        </button>
        <button
          type="button"
          className={`menu-mgmt__tab${activePanel === "products" ? " menu-mgmt__tab--active" : ""}`}
          onClick={() => setActivePanel("products")}
        >
          🍔 Ürünler
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* KATEGORİ PANELİ                                               */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {activePanel === "categories" && (
        <div className="menu-mgmt__body">
          {/* Add Category Form */}
          <div className="menu-mgmt__card">
            <h2 className="menu-mgmt__card-title">Yeni Kategori Ekle</h2>
            <form className="menu-mgmt__form" onSubmit={handleAddCategory}>
              <div className="menu-mgmt__field">
                <label className="menu-mgmt__label">Kategori Adı *</label>
                <input
                  className="login-input"
                  placeholder='örn. "Burgerler", "İçecekler", "Yan Ürünler"'
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  required
                />
              </div>
              <div className="menu-mgmt__field" style={{ flex: "0 0 140px" }}>
                <label className="menu-mgmt__label">Sıra No</label>
                <input
                  className="login-input"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={catSortOrder}
                  onChange={(e) => setCatSortOrder(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className="login-button"
                style={{ marginTop: "auto", flexShrink: 0 }}
                disabled={catSaving || !catName.trim()}
              >
                {catSaving ? "Kaydediliyor…" : "Kategori Ekle"}
              </button>
            </form>
            {catError && (
              <div className="salon-banner salon-banner--error" style={{ marginTop: "0.75rem" }}>
                {catError}
              </div>
            )}
          </div>

          {/* Category List */}
          <div className="menu-mgmt__card" style={{ marginTop: "1rem" }}>
            <h2 className="menu-mgmt__card-title">
              Mevcut Kategoriler
              <span className="menu-mgmt__badge">{categories.length}</span>
            </h2>

            {catLoading ? (
              <p className="salon-muted">Yükleniyor…</p>
            ) : categories.length === 0 ? (
              <p className="salon-muted" style={{ padding: "1rem 0" }}>
                Henüz kategori yok. Yukarıdaki formdan ilk kategoriyi ekleyin.
              </p>
            ) : (
              <div className="menu-mgmt__list">
                {categories.map((cat) => {
                  const productCount = items.filter((i) => i.category_id === cat.id).length;
                  return (
                    <div key={cat.id} className="menu-mgmt__list-row">
                      <div className="menu-mgmt__list-row__info">
                        <strong>{cat.name}</strong>
                        <span className="salon-muted" style={{ fontSize: "0.82rem" }}>
                          Sıra: {cat.sort_order} · {productCount} ürün
                        </span>
                      </div>
                      <button
                        type="button"
                        className="menu-mgmt__delete-btn"
                        onClick={() => void handleDeleteCategory(cat.id)}
                        title="Kategoriyi sil"
                      >
                        🗑️ Sil
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* ÜRÜN PANELİ                                                   */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {activePanel === "products" && (
        <div className="menu-mgmt__body">
          {/* Add Product Form */}
          <div className="menu-mgmt__card">
            <h2 className="menu-mgmt__card-title">Yeni Ürün Ekle</h2>

            {categories.length === 0 ? (
              <div className="salon-banner" style={{ background: "#fef3c7", border: "1px solid #fbbf24" }}>
                <strong>⚠️ Önce bir kategori ekleyin.</strong>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem" }}>
                  Ürün ekleyebilmek için en az bir kategori gerekli.
                </p>
              </div>
            ) : (
              <form className="menu-mgmt__product-form" onSubmit={handleAddProduct}>
                <div className="menu-mgmt__product-form__row">
                  <div className="menu-mgmt__field" style={{ flex: 2 }}>
                    <label className="menu-mgmt__label">Ürün Adı *</label>
                    <input
                      className="login-input"
                      placeholder='örn. "Öküz Burger", "Ayran"'
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="menu-mgmt__field" style={{ flex: 1 }}>
                    <label className="menu-mgmt__label">Kategori *</label>
                    <select
                      className="login-input"
                      value={newCategoryId}
                      onChange={(e) => setNewCategoryId(e.target.value)}
                      required
                    >
                      <option value="">— Seçin —</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="menu-mgmt__field" style={{ flex: "0 0 120px" }}>
                    <label className="menu-mgmt__label">Fiyat (₺) *</label>
                    <input
                      className="login-input"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={newPrice}
                      onChange={(e) => setNewPrice(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="menu-mgmt__product-form__row">
                  <div className="menu-mgmt__field" style={{ flex: 3 }}>
                    <label className="menu-mgmt__label">İçerik / Not</label>
                    <input
                      className="login-input"
                      placeholder='örn. "Çift köfte, kaşar, özel sos, turşu"'
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                    />
                  </div>
                  <div className="menu-mgmt__field" style={{ flex: "0 0 120px" }}>
                    <label className="menu-mgmt__label">Sıra No</label>
                    <input
                      className="login-input"
                      type="number"
                      min="0"
                      placeholder="0"
                      value={newSortOrder}
                      onChange={(e) => setNewSortOrder(e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    className="login-button"
                    style={{ marginTop: "auto", flexShrink: 0 }}
                    disabled={productSaving || !newName.trim() || !newCategoryId || !newPrice}
                  >
                    {productSaving ? "Kaydediliyor…" : "Ürün Ekle"}
                  </button>
                </div>
                {productError && (
                  <div className="salon-banner salon-banner--error" style={{ marginTop: "0.75rem" }}>
                    {productError}
                  </div>
                )}
              </form>
            )}
          </div>

          {/* Product List */}
          <div className="menu-mgmt__card" style={{ marginTop: "1rem" }}>
            <h2 className="menu-mgmt__card-title">
              Ürün Listesi
              <span className="menu-mgmt__badge">{items.length}</span>
            </h2>

            {itemsLoading ? (
              <p className="salon-muted">Yükleniyor…</p>
            ) : items.length === 0 ? (
              <p className="salon-muted" style={{ padding: "1rem 0" }}>
                Henüz ürün yok. Yukarıdaki formdan ilk ürünü ekleyin.
              </p>
            ) : (
              <div className="menu-mgmt__list">
                {/* Group by category */}
                {categories
                  .filter((cat) => items.some((i) => i.category_id === cat.id))
                  .map((cat) => (
                    <div key={cat.id} className="menu-mgmt__cat-group">
                      <div className="menu-mgmt__cat-group__header">{cat.name}</div>
                      {items
                        .filter((i) => i.category_id === cat.id)
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map((item) =>
                          editing?.id === item.id ? (
                            /* ── Edit Row ── */
                            <div key={item.id} className="menu-mgmt__edit-row">
                              <div className="menu-mgmt__edit-row__fields">
                                <input
                                  className="login-input"
                                  placeholder="Ürün adı"
                                  value={editing.name}
                                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                                />
                                <select
                                  className="login-input"
                                  value={editing.category_id}
                                  onChange={(e) => setEditing({ ...editing, category_id: e.target.value })}
                                >
                                  {categories.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  className="login-input"
                                  placeholder="İçerik / Not"
                                  value={editing.description}
                                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                                />
                                <input
                                  className="login-input"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder="Fiyat"
                                  value={editing.price}
                                  onChange={(e) => setEditing({ ...editing, price: e.target.value })}
                                />
                              </div>
                              <div className="menu-mgmt__edit-row__actions">
                                <button
                                  type="button"
                                  className="login-button"
                                  style={{ marginTop: 0, padding: "0.5rem 0.9rem" }}
                                  disabled={productSaving}
                                  onClick={() => void handleSaveEdit()}
                                >
                                  ✔ Kaydet
                                </button>
                                <button
                                  type="button"
                                  className="ghost-btn"
                                  onClick={() => setEditing(null)}
                                >
                                  İptal
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* ── Normal Row ── */
                            <div key={item.id} className="menu-mgmt__list-row">
                              <div className="menu-mgmt__list-row__info">
                                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                  <span
                                    className={`menu-mgmt__avail-dot ${item.is_available ? "menu-mgmt__avail-dot--on" : "menu-mgmt__avail-dot--off"}`}
                                    title={item.is_available ? "Aktif" : "Pasif"}
                                  />
                                  <strong>{item.name}</strong>
                                  <span className="menu-mgmt__price-badge">
                                    {formatTry(item.price)}
                                  </span>
                                </div>
                                {item.description && (
                                  <span className="salon-muted" style={{ fontSize: "0.82rem" }}>
                                    {item.description}
                                  </span>
                                )}
                              </div>
                              <div className="menu-mgmt__list-row__actions">
                                <button
                                  type="button"
                                  className={`menu-mgmt__toggle-btn ${item.is_available ? "menu-mgmt__toggle-btn--active" : "menu-mgmt__toggle-btn--inactive"}`}
                                  onClick={() => void handleToggleAvailable(item)}
                                  title={item.is_available ? "Pasife al (kasada gizle)" : "Aktife al (kasada göster)"}
                                >
                                  {item.is_available ? "✓ Aktif" : "✗ Pasif"}
                                </button>
                                <button
                                  type="button"
                                  className="menu-mgmt__edit-btn"
                                  onClick={() =>
                                    setEditing({
                                      id: item.id,
                                      name: item.name,
                                      category_id: item.category_id,
                                      description: item.description ?? "",
                                      price: String(item.price),
                                      is_available: item.is_available,
                                    })
                                  }
                                >
                                  ✏️ Düzenle
                                </button>
                                <button
                                  type="button"
                                  className="menu-mgmt__delete-btn"
                                  onClick={() => void handleDeleteProduct(item.id)}
                                  title="Ürünü sil"
                                >
                                  🗑️ Sil
                                </button>
                              </div>
                            </div>
                          ),
                        )}
                    </div>
                  ))}
                {/* Uncategorised (orphan) items */}
                {items
                  .filter((i) => !categories.some((c) => c.id === i.category_id))
                  .map((item) => (
                    <div key={item.id} className="menu-mgmt__list-row">
                      <div className="menu-mgmt__list-row__info">
                        <strong>{item.name}</strong>{" "}
                        <span className="salon-muted">(Kategorisiz)</span>
                      </div>
                      <button
                        type="button"
                        className="menu-mgmt__delete-btn"
                        onClick={() => void handleDeleteProduct(item.id)}
                      >
                        🗑️ Sil
                      </button>
                    </div>
                  ))}
              </div>
            )}
            {itemsError && (
              <div className="salon-banner salon-banner--error" style={{ marginTop: "0.75rem" }}>
                {itemsError}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
