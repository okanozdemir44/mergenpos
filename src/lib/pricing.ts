import type { CartLine, CartOrderType, MenuItem } from "@/types/pos";

/**
 * Aktif sipariş tipine ('STORE' | 'DELIVERY') göre ürünün birim fiyatını döndürür.
 * - 'DELIVERY': price_delivery tanımlıysa (null/undefined değilse) kullanılır; aksi halde price_store / price kullanılır.
 * - 'STORE': price_store (veya price) kullanılır.
 */
export function getMenuItemPrice(
  item: { price: number; price_store?: number; price_delivery?: number | null },
  orderType: CartOrderType = "STORE"
): number {
  if (orderType === "DELIVERY") {
    if (item.price_delivery !== null && item.price_delivery !== undefined) {
      return Number(item.price_delivery);
    }
  }
  return Number(item.price_store ?? item.price);
}

/**
 * Sepetteki halihazırdaki ürünlerin birim fiyatlarını yeni sipariş tipine ('STORE' | 'DELIVERY') göre
 * anında günceller ve güncel sepet dizisini döndürür.
 */
export function recalculateCartPrices(
  cart: CartLine[],
  menuItems: MenuItem[],
  orderType: CartOrderType
): CartLine[] {
  if (!cart.length) return [];
  const itemMap = new Map<string, MenuItem>(menuItems.map((item) => [item.id, item]));

  return cart.map((line) => {
    const item = itemMap.get(line.menuItemId);
    if (!item) return line;

    const unitPrice = getMenuItemPrice(item, orderType);
    return {
      ...line,
      unitPrice,
    };
  });
}

/**
 * Sepetin güncel toplam tutarını hesaplar.
 */
export function calculateCartTotal(cart: CartLine[]): number {
  return cart.reduce((sum, line) => sum + Number(line.unitPrice) * line.quantity, 0);
}

