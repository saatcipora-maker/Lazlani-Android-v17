import React, { useState } from 'react';
import {
  Alert, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useData } from '@/context/DataContext';
import { Chapter } from '@/data/types';

export default function WriteChapterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { bookId, bookTitle } = useLocalSearchParams<{ bookId: string; bookTitle: string }>();
  const { books, addChapterToBook } = useData();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const book = books.find(b => b.id === bookId);
  const nextOrder = (book?.chapters?.length ?? 0) + 1;

  const [title, setTitle]     = useState('');
  const [content, setContent] = useState('');
  const [summary, setSummary] = useState('');
  const [isDraft, setIsDraft] = useState(false);
  const [saving, setSaving]   = useState(false);

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  const handleSave = (draft: boolean) => {
    if (!title.trim()) { Alert.alert('Hata', 'Bölüm başlığı boş olamaz.'); return; }
    if (!content.trim()) { Alert.alert('Hata', 'Bölüm içeriği boş olamaz.'); return; }

    setSaving(true);
    const chapter: Chapter = {
      id: Date.now().toString(),
      bookId: bookId ?? '',
      title: title.trim(),
      content: content.trim(),
      summary: summary.trim() || undefined,
      wordCount,
      order: nextOrder,
      isDraft: draft,
      createdAt: new Date().toISOString(),
    };

    addChapterToBook(bookId ?? '', chapter);
    setSaving(false);
    Alert.alert(
      draft ? 'Taslak Kaydedildi' : 'Bölüm Yayınlandı! 🎉',
      draft ? `"${title}" taslak olarak kaydedildi.` : `${nextOrder}. bölüm yayınlandı.`,
      [{ text: 'Tamam', onPress: () => router.back() }]
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: topPad + 10, borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.foreground} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]} numberOfLines={1}>
              {bookTitle ?? book?.title}
            </Text>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>{nextOrder}. Bölüm</Text>
          </View>
          <TouchableOpacity onPress={() => handleSave(true)} style={[styles.draftBtn, { borderColor: colors.border }]} disabled={saving}>
            <Text style={[styles.draftBtnText, { color: colors.mutedForeground }]}>Taslak</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Title */}
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Bölüm başlığı..."
            placeholderTextColor={colors.mutedForeground}
            style={[styles.titleInput, { color: colors.foreground, borderBottomColor: colors.border }]}
          />

          {/* Summary */}
          <TextInput
            value={summary}
            onChangeText={setSummary}
            placeholder="Kısa özet (opsiyonel)..."
            placeholderTextColor={colors.mutedForeground}
            style={[styles.summaryInput, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
            multiline
            numberOfLines={2}
          />

          {/* Word count */}
          <View style={styles.wordBar}>
            <Ionicons name="text-outline" size={14} color={colors.mutedForeground} />
            <Text style={[styles.wordCount, { color: colors.mutedForeground }]}>{wordCount} kelime</Text>
            <View style={{ flex: 1 }} />
            <Text style={[styles.readTime, { color: colors.mutedForeground }]}>
              ~{Math.ceil(wordCount / 200)} dk okuma
            </Text>
          </View>

          {/* Content */}
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder="Hikayenizi buraya yazın..."
            placeholderTextColor={colors.mutedForeground}
            style={[styles.contentInput, { color: colors.foreground }]}
            multiline
            textAlignVertical="top"
          />

          <View style={{ height: insets.bottom + 100 }} />
        </ScrollView>

        {/* Bottom bar */}
        <View style={[styles.bottomBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 8 }]}>
          <TouchableOpacity
            onPress={() => handleSave(false)}
            style={[styles.publishBtn, { backgroundColor: colors.primary }]}
            disabled={saving}
          >
            <Ionicons name="cloud-upload-outline" size={18} color={colors.primaryForeground} />
            <Text style={[styles.publishBtnText, { color: colors.primaryForeground }]}>
              {saving ? 'Kaydediliyor...' : 'Bölümü Yayınla'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
    paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  headerCenter: { flex: 1 },
  headerSub: { fontSize: 11, fontFamily: 'Poppins_400Regular' },
  headerTitle: { fontSize: 16, fontFamily: 'Poppins_600SemiBold' },
  draftBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  draftBtnText: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
  body: { padding: 16 },
  titleInput: {
    fontSize: 20, fontFamily: 'Poppins_600SemiBold',
    borderBottomWidth: 1, paddingBottom: 12, marginBottom: 16,
  },
  summaryInput: {
    fontSize: 14, fontFamily: 'Poppins_400Regular', borderRadius: 10,
    borderWidth: 1, padding: 12, marginBottom: 12, minHeight: 60,
  },
  wordBar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  wordCount: { fontSize: 12, fontFamily: 'Poppins_400Regular' },
  readTime: { fontSize: 12, fontFamily: 'Poppins_400Regular' },
  contentInput: {
    fontSize: 16, fontFamily: 'Poppins_400Regular', lineHeight: 26, minHeight: 400,
  },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 12, borderTopWidth: StyleSheet.hairlineWidth,
  },
  publishBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 14 },
  publishBtnText: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
});
