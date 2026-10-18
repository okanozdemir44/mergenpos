import { createBrowserClient } from "./supabase-browser";
import {
  type ReceiptSettings,
  DEFAULT_RECEIPT_SETTINGS,
  sanitizeReceiptSettings,
} from "./receipt-settings";

let cachedReceiptSettings: ReceiptSettings | null = null;
let cachedRestaurantId: string | null = null;

/**
 * Bellekteki önbelleği temizler (örneğin ayarlar kaydedildiğinde)
 */
export function clearReceiptSettingsCache(): void {
  cachedReceiptSettings = null;
  cachedRestaurantId = null;
}

/**
 * Senkron olarak mevcut önbellekteki ayarları veya varsayılanı döner.
 */
export function getCachedReceiptSettings(): ReceiptSettings {
  return cachedReceiptSettings || DEFAULT_RECEIPT_SETTINGS;
}

/**
 * Restoran için fiş ayarlarını yükler veya önbellekten getirir.
 * Oturum boyunca önbellekte saklanır. Hata alırsa veya satır yoksa VARSAYILAN ayarları döner.
 * Yazdırmayı ASLA engellemez veya geciktirmez (1.5s zaman aşımı koruması).
 */
export async function getOrFetchReceiptSettings(
  restaurantId?: string | null
): Promise<ReceiptSettings> {
  if (!restaurantId) {
    return getCachedReceiptSettings();
  }

  // 1. In-memory cache varsa doğrudan dön
  if (cachedReceiptSettings && cachedRestaurantId === restaurantId) {
    return cachedReceiptSettings;
  }

  // 2. LocalStorage yedeği varsa hemen hazırla
  let localFallback: ReceiptSettings | null = null;
  if (typeof window !== "undefined") {
    try {
      const localStr = localStorage.getItem(`mergen_receipt_settings_${restaurantId}`);
      if (localStr) {
        localFallback = sanitizeReceiptSettings(JSON.parse(localStr));
      }
    } catch {
      // JSON parse hatası önemsiz
    }
  }

  // 3. Supabase'den çek (1500ms timeout korumasıyla yazdırmayı geciktirmez)
  try {
    const fetchPromise = async (): Promise<ReceiptSettings> => {
      const supabase = createBrowserClient();
      const { data, error } = await supabase
        .from("receipt_settings")
        .select("settings")
        .eq("restaurant_id", restaurantId)
        .maybeSingle();

      if (error || !data || !data.settings) {
        return localFallback || DEFAULT_RECEIPT_SETTINGS;
      }

      return sanitizeReceiptSettings(data.settings);
    };

    const timeoutPromise = new Promise<ReceiptSettings>((resolve) => {
      setTimeout(() => {
        resolve(localFallback || DEFAULT_RECEIPT_SETTINGS);
      }, 1500);
    });

    const settings = await Promise.race([fetchPromise(), timeoutPromise]);

    // Önbellekleri güncelle
    cachedReceiptSettings = settings;
    cachedRestaurantId = restaurantId;

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(`mergen_receipt_settings_${restaurantId}`, JSON.stringify(settings));
      } catch {
        // storage quota vs
      }
    }

    return settings;
  } catch (err) {
    console.warn("[ReceiptSettingsClient] Ayarlar yüklenirken hata oluştu, varsayılan kullanılıyor:", err);
    return localFallback || DEFAULT_RECEIPT_SETTINGS;
  }
}

/**
 * Restoran fiş ayarlarını kaydeder (receipt_settings tablosuna upsert).
 */
export async function saveRestaurantReceiptSettings(
  restaurantId: string,
  settings: ReceiptSettings
): Promise<{ success: boolean; error?: string }> {
  try {
    const sanitized = sanitizeReceiptSettings(settings);
    const supabase = createBrowserClient();

    const { error } = await supabase
      .from("receipt_settings")
      .upsert(
        {
          restaurant_id: restaurantId,
          settings: sanitized,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "restaurant_id" }
      );

    if (error) {
      console.error("[ReceiptSettingsClient] Kaydetme hatası:", error);
      return { success: false, error: error.message };
    }

    // Önbelleği güncelle
    cachedReceiptSettings = sanitized;
    cachedRestaurantId = restaurantId;

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(`mergen_receipt_settings_${restaurantId}`, JSON.stringify(sanitized));
      } catch {
        // ignore
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error("[ReceiptSettingsClient] Kaydetme beklenmeyen hata:", err);
    return { success: false, error: err?.message || "Bilinmeyen hata" };
  }
}
