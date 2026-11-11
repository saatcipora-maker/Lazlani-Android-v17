const { isIP } = require('node:net');

const ANDROID_PACKAGE = 'com.lazlani.app';
const MAX_VERSION_CODE = 2100000000;
const UNSIGNED_MARKER = '// Afilli: private signing happens after Gradle has finished.';

function nextVersionCode(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) throw new Error('Play Console’daki en yüksek sürüm kodu gerekli; kaynak koddaki eski değer kullanılmaz.');
  const highest = Number(text);
  if (!Number.isSafeInteger(highest) || highest < 1 || highest >= MAX_VERSION_CODE) {
    throw new Error('Play sürüm kodu geçersiz veya Android sürüm kodu sınırına ulaşıldı.');
  }
  return highest + 1;
}

function productionHost(value) {
  const raw = String(value ?? '');
  const host = raw.toLowerCase();
  if (!host || raw !== raw.trim() || !/^[a-z0-9.-]+$/.test(host) || !host.includes('.')) {
    throw new Error('EXPO_PUBLIC_DOMAIN yalnızca yayımlanmış API’nin alan adı olmalı; protokol veya yol içermemeli.');
  }
  const url = new URL(`https://${host}`);
  if (url.hostname !== host || isIP(host) || host.endsWith('.') ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host) ||
      host.endsWith('.replit.dev') || host.endsWith('.repl.co')) {
    throw new Error('Android güncellemesi için önizleme, yerel adres veya IP değil üretim alan adı gerekli.');
  }
  return host;
}

function certificateFingerprint(value) {
  const normalized = String(value ?? '').replace(/[:\s]/g, '').toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(normalized)) {
    throw new Error('Play Console yükleme sertifikasının SHA-256 parmak izi gerekli; uygulama imzalama sertifikasıyla karıştırma.');
  }
  return normalized;
}

function prepareReleaseConfig(config, env) {
  if (config?.expo?.name !== 'Afilli' || config?.expo?.android?.package !== ANDROID_PACKAGE) {
    throw new Error('Afilli adı ve mevcut Google Play paket kimliği eşleşmiyor; başka uygulamaya derleme yapılmaz.');
  }
  const versionCode = nextVersionCode(env.AFILLI_HIGHEST_PLAY_VERSION_CODE);
  const version = String(env.AFILLI_RELEASE_VERSION ?? '').trim();
  if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version)) {
    throw new Error('Görünür sürüm numarası gerekli; örneğin 2.0.0.');
  }
  const host = productionHost(env.EXPO_PUBLIC_DOMAIN);
  const publicKey = String(env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '');
  if (!/^pk_live_[A-Za-z0-9_+/=-]+$/.test(publicKey)) {
    throw new Error('Android güncellemesi için üretim Clerk yayınlanabilir anahtarı gerekli; geliştirme anahtarı kullanılmaz.');
  }
  if (env.EXPO_PUBLIC_CLERK_PROXY_URL) {
    const proxy = new URL(env.EXPO_PUBLIC_CLERK_PROXY_URL);
    if (proxy.protocol !== 'https:' || proxy.hostname !== host || proxy.username || proxy.password || proxy.search || proxy.hash) {
      throw new Error('Clerk proxy adresi üretim API’siyle aynı HTTPS alanında olmalı.');
    }
  }
  certificateFingerprint(env.AFILLI_EXPECTED_UPLOAD_SHA256);
  const result = structuredClone(config);
  result.expo.version = version;
  result.expo.android.versionCode = versionCode;
  // Preserve the current Afilli runtime. Never copy LAZLANI's old Expo project,
  // API host, OAuth client or stored authentication tokens into this config.
  return {
    config: result,
    metadata: { package: ANDROID_PACKAGE, version, versionCode, apiOrigin: `https://${host}` },
  };
}

function unsignedGradle(source) {
  if (!source.includes('com.android.application') || !/\bandroid\s*\{/.test(source)) {
    throw new Error('Beklenen Android uygulama Gradle dosyası bulunamadı.');
  }
  if (source.includes(UNSIGNED_MARKER)) return source;
  // Do not expose the upload keystore or passwords to npm scripts or Gradle
  // plugins. Remove the template's debug signing and sign with jarsigner later.
  return `${source}\n${UNSIGNED_MARKER}\nandroid {\n    buildTypes {\n        release {\n            signingConfig = null\n        }\n    }\n}\n`;
}

function validateManifest(metadata, actual) {
  if (actual.package !== ANDROID_PACKAGE || actual.versionCode !== String(metadata.versionCode) ||
      actual.version !== metadata.version) {
    throw new Error('AAB içindeki paket veya sürüm bilgileri doğrulanmış derleme ayarlarıyla eşleşmiyor.');
  }
}

module.exports = { ANDROID_PACKAGE, nextVersionCode, productionHost, certificateFingerprint, prepareReleaseConfig, unsignedGradle, validateManifest };
