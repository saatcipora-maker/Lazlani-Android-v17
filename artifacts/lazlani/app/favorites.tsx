import React from 'react';
import {
  FlatList, StyleSheet, Text, TouchableOpacity, View, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { Book } from '@/data/types';

export default function FavoritesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { books, favoriteIds, toggleFavorite } = useData();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const favoriteBooks = books.filter(b => favoriteIds.has(b.id));

  const renderBook = ({ item }: { item: Book }) => (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
      onPress={() => router.push(`/book/${item.id}` as any)}
    >
      <View style={[styles.cover, { backgroundColor: item.coverColor + '60', borderRadius: 8 }]}>
        <Text style={styles.coverLetter}>{item.title[0]}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.bookTitle, { color: colors.foreground }]} numberOfLines={1}>{item.title}</Text>
        <Text style={[styles.bookAuthor, { color: colors.mutedForeground }]} numberOfLines={1}>{item.authorName}</Text>
        {item.genre ? (
          <View style={[styles.genreBadge, { backgroundColor: colors.primary + '20' }]}>
            <Text style={[styles.genreText, { color: colors.primary }]}>{item.genre}</Text>
          </View>
        ) : null}
      </View>
      <TouchableOpacity onPress={() => toggleFavorite(item.id)} hitSlop={8}>
        <Ionicons name="heart" size={22} color="#EF4444" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 10, backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Favorilerim</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>{favoriteBooks.length} kitap</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      {favoriteBooks.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="heart-outline" size={56} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Henüz favori yok</Text>
          <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
            Kitap detayından kalp ikonuna basarak favorilerine ekleyebilirsin.
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/' as any)}
            style={[styles.exploreBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.exploreBtnText}>Kitapları Keşfet</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={favoriteBooks}
          keyExtractor={b => b.id}
          renderItem={renderBook}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14 },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  headerSub: { fontSize: 12, marginTop: 1 },
  list: { padding: 16, gap: 10, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1 },
  cover: { width: 52, height: 72, justifyContent: 'center', alignItems: 'center' },
  coverLetter: { fontSize: 22, fontWeight: '800', color: '#fff' },
  bookTitle: { fontWeight: '700', fontSize: 15 },
  bookAuthor: { fontSize: 13, marginTop: 2 },
  genreBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginTop: 5 },
  genreText: { fontSize: 11, fontWeight: '600' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '800' },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  exploreBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, marginTop: 8 },
  exploreBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
