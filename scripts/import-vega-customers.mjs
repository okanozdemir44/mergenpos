import fs from "node:fs";
import path from "node:path";

/**
 * Normalizes phone number exactly matching src/lib/phone.ts:
 * 1. Keep only digits
 * 2. Strip country codes (0090 or 90 with length > 10)
 * 3. Strip leading 0
 * 4. Must be exactly 10 digits
 */
export function normalizePhone(rawNumber) {
  if (!rawNumber) return null;

  // 1. Sadece rakamları bırak
  let cleaned = String(rawNumber).replace(/\D/g, "");

  // 2. Ülke kodlarını (90 veya 0090) baştan sil
  if (cleaned.startsWith("0090")) {
    cleaned = cleaned.substring(4);
  } else if (cleaned.startsWith("90") && cleaned.length > 10) {
    // 90 ile başlayıp 10 haneden uzunsa ülke kodudur (Örn: 90532...)
    cleaned = cleaned.substring(2);
  }

  // 3. Baştaki 0'ı sil
  if (cleaned.startsWith("0")) {
    cleaned = cleaned.substring(1);
  }

  // 4. Sonuç tam olarak 10 hane mi kontrol et (Alan kodu + 7 hane = 10 hane)
  if (cleaned.length === 10) {
    return cleaned;
  }

  return null; // Geçersiz numara
}

// 5 Test numarası doğrulaması
export function verifyPhoneNormalization() {
  const tests = [
    { input: "05445019848", expected: "5445019848" },
    { input: "0542 396 23 87", expected: "5423962387" },
    { input: "+90 (531) 891 12 73", expected: "5318911273" },
    { input: "00905464721971", expected: "5464721971" },
    { input: "5399613727", expected: "5399613727" },
  ];

  for (const t of tests) {
    const res = normalizePhone(t.input);
    if (res !== t.expected) {
      throw new Error(`Phone normalization verification failed for ${t.input}: expected ${t.expected}, got ${res}`);
    }
  }
  return true;
}

function parseDate(str) {
  if (!str) return null;
  const parts = str.trim().split(" ");
  if (parts.length < 2) return null;
  const [d, m, y] = parts[0].split(".").map(Number);
  const timeParts = parts[1].split(":").map(Number);
  const h = timeParts[0] || 0;
  const min = timeParts[1] || 0;
  const s = timeParts[2] || 0;
  return new Date(y, m - 1, d, h, min, s);
}

function hammingDistance(s1, s2) {
  if (s1.length !== s2.length) return 999;
  let diff = 0;
  for (let i = 0; i < s1.length; i++) {
    if (s1[i] !== s2[i]) diff++;
  }
  return diff;
}

function escapeSql(str) {
  if (str === null || str === undefined) return "NULL";
  return `'${String(str).replace(/'/g, "''")}'`;
}

function escapeCsv(val) {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function runImport(tsvPath = "import/vega-aramalar.tsv", outDir = "import/out") {
  // 1. Telefon normalizasyonunu 5 örnekle doğrula
  verifyPhoneNormalization();

  if (!fs.existsSync(tsvPath)) {
    console.error(`Girdi dosyası bulunamadı: ${tsvPath}`);
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const content = fs.readFileSync(tsvPath, "utf-8");
  const rawLines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (rawLines.length === 0) {
    console.error("Girdi dosyası boş!");
    process.exit(1);
  }

  const header = rawLines[0].split("\t");
  const dataLines = rawLines.slice(1);

  const invalidCalls = [];
  const parsedCalls = [];

  for (let idx = 0; idx < dataLines.length; idx++) {
    const line = dataLines[idx];
    const cols = line.split("\t");
    const rawTime = cols[0] || "";
    const rawPhone = cols[1] || "";
    const rawStatus = cols[2] || "";
    const rawAnswerTime = cols[3] || "";
    const rawUser = cols[4] || "";
    const rawLine = cols[5] || "";
    const rawLabel = cols[6] || "";

    const phone = normalizePhone(rawPhone);
    const time = parseDate(rawTime);

    // Etiket temizliği:
    // Baştaki/sondaki boşlukları at, ardışık boşlukları teke indir.
    // BÜYÜK/KÜÇÜK HARFİ ve yazımı DEĞİŞTİRME.
    // Boşsa ya da "[YENİ BİR MÜŞTERİ]" ise etiketsiz say.
    const cleanLabel = rawLabel.trim().replace(/\s+/g, " ");
    const isUnlabeled = !cleanLabel || cleanLabel === "[YENİ BİR MÜŞTERİ]";

    if (!phone) {
      invalidCalls.push({
        lineIndex: idx + 2,
        rawPhone,
        rawTime,
        cleanLabel,
      });
      continue;
    }

    parsedCalls.push({
      lineIndex: idx + 2,
      rawTime,
      time,
      rawPhone,
      phone,
      rawStatus,
      rawUser,
      rawLine,
      cleanLabel,
      isUnlabeled,
    });
  }

  // Numara bazlı toplam çağrı ve geçerli etiket sayıları
  const phoneAllCalls = new Map();
  for (const call of parsedCalls) {
    if (!phoneAllCalls.has(call.phone)) {
      phoneAllCalls.set(call.phone, []);
    }
    phoneAllCalls.get(call.phone).push(call);
  }

  // 2. Şüpheli yanlış okuma tespiti:
  // Aynı dakika içinde (≤5 sn) gelen ve yalnızca 1 hanesi farklı iki numaradan,
  // dosyada daha az görünen ya da etiketsiz olanı aktarma.
  const suspiciousMap = new Map(); // phone -> { matchedPhone, diffSec, time, label, matchedLabel, reason }

  for (let i = 0; i < parsedCalls.length; i++) {
    for (let j = i + 1; j < parsedCalls.length; j++) {
      const c1 = parsedCalls[i];
      const c2 = parsedCalls[j];
      if (c1.phone === c2.phone) continue;
      if (!c1.time || !c2.time) continue;

      const diffSec = Math.abs(c1.time.getTime() - c2.time.getTime()) / 1000;
      if (diffSec <= 5) {
        const h = hammingDistance(c1.phone, c2.phone);
        if (h === 1) {
          const count1 = phoneAllCalls.get(c1.phone).length;
          const count2 = phoneAllCalls.get(c2.phone).length;
          const validLabels1 = phoneAllCalls.get(c1.phone).filter((c) => !c.isUnlabeled).length;
          const validLabels2 = phoneAllCalls.get(c2.phone).filter((c) => !c.isUnlabeled).length;

          let suspiciousPhone = null;
          let matchedPhone = null;
          let suspCall = null;
          let matchCall = null;
          let reason = "";

          if (validLabels1 === 0 && validLabels2 > 0) {
            suspiciousPhone = c1.phone;
            matchedPhone = c2.phone;
            suspCall = c1;
            matchCall = c2;
            reason = "Etiketsiz ve 1 hanesi farkli, ayni anda gelen cagri";
          } else if (validLabels2 === 0 && validLabels1 > 0) {
            suspiciousPhone = c2.phone;
            matchedPhone = c1.phone;
            suspCall = c2;
            matchCall = c1;
            reason = "Etiketsiz ve 1 hanesi farkli, ayni anda gelen cagri";
          } else if (count1 < count2) {
            suspiciousPhone = c1.phone;
            matchedPhone = c2.phone;
            suspCall = c1;
            matchCall = c2;
            reason = "Dosyada daha az gorunen numara (1 hane farkli)";
          } else if (count2 < count1) {
            suspiciousPhone = c2.phone;
            matchedPhone = c1.phone;
            suspCall = c2;
            matchCall = c1;
            reason = "Dosyada daha az gorunen numara (1 hane farkli)";
          }

          if (suspiciousPhone && !suspiciousMap.has(suspiciousPhone)) {
            suspiciousMap.set(suspiciousPhone, {
              phone: suspiciousPhone,
              matchedPhone,
              diffSec,
              time: suspCall.rawTime,
              label: suspCall.cleanLabel,
              matchedLabel: matchCall.cleanLabel,
              reason,
            });
          }
        }
      }
    }
  }

  // 3. Numara başına etiket analizi ve çakışma tespiti
  const unnamedList = [];
  const conflictsList = [];
  const candidateList = [];

  for (const [phone, calls] of phoneAllCalls.entries()) {
    // Şüpheli numara ise atla
    if (suspiciousMap.has(phone)) {
      continue;
    }

    const validLabelCalls = calls.filter((c) => !c.isUnlabeled);
    if (validLabelCalls.length === 0) {
      // Hiç etiketi olmayan numara
      const latestCall = calls.slice().sort((a, b) => (b.time?.getTime() || 0) - (a.time?.getTime() || 0))[0];
      unnamedList.push({
        phone,
        totalCalls: calls.length,
        lastTime: latestCall?.rawTime || "",
      });
      continue;
    }

    // Kalan etiketlerden en sık geçeni seç, eşitlikte tarihi en yeni olanı
    const labelCounts = new Map();
    const labelNewestTime = new Map();

    for (const c of validLabelCalls) {
      labelCounts.set(c.cleanLabel, (labelCounts.get(c.cleanLabel) || 0) + 1);
      const prevTime = labelNewestTime.get(c.cleanLabel);
      if (!prevTime || (c.time && c.time.getTime() > prevTime.getTime())) {
        labelNewestTime.set(c.cleanLabel, c.time);
      }
    }

    // Farklı etiketler varsa:
    // En sık geçen / en güncel olan birinci adres, diğerleri ikinci / üçüncü adres olarak kaydedilir.
    // Müşteri notu alanına adres yazılmaz!
    const distinctLabels = Array.from(labelCounts.keys()).sort((a, b) => {
      const countDiff = (labelCounts.get(b) || 0) - (labelCounts.get(a) || 0);
      if (countDiff !== 0) return countDiff;
      const timeB = labelNewestTime.get(b)?.getTime() || 0;
      const timeA = labelNewestTime.get(a)?.getTime() || 0;
      return timeB - timeA;
    });

    const selectedLabel = distinctLabels[0];
    const allAddresses = distinctLabels;

    if (distinctLabels.length > 1) {
      const allLabelsWithCounts = distinctLabels
        .map((l) => `${l} (${labelCounts.get(l)} adet)`)
        .join("; ");

      conflictsList.push({
        phone,
        allLabelsWithCounts,
        selectedLabel,
        allAddresses,
      });
    }

    candidateList.push({
      phone,
      selectedLabel,
      allAddresses,
      totalCalls: calls.length,
    });
  }

  // 4. Merge candidates: Aynı etikete (küçük harfe çevrilmiş, Türkçe uyumlu) sahip FARKLI numaralar
  // Hem seçilen etiketler hem de aktarılacak numaralara ait tüm geçerli etiketler taranır
  const labelToPhones = new Map();
  for (const cand of candidateList) {
    const calls = phoneAllCalls.get(cand.phone) || [];
    const allLabelsForPhone = new Set([
      cand.selectedLabel,
      ...calls.filter((c) => !c.isUnlabeled).map((c) => c.cleanLabel),
    ]);

    for (const lbl of allLabelsForPhone) {
      const trLower = lbl.toLocaleLowerCase("tr-TR");
      if (!labelToPhones.has(trLower)) {
        labelToPhones.set(trLower, new Map());
      }
      labelToPhones.get(trLower).set(cand.phone, lbl);
    }
  }

  const mergeCandidates = [];
  for (const [trLower, phoneMap] of labelToPhones.entries()) {
    if (phoneMap.size > 1) {
      const phones = Array.from(phoneMap.keys());
      const originalLabels = Array.from(phoneMap.entries())
        .map(([p, lbl]) => `${p}: ${lbl}`)
        .join(" | ");
      mergeCandidates.push({
        labelTrLower: trLower,
        phones: phones.join("; "),
        originalLabels,
      });
    }
  }

  // 5. CSV dosyalarını yaz
  // a) import/out/conflicts.csv
  const conflictsCsvLines = [
    "numara,tum_etiketler_ve_adetleri,secilen_etiket",
    ...conflictsList.map(
      (c) => `${escapeCsv(c.phone)},${escapeCsv(c.allLabelsWithCounts)},${escapeCsv(c.selectedLabel)}`
    ),
  ];
  fs.writeFileSync(path.join(outDir, "conflicts.csv"), "\uFEFF" + conflictsCsvLines.join("\n"), "utf-8");

  // b) import/out/unnamed.csv
  const unnamedCsvLines = [
    "numara,toplam_arama,son_arama_zamani",
    ...unnamedList.map(
      (u) => `${escapeCsv(u.phone)},${escapeCsv(u.totalCalls)},${escapeCsv(u.lastTime)}`
    ),
  ];
  fs.writeFileSync(path.join(outDir, "unnamed.csv"), "\uFEFF" + unnamedCsvLines.join("\n"), "utf-8");

  // c) import/out/suspicious.csv
  const suspiciousCsvLines = [
    "supheli_numara,eslesen_numara,fark_saniye,arama_zamani,supheli_etiket,eslesen_etiket,neden",
    ...Array.from(suspiciousMap.values()).map(
      (s) =>
        `${escapeCsv(s.phone)},${escapeCsv(s.matchedPhone)},${escapeCsv(s.diffSec)},${escapeCsv(s.time)},${escapeCsv(
          s.label
        )},${escapeCsv(s.matchedLabel)},${escapeCsv(s.reason)}`
    ),
  ];
  fs.writeFileSync(path.join(outDir, "suspicious.csv"), "\uFEFF" + suspiciousCsvLines.join("\n"), "utf-8");

  // d) import/out/merge-candidates.csv
  const mergeCsvLines = [
    "etiket_kucuk_harf,numaralar,orijinal_etiketler",
    ...mergeCandidates.map(
      (m) => `${escapeCsv(m.labelTrLower)},${escapeCsv(m.phones)},${escapeCsv(m.originalLabels)}`
    ),
  ];
  fs.writeFileSync(path.join(outDir, "merge-candidates.csv"), "\uFEFF" + mergeCsvLines.join("\n"), "utf-8");

  // 6. SQL dosyasını oluştur: import/out/vega-customers.sql
  // - Tek transaction
  // - Restoran slug='ikram-doner' ile bulunur, tam 1 satır dönmezse hata verir
  // - customers: name = '', ON CONFLICT (restaurant_id, phone) DO NOTHING
  // - customer_phones tablosunda zaten kayıtlı numaraları atla
  // - customer_addresses: title = 'Eski kayıt', NOT EXISTS ile ekle
  // - Çakışan etiketlerde seçilmeyenler note sütununa yazılır
  const sqlLines = [];
  sqlLines.push("-- ============================================================================");
  sqlLines.push("-- VEGA ARAMA KAYITLARINDAN MÜŞTERİ AKTARIMI (İKRAM DÖNER)");
  sqlLines.push(`-- Üretim Tarihi: ${new Date().toISOString()}`);
  sqlLines.push(`-- Toplam Aktarılacak Müşteri / Adres: ${candidateList.length}`);
  sqlLines.push("-- ============================================================================");
  sqlLines.push("BEGIN;");
  sqlLines.push("");
  sqlLines.push("DO $$");
  sqlLines.push("DECLARE");
  sqlLines.push("  v_restaurant_id uuid;");
  sqlLines.push("  v_count integer;");
  sqlLines.push("  v_cust_id uuid;");
  sqlLines.push("BEGIN");
  sqlLines.push("  -- 1. Restoran doğrulama: slug='ikram-doner' tam olarak 1 satır olmalı");
  sqlLines.push("  SELECT count(*) INTO v_count FROM public.restaurants WHERE slug = 'ikram-doner';");
  sqlLines.push("  IF v_count <> 1 THEN");
  sqlLines.push(
    "    RAISE EXCEPTION 'Restoran doğrulama başarısız! slug=''ikram-doner'' için bulunan kayıt sayısı: % (tam olarak 1 olmalıdır). İşlem iptal edildi.', v_count;"
  );
  sqlLines.push("  END IF;");
  sqlLines.push("");
  sqlLines.push("  SELECT id INTO v_restaurant_id FROM public.restaurants WHERE slug = 'ikram-doner';");
  sqlLines.push("");
  sqlLines.push("  -- customers.note kolonunun varlığından emin ol (migration 20261015000002)");
  sqlLines.push("  ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS note text;");
  sqlLines.push("");
  sqlLines.push("  -- Varsa eski çalışmadan kalan 'Diğer eski kayıt...' müşteri notlarını temizle");
  sqlLines.push("  UPDATE public.customers");
  sqlLines.push("  SET note = NULL");
  sqlLines.push("  WHERE restaurant_id = v_restaurant_id");
  sqlLines.push("    AND note LIKE 'Diğer eski kayıt etiketleri:%';");
  sqlLines.push("");

  let totalAddressCount = 0;
  for (let i = 0; i < candidateList.length; i++) {
    const cand = candidateList[i];
    const phoneSql = escapeSql(cand.phone);

    sqlLines.push(`  -- [${i + 1}/${candidateList.length}] Numara: ${cand.phone} (${cand.allAddresses.length} adres)`);
    sqlLines.push(`  IF to_regclass('public.customer_phones') IS NOT NULL AND EXISTS (`);
    sqlLines.push(`    SELECT 1 FROM public.customer_phones WHERE restaurant_id = v_restaurant_id AND phone = ${phoneSql}`);
    sqlLines.push(`  ) THEN`);
    sqlLines.push(`    -- Numara customer_phones tablosunda zaten mevcut, atla`);
    sqlLines.push(`    NULL;`);
    sqlLines.push(`  ELSE`);
    sqlLines.push(`    -- customers tablosuna ekle (name='', note=NULL, mevcut kayıtlara dokunma)`);
    sqlLines.push(`    INSERT INTO public.customers (restaurant_id, name, phone, note)`);
    sqlLines.push(`    VALUES (v_restaurant_id, '', ${phoneSql}, NULL)`);
    sqlLines.push(`    ON CONFLICT (restaurant_id, phone) DO NOTHING;`);
    sqlLines.push(``);
    sqlLines.push(`    -- Eklenen ya da mevcut müşterinin ID'sini al`);
    sqlLines.push(`    SELECT id INTO v_cust_id FROM public.customers WHERE restaurant_id = v_restaurant_id AND phone = ${phoneSql};`);
    sqlLines.push(``);
    sqlLines.push(`    -- Müşterinin adreslerini ekle (birden fazla farklı adres varsa hepsi 'Eski kayıt' olarak eklenir)`);

    for (let aIdx = 0; aIdx < cand.allAddresses.length; aIdx++) {
      const addr = cand.allAddresses[aIdx];
      const addrSql = escapeSql(addr);
      totalAddressCount++;
      sqlLines.push(`    IF v_cust_id IS NOT NULL AND NOT EXISTS (`);
      sqlLines.push(`      SELECT 1 FROM public.customer_addresses WHERE customer_id = v_cust_id AND address = ${addrSql}`);
      sqlLines.push(`    ) THEN`);
      sqlLines.push(`      INSERT INTO public.customer_addresses (restaurant_id, customer_id, title, address)`);
      sqlLines.push(`      VALUES (v_restaurant_id, v_cust_id, 'Eski kayıt', ${addrSql});`);
      sqlLines.push(`    END IF;`);
    }

    sqlLines.push(`  END IF;`);
    sqlLines.push("");
  }

  sqlLines.push("END $$;");
  sqlLines.push("");
  sqlLines.push("COMMIT;");
  sqlLines.push("");

  fs.writeFileSync(path.join(outDir, "vega-customers.sql"), sqlLines.join("\n"), "utf-8");

  const summary = {
    totalRows: dataLines.length,
    invalidPhoneCount: invalidCalls.length,
    validCallsCount: parsedCalls.length,
    uniquePhones: phoneAllCalls.size,
    suspiciousCount: suspiciousMap.size,
    unnamedCount: unnamedList.length,
    importedCustomerCount: candidateList.length,
    importedAddressCount: totalAddressCount,
    conflictCount: conflictsList.length,
    mergeCandidateCount: mergeCandidates.length,
    paths: {
      sql: path.join(outDir, "vega-customers.sql"),
      conflicts: path.join(outDir, "conflicts.csv"),
      unnamed: path.join(outDir, "unnamed.csv"),
      suspicious: path.join(outDir, "suspicious.csv"),
      mergeCandidates: path.join(outDir, "merge-candidates.csv"),
    },
  };

  console.log("=== VEGA MÜŞTERİ AKTARIM RAPORU ===");
  console.log(JSON.stringify(summary, null, 2));

  return summary;
}

// Doğrudan çalıştırıldığında import fonksiyonunu çağır
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("scripts/import-vega-customers.mjs")) {
  runImport();
}
