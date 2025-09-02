# Jira Bug Reporter

Tek tıkla bulunduğunuz sayfadan ekran görüntüsü, console & network logları, cookies ve local/session storage toplayıp Jira’da bilet açar. Zengin metin açıklamalar ADF (Atlassian Document Format) ile oluşturulur.

## Özellikler
**Jira entegrasyonu:** Proje anahtarı ve issue tipi ile anında bilet açar.

**Kanıt toplama:** Screenshot, JS hataları, console.* mesajları, fetch/XHR özetleri.

**Bağlam verileri (opsiyonel):** Cookies (mümkün olduğunca HttpOnly dahil), localStorage & sessionStorage özetleri.

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

Uzantı ikonuna sağ tıklayın ve ayarlar sayfasına gidin.

-   **Jira Base URL:** `https://company.atlassian.net`
    
-   **Email:** Jira hesabınıza ait e-posta adresi
    
-   **API Token:** (Jira Cloud → Account → Security → API tokens)
    
-   **Project Key:** ör. `WEB`
    
-   **Issue Type:** ör. `Bug`

## Kullanım
    
1.  **Jira’ya bildir** butonuna basın.
    
2.  Uzantı Jira üzerinde yeni issue’yu açar; açık olan sekmeye ait bilgiler (**screenshot** ve **page-report.json**) dosya oalrak bilete eklenir.
3.  Pop-up’ta bilet bağlantısı görünür.

## Gizlilik

-   Veri toplama **yalnızca kullanıcı eylemiyle** (butona basınca) yapılır.
-   Veriler cihazda işlenir ve **sadece** sizin Jira alanınıza **HTTPS** ile gönderilir.
-   Üçüncü taraf sunucu kullanılmaz; izleme/analitik bulunmaz.
-   Ayarlar Chrome Storage’da saklanır.
-   İsterseniz cookies/storage/ekran kaydı eklemeyi kapatabilirsiniz.

### Uzantı İzinleri

|İzin|Açıklama|
|--|--|
|`activeTab`, `tabs`, `scripting`|Aktif sekmeye script enjekte edip bağlam/veri toplamak|
|`storage`|Jira alanı, e-posta, token ve tercihleri saklamak|
|`cookies`|İstendiğinde cookies’i (mümkünse HttpOnly dahil) eklemek|
|`tabCapture`|Sekme ekran kaydı için kullanılır|
|`host_permissions`|Jira alanınıza POST yapmak; site bağlamını okumak|

## Yol Haritası

 - [ ] Ayarlar sayfasının tasarımının yapılması
 - [ ] API token yerine Jira OAuth ile giriş
 - [ ] Proje/issue type seçince zorunlu alanları otomatik formda gösterme
 - [ ] Etiket/assignee/priority seçimleri
 - [ ] Çoklu proje profilleri
 - [ ] Çoklu dil desteği
 - [ ] DevTools paneli ile HAR çıkarmak
 - [ ] `chrome.debugger` ile header/status/redirect zincirini de elde etmek
 - [ ] Alan adı/desen bazlı include/exclude (örn. `cdn.*.com` hariç)

## Copyright

Trademarks: Atlassian, Jira and their respective logos are trademarks or registered trademarks of Atlassian Pty Ltd in the U.S. and other countries. All other product names, logos, and brands are property of their respective owners.