/**
 * LAZLANI — İçerik Filtresi
 * Türkçe küfür, hakaret, nefret söylemi ve spam tespiti.
 * DataContext'ten gelen dinamik bannedWords listesiyle çalışır.
 */

export type FilterLevel = 'kapali' | 'dusuk' | 'orta' | 'yuksek';

/** Varsayılan yasaklı kelime listesi */
export const DEFAULT_BANNED_WORDS: string[] = [
  // Ağır küfürler (türevleriyle birlikte)
  'orospu', 'orosp', 'sik', 'sıç', 'göt', 'amk', 'amına', 'bok',
  'yarrak', 'yarak', 'piç', 'puşt', 'ibne', 'götveren',
  // Hakaretler / aşağılayıcı
  'gerizekalı', 'aptal', 'salak', 'mal', 'dangalak', 'ahmak', 'eşek',
  'it', 'köpek oğlu', 'sürtük', 'fahişe', 'kaltak',
  // Nefret söylemi
  'defol', 'kahrol', 'gebер', 'öl',
  // Spam kalıpları
  'www.', 'http://', 'https://', 'click here', 'free money',
];

/**
 * Metni filtreler.
 * @returns { ok: true } veya { ok: false, message: string }
 */
export function filterContent(
  text: string,
  bannedWords: string[] = DEFAULT_BANNED_WORDS,
  level: FilterLevel = 'orta',
): { ok: boolean; message?: string } {
  if (level === 'kapali') return { ok: true };

  const normalized = text
    .toLowerCase()
    .replace(/[^\w\sğüşıöçğüşiöç]/gi, ' ')  // noktalama kaldır
    .replace(/0/g, 'o').replace(/3/g, 'e').replace(/1/g, 'i').replace(/4/g, 'a'); // leet speak

  // Düşük seviye — sadece ağır küfürler (ilk 10)
  const wordsToCheck =
    level === 'dusuk' ? bannedWords.slice(0, 10) :
    level === 'orta'  ? bannedWords.slice(0, 20) :
    bannedWords; // yüksek — hepsi

  const found = wordsToCheck.find(w => {
    const wn = w.toLowerCase();
    // Tam kelime eşleşmesi (kısa kelimelerde) veya içerik eşleşmesi
    return wn.length <= 3
      ? new RegExp(`\\b${wn}\\b`).test(normalized)
      : normalized.includes(wn);
  });

  if (found) {
    return {
      ok: false,
      message:
        'Paylaşımınız uygunsuz ifadeler içerdiği için yayınlanmadı. Lütfen topluluk kurallarına uygun bir dil kullanınız.',
    };
  }

  // Spam kontrolü (yüksek seviyede URL kontrolü de yapılır)
  if (level === 'yuksek') {
    if (/https?:\/\//i.test(text) || /www\./i.test(text)) {
      return { ok: false, message: 'Paylaşımınız izinsiz bağlantı içerdiği için yayınlanmadı.' };
    }
    // Aşırı tekrar (spam)
    const words = text.trim().split(/\s+/);
    const unique = new Set(words);
    if (words.length > 5 && unique.size / words.length < 0.3) {
      return { ok: false, message: 'Paylaşımınız tekrarlayan içerik (spam) içerdiği için yayınlanmadı.' };
    }
  }

  return { ok: true };
}
