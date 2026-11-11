import { db } from "@workspace/db";
import {
  favoriBooksTable,
  favoriNotificationsTable,
  favoriPostsTable,
  favoriProfilesTable,
  favoriReadingProgressTable,
  favoriReactionsTable,
} from "@workspace/db";

export const DEMO_PROFILE_ID = "demo-elif-yilmaz";

export const storySamples = [
  { id: "story-ayse", handle: "ayse_y", name: "Ayşe", seen: false },
  { id: "story-onur", handle: "onur.k", name: "Onur", seen: false },
  { id: "story-elif", handle: "elif.n", name: "Elif", seen: false },
  { id: "story-kerem", handle: "kerem_", name: "Kerem", seen: true },
  { id: "story-zeynep", handle: "zeynep_", name: "Zeynep", seen: false },
  { id: "story-emir", handle: "emir_", name: "Emir", seen: true },
];

const sampleProfiles = [
  {
    id: DEMO_PROFILE_ID,
    handle: "elif_yilmaz",
    name: "Elif Yılmaz",
    bio: "Kitapların arasında kendime ait bir dünya kuruyorum.",
  },
  {
    id: "demo-elif-demir",
    handle: "elif_demir",
    name: "Elif Demir",
    bio: "Okuduklarım ve kitaplardan kalanlar.",
  },
  {
    id: "demo-ayse-yilmaz",
    handle: "ayse_yilmaz",
    name: "Ayşe Yılmaz",
    bio: "Kahve, kitap ve biraz sessizlik.",
  },
  {
    id: "demo-mert-demir",
    handle: "mert_demir",
    name: "Mert Demir",
    bio: "Zamanın kıyısında yazıyorum.",
  },
  {
    id: "demo-selin-aksoy",
    handle: "selin_aksoy",
    name: "Selin Aksoy",
    bio: "Her gün birkaç sayfa daha.",
  },
  {
    id: "demo-burak-yildiz",
    handle: "burak_yildiz",
    name: "Burak Yıldız",
    bio: "Notlar, romanlar ve yeni başlangıçlar.",
  },
  {
    id: "demo-deniz-korkmaz",
    handle: "deniz_korkmaz",
    name: "Deniz Korkmaz",
    bio: "Kıyıda köşede kalmış hikâyeler.",
  },
  {
    id: "demo-zeynep-duran",
    handle: "zeynep_duran",
    name: "Zeynep Duran",
    bio: "Bir kitabın içinde kaybolmayı seviyorum.",
  },
  {
    id: "demo-kerem-aydin",
    handle: "kerem_aydin",
    name: "Kerem Aydın",
    bio: "Okur ve amatör yazar.",
  },
  {
    id: "demo-pelin-celik",
    handle: "pelin_celik",
    name: "Pelin Çelik",
    bio: "Rüzgârın getirdiği hikâyeler.",
  },
];

const sampleBooks = [
  {
    id: "sessiz-orman-gunlugu",
    title: "Sessiz Ormanın Günlüğü",
    author: "E. Yılmaz",
    authorId: "demo-elif-demir",
    category: "Roman",
    description: "Ormanın sessizliğinde kendini yeniden bulan bir kadının günlüğü.",
    content:
      "Ormanın içindeki patika, sabah ışığında gümüş gibi parlıyordu. Defterimi açtım ve uzun zamandır ilk kez acele etmeden yazmaya başladım.\n\nBir ağacın gölgesinde oturunca, sessizliğin boşluk değil; insanın kendine dönebildiği bir yer olduğunu anladım.",
    coverTone: "#42563D",
    reads: 12400,
    likes: 1200,
    commentCount: 348,
    isPromoted: true,
  },
  {
    id: "zamanin-kiyisinda",
    title: "Zamanın Kıyısında",
    author: "M. Demir",
    authorId: "demo-mert-demir",
    category: "Fantastik",
    description: "Bir saatçinin geçmiş ile gelecek arasında açtığı kapı.",
    content:
      "Saat, her gece aynı anda duruyordu. Mert bunun bir arıza olduğunu düşündü; ta ki akrebin gösterdiği dakikada kapının öte yanında kendi çocukluğunu görene kadar.",
    coverTone: "#294B68",
    reads: 9800,
    likes: 980,
    commentCount: 211,
    isPromoted: true,
  },
  {
    id: "tasin-sirri",
    title: "Taşın Sırrı",
    author: "A. Kara",
    authorId: "demo-ayse-yilmaz",
    category: "Gizem",
    description: "Kasabanın meydanındaki eski taşın sakladığı sır.",
    content:
      "Meydandaki taşın üzerinde kimsenin okuyamadığı bir yazı vardı. Leyla, harfleri tek tek kâğıda geçirince, kasabanın unutulmuş hikâyesi ortaya çıkmaya başladı.",
    coverTone: "#774434",
    reads: 7600,
    likes: 754,
    commentCount: 190,
    isPromoted: true,
  },
  {
    id: "bozkirda-bir-sabah",
    title: "Bozkırda Bir Sabah",
    author: "D. Aksoy",
    authorId: "demo-deniz-korkmaz",
    category: "Roman",
    description: "Bozkırın ortasında başlayan sakin ve cesur bir yolculuk.",
    content:
      "Güneş doğarken bozkırın rengi değişti. Eski istasyonda bekleyen iki yabancı, aynı treni beklediklerini ancak düdük duyulduğunda fark etti.",
    coverTone: "#A78962",
    reads: 5300,
    likes: 612,
    commentCount: 97,
    isPromoted: false,
  },
  {
    id: "kahve-ve-kelimeler",
    title: "Kahve ve Kelimeler",
    author: "S. Polat",
    authorId: "demo-selin-aksoy",
    category: "Kişisel Gelişim",
    description: "Günlük hayatı yavaşlatan küçük notlar ve kısa denemeler.",
    content:
      "Kahvenin soğumasını beklemek de bir çeşit sabır. Bazen cümleler, tam da hiçbir yere yetişmeye çalışmadığımızda geliyor.",
    coverTone: "#95704D",
    reads: 4900,
    likes: 543,
    commentCount: 82,
    isPromoted: false,
  },
  {
    id: "gece-defteri",
    title: "Gece Defteri",
    author: "R. Yıldız",
    authorId: "demo-burak-yildiz",
    category: "Hikâye",
    description: "Uykuyla uyanıklık arasındaki saatlerden kısa hikâyeler.",
    content:
      "Gece, pencerenin önüne sessizce oturdu. Defterime bugün olanları değil, bugün olmasını dilediğim şeyleri yazdım.",
    coverTone: "#24364A",
    reads: 3200,
    likes: 420,
    commentCount: 63,
    isPromoted: true,
  },
  {
    id: "kayip-pusulanin-izinde",
    title: "Kayıp Pusulanın İzinde",
    author: "C. Bulut",
    authorId: "demo-pelin-celik",
    category: "Macera",
    description: "Eski bir pusula, iki kardeşi haritada olmayan bir adaya götürür.",
    content:
      "Pusulanın iğnesi kuzeyi göstermiyordu. Her dönüşünde aynı noktaya, kıyıdaki terk edilmiş deniz fenerine yöneliyordu.",
    coverTone: "#D5C6A5",
    reads: 2800,
    likes: 375,
    commentCount: 51,
    isPromoted: false,
  },
  {
    id: "kayip-mektup",
    title: "Kayıp Mektup",
    author: "Ayşe Kara",
    authorId: "demo-ayse-yilmaz",
    category: "Roman",
    description: "Yıllar sonra bulunan bir mektubun değiştirdiği üç hayat.",
    content:
      "Mektup, kitaplığın arkasına düşmüş ve yıllarca orada kalmıştı. Sararmış kâğıtta yazan tek cümle, herkesin bildiği hikâyeyi değiştirdi.",
    coverTone: "#B76B32",
    reads: 15700,
    likes: 2100,
    commentCount: 220,
    isPromoted: false,
  },
  {
    id: "geceye-notlar",
    title: "Geceye Notlar",
    author: "Burak Yıldız",
    authorId: "demo-burak-yildiz",
    category: "Şiir",
    description: "Kısa gecelere ve uzun düşüncelere yazılmış şiirler.",
    content:
      "Geceyi dinledim.\nBir cümle kaldı masada,\nüzerine sabah ışığı düştü.",
    coverTone: "#24364A",
    reads: 1900,
    likes: 320,
    commentCount: 33,
    isPromoted: false,
  },
  {
    id: "tas-ve-golge",
    title: "Taş ve Gölge",
    author: "Deniz Korkmaz",
    authorId: "demo-deniz-korkmaz",
    category: "Roman",
    description: "Bir kıyı kasabasında geçen aile hikâyesi.",
    content:
      "Evin duvarında gün boyu yer değiştiren gölge, her akşam dedesinin koltuğuna kadar uzanırdı.",
    coverTone: "#805136",
    reads: 1400,
    likes: 260,
    commentCount: 29,
    isPromoted: false,
  },
  {
    id: "yildizlarin-ardinda",
    title: "Yıldızların Ardında",
    author: "Selin Aksoy",
    authorId: "demo-selin-aksoy",
    category: "Bilim Kurgu",
    description: "Uzak bir gezegenden gelen beklenmedik bir mesaj.",
    content:
      "Sinyal, yirmi yıldır boş olan istasyondan gelmişti. Ekrandaki koordinatlar, Dünya'yı gösteriyordu.",
    coverTone: "#28635E",
    reads: 1100,
    likes: 214,
    commentCount: 18,
    isPromoted: false,
  },
  {
    id: "kis-bahcesi",
    title: "Kış Bahçesi",
    author: "Zeynep Duran",
    authorId: "demo-zeynep-duran",
    category: "Roman",
    description: "Kışın ortasında açan küçük bir bahçenin hikâyesi.",
    content: "Bahçede kışın açan tek şey, yıllardır sulanmayan eski gül ağacıydı.",
    coverTone: "#B97A86",
    reads: 860,
    likes: 175,
    commentCount: 11,
    isPromoted: false,
  },
  {
    id: "sisli-liman",
    title: "Sisli Liman",
    author: "Kerem Aydın",
    authorId: "demo-kerem-aydin",
    category: "Polisiye",
    description: "Sis bastığında limanda bulunan gizemli bir valiz.",
    content: "Limanın ışıkları birer birer söndü. Valiz ise hâlâ ıslak ve sıcaktı.",
    coverTone: "#C49A45",
    reads: 720,
    likes: 140,
    commentCount: 9,
    isPromoted: false,
  },
  {
    id: "ruzgarin-yolunda",
    title: "Rüzgârın Yolunda",
    author: "Pelin Çelik",
    authorId: "demo-pelin-celik",
    category: "Macera",
    description: "Bir harita ve kayıp bir yelkenlinin izinde.",
    content: "Rüzgâr, kıyıya vuran şişedeki haritayı tam doğru yere getirmişti.",
    coverTone: "#65724D",
    reads: 600,
    likes: 121,
    commentCount: 7,
    isPromoted: false,
  },
];

const samplePosts = [
  {
    id: "post-elif-demir",
    authorId: "demo-elif-demir",
    type: "newsletter",
    title: "Sessiz Ev hakkında",
    body:
      "Az önce bitirdiğim “Sessiz Ev” beni çok etkiledi. Karakterlerin iç dünyası çok iyi işlenmiş, son bölüm tam anlamıyla şoke etti! Siz nasıl buldunuz?",
    likes: 856,
    commentCount: 142,
    views: 5300,
    allowLikes: true,
    allowComments: true,
  },
  {
    id: "post-ayse-yilmaz",
    authorId: "demo-ayse-yilmaz",
    type: "newsletter",
    title: "Sessiz Liman — Düşüncelerim",
    body:
      "Dün gece kitabı bitirdim ve uzun zamandır bu kadar sakinleştiren bir hikâyeye rastlamadım. Yazarın doğayı tasviri o kadar gerçekçi ki kendimi kıyıdaki küçük kasabada çayımı yudumlarken buldum.",
    likes: 856,
    commentCount: 142,
    views: 2400,
    allowLikes: true,
    allowComments: true,
  },
  {
    id: "post-magazine-autumn",
    authorId: "demo-selin-aksoy",
    type: "magazine",
    title: "Sonbahar Edebiyatı: Kelimelerin Sıcak Rüzgârı",
    body:
      "Bu ay, edebiyatın dönüşen sayfalarına birlikte göz atıyoruz. Kitaplar bize sadece hikâyeler anlatmaz; aynı zamanda mevsimlerin ruhunu da taşır. Sonbahar, yaprakların döküldüğü gibi kelimelerin de döküldüğü, satırların derinleştiği bir dönemdir.",
    likes: 1200,
    commentCount: 234,
    views: 5300,
    allowLikes: true,
    allowComments: true,
  },
];

const sampleNotifications = [
  {
    id: "notice-comment-1",
    actorName: "Elif Demir",
    action: "comment",
    text: "Kitabınıza yorum yaptı: Harika bir bölüm olmuş.",
    timeLabel: "2 dk önce",
    relatedBookId: "sessiz-orman-gunlugu",
  },
  {
    id: "notice-like-1",
    actorName: "Mert Demir",
    action: "like",
    text: "Kitabınızı beğendi.",
    timeLabel: "10 dk önce",
    relatedBookId: "zamanin-kiyisinda",
  },
  {
    id: "notice-save-1",
    actorName: "Ayşe Kara",
    action: "save",
    text: "Kitabınızı kaydetti.",
    timeLabel: "30 dk önce",
    relatedBookId: "tasin-sirri",
  },
  {
    id: "notice-follow-1",
    actorName: "Selin Aksoy",
    actorId: "demo-selin-aksoy",
    action: "follow",
    text: "Sizi takip etmeye başladı.",
    timeLabel: "1 sa önce",
  },
  {
    id: "notice-comment-2",
    actorName: "Burak Yıldız",
    action: "comment",
    text: "Kitabınıza yorum yaptı.",
    timeLabel: "2 sa önce",
    relatedBookId: "gece-defteri",
  },
  {
    id: "notice-like-2",
    actorName: "Deniz Korkmaz",
    action: "like",
    text: "Kitabınızı beğendi.",
    timeLabel: "3 sa önce",
    relatedBookId: "bozkirda-bir-sabah",
  },
];

let seedPromise: Promise<void> | null = null;

export function ensureSampleData(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      await db
        .insert(favoriProfilesTable)
        .values(sampleProfiles)
        .onConflictDoNothing();
      await db
        .insert(favoriBooksTable)
        .values(sampleBooks)
        .onConflictDoNothing();
      await db
        .insert(favoriPostsTable)
        .values(samplePosts)
        .onConflictDoNothing();
      await db
        .insert(favoriNotificationsTable)
        .values(
          sampleNotifications.map((item) => ({
            id: item.id,
            userId: DEMO_PROFILE_ID,
            actorName: item.actorName,
            actorAvatarUrl: null,
            action: item.action,
            text: item.text,
            timeLabel: item.timeLabel,
            relatedBookId: "relatedBookId" in item ? item.relatedBookId : null,
            relatedProfileId: "actorId" in item ? item.actorId : null,
            isRead: false,
          })),
        )
        .onConflictDoNothing();
      await db
        .insert(favoriReadingProgressTable)
        .values([
          { userId: DEMO_PROFILE_ID, bookId: "geceye-notlar", progress: 70 },
          { userId: DEMO_PROFILE_ID, bookId: "tas-ve-golge", progress: 70 },
          { userId: DEMO_PROFILE_ID, bookId: "yildizlarin-ardinda", progress: 70 },
        ])
        .onConflictDoNothing();
      await db
        .insert(favoriReactionsTable)
        .values([
          {
            userId: DEMO_PROFILE_ID,
            targetType: "book",
            targetId: "kis-bahcesi",
            kind: "save",
          },
          {
            userId: DEMO_PROFILE_ID,
            targetType: "book",
            targetId: "sisli-liman",
            kind: "save",
          },
          {
            userId: DEMO_PROFILE_ID,
            targetType: "book",
            targetId: "ruzgarin-yolunda",
            kind: "save",
          },
        ])
        .onConflictDoNothing();
    })().catch((error: unknown) => {
      seedPromise = null;
      throw error;
    });
  }
  return seedPromise;
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 9)}`;
}
