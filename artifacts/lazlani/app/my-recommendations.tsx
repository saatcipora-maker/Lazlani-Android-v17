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

const STATUS_CONFIG = {
  pending:  { label: 'Beklemede',  icon: 'time-outline'         as const, color: '#F59E0B', bg: '#F59E0B20' },
  approved: { label: 'Onaylandı',  icon: 'checkmark-circle'     as const, color: '#10B981', bg: '#10B98120' },
  rejected: { label: 'Reddedildi', icon: 'close-circle-outline' as const, color: '#EF4444', bg: '#EF444420' },
  none:     { label: 'Yok',        icon: 'remove-circle-outline' as const, color: '#6B7280', bg: '#6B728020' },
};

export default function MyRecommendationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { books, recommendBook } = useData();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const myBooks = books.filter(b => b.authorId === user?.id && b.recommendationStatus && b.recommendationStatus !== 'none');

  const renderItem = ({ item }: { item: Book }) => {
    const status = item.recommendationStatus ?? 'none';
    const cfg = STATUS_CONFIG[status];
    return (
      <TouchableOpacity
        style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
        onPress={() => router.push(`/book/${item.id}` as any)}
      >
        <View style={[styles.cover, { backgroundColor: item.coverColor + '60', borderRadius: 8 }]}>
          <Text style={styles.coverLetter}>{item.title[0]}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.bookTitle, { color: colors.foreground }]} numberOfLines={1}>{item.title}</Text>
          <Text style={[styles.bookDate, { color: colors.mutedForeground }]}>
            {new Date(item.createdAt).toLocaleDateString('tr-TR')}
          </Text>
          <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.icon} size={12} color={cfg.color} />
            <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>
        {status === 'none' || status === 'rejected' ? (
          <TouchableOpacity
            onPress={() => recommendBook(item.id, 'pending')}
            style={[styles.recommendBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.recommendBtnText}>Öner</Text>
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>
    );
  };

  // All my books to show "Öner" action
  const allMyBooks = books.filter(b => b.authorId === user?.id && !b.isDraft);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 10, backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Önerilerim</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>Editör onayına gönderilen kitaplar</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      {allMyBooks.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="star-outline" size={56} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Henüz kitabın yok</Text>
          <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
            Yayınlanan kitaplarını editöre önerebilirsin. Onaylanırsa ana sayfada öne çıkar.
          </Text>
        </View>
      ) : (
        <FlatList
          data={allMyBooks}
          keyExtractor={b => b.id}
          renderItem={({ item }) => {
            const status = item.recommendationStatus ?? 'none';
            const cfg = STATUS_CONFIG[status];
            return (
              <TouchableOpacity
                style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
                onPress={() => router.push(`/book/${item.id}` as any)}
              >
                <View style={[styles.cover, { backgroundColor: item.coverColor + '60', borderRadius: 8 }]}>
                  <Text style={styles.coverLetter}>{item.title[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.bookTitle, { color: colors.foreground }]} numberOfLines={1}>{item.title}</Text>
                  <Text style={[styles.bookDate, { color: colors.mutedForeground }]}>
                    {new Date(item.createdAt).toLocaleDateString('tr-TR')}
                  </Text>
                  {status !== 'none' && (
                    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
                      <Ionicons name={cfg.icon} size={12} color={cfg.color} />
                      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  )}
                </View>
                {(status === 'none' || status === 'rejected') ? (
                  <TouchableOpacity
                    onPress={() => recommendBook(item.id, 'pending')}
                    style={[styles.recommendBtn, { backgroundColor: colors.primary }]}
                  >
                    <Text style={styles.recommendBtnText}>Öner</Text>
                  </TouchableOpacity>
                ) : null}
              </TouchableOpacity>
            );
          }}
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
  bookDate: { fontSize: 12, marginTop: 2 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginTop: 5 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  recommendBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16 },
  recommendBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '800' },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
