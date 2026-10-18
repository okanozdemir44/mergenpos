import fs from "fs";
import path from "path";
import { generateCashierReceiptHtml, generateKitchenReceiptHtml } from "../src/lib/receipt-generators";
import { DEFAULT_RECEIPT_SETTINGS, sanitizeReceiptSettings } from "../src/lib/receipt-settings";
import type { ThermalReceiptProps } from "../src/components/receipt/ThermalReceipt";

const sampleData: ThermalReceiptProps = {
  branchName: "SAMSUN / ÖKÜZ BURGER",
  receiptNo: "123456789",
  dateStr: "18.10.2026 19:30:00",
  cashierName: "Kasiyer 1",
  orderChannel: "GEL AL",
  orderNumber: 42,
  complimentText: "Afiyet Olsun.",
  total: 510,
  paymentMethod: "cash",
  paidAmount: 510,
  changeAmount: 0,
  items: [
    { name: "Öküz Burger Menü", quantity: 2, unitPrice: 220, totalPrice: 440, unit: "Tam", note: "Soğansız" },
    { name: "Patates Kızartması", quantity: 1, unitPrice: 70, totalPrice: 70, unit: "Porsiyon" },
  ],
};

function runTests() {
  console.log("=== FIŞ ŞABLONU VE KENAR BOŞLUKLARI BİRİM TESTİ BAŞLIYOR ===");

  // (a) Ayarsız Kasa Fişi Çağrısı (Snapshot Eşitliği)
  const htmlNoSettings = generateCashierReceiptHtml(sampleData);
  const snapshotPath = path.join(process.cwd(), "tmp", "fis-test.html");
  
  if (!fs.existsSync(snapshotPath)) {
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    fs.writeFileSync(snapshotPath, htmlNoSettings, "utf-8");
    console.log("[SNAPSHOT] Yeni snapshot oluşturuldu:", snapshotPath);
  }

  const existingSnapshot = fs.readFileSync(snapshotPath, "utf-8");

  if (htmlNoSettings === existingSnapshot) {
    console.log("✓ TEST 1 (a) GEÇTİ: generateCashierReceiptHtml() ayarsız çağrısı snapshot ile BİREBİR AYNI (byte-for-byte).");
  } else {
    console.error("✗ TEST 1 (a) BAŞARISIZ: Ayarsız çağrı snapshot ile uyuşmuyor!");
    console.error("Uzunluk farkı:", htmlNoSettings.length, "vs", existingSnapshot.length);
    process.exit(1);
  }

  // (a) Boş nesne ile çağrı
  const htmlEmptySettings = generateCashierReceiptHtml(sampleData, {} as any);
  if (htmlEmptySettings === existingSnapshot) {
    console.log("✓ TEST 2 (a) GEÇTİ: generateCashierReceiptHtml() boş ayar nesnesi ile çağrıldığında da snapshot ile BİREBİR AYNI.");
  } else {
    console.error("✗ TEST 2 (a) BAŞARISIZ: Boş ayar nesnesi varsayılan geriye dönük uyumluluğu korumadı!");
    process.exit(1);
  }

  // (a) Mutfak Fişi Ayarsız Çağrısı
  const kitchenNoSettings = generateKitchenReceiptHtml(sampleData);
  const kitchenEmptySettings = generateKitchenReceiptHtml(sampleData, {} as any);
  if (kitchenNoSettings === kitchenEmptySettings && kitchenNoSettings.includes("SİPARİŞ: 42") && kitchenNoSettings.includes("Öküz Burger Menü")) {
    console.log("✓ TEST 3 (a) GEÇTİ: generateKitchenReceiptHtml() ayarsız çağrısı ve boş ayar çağrısı birebir aynı.");
  } else {
    console.error("✗ TEST 3 (a) BAŞARISIZ: Mutfak fişi geriye dönük uyumluluk testi başarısız!");
    process.exit(1);
  }

  // (b) Boşluk / Ortala Ayarlı Çıktıda İlgili Stillerin Varlığı
  const customLayoutSettings = {
    ...DEFAULT_RECEIPT_SETTINGS,
    cashier: {
      ...DEFAULT_RECEIPT_SETTINGS.cashier,
      layout: {
        paddingLeftMm: 6,
        paddingRightMm: 8,
        contentWidthMm: 68,
        autoContentWidth: false,
        centerContent: true,
      },
    },
    kitchen: {
      ...DEFAULT_RECEIPT_SETTINGS.kitchen,
      layout: {
        paddingLeftMm: 4,
        paddingRightMm: 5,
        contentWidthMm: 72,
        autoContentWidth: false,
        centerContent: true,
      },
    },
  };

  const cashierCustomHtml = generateCashierReceiptHtml(sampleData, customLayoutSettings);
  const hasCashierMarginAuto = cashierCustomHtml.includes("margin: 0 auto;");
  const hasCashierPadding = cashierCustomHtml.includes("padding: 2mm 8mm 8mm 6mm;");
  const hasCashierWidth = cashierCustomHtml.includes("width: 68mm;");

  if (hasCashierMarginAuto && hasCashierPadding && hasCashierWidth) {
    console.log("✓ TEST 4 (b) GEÇTİ: Kasa fişi çıktısında özel boşluk (6mm sol, 8mm sağ), ortalama (margin: 0 auto) ve genişlik (68mm) stilleri mevcut.");
  } else {
    console.error("✗ TEST 4 (b) BAŞARISIZ: Kasa fişi layout stilleri doğru üretilemedi!");
    console.error({ hasCashierMarginAuto, hasCashierPadding, hasCashierWidth });
    process.exit(1);
  }

  const kitchenCustomHtml = generateKitchenReceiptHtml(sampleData, customLayoutSettings);
  const hasKitchenMarginAuto = kitchenCustomHtml.includes("margin: 0 auto;");
  const hasKitchenPadding = kitchenCustomHtml.includes("padding: 2mm 5mm 8mm 4mm;");
  const hasKitchenWidth = kitchenCustomHtml.includes("width: 72mm;");

  if (hasKitchenMarginAuto && hasKitchenPadding && hasKitchenWidth) {
    console.log("✓ TEST 5 (b) GEÇTİ: Mutfak fişi çıktısında özel boşluk (4mm sol, 5mm sağ), ortalama (margin: 0 auto) ve genişlik (72mm) stilleri mevcut.");
  } else {
    console.error("✗ TEST 5 (b) BAŞARISIZ: Mutfak fişi layout stilleri doğru üretilemedi!");
    console.error({ hasKitchenMarginAuto, hasKitchenPadding, hasKitchenWidth });
    process.exit(1);
  }

  // (c) Sınır Dışı Değerlerin Sınırlandırılması (Clamping)
  const outOfBoundsInput = {
    cashier: {
      layout: {
        paddingLeftMm: 999, // Max 10 olmalı
        paddingRightMm: -50, // Min 0 olmalı
        contentWidthMm: 150, // Max 80 olmalı
        autoContentWidth: false,
        centerContent: true,
      },
    },
    kitchen: {
      layout: {
        paddingLeftMm: -10, // Min 0 olmalı
        paddingRightMm: 100, // Max 10 olmalı
        contentWidthMm: 20, // Min 40 olmalı
        autoContentWidth: false,
        centerContent: false,
      },
    },
  };

  const sanitized = sanitizeReceiptSettings(outOfBoundsInput);
  const cLayout = sanitized.cashier.layout;
  const kLayout = sanitized.kitchen.layout;

  if (
    cLayout.paddingLeftMm === 10 &&
    cLayout.paddingRightMm === 0 &&
    cLayout.contentWidthMm === 80 &&
    kLayout.paddingLeftMm === 0 &&
    kLayout.paddingRightMm === 10 &&
    kLayout.contentWidthMm === 40
  ) {
    console.log("✓ TEST 6 (c) GEÇTİ: Sınır dışı kenar boşluğu ve genişlik değerleri başarıyla sınırlandırıldı (0-10mm boşluk, 40-80mm genişlik).");
  } else {
    console.error("✗ TEST 6 (c) BAŞARISIZ: Sınır dışı değerler doğru sınırlandırılamadı!", { cLayout, kLayout });
    process.exit(1);
  }

  // (d) XSS Koruması ve MERGEN TEKNOLOJİ sabitliği
  const xssSettings = {
    ...DEFAULT_RECEIPT_SETTINGS,
    cashier: {
      ...DEFAULT_RECEIPT_SETTINGS.cashier,
      header: {
        ...DEFAULT_RECEIPT_SETTINGS.cashier.header,
        customTitle: '<script>alert("hack")</script>Restoran',
      },
    },
  };
  const htmlXss = generateCashierReceiptHtml(sampleData, xssSettings);
  if (!htmlXss.includes("<script>") && htmlXss.includes("&lt;script&gt;") && htmlXss.includes("MERGEN TEKNOLOJİ")) {
    console.log("✓ TEST 7 GEÇTİ: XSS koruması aktif ve 'MERGEN TEKNOLOJİ' marka satırı sabit.");
  } else {
    console.error("✗ TEST 7 BAŞARISIZ: XSS veya marka satırı korunamadı!");
    process.exit(1);
  }

  console.log("=== TÜM TESTLER BAŞARIYLA TAMAMLANDI ===");
}

runTests();
