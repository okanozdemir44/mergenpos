export function normalizePhone(rawNumber: string | null | undefined): string | null {
  if (!rawNumber) return null;
  
  // 1. Sadece rakamları bırak
  let cleaned = rawNumber.replace(/\D/g, "");
  
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

export function formatPhone(phone: string | null | undefined): string {
  const normalized = normalizePhone(phone);
  if (!normalized) return phone || "";
  return `0 (${normalized.slice(0, 3)}) ${normalized.slice(3, 6)} ${normalized.slice(6, 8)} ${normalized.slice(8, 10)}`;
}
