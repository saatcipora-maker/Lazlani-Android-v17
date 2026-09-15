import React from 'react';
import {
  Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';

export default function BookmarksScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { bookmarks, removeBookmark, books, stories, poems } = useData();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const myBookmarks = bookmarks.filter(b => b.userId === user?.id);

  const resolveTitle = (targetId: string, targetType: string) => {
    if (targetType === 'book') return books.find(b => b.id === targetId)?.title ?? 'Kitap';
    if (targetType === 'story') return stories.find(s => s.id === targetId)?.title ?? 'Hikaye';
    if (targetType === 'poem') return poems.find(p => p.id === targetId)?.title ?? 'Şiir';
    return 'İçerik';
  };

  const resolveColor = (targetId: string, targetType: string) => {
    if (targetType === 'book') return books.find(b => b.id === targetId)?.coverColor ?? '#9B59F5';
    if (targetType === 'story') return stories.find(s => s.id === targetId)?.coverColor ?? '#EC4899';
    if (targetType === 'poem') return poems.find(p => p.id === targetId)?.coverColor ?? '#3B82F6';
    return '#9B59F5';
  };

  const typeIcon = (type: string) => {
    if (type === 'book') return 'book-outline';
    if (type === 'story') return 'document-text-outline';
    return 'musical-notes-outline';
  };

  const typeLabel = (type: string) => {
    if (type === 'book') return 'Kitap';
    if (type === 'story') return 'Hikaye';
    return 'Şiir';
  };

  const handleOpen = (b: typeof myBookmarks[0]) => {
    if (b.targetType === 'book') router.push(`/book/${b.targetId}` as any);
    else if (b.targetType === 'story') router.push(`/story/${b.targetId}` as any);
    else router.push(`/poem/${b.targetId}` as any);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Yer İmleri</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {myBookmarks.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="bookmark-outline" size={56} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Yer imi yok</Text>
            <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
              Okurken içerikleri yer imine ekleyebilirsin
            </Text>
          </View>
        ) : (
          myBookmarks.map(bm => (
            <TouchableOpacity key={bm.id} onPress={() => handleOpen(bm)}
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.cover, { backgroundColor: resolveColor(bm.targetId, bm.targetType) }]}>
                <Ionicons name={typeIcon(bm.targetType) as any} size={22} color="rgba(255,255,255,0.85)" />
              </View>
              <View style={styles.info}>
                <View style={[styles.typeBadge, { backgroundColor: colors.primary + '22' }]}>
                  <Text style={[styles.typeBadgeText, { color: colors.primary }]}>{typeLabel(bm.targetType)}</Text>
                </View>
                <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {resolveTitle(bm.targetId, bm.targetType)}
                </Text>
                {bm.note ? (
                  <Text style={[styles.noteText, { color: colors.mutedForeground }]} numberOfLines={1}>📝 {bm.note}</Text>
                ) : (
                  <Text style={[styles.cardDate, { color: colors.mutedForeground }]}>
                    {new Date(bm.createdAt).toLocaleDateString('tr-TR')}
                  </Text>
                )}
                {bm.scrollPercent !== undefined && bm.scrollPercent > 0 && (
                  <View style={styles.progressRow}>
                    <View style={[styles.progressBg, { backgroundColor: colors.muted }]}>
                      <View style={[styles.progressFill, { width: `${bm.scrollPercent}%`, backgroundColor: colors.primary }]} />
                    </View>
                    <Text style={[styles.progressTxt, { color: colors.mutedForeground }]}>%{bm.scrollPercent}</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity onPress={() => removeBookmark(bm.id)} style={styles.removeBtn}>
                <Ionicons name="bookmark" size={20} color={colors.primary} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: insets.bottom + 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { fontSize: 18, fontFamily: 'Poppins_600SemiBold' },
  list: { padding: 16 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 10 },
  cover: { width: 52, height: 66, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 3 },
  typeBadge: { alignSelf: 'flex-start', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  typeBadgeText: { fontSize: 10, fontFamily: 'Poppins_500Medium' },
  cardTitle: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  noteText: { fontSize: 12, fontFamily: 'Poppins_400Regular', fontStyle: 'italic' },
  cardDate: { fontSize: 11, fontFamily: 'Poppins_400Regular' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  progressBg: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  progressTxt: { fontSize: 10, fontFamily: 'Poppins_400Regular', width: 28 },
  removeBtn: { padding: 8 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: 'Poppins_600SemiBold' },
  emptyDesc: { fontSize: 13, fontFamily: 'Poppins_400Regular', textAlign: 'center', paddingHorizontal: 40 },
});
