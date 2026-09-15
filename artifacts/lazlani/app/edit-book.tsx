import React, { useState } from 'react';
import {
  Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Platform,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useColors } from '@/hooks/useColors';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { isDeviceLocalCover, uploadBookCover } from '@/services/coverUpload';

const GENRES = ['Roman', 'Şiir', 'Hikaye', 'Fantastik', 'Bilim Kurgu', 'Romantik', 'Tarih', 'Korku', 'Polisiye', 'Deneme'];
const COLORS = ['#9B59F5', '#EC4899', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#84CC16', '#F97316'];

export default function EditBookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { books, updateBook, deleteBook, updateChapter, deleteChapter, addChapterToBook } = useData();

  const book = books.find(b => b.id === id);
  if (!book || book.authorId !== user?.id) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.foreground, textAlign: 'center', marginTop: 80 }}>Kitap bulunamadı.</Text>
      </View>
    );
  }

  const [title, setTitle] = useState(book.title);
  const [description, setDescription] = useState(book.description);
  const [genre, setGenre] = useState(book.genre);
  const [coverColor, setCoverColor] = useState(book.coverColor);
  const [coverUri, setCoverUri] = useState<string | null>(book.coverUrl ?? null);
  const [coverChanged, setCoverChanged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingChapter, setEditingChapter] = useState<string | null>(null);

  const pickCoverImage = () => {
    Alert.alert('Kapak Fotoğrafı', 'Kaynak seç', [
      { text: 'Galeriden Seç', onPress: async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('İzin gerekli', 'Galeri erişimi gerekiyor.'); return; }
        const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [16, 9], quality: 0.9 });
        if (!res.canceled && res.assets[0]) { setCoverUri(res.assets[0].uri); setCoverChanged(true); }
      }},
      { text: 'Kamera ile Çek', onPress: async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { Alert.alert('İzin gerekli', 'Kamera erişimi gerekiyor.'); return; }
        const res = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [16, 9], quality: 0.9 });
        if (!res.canceled && res.assets[0]) { setCoverUri(res.assets[0].uri); setCoverChanged(true); }
      }},
      { text: 'Fotoğrafı Kaldır', onPress: () => { setCoverUri(null); setCoverChanged(true); }, style: 'destructive' },
      { text: 'İptal', style: 'cancel' },
    ]);
  };
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterContent, setChapterContent] = useState('');
  const [showNewChapter, setShowNewChapter] = useState(false);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const handleSave = async () => {
    if (isSaving) return;
    if (!title.trim()) { Alert.alert('Hata', 'Başlık boş olamaz'); return; }
    setIsSaving(true);
    let persistentCoverUrl = coverUri ?? undefined;
    try {
      if (coverUri && (coverChanged || isDeviceLocalCover(coverUri))) {
        persistentCoverUrl = await uploadBookCover(coverUri);
      }
    } catch (error) {
      Alert.alert(
        'Kapak yüklenemedi',
        error instanceof Error ? error.message : 'Kapak görseli yüklenemedi. Lütfen tekrar deneyin.',
      );
      setIsSaving(false);
      return;
    }
    updateBook(id, { title: title.trim(), description: description.trim(), genre, coverColor, coverUrl: persistentCoverUrl });
    setIsSaving(false);
    Alert.alert('Kaydedildi', 'Kitap bilgileri güncellendi.', [{ text: 'Tamam', onPress: () => router.back() }]);
  };

  const handleDeleteBook = () => {
    Alert.alert('Kitabı Sil', 'Bu kitap kalıcı olarak silinecek. Emin misin?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => {
        deleteBook(id);
        router.back();
      } },
    ]);
  };

  const startEditChapter = (cId: string) => {
    const c = book.chapters.find(ch => ch.id === cId);
    if (!c) return;
    setEditingChapter(cId);
    setChapterTitle(c.title);
    setChapterContent(c.content);
  };

  const saveChapter = () => {
    if (editingChapter) {
      updateChapter(id, editingChapter, { title: chapterTitle, content: chapterContent });
    } else {
      addChapterToBook(id, {
        id: Date.now().toString(),
        bookId: id,
        title: chapterTitle,
        content: chapterContent,
        wordCount: chapterContent.split(' ').length,
        order: book.chapters.length + 1,
        isDraft: false,
        createdAt: new Date().toISOString(),
      });
    }
    setEditingChapter(null);
    setChapterTitle('');
    setChapterContent('');
    setShowNewChapter(false);
  };

  const handleDeleteChapter = (cId: string) => {
    Alert.alert('Bölümü Sil', 'Bu bölüm silinecek. Emin misin?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => deleteChapter(id, cId) },
    ]);
  };

  if (editingChapter !== null || showNewChapter) {
    return (
      <KeyboardAvoidingView
        style={[styles.root, { backgroundColor: colors.background }]}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <View style={[styles.header, { paddingTop: topPad + 10, backgroundColor: colors.card }]}>
          <TouchableOpacity onPress={() => { setEditingChapter(null); setShowNewChapter(false); setChapterTitle(''); setChapterContent(''); }}>
            <Ionicons name="arrow-back" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {editingChapter ? 'Bölümü Düzenle' : 'Yeni Bölüm'}
          </Text>
          <TouchableOpacity onPress={saveChapter} style={[styles.saveBtn, { backgroundColor: colors.primary }]}>
            <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>Kaydet</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Bölüm Başlığı</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
            value={chapterTitle}
            onChangeText={setChapterTitle}
            placeholder="Bölüm başlığı..."
            placeholderTextColor={colors.mutedForeground}
          />
          <Text style={[styles.label, { color: colors.mutedForeground }]}>İçerik</Text>
          <TextInput
            style={[styles.input, styles.contentInput, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
            value={chapterContent}
            onChangeText={setChapterContent}
            placeholder="Bölüm içeriğini yaz..."
            placeholderTextColor={colors.mutedForeground}
            multiline
            textAlignVertical="top"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: topPad + 10, backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Kitabı Düzenle</Text>
        <TouchableOpacity disabled={isSaving} onPress={() => void handleSave()} style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: isSaving ? 0.6 : 1 }]}>
          <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>{isSaving ? 'Yükleniyor…' : 'Kaydet'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Kapak fotoğrafı */}
        <TouchableOpacity onPress={pickCoverImage} activeOpacity={0.85}
          style={[styles.coverPreview, { backgroundColor: coverColor, borderRadius: colors.radius, overflow: 'hidden' }]}
        >
          {coverUri
            ? <Image source={{ uri: coverUri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
            : <Text style={styles.coverPreviewText} numberOfLines={2}>{title || 'Kitap Başlığı'}</Text>
          }
          <View style={styles.coverCameraBtn}>
            <Ionicons name="camera" size={16} color="#fff" />
            <Text style={styles.coverCameraText}>Kapak Fotoğrafı Ekle</Text>
          </View>
        </TouchableOpacity>

        <Text style={[styles.label, { color: colors.mutedForeground }]}>Kapak Rengi (Fotoğraf yokken)</Text>
        <View style={styles.colorRow}>
          {COLORS.map(c => (
            <TouchableOpacity key={c} onPress={() => setCoverColor(c)} style={[styles.colorDot, { backgroundColor: c, borderWidth: coverColor === c ? 3 : 0, borderColor: '#fff' }]} />
          ))}
        </View>

        <Text style={[styles.label, { color: colors.mutedForeground }]}>Başlık</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
          value={title}
          onChangeText={setTitle}
          placeholder="Kitap başlığı..."
          placeholderTextColor={colors.mutedForeground}
        />

        <Text style={[styles.label, { color: colors.mutedForeground }]}>Açıklama</Text>
        <TextInput
          style={[styles.input, styles.textArea, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
          value={description}
          onChangeText={setDescription}
          placeholder="Kitap açıklaması..."
          placeholderTextColor={colors.mutedForeground}
          multiline
          textAlignVertical="top"
        />

        <Text style={[styles.label, { color: colors.mutedForeground }]}>Tür</Text>
        <View style={styles.genreGrid}>
          {GENRES.map(g => (
            <TouchableOpacity
              key={g}
              onPress={() => setGenre(g)}
              style={[styles.genreChip, { backgroundColor: genre === g ? colors.primary : colors.card, borderColor: colors.border }]}
            >
              <Text style={[styles.genreText, { color: genre === g ? colors.primaryForeground : colors.mutedForeground }]}>{g}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Bölümler */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Bölümler ({book.chapters.length})</Text>
          <TouchableOpacity onPress={() => { setShowNewChapter(true); setChapterTitle(''); setChapterContent(''); }} style={[styles.addBtn, { backgroundColor: colors.primary + '20' }]}>
            <Ionicons name="add" size={18} color={colors.primary} />
            <Text style={[styles.addBtnText, { color: colors.primary }]}>Ekle</Text>
          </TouchableOpacity>
        </View>

        {book.chapters.length === 0 ? (
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>Henüz bölüm yok</Text>
        ) : (
          book.chapters.map((ch, i) => (
            <View key={ch.id} style={[styles.chapterRow, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <View style={[styles.chapterNum, { backgroundColor: colors.primary + '20' }]}>
                <Text style={[styles.chapterNumText, { color: colors.primary }]}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.chapterTitle, { color: colors.foreground }]} numberOfLines={1}>{ch.title}</Text>
                <Text style={[styles.chapterMeta, { color: colors.mutedForeground }]}>{ch.wordCount} kelime</Text>
              </View>
              <TouchableOpacity onPress={() => startEditChapter(ch.id)} style={styles.chapterBtn}>
                <Ionicons name="pencil-outline" size={18} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDeleteChapter(ch.id)} style={styles.chapterBtn}>
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
              </TouchableOpacity>
            </View>
          ))
        )}

        {/* Tehlikeli bölge */}
        <View style={[styles.dangerCard, { backgroundColor: '#EF444420', borderRadius: colors.radius, borderColor: '#EF4444' }]}>
          <Text style={styles.dangerTitle}>⚠️ Tehlikeli Bölge</Text>
          <TouchableOpacity onPress={handleDeleteBook} style={styles.deleteBtn}>
            <Ionicons name="trash-outline" size={16} color="#fff" />
            <Text style={styles.deleteBtnText}>Kitabı Kalıcı Olarak Sil</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  saveBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  content: { padding: 16, paddingBottom: 60 },
  coverPreview: {
    width: '100%', aspectRatio: 16 / 9,
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  coverPreviewText: { color: '#fff', fontWeight: '800', fontSize: 18, textAlign: 'center', paddingHorizontal: 16 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 14, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15 },
  textArea: { height: 100 },
  contentInput: { height: 200 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  colorDot: { width: 32, height: 32, borderRadius: 16 },
  genreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  genreChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  genreText: { fontSize: 13, fontWeight: '500' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  addBtnText: { fontSize: 13, fontWeight: '600' },
  empty: { fontSize: 14, textAlign: 'center', paddingVertical: 20 },
  chapterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginBottom: 8, borderWidth: 1 },
  chapterNum: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  chapterNumText: { fontWeight: '700', fontSize: 13 },
  chapterTitle: { fontWeight: '600', fontSize: 14 },
  chapterMeta: { fontSize: 12, marginTop: 2 },
  chapterBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  coverCameraBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginBottom: 10, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  coverCameraText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  dangerCard: { marginTop: 24, padding: 16, borderWidth: 1 },
  dangerTitle: { color: '#EF4444', fontWeight: '700', fontSize: 14, marginBottom: 12 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EF4444', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, alignSelf: 'flex-start' },
  deleteBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
