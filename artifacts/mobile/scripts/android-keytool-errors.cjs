// Return only fixed, safe diagnostics. Never return subprocess arguments,
// original error messages, certificate listings, passwords or file contents.
const messages = Object.freeze({
  missing: 'keytool aracı bulunamadı; Java kurulumunu kontrol et.',
  password: 'Anahtar deposu açılamadı: dosya parolası yanlış olabilir veya dosya bütünlüğü bozulmuş olabilir. AFILLI_UPLOAD_STORE_PASSWORD kaydını kontrol et.',
  format: 'Anahtar dosyası JKS/PKCS12 biçiminde açılamadı. AFILLI_UPLOAD_KEYSTORE_BASE64 kaydının doğru dosyadan hazırlandığını kontrol et.',
  algorithm: 'Anahtar dosyasının şifreleme algoritması bu Java sürümünde açılamadı; Java uyumluluğunu kontrol et.',
  alias: 'Belirtilen anahtar adı dosyada bulunamadı; AFILLI_UPLOAD_KEY_ALIAS ayarını kontrol et.',
  fallback: 'keytool işlemi başarısız; araç kurulumu ve derleme ayarlarını kontrol et.',
});

function diagnosticText(value) {
  if (Buffer.isBuffer(value)) return value.subarray(0, 65536).toString('utf8');
  return typeof value === 'string' ? value.slice(0, 65536) : '';
}

function safeKeytoolError(error) {
  if (error?.code === 'ENOENT') return messages.missing;
  const output = `${diagnosticText(error?.stdout)}\n${diagnosticText(error?.stderr)}`;
  // Unsupported encryption can be nested inside a generic opening failure.
  if (/NoSuchAlgorithmException|AlgorithmParameters not available|parseAlgParameters failed/i.test(output)) {
    return messages.algorithm;
  }
  if (/keystore was tampered with|password was incorrect|password verification failed|integrity check failed|failed to decrypt safe contents/i.test(output)) {
    return messages.password;
  }
  if (/unrecognized keystore format|invalid keystore format|not a valid keystore|toDerInputStream rejects tag|not enough content|short read of DER length|EOFException/i.test(output)) {
    return messages.format;
  }
  if (/Alias <[^\r\n]*> does not exist/i.test(output)) return messages.alias;
  return messages.fallback;
}

module.exports = { safeKeytoolError };
