const { X509Certificate } = require('node:crypto');
const { certificateFingerprint } = require('./android-release-config.cjs');

// Parse only English keytool -list -rfc output. Never log the listing or aliases.
// The selected entry is independently exported and checked again before use.
function uploadAliasFromListing(listing, expectedFingerprint) {
  const expected = certificateFingerprint(expectedFingerprint);
  const entries = String(listing).replace(/\r\n/g, '\n').split(/^Alias name: /m).slice(1);
  const matches = [];
  for (const entry of entries) {
    const newline = entry.indexOf('\n');
    if (newline < 0) continue;
    const alias = entry.slice(0, newline);
    const details = entry.slice(newline + 1);
    if (!/^Entry type: PrivateKeyEntry$/m.test(details)) continue;
    const pem = details.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/)?.[0];
    if (!pem) throw new Error('Anahtar listesindeki özel anahtar sertifikası okunamadı.');
    let actual;
    try {
      actual = certificateFingerprint(new X509Certificate(pem).fingerprint256);
    } catch {
      throw new Error('Anahtar listesindeki sertifika biçimi doğrulanamadı.');
    }
    if (actual !== expected) continue;
    // Reject control characters and option-like names, rather than guessing
    // how keytool/jarsigner would interpret unusual aliases.
    if (!alias || alias !== alias.trim() || /^-/.test(alias) || /[\x00-\x1f\x7f]/.test(alias)) {
      throw new Error('Alias güvenli biçimde otomatik seçilemedi; AFILLI_UPLOAD_KEY_ALIAS gerekli.');
    }
    matches.push(alias);
  }
  if (matches.length !== 1) {
    throw new Error('Play yükleme sertifikasıyla eşleşen tek bir özel anahtar bulunamadı; dosyayı ve parmak izini kontrol et veya AFILLI_UPLOAD_KEY_ALIAS ekle.');
  }
  return matches[0];
}

module.exports = { uploadAliasFromListing };
