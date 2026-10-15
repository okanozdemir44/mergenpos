# Mergen POS - Masaüstü Uygulaması Kurulum ve Kullanım Kılavuzu

Bu kılavuz, **İkram Döner** veya benzeri restoran/paket servis işletmelerinin Windows bilgisayarlarına Mergen POS Masaüstü uygulamasının sıfırdan kurulması, yazıcıların ve Caller ID (Arayan Numara) cihazlarının yapılandırılması için adım adım hazırlanmıştır.

---

## ⚠️ ÖNEMLİ: Paketlemeden Önce Canlı Adresi Yazın

Uygulamayı restoran bilgisayarına kurmadan veya installer üretmeden önce:
1. `desktop/config.json` dosyasını açın.
2. `"appUrl": "https://ornek-canli-adres.vercel.app"` yer tutucu değerini **kendi gerçek canlı adresinizle** (örn: `https://ikramdonerpos.com`) değiştirin.
3. Ardından terminalde `npm run dist` komutunu çalıştırarak kurulum dosyasını (`Mergen POS Setup 1.0.0.exe`) yeniden paketleyin.

---

## 1. Sistem Gereksinimleri
- **İşletim Sistemi:** Windows 10 veya Windows 11 (64-bit)
- **İnternet Bağlantısı:** Aktif geniş bant / Wi-Fi bağlantısı
- **Donanımlar (Opsiyonel):**
  - USB / Seri Port Caller ID Cihazı (CID / CIDShow / Multiline vb.)
  - 80mm veya 58mm Termal Fiş Yazıcısı (USB / Ethernet)

---

## 2. Kurulum Adımları

### Adım 2.1: Kurulum Dosyasını İndirme ve Çalıştırma
1. Size iletilen `Mergen POS Setup 1.0.0.exe` (veya güncel sürüm) kurulum dosyasını indirin.
2. Kurulum dosyasına çift tıklayın.

### Adım 2.2: Windows SmartScreen Uyarısını Aşma
Windows, henüz dijital sertifikası yeni olan uygulamalarda mavi bir güvenlik ekranı çıkarabilir:
> *"Windows kişisel bilgisayarınızı korudu"* (SmartScreen)

1. Ekranda sol tarafta yer alan **"Ek bilgi"** (More info) bağlantısına tıklayın.
2. Altta beliren **"Yine de çalıştır"** (Run anyway) butonuna tıklayın.
3. Kurulum sessizce tamamlanacak, masaüstünüze ve Başlat menünüze **Mergen POS** kısayolu eklenecek ve uygulama otomatik olarak açılacaktır.

---

## 3. İlk Açılış ve Giriş Yapma
1. Uygulama açıldığında restoran POS giriş ekranı gelecektir.
2. Restoran kullanıcı adı / şifreniz ile veya personel PIN kodunuzla sisteme giriş yapın.
3. Uygulama sağ alt sistem tepsisinde (Windows saatinin yanındaki küçük ok içinde) **Mergen POS** ikonu ile arka planda çalışmaya devam eder.

---

## 4. Yazıcı Ayarları (Sessiz Fiş Yazdırma & QZ Yedeği)

Mergen POS Masaüstü kabuğu, harici bir **QZ Tray programına ihtiyaç duymadan** doğrudan Windows yazıcı sürücüleri üzerinden sessizce (onay penceresi çıkmadan) fiş basabilir.

1. POS ana ekranında sağ üstteki **Ayarlar** (çark) simgesine veya menüden **Yazıcı Ayarları** seçeneğine tıklayın.
2. Açılan pencerede **"Masaüstü Doğrudan Yazdırma"** anahtarını **Açık** konuma getirin (Varsayılan olarak kapalıdır, test ettikten sonra açabilirsiniz).
3. **Termal Kağıt Genişliği:** Kullandığınız fiş kağıdına göre `80 mm` (Standart) veya `58 mm` seçin.
4. **Kasa Yazıcısı (Müşteri Fişi):** Listeden kasanızdaki termal yazıcıyı seçin.
5. **Mutfak Yazıcısı (Sipariş Fişi):** Varsa mutfaktaki yazıcıyı seçin (yoksa kasa yazıcısı seçilebilir).
6. **"Test Fişi Yazdır"** butonuna basarak Türkçe karakterlerin (ğ, ü, ş, ı, ö, ç, İ) ve kağıt sınırlarının doğru çıktığını test edin.
7. **"Kaydet"** butonuna tıklayarak ayarları saklayın.

> **Fiş Akışları:**
> - **Paket / Gel-Al Siparişleri:** Sipariş tamamlandığında kasa fişi ve mutfak fişi sırayla ve kilitlenmeyen kuyrukla basılır.
> - **Hızlı Satış / Salon:** Tahsilat alındığında müşteri kopyası basılır, mutfağa gönderimde mutfak fişi basılır.
> - **Kurye Ekranı (Kanban):** Sipariş kartlarının üzerindeki "🖨️" butonuna basılarak istenildiği zaman fiş yeniden basılabilir.
> - **Yedek Mekanizma:** Masaüstü yazdırma kapalıysa veya herhangi bir sürücü hatası oluşursa, sistem mevcut QZ Tray üzerinden yazdırmaya otomatik olarak yedeklenir.

---

## 5. Caller ID (Arayan Numara) Cihazı Kurulumu

### ⚠️ ÇOK ÖNEMLİ: Çakışan Eski Programları Kapatın (Vega, vb.)
Windows'ta bir COM (Seri) portunu aynı anda yalnızca **tek bir program** açabilir.
- Bilgisayarda önceden kurulu olan **Vega**, **CallerID Monitor**, **CIDTest** veya benzeri eski restoran yazılımlarını **Görev Yöneticisi'nden ve başlangıçtan tamamen kapatın / kaldırın**.
- Aksi takdirde Mergen POS `EADDRINUSE / Access Denied (Erişim Engellendi)` hatası verecek ve çağrıları yakalayamayacaktır.

### Adım 5.1: Cihazı Bağlama
1. Caller ID cihazının USB kablosunu bilgisayara, telefon hattı kablosunu ise cihazın `LINE` girişine takın.
2. Cihazın üzerindeki ışığın yandığından emin olun.

### Adım 5.2: Mergen POS İçinde Port Seçimi
1. Mergen POS ekranında **Ayarlar -> Caller ID (Arayan Numara) Ayarları** penceresini açın.
2. **Caller ID Hizmeti** toggle'ının **Açık** olduğunu teyit edin.
3. **COM Port:** Listede otomatik olarak `COM3`, `COM4` gibi algılanan cihazı seçin. (Görünmüyorsa "Yenile" butonuna tıklayın).
4. **Baud Rate:** Varsayılan değer `9600`'dür (özel bir cihaz değilse değiştirmeyiniz).
5. **Modem Modu:** Standart USB Caller ID kutuları düz metin iletir. Bu seçeneğin **KAPALI** olduğundan emin olun. (Sadece eski tip faks/modem cihazları kullanılıyorsa açılmalıdır).
6. Port bağlantısı sağlandığında pencere altındaki log alanında `[PORT BAĞLANDI]` mesajı listelenecektir.
7. Telefonunuzdan işletmeyi arayarak ekranda arayan müşteri kartının otomatik açıldığını test edin.

---

## 6. Sık Karşılaşılan Sorunlar ve Çözümleri

### 1. Telefon çalıyor ama ekrana müşteri kartı gelmiyor
- **Vega veya eski program açık mı?** Bilgisayarı kontrol edin, arka planda çalışan Caller ID programlarını kapatın.
- **Port seçimi doğru mu?** Ayarlar -> Caller ID menüsünde portun `[PORT BAĞLANDI]` olduğunu teyit edin.
- **Kablo bağlantısı:** Telefon hattı duvardan gelip cihazın `LINE` portuna takılı olmalı, `PHONE` çıkışından da sabit masa telefonuna gitmelidir.

### 2. Yazıcıdan fiş çıkmıyor veya boş kağıt çıkıyor
- Windows "Yazıcılar ve Tarayıcılar" menüsünde yazıcının "Çevrimdışı" (Offline) olmadığından emin olun.
- Yazıcının kağıt rulosunun ters takılmadığını kontrol edin (termal kağıdın tırnakla çizildiğinde siyah iz bırakan yüzeyi kafaya gelmelidir).
- Mergen POS Yazıcı Ayarları'nda "Test Fişi Yazdır" butonuna basarak bağlantıyı sınayın.

### 3. Sistem günlüklerini (Logları) inceleme
Bir hata meydana geldiğinde Mergen POS sistem günlüğünü incelemek için:
1. Sağ alttaki Windows sistem tepsisinde Mergen POS simgesine sağ tıklayın.
2. **"Hata Günlük Klasörünü Aç"** seçeneğine tıklayın.
3. Açılan klasördeki `app.log` dosyasını teknik destek ekibine iletin (Loglar maksimum 3 MB boyuta ulaşınca otomatik olarak arşivlenir).

---

## 7. Otomatik Güncelleme Dağıtımı Rehberi (GitHub Releases)

Uygulama istemci tarafında **asla GitHub token'ı barındırmaz**. Güncelleme kontrolleri herkese açık (Public) bir release deposu üzerinden anonim HTTP istekleriyle yapılır.

### Adım 7.1: Ayrı Bir Public Release Deposu Açma
1. GitHub hesabınızda yeni bir repository açın (Örn: `mergenpos-releases`).
2. Deponun görünürlüğünü **Public** yapın (Böylece istemciler token olmadan sürümleri indirebilir).

### Adım 7.2: Fine-Grained Personal Access Token Üretme
1. GitHub -> **Settings** -> **Developer Settings** -> **Personal Access Tokens** -> **Fine-grained tokens** sayfasına gidin.
2. **Generate new token** butonuna tıklayın:
   - **Token Name:** `Mergen POS Release Publisher`
   - **Expiration:** 1 yıl (veya dilediğiniz süre)
   - **Repository access:** `Only select repositories` -> Listeden yalnızca `mergenpos-releases` reposunu seçin (Ana kod deponuz tamamen güvende kalır).
   - **Permissions -> Repository permissions:**
     - `Contents`: **Read and write** (Diğer tüm izinleri "No access" bırakın).
3. Token'ı üretip güvenli bir yere kopyalayın (`github_pat_xxxx`).

### Adım 7.3: Yapılandırma
1. `desktop/config.json` dosyasını açıp release reponuzu yazın:
   ```json
   "update": {
     "owner": "kullanici-adiniz",
     "repo": "mergenpos-releases"
   }
   ```
2. `desktop/package.json` içindeki `"publish"` bölümünü de aynı şekilde güncelleyin:
   ```json
   "publish": {
     "provider": "github",
     "owner": "kullanici-adiniz",
     "repo": "mergenpos-releases"
   }
   ```

### Adım 7.4: Yeni Sürüm Paketleme ve Yayınlama
Yeni bir sürüm yayınlayacağınız zaman (Örn: `1.0.1`):
1. `desktop/package.json` içindeki `"version"` alanını `1.0.1` yapın.
2. PowerShell terminalinde token'ınızı ortam değişkenine atayın ve dağıtımı başlatın:
   ```powershell
   cd desktop
   $env:GH_TOKEN="github_pat_senin_tokenin"
   npm run dist -- --publish always
   ```
3. electron-builder otomatik olarak yeni kurulum dosyasını derler, GitHub Releases sekmesine yükler ve yayınlar.
4. Restoran bilgisayarlarındaki Mergen POS arka planda yeni sürümü indirir ve hazır olduğunda kasiyere *"Güncelleme hazır, yeniden başlatmak ister misiniz?"* sorusunu gösterir. İnternet yoksa veya repo yanıt vermezse hiçbir hata penceresi açılmaz, sessizce loglanır.
