import { autoUpdater } from "electron-updater";
import { BrowserWindow, dialog, Notification } from "electron";
import { loadConfig } from "./config";

export function setupAutoUpdater(mainWindow: BrowserWindow) {
  // Yalnızca paketli uygulamada çalıştır
  if (process.defaultApp || /[\\/]electron[\\/]/.test(process.execPath)) {
    console.log("[AutoUpdater] Geliştirme modunda otomatik güncelleme devre dışı.");
    return;
  }

  const config = loadConfig();
  if (config.update?.owner && config.update?.repo && !config.update.owner.includes("<")) {
    try {
      autoUpdater.setFeedURL({
        provider: "github",
        owner: config.update.owner,
        repo: config.update.repo,
      });
      console.log(`[AutoUpdater] Güncelleme hedefi: ${config.update.owner}/${config.update.repo}`);
    } catch (err: any) {
      console.warn("[AutoUpdater] setFeedURL hatası:", err.message);
    }
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    console.log("[AutoUpdater] Güncellemeler denetleniyor...");
  });

  autoUpdater.on("update-available", (info) => {
    console.log(`[AutoUpdater] Yeni sürüm mevcut: v${info.version}`);
  });

  autoUpdater.on("update-not-available", () => {
    console.log("[AutoUpdater] Uygulama güncel.");
  });

  // Hata olduğunda (404, internet yok, repo yok vb.) kullanıcıya hiçbir pencere gösterme, sadece log'a yaz
  autoUpdater.on("error", (err) => {
    console.warn("[AutoUpdater] Güncelleme hatası (kullanıcıya gösterilmedi):", err?.message || String(err));
  });

  // Yalnızca güncelleme paketi gerçekten indirilmişse bildirim ve soru penceresi çıksın
  autoUpdater.on("update-downloaded", (info) => {
    console.log(`[AutoUpdater] Güncelleme paketi indirildi: v${info.version}`);

    if (Notification.isSupported()) {
      const notif = new Notification({
        title: "Mergen POS Güncellemesi Hazır",
        body: `v${info.version} indirildi. Bir sonraki açılışta otomatik uygulanacaktır.`,
      });
      notif.show();
    }

    dialog
      .showMessageBox(mainWindow, {
        type: "info",
        title: "Güncelleme Hazır",
        message: `Mergen POS v${info.version} hazır!`,
        detail:
          "Yeni sürüm arka planda başarıyla indirildi. Şimdi yeniden başlatıp güncellemeyi uygulamak ister misiniz?\n(Dilerseniz uygulamayı normal kapattığınızda otomatik uygulanacaktır)",
        buttons: ["Şimdi Yeniden Başlat", "Daha Sonra"],
        defaultId: 1,
        cancelId: 1,
      })
      .then((res) => {
        if (res.response === 0) {
          autoUpdater.quitAndInstall(false, true);
        }
      });
  });

  // İlk açılışta 15 saniye sonra kontrol et
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn("[AutoUpdater] İlk denetim hatası (kullanıcıya gösterilmedi):", err?.message || String(err));
    });
  }, 15000);

  // Her 4 saatte bir kontrol et
  setInterval(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn("[AutoUpdater] Periyodik denetim hatası (kullanıcıya gösterilmedi):", err?.message || String(err));
    });
  }, 4 * 60 * 60 * 1000);
}

export function checkForUpdatesManual(mainWindow: BrowserWindow) {
  autoUpdater
    .checkForUpdates()
    .then((result) => {
      if (!result || !result.downloadPromise) {
        dialog.showMessageBox(mainWindow, {
          type: "info",
          title: "Güncelleme Denetimi",
          message: "Uygulamanız güncel.",
          detail: "En son Mergen POS sürümünü kullanıyorsunuz.",
          buttons: ["Tamam"],
        });
      }
    })
    .catch((err) => {
      // Manuel tıklandığında bile hata olursa kullanıcıya popup gösterme, sessizce log'a yaz
      console.warn("[AutoUpdater] Manuel denetim hatası (kullanıcıya gösterilmedi):", err?.message || String(err));
    });
}
