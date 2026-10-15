import { session, WebContents, shell } from "electron";
import { URL } from "url";

/**
 * Güvenlik Katmanı:
 * 1. Katı Origin Doğrulaması (startsWith açığına karşı tam origin eşitliği)
 * 2. Dış pencere / sekme açma engellemesi (setWindowOpenHandler)
 * 3. İzin yöneticisi (Yalnızca 'notifications' iznine izin verilir, 'media' dahil diğer tüm izinler reddedilir)
 */
export function setupSecurity(contents: WebContents, targetUrl: string) {
  let targetOrigin = "";
  try {
    targetOrigin = new URL(targetUrl).origin;
  } catch (err) {
    console.error("[Güvenlik] Geçersiz hedef URL formatı:", targetUrl, err);
  }

  // 1. Navigasyon Filtresi: Sadece hedef origin'e izin ver
  contents.on("will-navigate", (event, navigationUrl) => {
    try {
      const parsed = new URL(navigationUrl);

      // Yerel dosya sistemi (offline.html vb.) izinli
      if (parsed.protocol === "file:") {
        return;
      }

      // Origin tam eşitlik kontrolü (örn. https://mergen.pos !== https://mergen.pos.evil.com)
      if (!targetOrigin || parsed.origin !== targetOrigin) {
        console.warn(`[Güvenlik Uyarısı] Yetkisiz origin navigasyonu engellendi: ${navigationUrl}`);
        event.preventDefault();

        // Yalnızca http: ve https: protokollerine izin ver, diğer tüm protokolleri (file, javascript, custom vb.) sessizce engelle
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          shell.openExternal(navigationUrl).catch(() => {});
        }
      }
    } catch {
      event.preventDefault();
    }
  });

  // 2. Yeni Pencere Engelleme (target="_blank", window.open)
  contents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);

      // Yalnızca http: ve https: protokollerine izin ver, diğerlerini sessizce engelle
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        shell.openExternal(url).catch(() => {});
      }
    } catch {
      // URL ayrıştırılamazsa sessizce engelle
    }

    // Uygulama içinde asla serbest popup pencere açılmasına izin verme
    return { action: "deny" };
  });
}

/**
 * Oturum İzinleri Yönetimi:
 * Yalnızca 'notifications' iznine izin verilir, 'media' dahil diğer tüm izinler reddedilir.
 */
export function setupSessionPermissions() {
  const allowedPermissions = new Set(["notifications"]);

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (allowedPermissions.has(permission)) {
      callback(true);
    } else {
      console.warn(`[Güvenlik] İzin talebi reddedildi: ${permission}`);
      callback(false);
    }
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return allowedPermissions.has(permission);
  });
}
