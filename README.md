# Jira Bug Reporter

![GitHub License](https://img.shields.io/github/license/devoplus/JiraBugReporter) ![Devoplus Open Source](https://img.shields.io/badge/Open_Source-DP?label=Devoplus&labelColor=%23B60017&color=%2319191a)

Tek tıkla bulunduğunuz sayfadan ekran görüntüsü, console & network logları, cookies ve local/session storage toplayıp Jira’da bilet açar. Zengin metin açıklamalar ADF (Atlassian Document Format) ile oluşturulur.

## Özellikler
**Jira entegrasyonu:** Proje, issue tipi ve öncelik listeleri Jira'dan dinamik olarak çekilir; bilet açılmadan önce başlık/açıklama düzenlenebilir.

**Kanıt toplama:** Screenshot (işaretleme/bulanıklaştırma/kırpma destekli), JS hataları, console.* mesajları, fetch/XHR özetleri, kullanıcı adımları (repro steps).

**Sekme ekran kaydı:** Hatayı yeniden üretirken sekmenin videosunu kaydedip bilete ekleyin (offscreen document tabanlı, MV3 uyumlu).

**Mükerrer kontrolü:** Bilet açmadan önce aynı sayfayı anan açık biletler listelenir.

**Çoklu profil:** Birden fazla Jira alanı/projesi tanımlanabilir; profil, aktif sekmenin alan adına göre otomatik seçilir.

**Bağlam verileri (opsiyonel):** Cookies (mümkün olduğunca HttpOnly dahil; varsayılan olarak kapalı), localStorage & sessionStorage özetleri. Token/JWT/oturum kimliği benzeri değerler varsayılan olarak maskelenir.

**ADF açıklama:** Jira Cloud ile uyumlu zengin açıklama gövdesi.

**Yerel & şeffaf:** Yalnızca sizin aksiyonunuzla çalışır; üçüncü taraf sunucu yok.

## Kurulum
### Geliştirici olarak yükleme

 1. Depoyu klonlayın veya ZIP’i çıkarın.
 2.  Chrome → `chrome://extensions` → **Developer mode**’u açın.
 3.  **Load unpacked** → proje klasörünü seçin.

### Web Mağazası üzerinden yükleme
https://chromewebstore.google.com/detail/jira-bug-reporter/pjgaemnffpinbokdoekgbheakgenmbma adresi üzerinden uzantıyı yükleyin.

### Jira yapılandırması

Uzantı ikonuna sağ tıklayın ve ayarlar sayfasına gidin. Bir veya birden fazla profil tanımlayın:

-   **Jira Base URL:** `https://company.atlassian.net`
    
-   **Email:** Jira hesabınıza ait e-posta adresi
    
-   **API Token:** (Jira Cloud → Account → Security → API tokens). Belirteç yalnızca cihazınızda saklanır, senkronize edilmez.
    
-   **Project Key:** ör. `WEB`
    
-   **Issue Type:** ör. `Bug`

-   **Alan adları (opsiyonel):** ör. `app.example.com, *.example.org` — bu alanlarla eşleşen sekmelerde profil otomatik seçilir.

Kaydetmeden önce **Bağlantıyı Test Et** ile kimlik bilgilerinizi ve proje anahtarını doğrulayabilirsiniz.

## Kullanım

1.  (İsteğe bağlı) **⏺ Kayıt** ile sekme kaydını başlatın ve hatayı yeniden üretin.

2.  **Rapor hazırla** butonuna basın (kısayol: `Alt+Shift+J` ile pencereyi açabilirsiniz).

3.  Açılan rapor sayfasında başlık/açıklamayı düzenleyin, ekran görüntüsünü işaretleyin veya hassas alanları bulanıklaştırın, öncelik/etiket seçin; benzer açık biletler varsa üstte listelenir.

4.  **Jira’da bilet aç** butonuna basın; **screenshot.png**, **page-report.json** ve varsa **tab-recording.webm** bilete eklenir ve bilet bağlantısı görünür. Son açılan biletler pop-up’ta listelenir.

## Gizlilik

-   Veri toplama **yalnızca kullanıcı eylemiyle** (butona basınca) yapılır ve bilet açılmadan önce gözden geçirilebilir.
-   Veriler cihazda işlenir ve **sadece** sizin Jira alanınıza **HTTPS** ile gönderilir.
-   Üçüncü taraf sunucu kullanılmaz; izleme/analitik bulunmaz.
-   Ayarlar ve API belirteci yalnızca **bu cihazdaki** Chrome Storage’da (`storage.local`) saklanır; cihazlar arası senkronize edilmez.
-   Cookies eklenmesi varsayılan olarak **kapalıdır**; token/JWT/oturum kimliği benzeri değerler varsayılan olarak **maskelenir**. İsterseniz cookies/storage/ekran kaydı eklemeyi tamamen kapatabilirsiniz.
-   Kullanıcı adımları kaydedilirken form alanlarına girilen **değerler asla kaydedilmez**.

### Uzantı İzinleri

|İzin|Açıklama|
|--|--|
|`activeTab`, `tabs`|Aktif sekmeden ekran görüntüsü almak ve bağlam/veri toplamak|
|`storage`|Profiller, tercihler ve bekleyen rapor verisini saklamak|
|`cookies`|İstendiğinde cookies’i (mümkünse HttpOnly dahil) eklemek|
|`tabCapture`, `offscreen`|Sekme ekran kaydı için kullanılır (MV3’te kayıt offscreen document’ta yapılır)|
|`host_permissions`|Jira alanınıza POST yapmak; site bağlamını okumak|

## Yol Haritası

 - [x] Ayarlar sayfasının tasarımının yapılması
 - [ ] API token yerine Jira OAuth ile giriş
 - [x] Proje/issue type/öncelik listelerini Jira’dan dinamik çekme
 - [x] Etiket/priority seçimleri (assignee planlanıyor)
 - [x] Çoklu proje profilleri (alan adına göre otomatik seçim)
 - [x] Ekran görüntüsü işaretleme (dikdörtgen, ok, bulanıklaştırma, kırpma)
 - [x] Mükerrer bilet kontrolü (JQL ile benzer açık biletler)
 - [x] Kullanıcı adımları (repro steps) kaydı
 - [x] Sekme ekran kaydı (offscreen document ile)
 - [ ] Assignee seçimi
 - [ ] Zorunlu custom alanları otomatik formda gösterme
 - [ ] Çoklu dil desteği
 - [ ] DevTools paneli ile HAR çıkarmak
 - [ ] `chrome.debugger` ile header/status/redirect zincirini de elde etmek
 - [ ] Alan adı/desen bazlı include/exclude (örn. `cdn.*.com` hariç)

## Copyright

Trademarks: Atlassian, Jira and their respective logos are trademarks or registered trademarks of Atlassian Pty Ltd in the U.S. and other countries. All other product names, logos, and brands are property of their respective owners.
