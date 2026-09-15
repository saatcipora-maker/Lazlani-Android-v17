import React, { useState } from 'react';
import {
  Alert, Image, Platform,
  ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { Book, Chapter, Poem, Post, Story } from '@/data/types';
import { uploadBookCover } from '@/services/coverUpload';

const TYPES = [
  { key: 'book',  label: 'Kitap',   icon: 'library-outline'    as const, desc: 'Bölümlere ayrılmış uzun eser' },
  { key: 'story', label: 'Hikaye',  icon: 'book-outline'       as const, desc: 'Kısa veya orta uzunlukta anlatı' },
  { key: 'poem',  label: 'Şiir',    icon: 'leaf-outline'       as const, desc: 'Mısralardan oluşan edebi eser' },
  { key: 'post',  label: 'Gönderi', icon: 'chatbubble-outline' as const, desc: 'Toplulukla düşünce veya alıntı paylaş' },
];

const GENRES = ['Roman','Romantik','Macera','Fantastik','Bilim Kurgu','Gerilim','Şiir','Hikaye','Aile','Drama'];
const COVER_COLORS = ['#7F1D1D','#78350F','#1E3A5F','#1E3A8A','#4C1D95','#065F46','#7C2D12','#581C87'];

interface ChapterDraft {
  id: string;
  title: string;
  content: string;
  order: number;
}

export default function WriteScreen() {
  const colors   = useColors();
  const insets   = useSafeAreaInsets();
  const router   = useRouter();
  const { user } = useAuth();
  const { addBook, addStory, addPoem, addPost, checkContent } = useData();
  const topPad   = Platform.OS === 'web' ? 67 : insets.top;
  const botPad   = Platform.OS === 'web' ? 32 : insets.bottom + 16;

  const [type,       setType]       = useState<'book'|'story'|'poem'|'post'>('book');
  const [title,      setTitle]      = useState('');
  const [description,setDescription] = useState('');
  const [content,    setContent]    = useState('');
  const [genre,      setGenre]      = useState(GENRES[0]);
  const [coverColor, setCoverColor] = useState(COVER_COLORS[0]);
  const [coverUri,   setCoverUri]   = useState<string | null>(null);
  const [step,       setStep]       = useState<'type'|'form'|'chapter'>('type');
  const [isDraft,    setIsDraft]    = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // Chapter management
  const [chapters,       setChapters]      = useState<ChapterDraft[]>([]);
  const [editingChapter, setEditingChapter] = useState<ChapterDraft | null>(null);
  const [chapterTitle,   setChapterTitle]   = useState('');
  const [chapterContent, setChapterContent] = useState('');

  if (!user) return null;

  /* ── Image picker ── */
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('İzin gerekli', 'Galeriye erişmek için izin vermeniz gerekiyor.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [16, 9], quality: 0.9 });
    if (!result.canceled && result.assets[0]) setCoverUri(result.assets[0].uri);
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('İzin gerekli', 'Kameraya erişmek için izin vermeniz gerekiyor.'); return; }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [16, 9], quality: 0.9 });
    if (!result.canceled && result.assets[0]) setCoverUri(result.assets[0].uri);
  };

  const showImageOptions = () => Alert.alert('Kapak Görseli', 'Görsel kaynağını seç', [
    { text: 'Galeri', onPress: pickImage },
    { text: 'Kamera', onPress: takePhoto },
    { text: 'İptal', style: 'cancel' },
  ]);

  /* ── Save / Publish ── */
  const handlePublish = async (draft = false) => {
    if (isPublishing) return;
    if (!title.trim()) { Alert.alert('Hata', 'Başlık zorunludur.'); return; }
    if (!draft) {
      const texts = [title, description, content].filter(Boolean).join(' ');
      const check = checkContent(texts);
      if (!check.ok) { Alert.alert('İçerik Filtresi', check.message ?? 'Uygunsuz içerik tespit edildi.'); return; }
    }
    setIsPublishing(true);
    let persistentCoverUrl: string | undefined;
    try {
      persistentCoverUrl = type === 'book' && coverUri
        ? await uploadBookCover(coverUri)
        : coverUri ?? undefined;
    } catch (error) {
      Alert.alert(
        'Kapak yüklenemedi',
        error instanceof Error ? error.message : 'Kapak görseli yüklenemedi. Lütfen tekrar deneyin.',
      );
      setIsPublishing(false);
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const base = {
      id, authorId: user.id, authorName: user.displayName,
      authorAvatarColor: user.avatarColor,
      isDraft: draft, createdAt: new Date().toISOString(),
    };

    if (type === 'book') {
      const mappedChapters: Chapter[] = chapters.map((c, i) => ({
        id: c.id,
        bookId: id,
        title: c.title,
        content: c.content,
        wordCount: c.content.split(/\s+/).filter(Boolean).length,
        order: i + 1,
        isDraft: false,
        createdAt: new Date().toISOString(),
        summary: c.content.slice(0, 120) + '…',
      }));
      addBook({
        ...base, title, description, genre, tags: [],
        coverColor, coverUrl: persistentCoverUrl,
        chapters: mappedChapters,
        likesCount: 0, commentsCount: 0,
        rating: 0, ratingCount: 0, readCount: 0,
        isFeatured: false, isEditorChoice: false,
      } as Book);
    } else if (type === 'story') {
      addStory({
        ...base, title, description, content, genre, tags: [],
        coverColor, coverUrl: coverUri ?? undefined,
        likesCount: 0, commentsCount: 0, rating: 0, ratingCount: 0, readCount: 0,
      } as Story);
    } else if (type === 'poem') {
      addPoem({
        ...base, title, content, tags: [],
        coverColor, coverUrl: coverUri ?? undefined,
        likesCount: 0, commentsCount: 0, rating: 0, ratingCount: 0,
      } as Poem);
    } else {
      addPost({ ...base, content: title + (content ? '\n\n' + content : ''), likesCount: 0, commentsCount: 0, sharesCount: 0 } as Post);
    }

    setIsPublishing(false);
    router.back();
  };

  /* ── Chapter helpers ── */
  const openNewChapter = () => {
    setEditingChapter(null);
    setChapterTitle('');
    setChapterContent('');
    setStep('chapter');
  };

  const openEditChapter = (ch: ChapterDraft) => {
    setEditingChapter(ch);
    setChapterTitle(ch.title);
    setChapterContent(ch.content);
    setStep('chapter');
  };

  const saveChapter = () => {
    if (!chapterTitle.trim()) { Alert.alert('Hata', 'Bölüm başlığı zorunludur.'); return; }
    if (editingChapter) {
      setChapters(prev => prev.map(c => c.id === editingChapter.id
        ? { ...c, title: chapterTitle.trim(), content: chapterContent }
        : c
      ));
    } else {
      setChapters(prev => [...prev, {
        id: Date.now().toString(),
        title: chapterTitle.trim(),
        content: chapterContent,
        order: prev.length + 1,
      }]);
    }
    setStep('form');
  };

  const deleteChapter = (id: string) => {
    Alert.alert('Bölümü Sil', 'Bu bölüm silinecek. Emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => setChapters(prev => prev.filter(c => c.id !== id)) },
    ]);
  };

  const moveChapter = (id: string, dir: 'up' | 'down') => {
    setChapters(prev => {
      const idx = prev.findIndex(c => c.id === id);
      if (dir === 'up' && idx === 0) return prev;
      if (dir === 'down' && idx === prev.length - 1) return prev;
      const next = [...prev];
      const swap = dir === 'up' ? idx - 1 : idx + 1;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next.map((c, i) => ({ ...c, order: i + 1 }));
    });
  };

  const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

  /* ──────────────────────────────────────────
     STEP 1 — Type selection
  ──────────────────────────────────────────── */
  if (step === 'type') {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="close" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Yeni Eser</Text>
          <View style={{ width: 32 }} />
        </View>
        <ScrollView contentContainerStyle={styles.typeList}>
          <Text style={[styles.typeHint, { color: colors.mutedForeground }]}>Ne yazmak istiyorsun?</Text>
          {TYPES.map(t => (
            <TouchableOpacity key={t.key} onPress={() => { setType(t.key as any); setStep('form'); }} activeOpacity={0.82}>
              <LinearGradient
                colors={['#9B59F5','#EC4899']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={[styles.typeCardGrad, { borderRadius: colors.radius }]}
              >
                <View style={[styles.typeIcon, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                  <Ionicons name={t.icon} size={26} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.typeName}>{t.label}</Text>
                  <Text style={styles.typeDesc}>{t.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
              </LinearGradient>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  /* ──────────────────────────────────────────
     STEP 3 — Chapter editor (books only)
  ──────────────────────────────────────────── */
  if (step === 'chapter') {
    const wc = wordCount(chapterContent);
    return (
      <KeyboardAvoidingView
        style={[styles.root, { backgroundColor: colors.background }]}
        behavior="padding"
        keyboardVerticalOffset={topPad + 60}
      >
        <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => setStep('form')} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {editingChapter ? 'Bölümü Düzenle' : 'Yeni Bölüm'}
          </Text>
          <TouchableOpacity onPress={saveChapter}>
            <LinearGradient colors={['#9B59F5','#EC4899']} start={{ x: 0,y: 0 }} end={{ x: 1,y: 0 }} style={styles.publishBtn}>
              <Text style={styles.publishText}>Kaydet</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={[styles.form, { paddingBottom: botPad + 60 }]} keyboardShouldPersistTaps="handled">
          <View style={[styles.inputCard, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>BÖLÜM BAŞLIĞI</Text>
            <TextInput
              value={chapterTitle}
              onChangeText={setChapterTitle}
              style={[styles.input, { color: colors.foreground }]}
              placeholder="Örn: Bölüm 1 – Başlangıç"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>

          <View style={[styles.inputCard, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
            <View style={styles.inputLabelRow}>
              <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>İÇERİK</Text>
              <Text style={[styles.wordCount, { color: wc > 0 ? colors.primary : colors.mutedForeground }]}>{wc.toLocaleString('tr')} kelime</Text>
            </View>
            <TextInput
              value={chapterContent}
              onChangeText={setChapterContent}
              style={[styles.input, styles.chapterInput, { color: colors.foreground }]}
              placeholder="Bölüm içeriğini buraya yaz..."
              placeholderTextColor={colors.mutedForeground}
              multiline
              textAlignVertical="top"
              scrollEnabled={false}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  /* ──────────────────────────────────────────
     STEP 2 — Main form
  ──────────────────────────────────────────── */
  const isPost = type === 'post';
  const isBook = type === 'book';

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior="padding"
      keyboardVerticalOffset={topPad + 60}
    >
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => setStep('type')} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {TYPES.find(t => t.key === type)?.label} Yaz
        </Text>
        <View style={styles.headerActions}>
          {isBook && (
            <TouchableOpacity disabled={isPublishing} onPress={() => void handlePublish(true)} style={[styles.draftBtn, { borderColor: colors.border, opacity: isPublishing ? 0.6 : 1 }]}>
              <Text style={[styles.draftText, { color: colors.mutedForeground }]}>Taslak</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity disabled={isPublishing} onPress={() => void handlePublish(false)}>
            <LinearGradient colors={['#9B59F5','#EC4899']} start={{ x: 0,y: 0 }} end={{ x: 1,y: 0 }} style={styles.publishBtn}>
              <Text style={styles.publishText}>{isPublishing ? 'Yükleniyor…' : 'Yayımla'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.form, { paddingBottom: botPad + 40 }]} keyboardShouldPersistTaps="handled">

        {/* Cover */}
        {!isPost && (
          <View style={styles.coverSection}>
            <TouchableOpacity onPress={showImageOptions} activeOpacity={0.85}>
              {coverUri ? (
                <Image
                  source={{ uri: coverUri }}
                  style={[styles.coverPreview, { borderRadius: colors.radius, backgroundColor: coverColor }]}
                  resizeMode="contain"
                />
              ) : (
                <LinearGradient colors={[coverColor, coverColor + '88']} style={[styles.coverPreview, { borderRadius: colors.radius }]}>
                  <Ionicons name="image-outline" size={32} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.coverPreviewText}>Kapak Ekle</Text>
                </LinearGradient>
              )}
              <View style={styles.coverEditBadge}>
                <Ionicons name="camera" size={14} color="#fff" />
              </View>
            </TouchableOpacity>
            <View style={styles.colorRow}>
              <Text style={[styles.colorLabel, { color: colors.mutedForeground }]}>Renk:</Text>
              {COVER_COLORS.map(c => (
                <TouchableOpacity key={c} onPress={() => setCoverColor(c)}
                  style={[styles.swatch, { backgroundColor: c }, coverColor === c && styles.swatchActive]} />
              ))}
            </View>
          </View>
        )}

        {/* Title */}
        <View style={[styles.inputCard, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
          <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>{isPost ? 'BAŞLIK / ALINTI' : 'BAŞLIK'}</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            style={[styles.input, { color: colors.foreground }]}
            placeholder="Eserin adını yaz..."
            placeholderTextColor={colors.mutedForeground}
          />
        </View>

        {/* Genre — book/story only */}
        {!isPost && type !== 'poem' && (
          <View style={[styles.inputCard, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>TÜR</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.genreRow}>
              {GENRES.map(g => (
                <TouchableOpacity key={g} onPress={() => setGenre(g)}
                  style={[styles.genreChip, { backgroundColor: genre === g ? colors.primary : colors.secondary, borderRadius: 20 }]}>
                  <Text style={[styles.genreText, { color: genre === g ? colors.primaryForeground : colors.secondaryForeground }]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Description / Content */}
        <View style={[styles.inputCard, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
          <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>
            {isBook ? 'AÇIKLAMA / ÖN SÖZ' : type === 'poem' ? 'MİSRALAR' : type === 'post' ? 'DÜŞÜNCE (İSTEĞE BAĞLI)' : 'İÇERİK'}
          </Text>
          <TextInput
            value={isBook ? description : content}
            onChangeText={isBook ? setDescription : setContent}
            style={[styles.input, styles.contentInput, { color: colors.foreground }]}
            placeholder={type === 'poem' ? 'Şiirini yaz...' : isBook ? 'Kitap hakkında kısa bir açıklama...' : 'Yazmaya başla...'}
            placeholderTextColor={colors.mutedForeground}
            multiline
            textAlignVertical="top"
            scrollEnabled={false}
          />
        </View>

        {/* Chapters section — books only */}
        {isBook && (
          <View style={[styles.chaptersSection, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
            <View style={styles.chaptersSectionHeader}>
              <Ionicons name="layers-outline" size={18} color={colors.primary} />
              <Text style={[styles.chaptersSectionTitle, { color: colors.foreground }]}>
                Bölümler {chapters.length > 0 ? `(${chapters.length})` : ''}
              </Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={openNewChapter} style={[styles.addChapterBtn, { backgroundColor: `${colors.primary}18` }]}>
                <Ionicons name="add" size={16} color={colors.primary} />
                <Text style={[styles.addChapterText, { color: colors.primary }]}>Bölüm Ekle</Text>
              </TouchableOpacity>
            </View>

            {chapters.length === 0 ? (
              <TouchableOpacity onPress={openNewChapter} style={[styles.emptyChapters, { borderColor: `${colors.primary}30` }]}>
                <Ionicons name="document-text-outline" size={32} color={colors.mutedForeground} />
                <Text style={[styles.emptyChaptersText, { color: colors.mutedForeground }]}>Henüz bölüm eklenmedi</Text>
                <Text style={[styles.emptyChaptersHint, { color: colors.primary }]}>+ İlk bölümü ekle</Text>
              </TouchableOpacity>
            ) : (
              chapters.map((ch, i) => (
                <View key={ch.id} style={[styles.chapterRow, { borderTopColor: colors.border }]}>
                  <View style={styles.chapterOrder}>
                    <Text style={[styles.chapterOrderText, { color: colors.primary }]}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.chapterTitle, { color: colors.foreground }]}>{ch.title}</Text>
                    <Text style={[styles.chapterMeta, { color: colors.mutedForeground }]}>
                      {wordCount(ch.content).toLocaleString('tr')} kelime
                    </Text>
                  </View>
                  <View style={styles.chapterActions}>
                    <TouchableOpacity onPress={() => moveChapter(ch.id, 'up')} style={styles.chapterActionBtn}>
                      <Ionicons name="chevron-up" size={16} color={colors.mutedForeground} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => moveChapter(ch.id, 'down')} style={styles.chapterActionBtn}>
                      <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => openEditChapter(ch)} style={styles.chapterActionBtn}>
                      <Ionicons name="pencil-outline" size={16} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteChapter(ch.id)} style={styles.chapterActionBtn}>
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontFamily: 'Poppins_700Bold', fontSize: 17 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  draftBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  draftText: { fontFamily: 'Poppins_500Medium', fontSize: 12 },
  publishBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  publishText: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: 13 },
  typeList: { padding: 20, gap: 12 },
  typeHint: { fontFamily: 'Poppins_400Regular', fontSize: 14, marginBottom: 4 },
  typeCardGrad: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18,
  },
  typeIcon: { width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  typeName: { fontFamily: 'Poppins_700Bold', fontSize: 16, color: '#fff' },
  typeDesc: { fontFamily: 'Poppins_400Regular', fontSize: 12, marginTop: 2, color: 'rgba(255,255,255,0.8)' },
  form: { padding: 16, gap: 14 },
  coverSection: { gap: 12 },
  coverPreview: {
    width: '100%', aspectRatio: 16 / 9, alignSelf: 'center',
    alignItems: 'center', justifyContent: 'center', gap: 8, overflow: 'hidden',
  },
  coverPreviewText: { color: 'rgba(255,255,255,0.7)', fontFamily: 'Poppins_500Medium', fontSize: 12 },
  coverEditBadge: {
    position: 'absolute', bottom: 10, right: 10,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#9B59F5', alignItems: 'center', justifyContent: 'center',
  },
  colorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center', flexWrap: 'wrap' },
  colorLabel: { fontFamily: 'Poppins_500Medium', fontSize: 13 },
  swatch: { width: 28, height: 28, borderRadius: 8 },
  swatchActive: { borderWidth: 3, borderColor: '#fff' },
  inputCard: { padding: 16, gap: 8 },
  inputLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inputLabel: { fontFamily: 'Poppins_600SemiBold', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
  wordCount: { fontFamily: 'Poppins_600SemiBold', fontSize: 11 },
  input: { fontFamily: 'Poppins_400Regular', fontSize: 15, minHeight: 44 },
  contentInput: { minHeight: 160 },
  chapterInput: { minHeight: 400, fontSize: 15, lineHeight: 26 },
  genreRow: { gap: 8, paddingVertical: 4 },
  genreChip: { paddingHorizontal: 14, paddingVertical: 7 },
  genreText: { fontFamily: 'Poppins_500Medium', fontSize: 13 },
  chaptersSection: { overflow: 'hidden' },
  chaptersSectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 14, paddingBottom: 12,
  },
  chaptersSectionTitle: { fontFamily: 'Poppins_700Bold', fontSize: 15 },
  addChapterBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  addChapterText: { fontFamily: 'Poppins_600SemiBold', fontSize: 12 },
  emptyChapters: { alignItems: 'center', gap: 6, padding: 24, borderTopWidth: 1, borderStyle: 'dashed' },
  emptyChaptersText: { fontFamily: 'Poppins_400Regular', fontSize: 13 },
  emptyChaptersHint: { fontFamily: 'Poppins_600SemiBold', fontSize: 13 },
  chapterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, paddingLeft: 14, borderTopWidth: 1 },
  chapterOrder: { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(155,89,245,0.15)', alignItems: 'center', justifyContent: 'center' },
  chapterOrderText: { fontFamily: 'Poppins_700Bold', fontSize: 13 },
  chapterTitle: { fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
  chapterMeta: { fontFamily: 'Poppins_400Regular', fontSize: 11, marginTop: 2 },
  chapterActions: { flexDirection: 'row', gap: 4 },
  chapterActionBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
});
