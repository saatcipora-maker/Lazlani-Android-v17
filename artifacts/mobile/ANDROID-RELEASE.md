# LAZLANI → Afilli Android güncellemesi

## Ne hazır, ne hazır değil?

- Uygulamanın adı ve deneyimi **Afilli**. Android paket kimliği
  **`com.lazlani.app`** olarak korundu. Kullanıcı mevcut mağaza kaydını doğruladı.
- Kaynakta görülen eski LAZLANI sürüm kodu **güncel Play sürümü kabul edilmez**.
  Uygulamanın kaynak ayarına tahmini bir `versionCode` yazılmadı.
- `.github/workflows/afilli-android-aab.yml`, gerekli ayarlarla **elle
  başlatıldığında** imzalı bir AAB üretmek için hazırlandı.
- Bu dosyaların hazırlanması **AAB üretildiği veya gerçek Android derlemesinin
  geçtiği anlamına gelmez**. GitHub’a aktarılmaları ve derlemenin başarıyla
  tamamlanması gerekir. Akış Google Play’e yükleme veya otomatik yayın yapmaz.
- LAZLANI’nin hesapları/verileri silinmez, dışarı aktarılmaz veya e-posta
  eşleşmesine dayanarak Afilli hesaplarına bağlanmaz. Eski LAZLANI girişiyle yeni
  Afilli girişi farklı sistemlerdir; hesap geçişi henüz uygulanmış değildir.

## GitHub’da güvenli derleme ayarları

Bu çalışma alanındaki **güncel Afilli monoreposunun tamamı** bir geliştirme dalına
aktarılmalı. Yalnızca bu workflow’u eski LAZLANI koduna eklemek Afilli oluşturmaz.
Mevcut ana dalı silmeyin veya eski sürümü kaybetmeyin; değişiklikleri ayrı dalda
inceleyin. GitHub Actions ayarlarında `android-release` ortamı kullanılmalı.

**Yalnızca ayrı dala aktarmak derlemeyi başlatılabilir hale getirmez.**
GitHub'ın `workflow_dispatch` kuralı gereği workflow dosyası varsayılan dalda da
bulunmalı. Eski uygulama kodunu korumak için, sahibinin açık onayıyla `main`
dalına **yalnızca** `.github/workflows/afilli-android-aab.yml` eklenebilir.
Afilli kaynaklarının tamamını `main` dalına birleştirmek şart değildir.
Derleme başlatılırken kaynak dalı olarak **afilli-android-16** seçilmelidir;
eski uygulama kaynaklarının bulunduğu `main` dalı seçilmemelidir. Bu kaynak veya
derleme tanımı aktarımı Google Play yayını değildir; akış yalnızca elle başlatılır.

`android-release` ortamı ilk kurulurken depo sahibinin onayını gerektirecek
şekilde korunur. Derleme elle başlatıldıktan sonra GitHub'daki ortam onayı da
verilmeden işlemler başlamaz. Önceden var olan ortamın güvenlik kuralları
kurulum sırasında zayıflatılmamalıdır.

Bu ortamın **Variables** bölümüne:

| Ad | Değer |
| --- | --- |
| `AFILLI_API_HOST` | Yayımlanmış Afilli API’sinin yalnızca alan adı; `https://` ve `/api` eklenmez. Önizleme adresi kullanılmaz. |
| `AFILLI_EXPECTED_UPLOAD_SHA256` | Play Console’daki **yükleme sertifikasının** SHA-256 parmak izi. **Uygulama imzalama sertifikası değil.** |
| `AFILLI_CLERK_PROXY_URL` | Üretim kurulumu proxy kullanıyorsa aynı API alanındaki tam HTTPS Clerk proxy adresi; kullanmıyorsa boş. |

**Secrets** bölümüne:

| Ad | İçerik |
| --- | --- |
| `AFILLI_CLERK_PUBLISHABLE_KEY` | Aynı Afilli üretim ortamının `pk_live_` yayınlanabilir anahtarı. Sunucu gizli anahtarı veya `pk_test_` kullanılmaz. |
| `AFILLI_UPLOAD_KEYSTORE_BASE64` | Mevcut Play yükleme anahtarı dosyasının Base64 kodlaması. Yeni, ilgisiz anahtar üretmeyin. |
| `AFILLI_UPLOAD_KEY_ALIAS` | İsteğe bağlı: mevcut anahtarın alias değeri. Boşsa yalnızca Play yükleme sertifikasıyla eşleşen tek bir özel anahtar otomatik seçilir. |
| `AFILLI_UPLOAD_STORE_PASSWORD` | Anahtar deposunun parolası. |
| `AFILLI_UPLOAD_KEY_PASSWORD` | İlgili özel anahtarın parolası. |

Anahtar dosyalarını ve parolaları sohbet mesajına, kaynak koda veya repoya
koymayın. Base64 **şifreleme değildir**. Bu değerleri yalnızca güvenli Secrets
alanlarına girin; temsilciye değerlerini göndermeyin. GitHub erişimi OAuth
bağlantısından sağlanmalı; sohbetten kişisel erişim tokenı istenmez.

Alias boş bırakıldığında liste yalnızca sertifika kontrolü ve imzalama
adımlarında, sabit İngilizce `keytool -list -rfc` çıktısından okunur. Liste veya
alias günlüklerde gösterilmez. İlk bulunan anahtar seçilmez: özel anahtar
kaydının yaprak sertifikası, Play'den ayrıca alınan yükleme SHA-256 değeriyle
eşleşmeli ve eşleşme tek olmalıdır. Eşleşme yoksa veya birden fazlaysa işlem
durur. Seçilen alias ile sertifika tekrar dışarı aktarılıp bağımsız olarak
doğrulanır; yanlış parolalar veya yanlış sertifika kabul edilmez.

Mobil uygulamanın canlı Clerk anahtarı ile API'nin doğruladığı Clerk üretim
ortamı aynı olmalı. Yalnızca `pk_live_` yazmak çalışan üretim girişi kanıtı
değildir; mevcut önizleme anahtarlarını değiştirerek bu kontrolü aşmayın.

Replit tarafından yönetilen mevcut kurulumda dış Android derlemesinin
paylaşılabilir giriş ayarı, sunucunun da kullandığı
`@clerk/shared/keys` içindeki `publishableKeyFromHost` ile doğrulanmış
yayımlanmış API alan adından çözümlenir. Yönetilen Clerk secret değerleri
okunmaz veya dışarı aktarılmaz. Önce yayımlanmış proxy'nin
`/v1/environment` yanıtında `display_config.instance_environment_type`
değerinin `production` olduğu doğrulanmalıdır. Dış derleme için seçilen proxy
adresi de bu doğrulanmış yayına ait olmalıdır. Bunlar yalnızca GitHub'daki
derleme ayarlarıdır; Replit'in yönettiği `CLERK_*` veya geliştirme ortamı
değerleri değiştirilmez. Bu bağlantı kontrolü, gerçek cihazda giriş testinin
yerini tutmaz.

## Derleme ve çıktı

1. Play Console’dan **bütün kanallarda** yüklenmiş en yüksek sürüm kodunu bulun.
2. GitHub Actions → **Afilli Android AAB** → **Run workflow** seçin.
   Güncel Afilli kodunun bulunduğu dalı seçin. En yüksek sürüm kodunu ve görünür
   yeni sürümü girin. Akış, Android sürüm kodunu verilen maksimumun bir fazlası
   olarak yalnızca derleme kopyasında ayarlar; kaynak dala commit atmaz.
3. Akış API erişimini ve ayarları doğrular, SDK 58 Afilli kodunu üretir.
   Eski uygulamanın SDK’sı, OAuth istemcisi, API adresi veya Expo proje bağlantısı
   kopyalanmaz. Bağımlılıklardan önce yükleme anahtarının sertifikası doğrulanır.
4. Bağımlılıklar ve Gradle özel yükleme anahtarına erişmeden çalışır. Gradle’ın
   debug imzası kapatılır. Anahtar dosyası yalnızca ayrı sertifika kontrolü ve
   `jarsigner` adımlarında geçici dosyada kullanılır ve hata olsa da temizlenir.
5. İmza, yükleme sertifikası, AAB paket kimliği ve iki sürüm alanı doğrulanır.
   Başarıdan sonra **Artifacts** bölümünde `Afilli-<sürüm-kodu>-AAB` görünür.
   Arşiv içinde `.aab`, SHA-256 özeti ve `release-info.json` bulunur.
   Dosyalar yedi gün saklanır; hata halinde indirilebilir AAB çıktısı üretilmez.

Bu akış harici GitHub Actions çalışma süresi kullanır; koşullar ve kullanım
limitleri ilgili GitHub hesabına bağlıdır. Kendiliğinden çalışmaz.

## Gerçek yayından önce

Önce Google Play’in dahili test kanalında **mevcut uygulamanın üzerine
güncelleme** olarak deneyin; kaldırıp yeniden kurmak yükseltme testi değildir.
Ad/simge, üretim hesabıyla giriş, hesaplar arası veri yalıtımı, kitaplar,
yüklemeler, sohbet, video ve mağaza erişimini doğrulayın.

Eski hesapların/verilerin Afilli’de nasıl erişilebilir olacağı ayrıca
kararlaştırılmalı ve doğrulanmalı. AAB imzasının geçmesi bu veri geçişini
doğrulamaz. Play Console’daki uygulama adı, açıklamalar, görseller, gizlilik
politikası ve veri güvenliği beyanları da yeni Afilli deneyimine göre gözden
geçirilmeli. Bunlar bu akış tarafından değiştirilmez.
