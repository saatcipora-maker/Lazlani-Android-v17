const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { createHash, X509Certificate } = require('node:crypto');
const { prepareReleaseConfig, unsignedGradle, certificateFingerprint, validateManifest } = require('./android-release-config.cjs');
const { uploadAliasFromListing } = require('./android-signing-alias.cjs');

const root = path.resolve(__dirname, '..');
const configPath = path.join(root, 'app.json');
const bundlePath = path.join(root, 'android/app/build/outputs/bundle/release/app-release.aab');

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} güvenli derleme ayarlarında eksik.`);
  return value;
}

function command(binary, args) {
  try {
    return execFileSync(binary, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    // Never include subprocess environment, passwords or keystore data in logs.
    throw new Error(`${binary} işlemi başarısız; araç kurulumu ve derleme ayarlarını kontrol et.`);
  }
}

function currentRelease() {
  return prepareReleaseConfig(JSON.parse(fs.readFileSync(configPath, 'utf8')), process.env);
}

async function prepare() {
  const release = currentRelease();
  if (process.env.AFILLI_SIGNING_AVAILABLE !== 'true') {
    throw new Error('Mevcut yükleme anahtarı ve parolaları güvenli derleme ortamına eklenmeden AAB üretilemez.');
  }
  const response = await fetch(`${release.metadata.apiOrigin}/api/healthz`, {
    signal: AbortSignal.timeout(30_000), redirect: 'error',
  });
  if (!response.ok || (await response.json()).status !== 'ok') {
    throw new Error('Üretim API’sinin sağlık kontrolü başarısız; derleme durduruldu.');
  }
  fs.writeFileSync(configPath, `${JSON.stringify(release.config, null, 2)}\n`);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `version_code=${release.metadata.versionCode}\n`);
  }
  console.log(`Afilli Android yapılandırması doğrulandı: ${release.metadata.package}, sürüm kodu ${release.metadata.versionCode}.`);
}

function makeUnsigned() {
  const file = path.join(root, 'android/app/build.gradle');
  fs.writeFileSync(file, unsignedGradle(fs.readFileSync(file, 'utf8')));
}

function assertCertificate(pem) {
  const certificate = typeof pem === 'string'
    ? pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/)?.[0]
    : pem;
  if (!certificate) throw new Error('Yükleme sertifikası okunamadı.');
  const actual = new X509Certificate(certificate).fingerprint256;
  if (certificateFingerprint(actual) !== certificateFingerprint(required('AFILLI_EXPECTED_UPLOAD_SHA256'))) {
    throw new Error('Yükleme anahtarı Google Play’de beklenen yükleme sertifikasıyla eşleşmiyor.');
  }
}

function withUploadKey(action) {
  const encoded = required('AFILLI_UPLOAD_KEYSTORE_BASE64');
  if (!/^[A-Za-z0-9+/=\s]+$/.test(encoded)) throw new Error('Yükleme anahtarı dosyasının kodlaması geçersiz.');
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length) throw new Error('Yükleme anahtarı dosyası boş.');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'afilli-sign-'));
  try {
    const keystore = path.join(temporary, 'upload.keystore');
    const certificate = path.join(temporary, 'upload.der');
    fs.writeFileSync(keystore, bytes, { mode: 0o600 });
    required('AFILLI_UPLOAD_STORE_PASSWORD');
    required('AFILLI_UPLOAD_KEY_PASSWORD');
    const alias = process.env.AFILLI_UPLOAD_KEY_ALIAS || uploadAliasFromListing(
      command('keytool', ['-J-Duser.language=en', '-J-Duser.country=US', '-list', '-rfc',
        '-keystore', keystore, '-storepass:env', 'AFILLI_UPLOAD_STORE_PASSWORD']),
      required('AFILLI_EXPECTED_UPLOAD_SHA256'),
    );
    command('keytool', ['-exportcert', '-keystore', keystore, '-alias', alias,
      '-storepass:env', 'AFILLI_UPLOAD_STORE_PASSWORD', '-file', certificate]);
    assertCertificate(fs.readFileSync(certificate));
    action({ keystore, alias });
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
    bytes.fill(0);
  }
}

function checkKey() {
  currentRelease();
  withUploadKey(() => {});
  console.log('Yükleme sertifikası derlemeden önce doğrulandı; geçici anahtar dosyası temizlendi.');
}

function sign() {
  currentRelease();
  const entries = command('unzip', ['-Z1', bundlePath]).split(/\r?\n/);
  if (entries.some((entry) => /^META-INF\/[^/]+\.(SF|RSA|DSA|EC)$/i.test(entry))) {
    throw new Error('AAB zaten imzalı; debug veya farklı bir imzanın üzerine imza eklenmez.');
  }
  withUploadKey(({ keystore, alias }) => {
    command('jarsigner', ['-keystore', keystore, '-storepass:env', 'AFILLI_UPLOAD_STORE_PASSWORD',
      '-keypass:env', 'AFILLI_UPLOAD_KEY_PASSWORD', '-digestalg', 'SHA-256', bundlePath, alias]);
  });
  console.log('AAB mevcut yükleme sertifikasıyla imzalandı; geçici anahtar dosyası temizlendi.');
}

function verify() {
  const { metadata } = currentRelease();
  const tool = required('AFILLI_BUNDLETOOL_JAR');
  command('java', ['-jar', tool, 'validate', `--bundle=${bundlePath}`]);
  const dump = (xpath) => command('java', ['-jar', tool, 'dump', 'manifest', `--bundle=${bundlePath}`, `--xpath=${xpath}`]).trim();
  validateManifest(metadata, {
    package: dump('/manifest/@package'),
    versionCode: dump('/manifest/@android:versionCode'),
    version: dump('/manifest/@android:versionName'),
  });
  const verification = command('jarsigner', ['-J-Duser.language=en', '-J-Duser.country=US', '-verify', bundlePath]);
  if (!/\bjar verified\./i.test(verification)) throw new Error('AAB imzası doğrulanamadı.');
  assertCertificate(command('keytool', ['-printcert', '-jarfile', bundlePath, '-rfc']));
  const directory = required('AFILLI_OUTPUT_DIR');
  fs.mkdirSync(directory, { recursive: true });
  const name = `Afilli-${metadata.versionCode}.aab`;
  fs.copyFileSync(bundlePath, path.join(directory, name));
  const sha256 = createHash('sha256').update(fs.readFileSync(bundlePath)).digest('hex');
  fs.writeFileSync(path.join(directory, `${name}.sha256`), `${sha256}  ${name}\n`);
  fs.writeFileSync(path.join(directory, 'release-info.json'), `${JSON.stringify({
    ...metadata, sha256, uploadCertificateSha256: certificateFingerprint(process.env.AFILLI_EXPECTED_UPLOAD_SHA256),
    accountMigrationVerified: false, googlePlayUploaded: false,
  }, null, 2)}\n`);
  console.log('İmzalı AAB, paket kimliği ve sürüm doğrulandı. Google Play’e yüklenmedi; eski hesap geçişi doğrulanmış değildir.');
}

async function main() {
  switch (process.argv[2]) {
    case 'prepare': await prepare(); break;
    case 'check-key': checkKey(); break;
    case 'unsigned': makeUnsigned(); break;
    case 'sign': sign(); break;
    case 'verify': verify(); break;
    default: throw new Error('İşlem gerekli: prepare, check-key, unsigned, sign veya verify.');
  }
}

main().catch((error) => {
  // Fetch failures can carry URLs/headers in their causes. Only print our own
  // short error message, never nested transport/subprocess details.
  console.error(error instanceof Error ? error.message : 'Android derlemesi başarısız.');
  process.exitCode = 1;
});
