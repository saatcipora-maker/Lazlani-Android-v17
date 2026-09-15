import React from 'react';
import {
  FlatList, Platform, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useData } from '@/context/DataContext';

export default function CategoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { genre } = useLocalSearchParams<{ genre: string }>();
  const { books } = useData();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 32 : insets.bottom + 16;

  const filtered = books.filter(b => b.genre === genre);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>{genre}</Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>{filtered.length} eser</Text>
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={b => b.id}
        numColumns={2}
        contentContainerStyle={[styles.grid, { paddingBottom: botPad }]}
        columnWrapperStyle={{ gap: 12 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="book-outline" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>Bu kategoride henüz eser yok</Text>
          </View>
        }
        renderItem={({ item: book }) => (
          <TouchableOpacity
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push(`/book/${book.id}` as any)}
            activeOpacity={0.85}
          >
            <LinearGradient colors={[book.coverColor, book.coverColor + '66', colors.background]} style={styles.cover}>
              <Text style={styles.coverInitial}>{book.title[0]}</Text>
              {book.isEditorChoice && (
                <View style={styles.editorBadge}>
                  <Ionicons name="star" size={9} color="#F5C842" />
                  <Text style={styles.editorTxt}>Editör</Text>
                </View>
              )}
            </LinearGradient>
            <View style={styles.info}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>{book.title}</Text>
              <Text style={[styles.cardAuthor, { color: colors.mutedForeground }]} numberOfLines={1}>{book.authorName}</Text>
              <View style={styles.meta}>
                <Ionicons name="star" size={11} color="#F59E0B" />
                <Text style={[styles.metaTxt, { color: colors.mutedForeground }]}>{book.rating.toFixed(1)}</Text>
                <Text style={[styles.metaDot, { color: colors.mutedForeground }]}>·</Text>
                <Ionicons name="eye-outline" size={11} color={colors.mutedForeground} />
                <Text style={[styles.metaTxt, { color: colors.mutedForeground }]}>{(book.readCount / 1000).toFixed(1)}K</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  title: { fontFamily: 'Poppins_700Bold', fontSize: 20 },
  sub: { fontFamily: 'Poppins_400Regular', fontSize: 12, marginTop: 1 },
  grid: { padding: 16, gap: 12 },
  card: { flex: 1, borderRadius: 14, overflow: 'hidden', borderWidth: 1 },
  cover: { height: 160, alignItems: 'center', justifyContent: 'center' },
  coverInitial: { fontFamily: 'Poppins_700Bold', fontSize: 44, color: '#fff' },
  editorBadge: {
    position: 'absolute', top: 8, right: 8,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 10,
  },
  editorTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 9, color: '#F5C842' },
  info: { padding: 10, gap: 3 },
  cardTitle: { fontFamily: 'Poppins_600SemiBold', fontSize: 13, lineHeight: 18 },
  cardAuthor: { fontFamily: 'Poppins_400Regular', fontSize: 11 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  metaTxt: { fontFamily: 'Poppins_400Regular', fontSize: 11 },
  metaDot: { fontSize: 11 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTxt: { fontFamily: 'Poppins_500Medium', fontSize: 14 },
});
