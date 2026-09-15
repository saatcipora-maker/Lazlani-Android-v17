---
name: Monorepo Dependency Installs
description: Workspace bağımlılıklarının pnpm monorepo içinde doğru pakete eklenmesi
---

Monorepo’da yeni bir bağımlılık, onu kullanan workspace’in manifestine ve lockfile importer’ına eklenmelidir; kök workspace’e genel paket ekleme komutu çalıştırılmamalıdır.

**Why:** Kökten çalışan paket ekleme komutları pnpm’in workspace-root kontrolüne takılabilir veya bağımlılığı yanlış pakete yazarak uygulamanın doğrudan bağımlılık sözleşmesini bozabilir.

**How to apply:** Önce ilgili workspace `package.json` dosyasını güncelle; ardından filtrelenmiş pnpm kurulumu ile o workspace’in lockfile ve `node_modules` bağlantılarını yenile. Sonra paketin doğrudan çözümlendiğini ve workspace typecheck’inin geçtiğini doğrula.