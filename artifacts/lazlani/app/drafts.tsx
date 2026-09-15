import React, { useState } from 'react';
import {
  Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';

const TABS = ['Kitaplar', 'Hikayeler', 'Şiirler'];

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'şimdi';
  if (diff < 3600) return `${Math.floor(diff / 60)}dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa önce`;
  return `${Math.floor(diff / 86400)}g önce`;
}

export default function DraftsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { books, stories, poems, publishDraft } = useData();
  const [activeTab, setActiveTab] = useState('Kitaplar');
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const draftBooks    = books.filter(b => b.authorId === user?.id && b.isDraft);
  const draftStories  = stories.filter(s => s.authorId === user?.id && s.isDraft);
  const draftPoems    = poems.filter(p => p.authorId === user?.id && p.isDraft);

  const currentDrafts = activeTab === 'Kitaplar' ? draftBooks
    : activeTab === 'Hikayeler' ? draftStories
    : draftPoems;

  const handlePublish = (id: string, type: 'book' | 'story' | 'poem', title: string) => {
    Alert.alert('Yayınla', `"${title}" adlı içeriği yayınlamak istiyor musun?`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Yayınla', onPress: () => {
          publishDraft(id, type);
          Alert.alert('Yayınlandı! 🎉', `"${title}" artık herkese görünür.`);
        }
      },
    ]);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Taslaklar</Text>
        <TouchableOpacity onPress={() => router.push('/write' as any)} style={[styles.newBtn, { backgroundColor: colors.primary }]}>
          <Ionicons name="add" size={18} color={colors.primaryForeground} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {TABS.map(t => (
          <TouchableOpacity key={t} onPress={() => setActiveTab(t)} style={styles.tab}>
            <Text style={[styles.tabText, { color: activeTab === t ? colors.primary : colors.mutedForeground }]}>{t}</Text>
            {activeTab === t && <View style={[styles.tabUnder, { backgroundColor: colors.primary }]} />}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {currentDrafts.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="document-outline" size={56} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Taslak yok</Text>
            <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
              Yazdığın içerikler taslak olarak burada görünür
            </Text>
            <TouchableOpacity onPress={() => router.push('/write' as any)}
              style={[styles.emptyBtn, { backgroundColor: colors.primary }]}>
              <Text style={[styles.emptyBtnText, { color: colors.primaryForeground }]}>Yazmaya Başla</Text>
            </TouchableOpacity>
          </View>
        ) : (
          currentDrafts.map(item => (
            <View key={item.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.cardAccent, { backgroundColor: item.coverColor }]} />
              <View style={styles.cardBody}>
                <View style={[styles.draftBadge, { backgroundColor: colors.warning + '22' }]}>
                  <Text style={[styles.draftBadgeText, { color: colors.warning }]}>TASLAK</Text>
                </View>
                <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>{item.title}</Text>
                {'genre' in item && (
                  <Text style={[styles.cardMeta, { color: colors.mutedForeground }]}>{(item as any).genre}</Text>
                )}
                <Text style={[styles.cardTime, { color: colors.mutedForeground }]}>{timeAgo(item.createdAt)}</Text>
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity
                  onPress={() => handlePublish(item.id, activeTab === 'Kitaplar' ? 'book' : activeTab === 'Hikayeler' ? 'story' : 'poem', item.title)}
                  style={[styles.publishBtn, { backgroundColor: colors.success }]}>
                  <Ionicons name="cloud-upload-outline" size={14} color="#fff" />
                  <Text style={styles.publishBtnText}>Yayınla</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.editBtn, { borderColor: colors.border }]}>
                  <Ionicons name="create-outline" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            </View>
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
  newBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { fontSize: 14, fontFamily: 'Poppins_500Medium' },
  tabUnder: { height: 2, width: 40, borderRadius: 1, marginTop: 4 },
  list: { padding: 16 },
  card: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 12, marginBottom: 12,
    borderWidth: 1, overflow: 'hidden',
  },
  cardAccent: { width: 6, alignSelf: 'stretch' },
  cardBody: { flex: 1, padding: 12 },
  draftBadge: { alignSelf: 'flex-start', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 4 },
  draftBadgeText: { fontSize: 9, fontFamily: 'Poppins_600SemiBold', letterSpacing: 1 },
  cardTitle: { fontSize: 15, fontFamily: 'Poppins_600SemiBold', marginBottom: 2 },
  cardMeta: { fontSize: 12, fontFamily: 'Poppins_400Regular' },
  cardTime: { fontSize: 11, fontFamily: 'Poppins_400Regular', marginTop: 4 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 12 },
  publishBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  publishBtnText: { fontSize: 12, color: '#fff', fontFamily: 'Poppins_500Medium' },
  editBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: 'Poppins_600SemiBold' },
  emptyDesc: { fontSize: 13, fontFamily: 'Poppins_400Regular', textAlign: 'center', paddingHorizontal: 40 },
  emptyBtn: { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  emptyBtnText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
});
