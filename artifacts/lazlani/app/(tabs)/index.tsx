import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions, FlatList, Image, Platform, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';

const SCREEN_W = Dimensions.get('window').width;
const SLIDE_W  = SCREEN_W;          // tam ekran genişliği
const SLIDE_H  = 220;               // slider yüksekliği
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome6, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import UserAvatar from '@/components/UserAvatar';

function GoalRing({ pct }: { pct: number }) {
  return (
    <View style={{ width: 66, height: 66, alignItems: 'center', justifyContent: 'center' }}>
      <View style={[styles.ringOuter, { borderColor: 'rgba(255,255,255,0.15)' }]}>
        <LinearGradient
          colors={['#EF4444', '#F97316']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.ringInner}
        />
      </View>
      <View style={styles.ringCenter}>
        <Text style={styles.ringPct}>{pct}%</Text>
      </View>
    </View>
  );
}

type CatTab = {
  key: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  isBremil?: boolean;
};

const CAT_TABS: CatTab[] = [
  { key: 'magaza', icon: 'storefront-outline', label: 'Mağaza' },
  { key: 'ozel', icon: 'sparkles-outline', label: 'Özel' },
  { key: 'bulten', icon: 'newspaper-outline', label: 'Bültenler' },
  { key: 'dergi', icon: 'book-outline', label: 'Dergi' },
  { key: 'bremil', icon: 'star-outline', label: 'Bremil', isBremil: true },
];

/* ── Neon border color per genre ──────────────────────────── */
const GENRE_NEON: Record<string, string> = {
  'Roman':       '#F97316',
  'Romantik':    '#EC4899',
  'Gerilim':     '#06B6D4',
  'Polisiye':    '#06B6D4',
  'Macera':      '#22C55E',
  'Tarihi':      '#84CC16',
  'Bilim Kurgu': '#A855F7',
  'Fantastik':   '#8B5CF6',
  'Şiir':        '#F59E0B',
  'Drama':       '#EF4444',
  'Hikâye':      '#3B82F6',
  'Hikaye':      '#3B82F6',
  'Aile':        '#10B981',
};

export default function HomeScreen() {
  const colors   = useColors();
  const insets   = useSafeAreaInsets();
  const router   = useRouter();
  const { user } = useAuth();
  const { books, unreadNotifCount, weeklyBookId } = useData();
  const weeklyBook = weeklyBookId ? books.find(b => b.id === weeklyBookId) : books.find(b => b.isEditorChoice);
  const topPad   = Platform.OS === 'web' ? 67 : insets.top;

  const [activeCat, setActiveCat] = useState('magaza');
  const [slideIndex,   setSlideIndex]   = useState(0);
  const [showLoveButton, setShowLoveButton] = useState(false);
  const slideRef  = useRef<FlatList>(null);
  const slideTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Slayt kitapları — haftalık + editör seçimleri (en az 3, max 6)
  const slideBooks = [
    ...(weeklyBook ? [weeklyBook] : []),
    ...books.filter(b => b.isEditorChoice && b.id !== weeklyBook?.id),
    ...books.filter(b => b.isFeatured   && b.id !== weeklyBook?.id && !b.isEditorChoice),
  ].slice(0, 6);
  const slideCount = slideBooks.length;

  // Otomatik sağdan sola kayma
  const goNext = useCallback(() => {
    if (!slideCount) return;
    setSlideIndex(prev => {
      const next = (prev + 1) % slideCount;
      slideRef.current?.scrollToIndex({ index: next, animated: true });
      return next;
    });
  }, [slideCount]);

  useEffect(() => {
    if (slideCount < 2) return;
    slideTimer.current = setInterval(goNext, 3500);
    return () => { if (slideTimer.current) clearInterval(slideTimer.current); };
  }, [goNext, slideCount]);

  const handleCatPress = (cat: CatTab) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (cat.key === 'bulten') { router.push('/bulten' as any); return; }
    if (cat.key === 'dergi') { router.push('/dergi' as any); return; }
    if (cat.key === 'ozel') { router.push('/ozel' as any); return; }
    if (cat.key === 'bremil') { router.push('/bremil' as any); return; }
    setActiveCat(cat.key);
  };

  return (
      <View testID="screen-home" style={[styles.root, { backgroundColor: colors.background }]}>

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topPad + 10 }]}>
        <View style={styles.logoGroup}>
          <Text style={styles.logo}>LAZLANİ</Text>
          <TouchableOpacity
            testID="header-chat-button"
            accessibilityRole="button"
            accessibilityLabel="LOVE butonunu göster"
            accessibilityState={{ expanded: showLoveButton }}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowLoveButton(current => !current);
            }}
            activeOpacity={0.72}
            hitSlop={8}
            style={[
              styles.headerChatButton,
              {
                backgroundColor: `${colors.primary}16`,
                borderColor: `${colors.primary}80`,
              },
            ]}
          >
            <FontAwesome6 name="star-and-crescent" size={15} color={colors.primary} />
          </TouchableOpacity>
          {showLoveButton && (
            <TouchableOpacity
              testID="header-love-button"
              accessibilityRole="button"
              accessibilityLabel="LOVE"
              accessibilityHint="Topluluk ekranını açar"
              onPress={() => router.push('/minnit-chat' as any)}
              activeOpacity={0.78}
              style={[
                styles.loveButton,
                {
                  backgroundColor: `${colors.primary}20`,
                  borderColor: `${colors.primary}80`,
                },
              ]}
            >
              <Text style={[styles.loveButtonText, { color: colors.primary }]}>LOVE</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/discover' as any)}
            style={styles.iconBtn}
          >
            <Ionicons name="search-outline" size={22} color="#E0D8FF" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/notifications' as any)}
            style={styles.iconBtn}
          >
            <Ionicons name="notifications-outline" size={22} color="#E0D8FF" />
            {unreadNotifCount > 0 && <View style={styles.notifDot} />}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(tabs)/profile' as any)}>
            <UserAvatar
              name={user?.displayName ?? 'Kullanıcı'}
              color={user?.avatarColor ?? '#9B59F5'}
              size={34}
              imageUri={user?.avatarUrl}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catRow}
        >
          {CAT_TABS.map(cat => {
            const isActive = activeCat === cat.key;
            if (cat.isBremil) {
              return (
                <TouchableOpacity key={cat.key} onPress={() => handleCatPress(cat)} activeOpacity={0.82}>
                  <View style={[
                    styles.bremilTab,
                    isActive && styles.bremilTabActive,
                    { borderColor: isActive ? '#F5C842' : 'rgba(245,200,66,0.35)' },
                  ]}>
                    <Ionicons name="star" size={12} color={isActive ? '#F5C842' : 'rgba(245,200,66,0.6)'} />
                    <Text style={[styles.bremilTxt, { color: isActive ? '#F5C842' : 'rgba(245,200,66,0.7)' }]}>
                      Bremil
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }

            return (
              <TouchableOpacity key={cat.key} onPress={() => handleCatPress(cat)} activeOpacity={0.82}>
                {isActive ? (
                  <LinearGradient
                    colors={['#9B59F5', '#EC4899']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={styles.catActive}
                  >
                    <Ionicons name={cat.icon} size={14} color="#fff" />
                    <Text style={styles.catActiveTxt}>{cat.label}</Text>
                  </LinearGradient>
                ) : (
                  <View style={styles.catInactive}>
                    <Ionicons name={cat.icon} size={14} color="#C8B8FF" />
                    <Text style={styles.catInactiveTxt}>{cat.label}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Haftanın Kitabı Slayt ── */}
        {slideCount > 0 && (
          <View style={styles.sliderWrap}>
            {/* Başlık */}
            <View style={styles.sliderHeader}>
              <Ionicons name="trophy" size={14} color="#F5C842" />
              <Text style={styles.sliderTitle}>LAZLANİ ÖNERİLERİ</Text>
            </View>

            {/* Carousel */}
            <FlatList
              ref={slideRef}
              data={slideBooks}
              keyExtractor={b => b.id}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              scrollEnabled
              onMomentumScrollEnd={e => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / SLIDE_W);
                setSlideIndex(idx);
                // Elle kaydırıldığında timer'ı sıfırla
                if (slideTimer.current) clearInterval(slideTimer.current);
                slideTimer.current = setInterval(goNext, 3500);
              }}
              getItemLayout={(_, i) => ({ length: SLIDE_W, offset: SLIDE_W * i, index: i })}
              renderItem={({ item: book }) => {
                const neon = GENRE_NEON[book.genre] ?? '#9B59F5';
                return (
                  <TouchableOpacity
                    onPress={() => router.push(`/book/${book.id}` as any)}
                    activeOpacity={0.9}
                    style={styles.slide}
                  >
                    {/* Kapak */}
                    {book.coverUrl ? (
                      <Image source={{ uri: book.coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    ) : (
                      <LinearGradient
                        colors={[book.coverColor, book.coverColor + 'BB', '#050210']}
                        style={StyleSheet.absoluteFill}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      />
                    )}

                    {/* Karartma gradyanı */}
                    <LinearGradient
                      colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.75)']}
                      style={StyleSheet.absoluteFill}
                      start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                    />

                    {/* Alt bilgi çubuğu */}
                    <View style={styles.slideBar}>
                      <Text style={styles.slideAuthor} numberOfLines={1}>
                        {book.authorName.toUpperCase()}
                      </Text>
                      <View style={[styles.slideReadBtn, { backgroundColor: neon }]}>
                        <Ionicons name="book" size={12} color="#fff" />
                        <Text style={styles.slideReadBtnTxt}>KİTAP OKU</Text>
                      </View>
                      <Text style={[styles.slideGenre, { color: neon }]} numberOfLines={1}>
                        {book.genre.toUpperCase()}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />

            {/* Nokta göstergeleri */}
            {slideCount > 1 && (
              <View style={styles.dotRow}>
                {slideBooks.map((_, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => {
                      slideRef.current?.scrollToIndex({ index: i, animated: true });
                      setSlideIndex(i);
                    }}
                    style={[
                      styles.dot,
                      i === slideIndex
                        ? { backgroundColor: '#F5C842', width: 18 }
                        : { backgroundColor: 'rgba(255,255,255,0.3)', width: 7 },
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── Sinematik Neon Kart Listesi ── */}
        {(() => {
          // Haftanın kitabı önce, geri kalan kitaplar arkadan
          const sorted = weeklyBook
            ? [weeklyBook, ...books.filter(b => b.id !== weeklyBook.id)]
            : books;

          return sorted.map((book, idx) => {
            const neon = GENRE_NEON[book.genre] ?? '#9B59F5';
            const isWeekly = weeklyBook?.id === book.id;

            return (
              <View
                key={book.id}
                style={[
                  styles.neonOuter,
                  { borderColor: neon },
                  Platform.OS === 'ios' && {
                    shadowColor: neon,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.85,
                    shadowRadius: 12,
                  },
                ]}
              >
                <TouchableOpacity
                  onPress={() => router.push(`/book/${book.id}` as any)}
                  activeOpacity={0.88}
                  style={styles.neonCard}
                >
                  {/* Kapak görseli */}
                  {book.coverUrl ? (
                    <Image
                      source={{ uri: book.coverUrl }}
                      style={StyleSheet.absoluteFill}
                      resizeMode="cover"
                    />
                  ) : (
                    <LinearGradient
                      colors={[book.coverColor, book.coverColor + 'BB', '#080512']}
                      style={StyleSheet.absoluteFill}
                      start={{ x: 0.1, y: 0 }}
                      end={{ x: 0.9, y: 1 }}
                    />
                  )}

                  {/* Hafif karartma gradyanı — altta daha koyu */}
                  <LinearGradient
                    colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.30)', 'rgba(0,0,0,0.72)']}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                  />

                  {/* Haftanın Kitabı rozeti */}
                  {isWeekly && (
                    <View style={[styles.neonWeeklyBadge, { borderColor: neon }]}>
                      <Ionicons name="trophy" size={10} color={neon} />
                      <Text style={[styles.neonWeeklyBadgeTxt, { color: neon }]}>HAFTANIN KİTABI</Text>
                    </View>
                  )}

                  {/* Alt bilgi çubuğu */}
                  <View style={styles.neonBar}>
                    <Text style={styles.neonAuthor} numberOfLines={1}>
                      {book.authorName.toUpperCase()}
                    </Text>

                    <View style={[styles.neonReadBtn, { backgroundColor: neon }]}>
                      <Ionicons name="book" size={13} color="#fff" />
                      <Text style={styles.neonReadBtnTxt}>KİTAP OKU</Text>
                    </View>

                    <Text style={[styles.neonGenre, { color: neon }]} numberOfLines={1}>
                      {book.genre.toUpperCase()}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            );
          });
        })()}

        <View style={styles.statRow}>
          <View style={[styles.statCard, { backgroundColor: '#3A2F5A' }]}>
            <View style={styles.statCardTop}>
              <View style={[styles.statIcon, { backgroundColor: '#7F1D1D' }]}>
                <Ionicons name="book" size={17} color="#EF4444" />
              </View>
              <Text style={styles.statCardTitle}>OKUMA{'\n'}HEDEFİN</Text>
            </View>
            <View style={styles.statCardBody}>
              <GoalRing pct={75} />
              <Text style={styles.statCardTxt}>Sana özel 20 kitap hedefi hazırlandı!</Text>
            </View>
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push('/lazlani-ai' as any)}
            style={[styles.statCard, { backgroundColor: '#3A3020' }]}
          >
            <View style={styles.statCardTop}>
              <View style={[styles.statIcon, { backgroundColor: '#78350F' }]}>
                <Ionicons name="sparkles" size={17} color="#F59E0B" />
              </View>
              <Text style={[styles.statCardTitle, { color: '#F59E0B' }]}>LAZLANİ AI</Text>
            </View>
            <View style={{ paddingTop: 10, gap: 6 }}>
              <Text style={styles.statCardTxt}>Kitap, hikâye ve şiir önerileri için dokunun</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' }} />
                <Text style={[styles.statCardTxt, { fontSize: 10, color: '#22C55E' }]}>Çevrim içi</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        <View style={{ height: 110 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  /* Header */
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12, gap: 8,
  },
  logoGroup: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8,
  },
  logo: {
    textAlign: 'center',
    fontFamily: 'Poppins_700Bold', fontSize: 21,
    color: '#F5C842', letterSpacing: 2,
  },
  headerChatButton: {
    width: 30, height: 30, borderRadius: 15, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  loveButton: {
    height: 28, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  loveButtonText: { fontFamily: 'Poppins_700Bold', fontSize: 10, letterSpacing: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconBtn: { position: 'relative', padding: 4 },
  notifDot: {
    position: 'absolute', top: 4, right: 4,
    width: 7, height: 7, borderRadius: 4, backgroundColor: '#EF4444',
  },

  /* Category tabs — refined */
  catRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 4 },
  catActive: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 22,
  },
  catActiveTxt: { color: '#fff', fontFamily: 'Poppins_600SemiBold', fontSize: 13 },
  catInactive: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  catInactiveTxt: { color: '#C8B8FF', fontFamily: 'Poppins_400Regular', fontSize: 13 },

  /* Bremil — smaller + gold */
  bremilTab: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 18,
    borderWidth: 1, backgroundColor: 'rgba(245,200,66,0.06)',
  },
  bremilTabActive: { backgroundColor: 'rgba(245,200,66,0.12)' },
  bremilTxt: { fontFamily: 'Poppins_500Medium', fontSize: 11 },

  /* GÜNÜN KİTABI */
  dayRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, marginTop: 8,
  },
  dayBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(155,89,245,0.25)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18,
  },
  dayBadgeTxt: { color: '#E0D8FF', fontFamily: 'Poppins_600SemiBold', fontSize: 12, letterSpacing: 0.5 },
  pauseBtn: {
    width: 36, height: 36, borderRadius: 11,
    backgroundColor: '#3D3468', alignItems: 'center', justifyContent: 'center',
  },

  /* Hero */
  heroWrap: { marginHorizontal: 16 },
  heroCard: { height: 220, borderRadius: 20, overflow: 'hidden', justifyContent: 'flex-end' },
  heroOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 140 },
  heroContent: { padding: 18, gap: 3 },
  heroTitle: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: 25, lineHeight: 31 },
  heroAuthor: { color: 'rgba(255,255,255,0.75)', fontFamily: 'Poppins_500Medium', fontSize: 12 },
  heroMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  heroBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 11,
  },
  heroBadgeTxt: { color: '#fff', fontFamily: 'Poppins_500Medium', fontSize: 11 },
  heroStats: { flexDirection: 'row', gap: 12, marginTop: 6 },
  heroStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroStatTxt: { color: '#E0D8FF', fontFamily: 'Poppins_400Regular', fontSize: 11 },
  readBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 15, borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
  },
  readBtnTxt: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: 15 },

  /* Stat cards */
  statRow: { flexDirection: 'row', gap: 12, marginHorizontal: 16 },
  statCard: { flex: 1, borderRadius: 16, padding: 13, gap: 5 },
  statCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statIcon: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  statCardTitle: { color: '#EF4444', fontFamily: 'Poppins_700Bold', fontSize: 11, flex: 1, lineHeight: 15 },
  statCardBody: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  statCardTxt: { color: '#E0D8FF', fontFamily: 'Poppins_400Regular', fontSize: 11, lineHeight: 17, flex: 1 },

  /* Ring */
  ringOuter: { width: 56, height: 56, borderRadius: 28, borderWidth: 5, position: 'absolute', overflow: 'hidden' },
  ringInner: { ...StyleSheet.absoluteFillObject },
  ringCenter: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#3A2F5A', alignItems: 'center', justifyContent: 'center' },
  ringPct: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: 12 },

  /* Sections */
  scroll: { gap: 16, paddingTop: 6 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 16,
  },
  sectionTitle: { color: '#E0D8FF', fontFamily: 'Poppins_700Bold', fontSize: 15 },
  seeAll: { fontFamily: 'Poppins_600SemiBold', fontSize: 12 },

  /* ── Haftanın Kitabı Slayt ── */
  sliderWrap: { gap: 0 },
  sliderHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 16, paddingBottom: 10,
  },
  sliderTitle: {
    color: '#F5C842', fontFamily: 'Poppins_700Bold',
    fontSize: 13, letterSpacing: 1,
  },
  slide: {
    width: SLIDE_W,
    height: SLIDE_H,
    justifyContent: 'flex-end',
    backgroundColor: '#08051A',
    overflow: 'hidden',
  },
  slideBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(4,2,14,0.88)',
    paddingHorizontal: 14, paddingVertical: 12,
    gap: 10,
  },
  slideAuthor: {
    flex: 1, color: '#FFFFFF',
    fontFamily: 'Poppins_700Bold', fontSize: 11, letterSpacing: 0.5,
  },
  slideReadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20,
  },
  slideReadBtnTxt: {
    color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: 11, letterSpacing: 0.3,
  },
  slideGenre: {
    flex: 1, fontFamily: 'Poppins_700Bold', fontSize: 10,
    letterSpacing: 0.5, textAlign: 'right',
  },
  dotRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: 5, paddingVertical: 10,
  },
  dot: { height: 7, borderRadius: 4 },

  /* ── Sinematik Neon Kart ── */
  neonOuter: {
    marginHorizontal: 14,
    borderRadius: 16,
    borderWidth: 2,
    // Android elevation (colored shadow iOS'ta)
    elevation: 10,
  },
  neonCard: {
    height: 210,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#08051A',
    justifyContent: 'flex-end',
  },
  neonWeeklyBadge: {
    position: 'absolute', top: 12, left: 12,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  neonWeeklyBadgeTxt: {
    fontFamily: 'Poppins_700Bold', fontSize: 10, letterSpacing: 0.8,
  },
  neonBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(4,2,14,0.92)',
    paddingHorizontal: 14, paddingVertical: 12,
    gap: 10,
  },
  neonAuthor: {
    flex: 1,
    color: '#FFFFFF',
    fontFamily: 'Poppins_700Bold',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  neonReadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 22,
  },
  neonReadBtnTxt: {
    color: '#fff',
    fontFamily: 'Poppins_700Bold',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  neonGenre: {
    flex: 1,
    fontFamily: 'Poppins_700Bold',
    fontSize: 10,
    letterSpacing: 0.5,
    textAlign: 'right',
  },

  /* Posts */
  postCard: { marginHorizontal: 16, borderRadius: 16, padding: 13, gap: 8 },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  postName: { fontFamily: 'Poppins_600SemiBold', fontSize: 13 },
  postTitle: { fontFamily: 'Poppins_700Bold', fontSize: 14 },
  postContent: { fontFamily: 'Poppins_400Regular', fontSize: 13, lineHeight: 20 },
  postActions: { flexDirection: 'row', gap: 18 },
  postAction: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  postActionTxt: { fontFamily: 'Poppins_400Regular', fontSize: 12 },
});
