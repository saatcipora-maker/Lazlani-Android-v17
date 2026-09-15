import React, { useState, useRef, useEffect } from 'react';
import {
  Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';

const FONT_SIZES = [14, 16, 18, 20, 22];
const BG_THEMES = [
  { key: 'dark', bg: '#0D0B24', text: '#F0EEF9', label: 'Koyu' },
  { key: 'sepia', bg: '#2C2416', text: '#E8D9C0', label: 'Sepya' },
  { key: 'light', bg: '#F8F6FF', text: '#1A1730', label: 'Açık' },
];

export default function ReaderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { chapter: chapterParam } = useLocalSearchParams<{ chapter: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { books, addBookmark, bookmarks } = useData();
  const { user } = useAuth();

  const [fontSizeIdx, setFontSizeIdx] = useState(1);
  const [themeIdx, setThemeIdx] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [chapterIdx, setChapterIdx] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const book = books.find(b => b.id === id);
  if (!book || book.chapters.length === 0) return null;

  const theme = BG_THEMES[themeIdx];
  const fontSize = FONT_SIZES[fontSizeIdx];
  const chapter = book.chapters[chapterIdx];
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  useEffect(() => {
    if (chapterParam) {
      const idx = book.chapters.findIndex(c => c.id === chapterParam);
      if (idx >= 0) setChapterIdx(idx);
    }
  }, [chapterParam]);

  const goNext = () => {
    if (chapterIdx < book.chapters.length - 1) {
      setChapterIdx(chapterIdx + 1);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  };

  const goPrev = () => {
    if (chapterIdx > 0) {
      setChapterIdx(chapterIdx - 1);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <StatusBar barStyle={themeIdx === 2 ? 'dark-content' : 'light-content'} />

      {/* Top bar */}
      {showControls && (
        <View style={[styles.topBar, { paddingTop: topPad + 4, backgroundColor: theme.bg + 'F0', borderBottomColor: theme.text + '20' }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color={theme.text} />
          </TouchableOpacity>
          <View style={styles.topCenter}>
            <Text style={[styles.bookTitle, { color: theme.text + 'AA' }]} numberOfLines={1}>{book.title}</Text>
            <Text style={[styles.chapterTitle, { color: theme.text }]} numberOfLines={1}>{chapter.title}</Text>
          </View>
          <View style={styles.topRight}>
            <Text style={[styles.progress, { color: theme.text + '88' }]}>{chapterIdx + 1}/{book.chapters.length}</Text>
          </View>
        </View>
      )}

      {/* Content */}
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: showControls ? 16 : topPad + 16, paddingBottom: 120 }]}
        onScrollBeginDrag={() => setShowControls(false)}
        onMomentumScrollEnd={() => setShowControls(true)}
      >
        <TouchableOpacity activeOpacity={1} onPress={() => setShowControls(v => !v)}>
          <Text style={[styles.chapterHeader, { color: theme.text, fontSize: fontSize + 4 }]}>{chapter.title}</Text>
          <Text style={[styles.body, { color: theme.text, fontSize, lineHeight: fontSize * 1.8 }]}>
            {chapter.content}
          </Text>

          {/* Chapter nav */}
          <View style={styles.chapterNav}>
            {chapterIdx > 0 && (
              <TouchableOpacity onPress={goPrev} style={[styles.navBtn, { borderColor: theme.text + '40' }]}>
                <Ionicons name="chevron-back" size={16} color={theme.text} />
                <Text style={[styles.navBtnText, { color: theme.text }]}>Önceki Bölüm</Text>
              </TouchableOpacity>
            )}
            {chapterIdx < book.chapters.length - 1 && (
              <TouchableOpacity onPress={goNext} style={[styles.navBtn, { borderColor: theme.text + '40', marginLeft: 'auto' as any }]}>
                <Text style={[styles.navBtnText, { color: theme.text }]}>Sonraki Bölüm</Text>
                <Ionicons name="chevron-forward" size={16} color={theme.text} />
              </TouchableOpacity>
            )}
            {chapterIdx === book.chapters.length - 1 && (
              <View style={[styles.finishedBanner, { borderColor: '#9B59F5' + '60', backgroundColor: '#9B59F5' + '20' }]}>
                <Ionicons name="checkmark-circle" size={22} color="#9B59F5" />
                <Text style={[styles.finishedText, { color: '#9B59F5' }]}>Kitabı Tamamladın! 🎉</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </ScrollView>

      {/* Bottom controls */}
      {showControls && (
        <View style={[styles.bottomBar, { backgroundColor: theme.bg + 'F0', borderTopColor: theme.text + '20', paddingBottom: insets.bottom + 8 }]}>
          {/* Font size */}
          <View style={styles.controlRow}>
            <Text style={[styles.controlLabel, { color: theme.text + '88' }]}>Yazı</Text>
            <TouchableOpacity
              onPress={() => setFontSizeIdx(Math.max(0, fontSizeIdx - 1))}
              style={[styles.controlBtn, { opacity: fontSizeIdx === 0 ? 0.3 : 1 }]}
            >
              <Ionicons name="remove" size={18} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.controlVal, { color: theme.text }]}>{fontSize}</Text>
            <TouchableOpacity
              onPress={() => setFontSizeIdx(Math.min(FONT_SIZES.length - 1, fontSizeIdx + 1))}
              style={[styles.controlBtn, { opacity: fontSizeIdx === FONT_SIZES.length - 1 ? 0.3 : 1 }]}
            >
              <Ionicons name="add" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>

          <View style={[styles.sep, { backgroundColor: theme.text + '20' }]} />

          {/* Theme picker */}
          <View style={styles.controlRow}>
            <Text style={[styles.controlLabel, { color: theme.text + '88' }]}>Tema</Text>
            {BG_THEMES.map((t, i) => (
              <TouchableOpacity
                key={t.key}
                onPress={() => setThemeIdx(i)}
                style={[
                  styles.themeBtn,
                  { backgroundColor: t.bg, borderColor: i === themeIdx ? '#9B59F5' : t.text + '30' }
                ]}
              >
                <Text style={[styles.themeBtnText, { color: t.text }]}>{t.label[0]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1,
  },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  topCenter: { flex: 1 },
  bookTitle: { fontFamily: 'Poppins_400Regular', fontSize: 11 },
  chapterTitle: { fontFamily: 'Poppins_600SemiBold', fontSize: 13 },
  topRight: {},
  progress: { fontFamily: 'Poppins_400Regular', fontSize: 12 },
  content: { paddingHorizontal: 24 },
  chapterHeader: { fontFamily: 'Poppins_700Bold', marginBottom: 24, lineHeight: 36 },
  body: { fontFamily: 'Poppins_400Regular' },
  chapterNav: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 48 },
  navBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
  },
  navBtnText: { fontFamily: 'Poppins_600SemiBold', fontSize: 13 },
  finishedBanner: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderWidth: 1, borderRadius: 12, padding: 14,
  },
  finishedText: { fontFamily: 'Poppins_700Bold', fontSize: 15 },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1,
  },
  controlRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  controlLabel: { fontFamily: 'Poppins_500Medium', fontSize: 12 },
  controlBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  controlVal: { fontFamily: 'Poppins_700Bold', fontSize: 14, minWidth: 22, textAlign: 'center' },
  sep: { width: 1, height: 28, marginHorizontal: 4 },
  themeBtn: {
    width: 30, height: 30, borderRadius: 15, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  themeBtnText: { fontFamily: 'Poppins_700Bold', fontSize: 11 },
});
