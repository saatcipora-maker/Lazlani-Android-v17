import { Router } from "express";

const deleteAccountRouter = Router();

/* ── GET: Delete account request form ── */
deleteAccountRouter.get("/delete-account", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hesap Silme Talebi – LAZLANI</title>
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
      max-width: 600px;
      margin: 0 auto;
      padding: 48px 0 28px;
      border-bottom: 1px solid rgba(155,89,245,0.25);
    }
    .logo { font-size: 24px; font-weight: 800; letter-spacing: 4px; color: #F5C842; }
    h1 { font-size: 20px; font-weight: 700; margin-top: 10px; color: #fff; }
    .sub { font-size: 13px; color: #A394CC; margin-top: 4px; }
    main { max-width: 600px; margin: 32px auto 0; display: flex; flex-direction: column; gap: 20px; }
    .info-card {
      background: rgba(239,68,68,0.08);
      border: 1px solid rgba(239,68,68,0.25);
      border-radius: 14px;
      padding: 16px 20px;
      font-size: 13.5px;
      color: #FCA5A5;
    }
    .info-card strong { color: #EF4444; }
    .what-deleted {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      padding: 18px 20px;
    }
    .what-deleted h2 { font-size: 14px; font-weight: 700; color: #fff; margin-bottom: 10px; }
    .what-deleted ul { padding-left: 18px; display: flex; flex-direction: column; gap: 5px; }
    .what-deleted li { font-size: 13px; color: #B8A8DD; }
    .what-deleted .retained {
      margin-top: 10px; padding: 10px 14px;
      background: rgba(245,200,66,0.08); border-radius: 10px;
      font-size: 12.5px; color: #F5C842;
    }
    form { display: flex; flex-direction: column; gap: 14px; }
    label { font-size: 13px; color: #A394CC; margin-bottom: 4px; display: block; }
    input, textarea, select {
      width: 100%; padding: 12px 14px; border-radius: 10px;
      background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
      color: #E0D8FF; font-size: 14px; font-family: inherit;
      outline: none;
    }
    input:focus, textarea:focus, select:focus {
      border-color: rgba(155,89,245,0.6);
    }
    textarea { min-height: 90px; resize: vertical; }
    select option { background: #1A1040; color: #E0D8FF; }
    .checkbox-row { display: flex; align-items: flex-start; gap: 10px; }
    .checkbox-row input[type=checkbox] { width: 18px; height: 18px; margin-top: 2px; flex-shrink: 0; accent-color: #9B59F5; }
    .checkbox-row span { font-size: 13px; color: #B8A8DD; }
    button {
      padding: 14px; border-radius: 12px; border: none;
      background: linear-gradient(135deg, #9B59F5, #EC4899);
      color: #fff; font-size: 15px; font-weight: 700;
      cursor: pointer; font-family: inherit;
    }
    button:hover { opacity: 0.9; }
    .success {
      display: none; background: rgba(34,197,94,0.12);
      border: 1px solid rgba(34,197,94,0.3); border-radius: 14px;
      padding: 20px; text-align: center; color: #86EFAC; font-size: 14px;
    }
    footer {
      max-width: 600px; margin: 36px auto 0;
      border-top: 1px solid rgba(255,255,255,0.08);
      padding-top: 16px; font-size: 12px; color: #6B5B9A; text-align: center;
    }
  </style>
</head>
<body>
  <header>
    <div class="logo">LAZLANI</div>
    <h1>Hesap ve Veri Silme Talebi</h1>
    <p class="sub">Bu form aracılığıyla LAZLANI hesabınızı ve ilişkili tüm verilerinizi silebilirsiniz.</p>
  </header>

  <main>
    <div class="info-card">
      <strong>⚠️ Bu işlem geri alınamaz.</strong> Hesabınız silindikten sonra tüm
      içeriklerinize, okuma geçmişinize ve mesajlarınıza erişim kalıcı olarak sona erer.
    </div>

    <div class="what-deleted">
      <h2>Silinecek Veriler</h2>
      <ul>
        <li>Hesap bilgileri (ad, e-posta, şifre)</li>
        <li>Yayınlanmış kitap, hikâye ve şiirler</li>
        <li>Paylaşımlar, yorumlar ve beğeniler</li>
        <li>Mesajlaşma geçmişi</li>
        <li>Okuma listeleri ve okuma ilerlemesi</li>
        <li>Profil fotoğrafı ve biyografi</li>
      </ul>
      <div class="retained">
        ℹ️ Yasal yükümlülükler kapsamında gerekli olan bazı veriler mevzuata uygun süre boyunca saklanabilir.
      </div>
    </div>

    <form id="deleteForm">
      <div>
        <label for="email">E-posta Adresiniz *</label>
        <input type="email" id="email" name="email" placeholder="hesabiniz@ornek.com" required />
      </div>
      <div>
        <label for="username">Kullanıcı Adınız</label>
        <input type="text" id="username" name="username" placeholder="@kullanici_adi" />
      </div>
      <div>
        <label for="reason">Silme Sebebi (İsteğe bağlı)</label>
        <select id="reason" name="reason">
          <option value="">Bir sebep seçin...</option>
          <option value="privacy">Gizlilik endişeleri</option>
          <option value="notusing">Uygulamayı artık kullanmıyorum</option>
          <option value="alternative">Farklı bir platform kullanıyorum</option>
          <option value="content">İçerik beklentilerimi karşılamıyor</option>
          <option value="other">Diğer</option>
        </select>
      </div>
      <div>
        <label for="note">Ek Açıklama</label>
        <textarea id="note" name="note" placeholder="İsteğe bağlı ek bilgi..."></textarea>
      </div>
      <div class="checkbox-row">
        <input type="checkbox" id="confirm" name="confirm" required />
        <span>Hesabımı ve tüm ilişkili verilerimi kalıcı olarak silmek istediğimi onaylıyorum. Bu işlemin geri alınamayacağını anlıyorum.</span>
      </div>
      <button type="submit">Hesabımı Sil</button>
    </form>

    <div class="success" id="successMsg">
      ✅ Talebiniz alındı. E-posta adresinize bir doğrulama mesajı gönderilecek.
      Hesabınız <strong>7 iş günü</strong> içinde silinecektir.
    </div>
  </main>

  <footer>&copy; 2026 LAZLANI — Tüm hakları saklıdır.</footer>

  <script>
    document.getElementById('deleteForm').addEventListener('submit', function(e) {
      e.preventDefault();
      this.style.display = 'none';
      document.getElementById('successMsg').style.display = 'block';
    });
  </script>
</body>
</html>`);
});

export default deleteAccountRouter;
