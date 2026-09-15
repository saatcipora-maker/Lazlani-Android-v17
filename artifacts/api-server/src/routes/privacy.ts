import { Router } from "express";

const privacyRouter = Router();

privacyRouter.get("/privacy-policy", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Gizlilik Politikası – LAZLANI</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0D0B24;
      color: #E0D8FF;
      line-height: 1.7;
      padding: 0 16px 60px;
    }
    header {
      max-width: 720px;
      margin: 0 auto;
      padding: 48px 0 32px;
      border-bottom: 1px solid rgba(155,89,245,0.25);
    }
    .logo {
      font-size: 28px;
      font-weight: 800;
      letter-spacing: 4px;
      color: #F5C842;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      margin-top: 10px;
      color: #fff;
    }
    .updated {
      font-size: 13px;
      color: #A394CC;
      margin-top: 6px;
    }
    .intro {
      max-width: 720px;
      margin: 28px auto 0;
      background: rgba(155,89,245,0.10);
      border: 1px solid rgba(155,89,245,0.25);
      border-radius: 14px;
      padding: 16px 20px;
      font-size: 14px;
      color: #C8B8FF;
    }
    main {
      max-width: 720px;
      margin: 24px auto 0;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .item {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      padding: 18px 20px;
    }
    .item h2 {
      font-size: 15px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 6px;
    }
    .item p {
      font-size: 13.5px;
      color: #B8A8DD;
    }
    footer {
      max-width: 720px;
      margin: 36px auto 0;
      border-top: 1px solid rgba(255,255,255,0.08);
      padding-top: 20px;
      font-size: 12px;
      color: #6B5B9A;
      text-align: center;
    }
  </style>
</head>
<body>
  <header>
    <div class="logo">LAZLANI</div>
    <h1>Gizlilik Politikası</h1>
    <p class="updated">Son güncelleme: 28 Temmuz 2026</p>
  </header>

  <p class="intro">
    LAZLANI olarak kullanıcılarımızın gizliliğine önem veriyoruz. Bu politika,
    kişisel verilerinizi nasıl topladığımızı, kullandığımızı ve koruduğumuzu açıklar.
  </p>

  <main>
    <div class="item">
      <h2>1. Toplanan Veriler</h2>
      <p>Kayıt sırasında ad, e-posta ve şifre gibi temel bilgiler toplanır. Uygulama kullanımı sırasında paylaşılan içerikler (kitap, hikâye, şiir, yorum, mesaj) ve okuma istatistikleri sistemde saklanır.</p>
    </div>
    <div class="item">
      <h2>2. Kişisel Verilerin Korunması</h2>
      <p>Kullanıcıların kişisel bilgileri, 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) ve ilgili mevzuat çerçevesinde gizlilik ilkelerine uygun şekilde korunur.</p>
    </div>
    <div class="item">
      <h2>3. Veri İşleme Amacı</h2>
      <p>Toplanan veriler yalnızca uygulamanın sunduğu hizmetleri sağlamak, kullanıcı deneyimini iyileştirmek ve güvenliği sağlamak amacıyla işlenir. Reklam veya üçüncü taraf profilleme amacıyla kullanılmaz.</p>
    </div>
    <div class="item">
      <h2>4. Şifre Güvenliği</h2>
      <p>Kullanıcı şifreleri güvenli yöntemlerle saklanır. Şifreler hiçbir çalışanımız veya sistem yöneticisi tarafından görüntülenemez.</p>
    </div>
    <div class="item">
      <h2>5. Üçüncü Taraflarla Paylaşım</h2>
      <p>Kullanıcı verileri, açık rıza alınmadan üçüncü kişilerle paylaşılmaz veya satılmaz. Yasal zorunluluk bulunması veya kullanıcının onay vermesi halinde bu kural istisna oluşturabilir.</p>
    </div>
    <div class="item">
      <h2>6. Herkese Açık İçerikler</h2>
      <p>Kullanıcının herkese açık olarak paylaştığı profil bilgileri, kitap, hikâye, şiir ve yorumlar uygulama içinde diğer kullanıcılar tarafından görüntülenebilir.</p>
    </div>
    <div class="item">
      <h2>7. Cihaz İzinleri</h2>
      <p>Uygulama yalnızca işlev için gerekli olduğunda kamera, galeri ve bildirim izni talep eder. Bu izinler isteğe bağlıdır; reddedilmesi durumunda ilgili özellik çalışmaz, ancak diğer işlevler etkilenmez.</p>
    </div>
    <div class="item">
      <h2>8. Çocukların Gizliliği</h2>
      <p>LAZLANI 13 yaşın altındaki çocuklara yönelik değildir ve bilerek bu yaş grubuna ait kişisel veri toplamaz.</p>
    </div>
    <div class="item">
      <h2>9. Hesap Silme Hakkı</h2>
      <p>Kullanıcı dilediği zaman hesabını silebilir. Hesap silme talebini destek ekibimize iletebilirsiniz. Silme işleminin ardından veriler, yasal yükümlülükler saklı kalmak kaydıyla sistemden kaldırılır.</p>
    </div>
    <div class="item">
      <h2>10. Güvenlik Önlemleri</h2>
      <p>Yetkisiz erişime, veri kaybına veya değiştirilmesine karşı teknik ve idari güvenlik önlemleri uygulanır.</p>
    </div>
    <div class="item">
      <h2>11. Politika Güncellemeleri</h2>
      <p>Bu politika gerektiğinde güncellenebilir. Önemli değişiklikler uygulama içinde kullanıcılara bildirilir. Uygulamayı kullanmaya devam etmek güncel politikayı kabul etmek anlamına gelir.</p>
    </div>
    <div class="item">
      <h2>12. İletişim</h2>
      <p>Gizlilikle ilgili sorularınız için uygulama içindeki <strong>İletişim</strong> bölümünü kullanabilirsiniz.</p>
    </div>
  </main>

  <footer>
    &copy; 2026 LAZLANI — Tüm hakları saklıdır.
  </footer>
</body>
</html>`);
});

export default privacyRouter;
