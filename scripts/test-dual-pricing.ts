import { getMenuItemPrice, recalculateCartPrices, calculateCartTotal } from "../src/lib/pricing";
import { generateCashierReceiptHtml, generateKitchenReceiptHtml } from "../src/lib/receipt-generators";
import type { CartLine, MenuItem } from "../src/types/pos";
import type { ThermalReceiptProps } from "../src/components/receipt/ThermalReceipt";

function runTests() {
  console.log("=== ÇİFT FİYATLANDIRMA (DUAL-PRICING) TESTLERİ BAŞLIYOR ===");

  const menuItems: MenuItem[] = [
    {
      id: "item-1",
      restaurant_id: "rest-1",
      category_id: "cat-1",
      name: "Öküz Burger",
      price: 150,
      price_store: 150,
      price_delivery: 180,
      description: null,
      is_available: true,
      sort_order: 1,
    },
    {
      id: "item-2",
      restaurant_id: "rest-1",
      category_id: "cat-1",
      name: "Patates Kızartması",
      price: 60,
      price_store: 60,
      price_delivery: null, // Fallback to store price
      description: null,
      is_available: true,
      sort_order: 2,
    },
  ];

  // 1. Test getMenuItemPrice
  const burgerStorePrice = getMenuItemPrice(menuItems[0], "STORE");
  const burgerDeliveryPrice = getMenuItemPrice(menuItems[0], "DELIVERY");
  if (burgerStorePrice === 150 && burgerDeliveryPrice === 180) {
    console.log("✓ TEST 1 GEÇTİ: getMenuItemPrice() tezgah için 150 TL, paket için 180 TL döndürdü.");
  } else {
    console.error("✗ TEST 1 BAŞARISIZ:", { burgerStorePrice, burgerDeliveryPrice });
    process.exit(1);
  }

  // Fallback test
  const friesStorePrice = getMenuItemPrice(menuItems[1], "STORE");
  const friesDeliveryPrice = getMenuItemPrice(menuItems[1], "DELIVERY");
  if (friesStorePrice === 60 && friesDeliveryPrice === 60) {
    console.log("✓ TEST 2 GEÇTİ: getMenuItemPrice() paket fiyatı null olduğunda güvenle tezgah fiyatına fallback yaptı.");
  } else {
    console.error("✗ TEST 2 BAŞARISIZ:", { friesStorePrice, friesDeliveryPrice });
    process.exit(1);
  }

  // 2. Test recalculateCartPrices
  const initialCart: CartLine[] = [
    {
      key: "line-1",
      menuItemId: "item-1",
      name: "Öküz Burger",
      unitPrice: 150,
      quantity: 2,
      note: "",
    },
    {
      key: "line-2",
      menuItemId: "item-2",
      name: "Patates Kızartması",
      unitPrice: 60,
      quantity: 1,
      note: "Az tuzlu",
    },
  ];

  const initialTotal = calculateCartTotal(initialCart);
  if (initialTotal === 360) {
    console.log("✓ TEST 3 GEÇTİ: Tezgah sepet toplamı doğru hesaplandı (2x150 + 1x60 = 360 TL).");
  } else {
    console.error("✗ TEST 3 BAŞARISIZ: Toplam", initialTotal);
    process.exit(1);
  }

  // Mod Değişimi: STORE -> DELIVERY
  const deliveryCart = recalculateCartPrices(initialCart, menuItems, "DELIVERY");
  const deliveryTotal = calculateCartTotal(deliveryCart);
  if (
    deliveryCart[0].unitPrice === 180 &&
    deliveryCart[1].unitPrice === 60 &&
    deliveryTotal === 420
  ) {
    console.log("✓ TEST 4 GEÇTİ: recalculateCartPrices() tüm sepet kalemlerini anında paket fiyatlarına güncelledi (Toplam 360 -> 420 TL).");
  } else {
    console.error("✗ TEST 4 BAŞARISIZ:", { deliveryCart, deliveryTotal });
    process.exit(1);
  }

  // Mod Değişimi: DELIVERY -> STORE
  const revertedCart = recalculateCartPrices(deliveryCart, menuItems, "STORE");
  const revertedTotal = calculateCartTotal(revertedCart);
  if (
    revertedCart[0].unitPrice === 150 &&
    revertedCart[1].unitPrice === 60 &&
    revertedTotal === 360
  ) {
    console.log("✓ TEST 5 GEÇTİ: recalculateCartPrices() tekrar tezgah moduna dönüldüğünde fiyatları eksiksiz geri yükledi (420 -> 360 TL).");
  } else {
    console.error("✗ TEST 5 BAŞARISIZ:", { revertedCart, revertedTotal });
    process.exit(1);
  }

  // 3. Fiş / Adisyon Çıktısı Testi
  const sampleDeliveryReceipt: ThermalReceiptProps = {
    branchName: "ÖKÜZ BURGER",
    receiptNo: "998877665",
    dateStr: "08.11.2026 21:00",
    cashierName: "Kasiyer 1",
    orderChannel: "PAKET",
    orderType: "DELIVERY",
    orderNumber: 15,
    items: [
      { name: "Öküz Burger", quantity: 2, unitPrice: 180, totalPrice: 360 },
      { name: "Patates Kızartması", quantity: 1, unitPrice: 60, totalPrice: 60 },
    ],
    total: 420,
    paymentMethod: "cash",
  };

  const cashierHtml = generateCashierReceiptHtml(sampleDeliveryReceipt);
  const kitchenHtml = generateKitchenReceiptHtml(sampleDeliveryReceipt);

  if (cashierHtml.includes("PAKET SERVİS") && kitchenHtml.includes("PAKET SERVİS")) {
    console.log("✓ TEST 6 GEÇTİ: Hem kasa hem mutfak adisyonu en üstünde 'PAKET SERVİS' ibaresini belirgin şekilde içeriyor.");
  } else {
    console.error("✗ TEST 6 BAŞARISIZ: Adisyonda PAKET SERVİS ibaresi bulunamadı!");
    process.exit(1);
  }

  const sampleStoreReceipt: ThermalReceiptProps = {
    ...sampleDeliveryReceipt,
    orderChannel: "TEZGAH",
    orderType: "STORE",
  };
  const storeHtml = generateCashierReceiptHtml(sampleStoreReceipt);
  if (!storeHtml.includes("*** PAKET SERVİS ***")) {
    console.log("✓ TEST 7 GEÇTİ: Tezgah fişinde 'PAKET SERVİS' üst ibaresi basılmıyor.");
  } else {
    console.error("✗ TEST 7 BAŞARISIZ: Tezgah fişinde paket ibaresi çıktı!");
    process.exit(1);
  }

  console.log("=== TÜM ÇİFT FİYATLANDIRMA TESTLERİ BAŞARIYLA GEÇTİ ===");
}

runTests();

