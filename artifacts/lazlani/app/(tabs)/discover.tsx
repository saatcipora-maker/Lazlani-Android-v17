import React, { useState } from 'react';
import {
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useData } from '@/context/DataContext';
import BookCard from '@/components/BookCard';
import SectionHeader from '@/components/SectionHeader';
import UserAvatar from '@/components/UserAvatar';

const FILTERS = ['Tümü', 'Kitap', 'Hikaye', 'Şiir', 'Kullanıcı'];

export default function DiscoverScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { books, stories, poems, users } = useData();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('Tümü');
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const normalizedQuery = query.trim().toLocaleLowerCase('tr-TR');
  const matches = (...values: Array<string | undefined>) =>
    !normalizedQuery || values.some(value => value?.toLocaleLowerCase('tr-TR').includes(normalizedQuery));
  const filteredBooks = books.filter(b =>
    matches(b.title, b.authorName, b.genre)
  );
  const filteredStories = stories.filter(s =>
    matches(s.title, s.authorName, s.genre)
  );
  const filteredPoems = poems.filter(p =>
    matches(p.title, p.authorName)
  );
  const filteredUsers = users.filter(u =>
    matches(u.displayName, u.username, u.email, u.bio)
  );

  const showBooks = filter === 'Tümü' || filter === 'Kitap';
  const showStories = filter === 'Tümü' || filter === 'Hikaye';
  const showPoems = filter === 'Tümü' || filter === 'Şiir';
  const showUsers = filter === 'Tümü' || filter === 'Kullanıcı';
  const hasResults =
    (showBooks && filteredBooks.length > 0)
    || (showStories && filteredStories.length > 0)
    || (showPoems && filteredPoems.length > 0)
    || (showUsers && filteredUsers.length > 0);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Keşfet</Text>
      </View>

      {/* Search bar */}
      <View style={[styles.searchWrap, { backgroundColor: colors.card, borderRadius: colors.radius, borderColor: colors.border }]}>
        <Ionicons name="search-outline" size={18} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground, fontFamily: 'Poppins_400Regular' }]}
          placeholder="Kitap, hikaye, şiir, kullanıcı..."
          placeholderTextColor={colors.mutedForeground}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f} onPress={() => setFilter(f)}>
            {f === filter ? (
              <LinearGradient
                colors={['#9B59F5', '#EC4899']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.filterChip}
              >
                <Text style={[styles.filterText, { color: '#fff' }]}>{f}</Text>
              </LinearGradient>
            ) : (
              <View style={[styles.filterChip, { borderWidth: 1, borderColor: colors.border }]}>
                <Text style={[styles.filterText, { color: colors.mutedForeground }]}>{f}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {!hasResults && (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={42} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Sonuç bulunamadı</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Farklı bir isim, kullanıcı adı, yazar veya kitap türü deneyin.
            </Text>
          </View>
        )}
        {showBooks && filteredBooks.length > 0 && (
          <>
            <SectionHeader title="Kitaplar" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
              {filteredBooks.map(book => (
                <BookCard key={book.id} book={book} onPress={() => router.push(`/book/${book.id}` as any)} width={130} />
              ))}
            </ScrollView>
          </>
        )}

        {showStories && filteredStories.length > 0 && (
          <>
            <SectionHeader title="Hikayeler" />
            {filteredStories.map(story => (
              <TouchableOpacity
                key={story.id}
                onPress={() => router.push(`/story/${story.id}` as any)}
                style={[styles.listItem, { backgroundColor: colors.card, borderRadius: colors.radius }]}
              >
                <LinearGradient colors={[story.coverColor, '#0D0B24']} style={styles.itemCover} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitle, { color: colors.foreground }]}>{story.title}</Text>
                  <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{story.authorName} · {story.genre}</Text>
                  <View style={styles.itemMeta}>
                    <Ionicons name="heart" size={12} color={colors.accent} />
                    <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{story.likesCount}</Text>
                    <Ionicons name="star" size={12} color="#F59E0B" />
                    <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{story.rating.toFixed(1)}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}

        {showPoems && filteredPoems.length > 0 && (
          <>
            <SectionHeader title="Şiirler" />
            {filteredPoems.map(poem => (
              <TouchableOpacity
                key={poem.id}
                onPress={() => router.push(`/poem/${poem.id}` as any)}
                style={[styles.listItem, { backgroundColor: colors.card, borderRadius: colors.radius }]}
              >
                <LinearGradient colors={[poem.coverColor, '#0D0B24']} style={styles.itemCover} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitle, { color: colors.foreground }]}>{poem.title}</Text>
                  <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{poem.authorName}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            ))}
          </>
        )}

        {showUsers && filteredUsers.length > 0 && (
          <>
            <SectionHeader title="Kullanıcılar" />
            {filteredUsers.map(u => (
              <TouchableOpacity
                key={u.id}
                onPress={() => router.push(`/user/${u.id}` as any)}
                style={[styles.listItem, { backgroundColor: colors.card, borderRadius: colors.radius }]}
              >
                <UserAvatar name={u.displayName} color={u.avatarColor} size={46} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitle, { color: colors.foreground }]}>{u.displayName}</Text>
                  <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>@{u.username} · {u.followersCount.toLocaleString()} takipçi</Text>
                </View>
                {u.isPremium && <Ionicons name="flash" size={16} color="#F59E0B" />}
              </TouchableOpacity>
            ))}
          </>
        )}

        <View style={{ height: Platform.OS === 'web' ? 100 : 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  title: { fontFamily: 'Poppins_700Bold', fontSize: 28 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 20, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 14 },
  filters: { paddingHorizontal: 20, gap: 8, paddingBottom: 12 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, overflow: 'hidden' },
  filterText: { fontFamily: 'Poppins_500Medium', fontSize: 13 },
  content: { paddingTop: 8, gap: 8 },
  hList: { paddingHorizontal: 20, gap: 14, paddingBottom: 8 },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 20, padding: 12 },
  itemCover: { width: 50, height: 66, borderRadius: 8 },
  itemTitle: { fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
  itemSub: { fontFamily: 'Poppins_400Regular', fontSize: 12, marginTop: 2 },
  itemMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  metaText: { fontFamily: 'Poppins_400Regular', fontSize: 11 },
  emptyState: { alignItems: 'center', paddingHorizontal: 32, paddingVertical: 56, gap: 8 },
  emptyTitle: { fontFamily: 'Poppins_700Bold', fontSize: 17 },
  emptyText: { fontFamily: 'Poppins_400Regular', fontSize: 13, lineHeight: 20, textAlign: 'center' },
});
