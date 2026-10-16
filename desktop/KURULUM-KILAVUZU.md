# Mergen POS — Saha Kurulum ve Donanım Kılavuzu
**Saha Lokasyonu:** İkram Döner  
**Hedef Okuyucu:** Sahadaki teknik personel / servis yetkilisi (telefon veya laptop ekranında kolay okunabilir format).

---

## 1. Gitmeden Önce (Ön Hazırlık)

Sahaya çıkmadan önce aşağıdaki ekipman ve kontrolleri mutlaka tamamlayın.

1. **Kurulum Dosyasını Hazırlayın:**  
   En güncel `Mergen POS Setup.exe` dosyasını bir USB belleğe kopyalayın.
2. **Giriş Bilgilerini Not Edin:**  
   Restoran yöneticisi veya kasiyer kullanıcı adı ve şifresini yanınıza alın.  
   *(Örnek yer tutucu: Kullanıcı Adı: `<KULLANICI_ADI>`, Şifre: `<SIFRE>`)*
3. **Yedek Kablo Alın:**  
   Yazıcılar ve cihazlar için yanınıza en az 1 adet USB-A (yazıcı tipi USB-B/USB-A) kablosu ve 1 adet CAT6 Ethernet (LAN) kablosu alın.
4. **Yedek Caller ID Cihazı:**  
   Mümkünse yanınızda test edilmiş bir adet USB Caller ID cihazı bulundurun.
5. **Sunucu Adresini Doğrulayın:**  
   Kurulum paketinin `desktop/config.json` dosyasındaki `appUrl` değerinin canlı restoran adresine (`https://<RESTORAN_ADRESI>`) işaret ettiğini doğrulayın.

### Bölüm 1 Kontrol Listesi
- [ ] Kurulum dosyası USB bellekte mevcut.
- [ ] Yönetici/kasiyer kullanıcı giriş bilgileri yanımda.
- [ ] Yedek USB kablosu ve Ethernet kablosu çantada.
- [ ] Yedek USB Caller ID cihazı yanımda.
- [ ] `config.json` içerisindeki `appUrl` adresi doğrulandı.

---

## 2. Genel Kurallar & Eski Sisteme Dönüş (Rollback)

Sahada iş sürekliliğini korumak en öncelikli kuraldır.

1. **Vega Asla Kaldırılmaz:**  
   İlk gün mevcut Vega sistemi **kesinlikle silinmez veya kaldırılmaz**.
2. **Vega Yalnızca Geçici Kapatılır:**  
   Seri port (COM) veya yazıcı çakışmalarını önlemek için Vega yalnızca test sırasında kapatılır.
3. **Sakin Saatte Test Yapın:**  
   Tüm testleri öğle veya akşam servis yoğunluğu başlamadan önce, restoran sakinken tamamlayın.
4. **Eski Sisteme Hızlı Dönüş (Rollback):**  
   Olası bir aksilik durumunda:
   - Mergen POS uygulamasını kapatın.
   - Vega uygulamasını tekrar açın.
   - Sipariş ve adisyon alımına eski sistemden anında devam edin.

### Bölüm 2 Kontrol Listesi
- [ ] Vega programının silinmeyeceği personele bildirildi.
- [ ] Testler restoranın servis saatleri dışında planlandı.
- [ ] Acil durumda Vega'ya geri dönüş adımları biliniyor.

---

## 3. Kurulum ve İlk Çalıştırma

1. USB bellekteki kurulum dosyasını (`Mergen POS Setup.exe`) bilgisayarın masaüstüne kopyalayın.
2. Kurulum dosyasına çift tıklayarak çalıştırın.
3. Windows Defender SmartScreen ekranı çıkarsa:
   - **"Ek bilgi"** bağlantısına tıklayın.
   - Açılan altta **"Yine de çalıştır"** butonuna basın.
4. Kurulum otomatik tamamlanacak ve Mergen POS masaüstü kabuğu açılacaktır.
5. Personel giriş ekranında kullanıcı adı ve şifreyi girip **"Giriş yap"** butonuna basın.

### Bölüm 3 Kontrol Listesi
- [ ] Kurulum başarıyla tamamlandı.
- [ ] SmartScreen uyarısı "Yine de çalıştır" ile aşıldı.
- [ ] Mergen POS başarıyla açıldı ve ana ekrana giriş yapıldı.

---

## 4. Yazıcı Kurulumu (2 Adet DKT-B823)

İkram Döner'de 2 adet aynı model termal fiş yazıcısı bulunmaktadır:  
**Model:** DKT-B823 (80mm, 230 mm/sn, ESC/POS, USB + LAN bağlantılı).

### A. Kasa / Hesap Yazıcısı (USB Bağlantılı)
1. Kasa yanındaki yazıcının USB kablosunun bilgisayara takılı olduğunu doğrulayın.
2. Yazıcının güç düğmesini açın (yeşil ışık sabit yanmalıdır).
3. Windows'ta **Aygıtlar ve Yazıcılar** penceresinde yazıcının yüklü olduğunu kontrol edin (örneğin: `DKT-B823` veya `POS-80`).

### B. Mutfak Yazıcısı (LAN / Ağ Bağlantılı)
1. Mutfaktaki yazıcının Ethernet kablosunun modeme/switch'e bağlı olduğunu doğrulayın.
2. Yazıcının IP adresini öğrenmek için:
   - Yazıcı kapalıyken `FEED` tuşuna basılı tutun.
   - Güç düğmesini açın, 3 saniye sonra `FEED` tuşunu bırakın.
   - Çıkan self-test fişinde `IP Address` (örneğin `192.168.1.200`) yazar.
3. Eğer Windows'ta yazıcı henüz ekli değilse:
   - Windows **Ayarlar > Yazıcılar ve Tarayıcılar > Yazıcı ekle** seçin.
   - "İstediğim yazıcı listelenmiyor" > "TCP/IP adresi veya ana bilgisayar adı kullanarak yazıcı ekle".
   - Yazıcı IP adresini yazın, bağlantı noktası türünü `Standart TCP/IP (Port 9100)` seçin.
   - Sürücü olarak `Generic / Text Only` veya üretici `POS-80` sürücüsünü seçip kurulumu bitirin.

### C. Mergen POS İçerisinde Yazıcı Ayarları
1. Sol menünün altındaki **"🖨️ Yazıcılar"** butonuna tıklayın.
2. **Masaüstü Doğrudan Yazdırma:** Açık olduğunu doğrulayın.
3. **Termal Kağıt Genişliği:** Varsayılan olarak **80 mm** seçili olmalıdır.
4. **Kasa / Hesap Yazıcısı:** Listeden USB ile bağlı yazıcıyı seçin.
   - Yanındaki rozetin **🟢 Hazır** olduğunu görün.
5. **Mutfak Yazıcısı:** Listeden LAN ile bağlı yazıcıyı seçin.
   - Yanındaki rozetin **🟢 Hazır** olduğunu görün.
   - *(Not: İhtiyaç halinde her iki role aynı yazıcı da seçilebilir).*
6. **Test Fişi Basımı:**
   - **"Kasa Test Fişi Yazdır"** butonuna basın; kasa yazıcısından test fişi çıktığını doğrulayın.
   - **"Mutfak Test Fişi Yazdır"** butonuna basın; mutfak yazıcısından test fişi çıktığını doğrulayın.
7. **"Kaydet"** butonuna basarak ayarları tamamlayın.

### Bölüm 4 Kontrol Listesi
- [ ] Kasa yazıcısı USB ile bağlı ve Windows'ta görünüyor.
- [ ] Mutfak yazıcısı LAN kablosuyla bağlı ve Windows'ta Port 9100 ile tanımlı.
- [ ] Mergen POS Yazıcı Ayarları'nda her iki yazıcının durumu **🟢 Hazır** olarak görünüyor.
- [ ] Kağıt genişliği 80 mm olarak seçili.
- [ ] Kasa için ayrı test fişi basıldı.
- [ ] Mutfak için ayrı test fişi basıldı.

---

## 5. Caller ID (Arayan Numara) Teşhisi ve Kurulumu

İkram Döner'deki telefon cihazı: **Kardeş Elektronik SNT Model T1** (ekranlı kablolu telefon).  
*Önemli Not: Bu telefonun kasası üzerinde bilgisayara giden bir haberleşme portu bulunmamaktadır. Bilgisayarın arayan numarayı yakalayabilmesi için telefon hattı ile telefon arasına harici bir USB Caller ID cihazı takılı olmalıdır.*

### A. Fiziksel Cihaz Kontrolü
1. Duvardan gelen telefon hattını takip edin.
2. Hat doğrudan telefona mı giriyor, yoksa arada küçük bir siyah/gri USB kutu var mı kontrol edin.
3. Bilgisayara takılı USB kabloları kontrol edin (Vega'nın kullandığı USB Caller ID kutusu).
4. Windows **Aygıt Yöneticisi > Bağlantı Noktaları (COM ve LPT)** altına bakın.
   - Burada `USB-SERIAL CH340`, `Prolific` veya `FTDI` adında bir COM portu (örn. `COM3`) görünmelidir.

### B. Vega Çakışması Kontrolü
1. Vega açıkken COM portu kilitler.
2. Mergen POS testi sırasında Vega'yı geçici olarak kapatın.

### C. Mergen POS Caller ID Ayarları
1. Sol menüde **"📞 Caller ID"** butonuna tıklayın.
2. Açılan pencerede **Bağlantı Durumu** rozetini inceleyin:
   - **🟢 Bağlı:** Cihaz hazır ve veri dinliyor.
   - **🔴 Meşgul:** Port başka bir program tarafından tutuluyor (Vega'yı kapatıp "Yeniden Bağlan"a basın).
   - **🟡 Bağlı değil / COM Port Bulunamadı:** Cihaz takılı değil veya sürücüsü eksik.
3. Eğer liste boşsa ekranda çıkan teşhis uyarısını okuyun:
   - Cihazın USB kablosunu çıkartıp başka bir USB portuna takın.
   - "Yenile" butonuna basın.
4. **Test:**
   - "Çağrıyı Simüle Et" alanına cep telefonu numaranızı yazıp test edin.
   - Ardından dükkan telefonunu cep telefonunuzdan arayarak gerçek hat testi yapın.
   - Zil 2 kez çaldıktan sonra ekranda müşteri arama kartının açıldığını doğrulayın.

### Bölüm 5 Kontrol Listesi
- [ ] Hat ile telefon arasında USB Caller ID kutusu olduğu teyit edildi.
- [ ] Aygıt Yöneticisi'nde COM portu tespit edildi.
- [ ] Vega kapatılarak port meşguliyeti kaldırıldı.
- [ ] Mergen POS Caller ID ekranında durum **🟢 Bağlı** olarak görüldü.
- [ ] Gerçek telefon çağrısı yapılarak müşteri kartının açıldığı doğrulandı.

---

## 6. Uçtan Uca Sipariş ve Fiş Testi

1. **Hızlı Satış / Masa Siparişi:**
   - Bir ürün seçin ve siparişi onaylayın.
   - Mutfak yazıcısından sipariş fişinin çıktığını kontrol edin.
2. **Ödeme Alma:**
   - Nakit veya Kredi Kartı ile hesabı kapatın.
   - Kasa yazıcısından bilgi fişinin çıktığını kontrol edin.
3. **Yazıcı Çevrimdışı Testi:**
   - Mutfak yazıcısının kablosunu geçici olarak çekip bir sipariş kaydedin.
   - Siparişin ve ödemenin **asla engellenmediğini**, ekranda *"Mutfak yazıcısı yanıt vermedi"* şeklinde kısa Türkçe uyarı çıktığını gözlemleyin.
4. **Başarısız Fişi Tekrar Yazdırma:**
   - Yazıcı kablosunu tekrar takın.
   - **Paket Servis (Kanban)** ekranına gidin veya sipariş detayına tıklayın.
   - İlgili sipariş kartındaki **"Fiş Yazdır"** butonuna basarak fişi başarıyla yeniden çıkarın.

### Bölüm 6 Kontrol Listesi
- [ ] Masa siparişi verildi, mutfak fişi basıldı.
- [ ] Ödeme alındı, kasa fişi basıldı.
- [ ] Yazıcı kapalıyken satışın engellenmediği ve Türkçe uyarı verildiği test edildi.
- [ ] Başarısız fişin Paket Servis ekranındaki "Fiş Yazdır" butonuyla tekrar basılabildiği doğrulandı.
- [ ] Restoran yetkilisine sistem devredildi.
