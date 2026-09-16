---
name: LOVE chat architecture
description: LOVE sohbeti için kalıcı veri ve gerçek zamanlı taşıma sınırının neden ayrı tutulduğunu açıklar.
---

LOVE mesajları, konuşma üyeliği, okundu bilgisi, engelleme ve moderasyon ilişkisel sohbet tablolarında tutulmalıdır. Genel sosyal eşitleme kayıtları sohbet geçmişinin kalıcı kaynağı yapılmamalıdır. Gerçek zamanlı bildirim ve tekrar yakalama ise mevcut dayanıklı SSE olay günlüğü üzerinden yürütülmelidir; ikinci bir WebSocket sistemi eklenmemelidir.

**Why:** Sohbet gizliliği, üyelik yetkilendirmesi, sıralı sayfalama, atomik tekrar önleme ve moderasyon veritabanı kısıtları gerektirir. Ayrı bir gerçek zamanlı taşıma sistemi ise oturum, yeniden bağlanma ve çoklu sunucu davranışını gereksiz yere çoğaltır.

**How to apply:** Yeni LOVE mesaj türleri ve yönetim özelliklerinde ilişkisel sohbet modelini genişlet; istemcilere yapılan canlı dağıtımda mevcut SSE cursor, replay ve PostgreSQL bildirim mekanizmasını koru.