import React, { useState } from 'react';
import {
  Alert, Modal, Platform, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { ReadingList } from '@/data/types';
import BookCard from '@/components/BookCard';
import SectionHeader from '@/components/SectionHeader';

const TABS = ['Okuduklarım', 'Listelerim', 'Kitaplarım'];

const LIST_COLORS = [
  '#4C1D95', '#831843', '#1E3A5F', '#064E3B', '#78350F',
  '#7F1D1D', '#2D1B69', '#0E4D6B', '#3F6212', '#7C2D12',
];

export default function LibraryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { books, stories, poems, savedIds, lists, addList, removeList } = useData();
  const [activeTab, setActiveTab] = useState('Okuduklarım');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [listName, setListName] = useState('');
  const [listDesc, setListDesc] = useState('');
  const [listColor, setListColor] = useState(LIST_COLORS[0]);
  const [expandedList, setExpandedList] = useState<string | null>(null);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const savedBooks = books.filter(b => savedIds.has(b.id));
  const myBooks = books.filter(b => b.authorId === user?.id);
  const myStories = stories.filter(s => s.authorId === user?.id);
  const myPoems = poems.filter(p => p.authorId === user?.id);

  const handleCreateList = () => {
    if (!listName.trim()) {
      Alert.alert('Hata', 'Liste adı boş olamaz.');
      return;
    }
    const newList: ReadingList = {
      id: Date.now().toString(),
      name: listName.trim(),
      description: listDesc.trim(),
      coverColor: listColor,
      bookIds: [],
      createdAt: new Date().toISOString(),
    };
    addList(newList);
    setListName('');
    setListDesc('');
    setListColor(LIST_COLORS[0]);
    setShowCreateModal(false);
  };

  const handleDeleteList = (id: string, name: string) => {
    Alert.alert('Listeyi Sil', `"${name}" listesini silmek istediğinize emin misiniz?`, [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => removeList(id) },
    ]);
  };

  return (
    <View testID="screen-library" style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Kütüphane</Text>
        <TouchableOpacity onPress={() => router.push('/write' as any)} style={styles.createBtn}>
          <LinearGradient colors={['#9B59F5', '#EC4899']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.createBtnGrad}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.createBtnText}>Yeni Oluştur</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {TABS.map(t => (
          <TouchableOpacity key={t} onPress={() => setActiveTab(t)} style={styles.tab}>
            <Text style={[styles.tabText, { color: activeTab === t ? colors.primary : colors.mutedForeground }]}>{t}</Text>
            {activeTab === t && <View style={[styles.tabBar, { backgroundColor: colors.primary }]} />}
          </TouchableOpacity>
        ))}
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* ── Okuduklarım ── */}
        {activeTab === 'Okuduklarım' && (
          savedBooks.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="bookmark-outline" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Kaydedilen Yok</Text>
              <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>Beğendiğin kitapları kaydet, buradan takip et.</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {savedBooks.map(book => (
                <BookCard key={book.id} book={book} onPress={() => router.push(`/book/${book.id}` as any)} width={160} />
              ))}
            </View>
          )
        )}

        {/* ── Listelerim ── */}
        {activeTab === 'Listelerim' && (
          <>
            {/* Create list button */}
            <TouchableOpacity
              onPress={() => setShowCreateModal(true)}
              style={[styles.newListBtn, { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]}
            >
              <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
              <Text style={[styles.newListText, { color: colors.primary }]}>Yeni Liste Oluştur</Text>
            </TouchableOpacity>

            {lists.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="list-outline" size={48} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Liste Yok</Text>
                <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>Kitaplarını listeler oluşturarak düzenle.</Text>
              </View>
            ) : (
              lists.map(list => {
                const listBooks = books.filter(b => list.bookIds.includes(b.id));
                const isExpanded = expandedList === list.id;
                return (
                  <View key={list.id} style={[styles.listCard, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
                    <TouchableOpacity
                      onPress={() => setExpandedList(isExpanded ? null : list.id)}
                      style={styles.listHeader}
                    >
                      <LinearGradient colors={[list.coverColor, list.coverColor + '66']} style={styles.listCover}>
                        <Ionicons name="list" size={20} color="#fff" />
                      </LinearGradient>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.listName, { color: colors.foreground }]}>{list.name}</Text>
                        <Text style={[styles.listMeta, { color: colors.mutedForeground }]}>
                          {list.bookIds.length} kitap
                          {list.description ? ` · ${list.description}` : ''}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => handleDeleteList(list.id, list.name)} style={styles.deleteBtn}>
                        <Ionicons name="trash-outline" size={18} color={colors.mutedForeground} />
                      </TouchableOpacity>
                      <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={styles.listContent}>
                        {listBooks.length === 0 ? (
                          <View style={styles.listEmpty}>
                            <Text style={[styles.listEmptyText, { color: colors.mutedForeground }]}>Bu listede henüz kitap yok.</Text>
                            <TouchableOpacity onPress={() => router.push('/(tabs)/discover')}>
                              <Text style={[styles.listEmptyLink, { color: colors.primary }]}>Kitap keşfet →</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
                            {listBooks.map(b => (
                              <BookCard key={b.id} book={b} onPress={() => router.push(`/book/${b.id}` as any)} width={120} />
                            ))}
                          </ScrollView>
                        )}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </>
        )}

        {/* ── Kitaplarım ── */}
        {activeTab === 'Kitaplarım' && (
          myBooks.length + myStories.length + myPoems.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="pencil-outline" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Henüz Bir Şey Yok</Text>
              <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>İlk eserini yaz ve dünyayla paylaş!</Text>
              <TouchableOpacity onPress={() => router.push('/write' as any)} style={[styles.writeBtn, { borderColor: colors.primary }]}>
                <Text style={[styles.writeBtnText, { color: colors.primary }]}>Yazmaya Başla</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {myBooks.length > 0 && (
                <>
                  <SectionHeader title={`Kitaplarım (${myBooks.length})`} />
                  <View style={styles.grid}>
                    {myBooks.map(b => (
                      <BookCard key={b.id} book={b} onPress={() => router.push(`/book/${b.id}` as any)} width={160} />
                    ))}
                  </View>
                </>
              )}
              {myStories.length > 0 && (
                <>
                  <SectionHeader title={`Hikayelerim (${myStories.length})`} />
                  {myStories.map(s => (
                    <TouchableOpacity key={s.id} onPress={() => router.push(`/story/${s.id}` as any)}
                      style={[styles.listItem, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
                      <LinearGradient colors={[s.coverColor, '#0D0B24']} style={styles.miniCover} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.itemTitle, { color: colors.foreground }]}>{s.title}</Text>
                        <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{s.genre}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  ))}
                </>
              )}
              {myPoems.length > 0 && (
                <>
                  <SectionHeader title={`Şiirlerim (${myPoems.length})`} />
                  {myPoems.map(p => (
                    <TouchableOpacity key={p.id} onPress={() => router.push(`/poem/${p.id}` as any)}
                      style={[styles.listItem, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
                      <LinearGradient colors={[p.coverColor, '#0D0B24']} style={styles.miniCover} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.itemTitle, { color: colors.foreground }]}>{p.title}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </>
          )
        )}

        <View style={{ height: Platform.OS === 'web' ? 100 : 100 }} />
      </ScrollView>

      {/* Create List Modal */}
      <Modal visible={showCreateModal} transparent animationType="slide" onRequestClose={() => setShowCreateModal(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior="padding"
          keyboardVerticalOffset={0}
        >
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Yeni Liste</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.modalInput, { color: colors.foreground, borderColor: colors.border }]}
              placeholder="Liste adı..."
              placeholderTextColor={colors.mutedForeground}
              value={listName}
              onChangeText={setListName}
              maxLength={40}
            />
            <TextInput
              style={[styles.modalInput, { color: colors.foreground, borderColor: colors.border }]}
              placeholder="Açıklama (isteğe bağlı)..."
              placeholderTextColor={colors.mutedForeground}
              value={listDesc}
              onChangeText={setListDesc}
              maxLength={100}
            />

            <Text style={[styles.colorLabel, { color: colors.mutedForeground }]}>Renk</Text>
            <View style={styles.colorRow}>
              {LIST_COLORS.map(c => (
                <TouchableOpacity key={c} onPress={() => setListColor(c)}
                  style={[styles.colorDot, { backgroundColor: c, borderWidth: listColor === c ? 2 : 0, borderColor: '#fff' }]}>
                  {listColor === c && <Ionicons name="checkmark" size={12} color="#fff" />}
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity onPress={handleCreateList} style={styles.createListBtn}>
              <LinearGradient colors={['#9B59F5', '#EC4899']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.createListBtnGrad}>
                <Text style={styles.createListBtnText}>Liste Oluştur</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
  title: { fontFamily: 'Poppins_700Bold', fontSize: 28 },
  createBtn: { borderRadius: 20, overflow: 'hidden' },
  createBtnGrad: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8 },
  createBtnText: { color: '#fff', fontFamily: 'Poppins_600SemiBold', fontSize: 13 },
  tabRow: { flexDirection: 'row', paddingHorizontal: 20 },
  tab: { flex: 1, alignItems: 'center', paddingBottom: 10, position: 'relative' },
  tabText: { fontFamily: 'Poppins_600SemiBold', fontSize: 13 },
  tabBar: { position: 'absolute', bottom: 0, left: 16, right: 16, height: 2, borderRadius: 1 },
  divider: { height: 1, marginBottom: 16 },
  content: { paddingHorizontal: 20, gap: 10, paddingTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontFamily: 'Poppins_700Bold', fontSize: 18 },
  emptyDesc: { fontFamily: 'Poppins_400Regular', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  writeBtn: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10, marginTop: 8 },
  writeBtnText: { fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
  newListBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderRadius: 12, borderStyle: 'dashed', paddingVertical: 14,
  },
  newListText: { fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
  listCard: { overflow: 'hidden' },
  listHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  listCover: { width: 46, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  listName: { fontFamily: 'Poppins_700Bold', fontSize: 14 },
  listMeta: { fontFamily: 'Poppins_400Regular', fontSize: 12, marginTop: 2 },
  deleteBtn: { padding: 4 },
  listContent: { paddingBottom: 14 },
  listEmpty: { alignItems: 'center', paddingVertical: 16, gap: 6 },
  listEmptyText: { fontFamily: 'Poppins_400Regular', fontSize: 13 },
  listEmptyLink: { fontFamily: 'Poppins_600SemiBold', fontSize: 13 },
  hList: { paddingHorizontal: 14, gap: 10 },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  miniCover: { width: 50, height: 66, borderRadius: 8 },
  itemTitle: { fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
  itemSub: { fontFamily: 'Poppins_400Regular', fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 12 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  modalTitle: { fontFamily: 'Poppins_700Bold', fontSize: 18 },
  modalInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontFamily: 'Poppins_400Regular', fontSize: 14 },
  colorLabel: { fontFamily: 'Poppins_500Medium', fontSize: 12 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorDot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  createListBtn: { borderRadius: 12, overflow: 'hidden', marginTop: 4 },
  createListBtnGrad: { paddingVertical: 14, alignItems: 'center' },
  createListBtnText: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: 15 },
});
