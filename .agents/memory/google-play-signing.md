---
name: Google login and Play signing
description: LAZLANI Android Google girişinde Play imzası ve fiziksel cihaz doğrulaması gereksinimi.
---

Android Google OAuth istemcisinde `com.lazlani.app` paket adıyla Play App Signing sertifikasının SHA-1 değeri kayıtlı tutulmalıdır. Upload sertifikasının SHA-1 değeri bunun yerine geçmez.

**Why:** Google girişi, Play’in yeniden imzaladığı production AAB fiziksel Android cihaza internal testing üzerinden kurularak başarıyla doğrulandı. Mevcut LAZLANI hesabı açıldı; eşleşmeyen Google e-postası yeni kullanıcı oluşturmadı; iptal akışı uygulamayı bozmadı.

**How to apply:** Play App Signing anahtarı veya Android OAuth istemcisi değiştiğinde, yayın tamamlanmış sayılmadan önce aynı üç senaryoyu Play üzerinden kurulan fiziksel cihazda yeniden test et.