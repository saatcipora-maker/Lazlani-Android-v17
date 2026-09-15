import React, { useState } from 'react';
import {
  Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, Platform,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import UserAvatar from '@/components/UserAvatar';
import StarRating from '@/components/StarRating';
import StarRatingInput from '@/components/StarRatingInput';
import CommentInput from '@/components/CommentInput';
import { SAMPLE_USERS } from '@/data/sampleData';

export default function BookDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const {
    books, users, likedIds, savedIds, toggleLike, toggleSave,
    lists, addToList, userRatings, rateContent, readProgress,
    addBookmark, bookmarks, favoriteIds, toggleFavorite,
  } = useData();

  const [expanded,      setExpanded]      = useState(false);
  const [showListModal, setShowListModal] = useState(false);
  const [showChapModal, setShowChapModal] = useState(false);

  const topPad   = Platform.OS === 'web' ? 67 : insets.top;
  const book = books.find(b => b.id === id);
  if (!book) {
    return (
      <View style={[styles.root, styles.notFound, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <Ionicons name="book-outline" size={48} color={colors.mutedForeground} />
        <Text style={[styles.notFoundTitle, { color: colors.foreground }]}>Kitap bulunamadı</Text>
        <Text style={[styles.notFoundText, { color: colors.mutedForeground }]}>
          Kitap kaldırılmış veya bağlantı geçersiz olabilir.
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={[styles.notFoundButton, { backgroundColor: colors.primary }]}>
          <Text style={[styles.notFoundButtonText, { color: colors.primaryForeground }]}>Geri Dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const author   = users.find(u => u.id === book.authorId) ?? SAMPLE_USERS.find(u => u.id === book.authorId);
  const isLiked  = likedIds.has(id);
  const isSaved  = savedIds.has(id);
  const myRating = userRatings[id] ?? 0;
  const progress = readProgress[id] ?? 0;

  const handleLike = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleLike(id); };
  const handleSave = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleSave(id); };
  const isOwner = user?.id === book?.authorId;
  const isFavorite = favoriteIds.has(id);
  const isBookmarked = bookmarks.some(b => b.targetId === id && b.targetType === 'book' && b.userId === user?.id);
  const handleBookmark = () => {
    if (isBookmarked) return;
    addBookmark({ id: Date.now().toString(), userId: user?.id ?? '', targetId: id, targetType: 'book', scrollPercent: readProgress[id] ?? 0, createdAt: new Date().toISOString() });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      {/* ── Hero ── */}
      <LinearGradient colors={[book.coverColor, colors.background]} style={[styles.hero, { paddingTop: topPad }]}>
        <View style={styles.heroActions}>
          <TouchableOpacity onPress={() => router.back()} style={styles.circleBtn}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {/* Chapter menu button */}
            <TouchableOpacity
              onPress={() => setShowChapModal(true)}
              style={[styles.circleBtn, { flexDirection: 'row', paddingHorizontal: 12, gap: 5, width: 'auto' }]}
            >
              <Ionicons name="list" size={16} color="#fff" />
              <Text style={styles.chapBtnText}>Bölümler</Text>
            </TouchableOpacity>
            {isOwner && (
              <>
                <TouchableOpacity
                  onPress={() => router.push({ pathname: '/write-chapter', params: { bookId: id, bookTitle: book.title } } as any)}
                  style={[styles.circleBtn, { flexDirection: 'row', paddingHorizontal: 12, gap: 5, width: 'auto' }]}
                >
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.chapBtnText}>Bölüm Ekle</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => router.push({ pathname: '/edit-book', params: { id } } as any)}
                  style={[styles.circleBtn, { flexDirection: 'row', paddingHorizontal: 12, gap: 5, width: 'auto' }]}
                >
                  <Ionicons name="pencil" size={14} color="#fff" />
                  <Text style={styles.chapBtnText}>Düzenle</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity onPress={() => { toggleFavorite(id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} style={styles.circleBtn}>
              <Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={22} color={isFavorite ? '#EF4444' : '#fff'} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleBookmark} style={styles.circleBtn}>
              <Ionicons name={isBookmarked ? 'bookmark' : 'bookmark-outline'} size={22} color={isBookmarked ? '#FFD700' : '#fff'} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={styles.circleBtn}>
              <Ionicons name={isSaved ? 'heart' : 'heart-outline'} size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.heroContent}>
          <View style={[styles.coverArt, { backgroundColor: book.coverColor + '80', borderRadius: colors.radius }]}>
            <Text style={styles.coverArtTitle} numberOfLines={3}>{book.title}</Text>
            <Text style={styles.coverArtGenre}>{book.genre}</Text>
          </View>
          <View style={styles.heroInfo}>
            <Text style={styles.heroGenre}>{book.genre}</Text>
            <Text style={styles.heroTitle}>{book.title}</Text>
            {author && (
              <TouchableOpacity onPress={() => router.push(`/user/${author.id}` as any)} style={styles.authorRow}>
                <UserAvatar name={author.displayName} color={author.avatarColor} size={28} />
                <Text style={styles.heroAuthor}>{author.displayName}</Text>
              </TouchableOpacity>
            )}
            <StarRating rating={book.rating} size={14} />
          </View>
        </View>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Stats */}
        <View style={[styles.statsRow, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
          {[
            { icon: 'eye-outline'       as const, val: `${(book.readCount/1000).toFixed(1)}K`, label: 'Okuma' },
            { icon: 'heart-outline'     as const, val: `${(book.likesCount/1000).toFixed(1)}K`, label: 'Beğeni' },
            { icon: 'chatbubble-outline'as const, val: book.commentsCount.toString(),            label: 'Yorum' },
          ].map(s => (
            <View key={s.label} style={styles.stat}>
              <Ionicons name={s.icon} size={18} color={colors.primary} />
              <Text style={[styles.statVal, { color: colors.foreground }]}>{s.val}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
            </View>
          ))}
          <View style={styles.stat}>
            <StarRating rating={book.rating} size={16} />
            <Text style={[styles.statVal, { color: colors.foreground }]}>{book.rating.toFixed(1)}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{book.ratingCount} oy</Text>
          </View>
        </View>

        {/* Progress bar */}
        {progress > 0 && (
          <View style={[styles.progressCard, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
            <View style={styles.progressHeader}>
              <Text style={[styles.progressLabel, { color: colors.foreground }]}>Okuma İlerlemen</Text>
              <Text style={[styles.progressPct, { color: colors.primary }]}>%{progress}</Text>
            </View>
            <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
              <LinearGradient
                colors={['#9B59F5','#EC4899']} start={{ x:0,y:0 }} end={{ x:1,y:0 }}
                style={[styles.progressFill, { width: `${progress}%` as any }]}
              />
            </View>
          </View>
        )}

        {/* Description */}
        <View style={[styles.section, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Hakkında</Text>
          <Text style={[styles.desc, { color: colors.foreground }]} numberOfLines={expanded ? undefined : 3}>
            {book.description}
          </Text>
          <TouchableOpacity onPress={() => setExpanded(!expanded)}>
            <Text style={[styles.expandBtn, { color: colors.primary }]}>{expanded ? 'Daha Az' : 'Devamını Oku'}</Text>
          </TouchableOpacity>
        </View>

        {/* Tags */}
        <View style={styles.tags}>
          {book.tags.map(tag => (
            <View key={tag} style={[styles.tag, { backgroundColor: colors.secondary, borderRadius: 20 }]}>
              <Text style={[styles.tagText, { color: colors.secondaryForeground }]}>#{tag}</Text>
            </View>
          ))}
        </View>

        {/* Rate */}
        <View style={[styles.section, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Bu Kitabı Puanla</Text>
          <StarRatingInput rating={myRating} onRate={r => rateContent(id, r)} size={32} />
          {myRating > 0 && (
            <Text style={[styles.ratingNote, { color: colors.mutedForeground }]}>
              {['','Hiç beğenmedim','Beğenmedim','İdare eder','Beğendim','Harika!'][myRating]}
            </Text>
          )}
        </View>

        {/* Add to list */}
        {lists.length > 0 && (
          <TouchableOpacity
            onPress={() => setShowListModal(true)}
            style={[styles.listBtn, { backgroundColor: colors.card, borderRadius: colors.radius, borderColor: colors.border }]}
          >
            <Ionicons name="list-outline" size={18} color={colors.primary} />
            <Text style={[styles.listBtnText, { color: colors.foreground }]}>Listeye Ekle</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}

        {/* Chapter count summary */}
        <TouchableOpacity
          onPress={() => setShowChapModal(true)}
          style={[styles.chapSummary, { backgroundColor: colors.card, borderRadius: colors.radius, borderColor: colors.border }]}
        >
          <LinearGradient colors={['#9B59F5','#EC4899']} start={{ x:0,y:0 }} end={{ x:1,y:0 }} style={styles.chapSummaryIcon}>
            <Ionicons name="layers-outline" size={18} color="#fff" />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={[styles.chapSummaryTitle, { color: colors.foreground }]}>{book.chapters.length} Bölüm</Text>
            <Text style={[styles.chapSummaryDesc, { color: colors.mutedForeground }]}>Bölüm listesini görmek için dokun</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>

        {/* Comments */}
        <CommentInput targetId={id} targetType="book" />

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Bottom CTA */}
      <View style={[styles.bottomBar, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: insets.bottom + 10 }]}>
        <TouchableOpacity onPress={handleLike} style={[styles.likeBtn, { backgroundColor: colors.card }]}>
          <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={22} color={isLiked ? '#EC4899' : colors.mutedForeground} />
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1 }}
          onPress={() => router.push(`/reader/${book.id}` as any)}
        >
          <LinearGradient colors={['#9B59F5','#EC4899']} start={{ x:0,y:0 }} end={{ x:1,y:0 }} style={styles.readBtnGrad}>
            <Ionicons name="book-outline" size={18} color="#fff" />
            <Text style={styles.readBtnText}>{progress > 0 ? 'Devam Et' : 'Okumaya Başla'}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* ── Chapter drawer modal ── */}
      <Modal visible={showChapModal} transparent animationType="slide" onRequestClose={() => setShowChapModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Bölümler</Text>
                <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>{book.chapters.length} bölüm · {book.title}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowChapModal(false)}>
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 500 }}>
              {book.chapters.length === 0 ? (
                <Text style={[styles.noChap, { color: colors.mutedForeground }]}>Henüz bölüm eklenmedi.</Text>
              ) : (
                book.chapters.map((ch, idx) => (
                  <TouchableOpacity
                    key={ch.id}
                    onPress={() => {
                      setShowChapModal(false);
                      router.push(`/reader/${book.id}?chapter=${ch.id}` as any);
                    }}
                    style={[styles.chapRow, { borderBottomColor: colors.border }]}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.chapNum, { backgroundColor: colors.secondary }]}>
                      <Text style={[styles.chapNumText, { color: colors.primary }]}>{idx + 1}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={[styles.chapTitle, { color: colors.foreground }]}>{ch.title}</Text>
                      {ch.summary ? (
                        <Text style={[styles.chapSummaryText, { color: colors.mutedForeground }]} numberOfLines={2}>
                          {ch.summary}
                        </Text>
                      ) : null}
                      <View style={styles.chapMeta}>
                        <Ionicons name="document-text-outline" size={12} color={colors.mutedForeground} />
                        <Text style={[styles.chapMetaText, { color: colors.mutedForeground }]}>{ch.wordCount} kelime</Text>
                      </View>
                    </View>
                    <Ionicons name="play-circle-outline" size={22} color={colors.primary} />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Add to list modal ── */}
      <Modal visible={showListModal} transparent animationType="slide" onRequestClose={() => setShowListModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Listeye Ekle</Text>
              <TouchableOpacity onPress={() => setShowListModal(false)}>
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            {lists.map(list => {
              const inList = list.bookIds.includes(id);
              return (
                <TouchableOpacity
                  key={list.id}
                  onPress={() => { addToList(list.id, id); setShowListModal(false); }}
                  style={[styles.listRow, { borderBottomColor: colors.border }]}
                >
                  <LinearGradient colors={[list.coverColor, list.coverColor+'88']} style={styles.listRowCover}>
                    <Ionicons name="list" size={14} color="#fff" />
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.listRowName, { color: colors.foreground }]}>{list.name}</Text>
                    <Text style={[styles.listRowMeta, { color: colors.mutedForeground }]}>{list.bookIds.length} kitap</Text>
                  </View>
                  {inList && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  notFound: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10 },
  notFoundTitle: { fontFamily: 'Poppins_700Bold', fontSize: 20 },
  notFoundText: { fontFamily: 'Poppins_400Regular', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  notFoundButton: { marginTop: 8, borderRadius: 18, paddingHorizontal: 20, paddingVertical: 10 },
  notFoundButtonText: { fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
  hero: { paddingBottom: 20 },
  heroActions: { flexDirection:'row', justifyContent:'space-between', paddingHorizontal:16, paddingTop:8, paddingBottom:16 },
  circleBtn: { height:38, minWidth:38, borderRadius:19, backgroundColor:'rgba(0,0,0,0.3)', alignItems:'center', justifyContent:'center', paddingHorizontal: 10 },
  chapBtnText: { color:'#fff', fontFamily:'Poppins_600SemiBold', fontSize:13 },
  heroContent: { flexDirection:'row', gap:16, paddingHorizontal:20 },
  coverArt: { width:120, height:170, justifyContent:'flex-end', padding:10 },
  coverArtTitle: { color:'#fff', fontFamily:'Poppins_700Bold', fontSize:14, lineHeight:18 },
  coverArtGenre: { color:'rgba(255,255,255,0.7)', fontFamily:'Poppins_400Regular', fontSize:11, marginTop:4 },
  heroInfo: { flex:1, justifyContent:'flex-end', paddingBottom:4, gap:6 },
  heroGenre: { color:'rgba(255,255,255,0.7)', fontFamily:'Poppins_500Medium', fontSize:12 },
  heroTitle: { color:'#FFFFFF', fontFamily:'Poppins_700Bold', fontSize:20, lineHeight:26 },
  authorRow: { flexDirection:'row', alignItems:'center', gap:8 },
  heroAuthor: { color:'rgba(255,255,255,0.85)', fontFamily:'Poppins_500Medium', fontSize:13 },
  content: { gap:12, padding:16 },
  statsRow: { flexDirection:'row', justifyContent:'space-around', padding:16 },
  stat: { alignItems:'center', gap:4 },
  statVal: { fontFamily:'Poppins_700Bold', fontSize:15 },
  statLabel: { fontFamily:'Poppins_400Regular', fontSize:11 },
  progressCard: { padding:14, gap:8 },
  progressHeader: { flexDirection:'row', justifyContent:'space-between' },
  progressLabel: { fontFamily:'Poppins_600SemiBold', fontSize:13 },
  progressPct: { fontFamily:'Poppins_700Bold', fontSize:13 },
  progressBar: { height:6, borderRadius:3, overflow:'hidden' },
  progressFill: { height:6, borderRadius:3 },
  section: { padding:16, gap:10 },
  sectionTitle: { fontFamily:'Poppins_700Bold', fontSize:16, marginBottom:4 },
  desc: { fontFamily:'Poppins_400Regular', fontSize:14, lineHeight:22 },
  expandBtn: { fontFamily:'Poppins_600SemiBold', fontSize:13, marginTop:4 },
  ratingNote: { fontFamily:'Poppins_400Regular', fontSize:13, marginTop:6 },
  tags: { flexDirection:'row', flexWrap:'wrap', gap:8 },
  tag: { paddingHorizontal:12, paddingVertical:6 },
  tagText: { fontFamily:'Poppins_500Medium', fontSize:12 },
  listBtn: { flexDirection:'row', alignItems:'center', gap:12, padding:14, borderWidth:1 },
  listBtnText: { flex:1, fontFamily:'Poppins_600SemiBold', fontSize:14 },
  chapSummary: { flexDirection:'row', alignItems:'center', gap:14, padding:14, borderWidth:1 },
  chapSummaryIcon: { width:42, height:42, borderRadius:12, alignItems:'center', justifyContent:'center' },
  chapSummaryTitle: { fontFamily:'Poppins_700Bold', fontSize:15 },
  chapSummaryDesc: { fontFamily:'Poppins_400Regular', fontSize:12, marginTop:2 },
  bottomBar: { flexDirection:'row', gap:10, paddingHorizontal:20, paddingTop:10, borderTopWidth:1 },
  likeBtn: { width:48, height:48, borderRadius:12, alignItems:'center', justifyContent:'center' },
  readBtnGrad: { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, paddingVertical:14, borderRadius:12 },
  readBtnText: { color:'#fff', fontFamily:'Poppins_700Bold', fontSize:15 },
  /* Modals */
  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'flex-end' },
  modalCard: { borderTopLeftRadius:24, borderTopRightRadius:24, padding:20, gap:4 },
  modalHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 },
  modalTitle: { fontFamily:'Poppins_700Bold', fontSize:18 },
  modalSub: { fontFamily:'Poppins_400Regular', fontSize:12, marginTop:2 },
  noChap: { fontFamily:'Poppins_400Regular', fontSize:13, textAlign:'center', paddingVertical:20 },
  chapRow: { flexDirection:'row', alignItems:'center', gap:14, paddingVertical:14, borderBottomWidth:1 },
  chapNum: { width:38, height:38, borderRadius:10, alignItems:'center', justifyContent:'center' },
  chapNumText: { fontFamily:'Poppins_700Bold', fontSize:15 },
  chapTitle: { fontFamily:'Poppins_600SemiBold', fontSize:14 },
  chapSummaryText: { fontFamily:'Poppins_400Regular', fontSize:12, lineHeight:18 },
  chapMeta: { flexDirection:'row', alignItems:'center', gap:4, marginTop:2 },
  chapMetaText: { fontFamily:'Poppins_400Regular', fontSize:11 },
  listRow: { flexDirection:'row', alignItems:'center', gap:12, paddingVertical:12, borderBottomWidth:1 },
  listRowCover: { width:38, height:38, borderRadius:8, alignItems:'center', justifyContent:'center' },
  listRowName: { fontFamily:'Poppins_600SemiBold', fontSize:14 },
  listRowMeta: { fontFamily:'Poppins_400Regular', fontSize:12 },
});
