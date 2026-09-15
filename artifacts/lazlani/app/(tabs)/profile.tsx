import React, { useState } from 'react';
import {
  Alert, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import BookCard from '@/components/BookCard';
import UserAvatar from '@/components/UserAvatar';
import { Post, PostComment } from '@/data/types';

const TABS = ['Paylaşımlar', 'Kitaplar', 'Hikayeler', 'Şiirler', 'Hakkında'];

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'şimdi';
  if (diff < 3600) return `${Math.floor(diff / 60)}dk`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa`;
  return `${Math.floor(diff / 86400)}g`;
}

interface ProfilePostCardProps {
  post: Post;
  comments: PostComment[];
  isLiked: boolean;
  isSaved: boolean;
  onLike: () => void;
  onSave: () => void;
}

function ProfilePostCard({ post, comments, isLiked, isSaved, onLike, onSave }: ProfilePostCardProps) {
  const colors = useColors();
  const [showComments, setShowComments] = useState(false);

  return (
    <View style={[styles.postCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {post.title && (
        <Text style={[styles.postTitle, { color: colors.foreground }]}>{post.title}</Text>
      )}
      <Text style={[styles.postContent, { color: colors.foreground }]}>{post.content}</Text>
      <Text style={[styles.postTime, { color: colors.mutedForeground }]}>{timeAgo(post.createdAt)}</Text>

      <View style={[styles.postActions, { borderTopColor: colors.border }]}>
        <TouchableOpacity onPress={onLike} style={styles.postAction}>
          <Ionicons
            name={isLiked ? 'heart' : 'heart-outline'}
            size={17}
            color={isLiked ? '#EC4899' : colors.mutedForeground}
          />
          <Text style={[styles.postActionTxt, { color: colors.mutedForeground }]}>
            {post.likesCount + (isLiked ? 1 : 0)}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setShowComments(v => !v)} style={styles.postAction}>
          <Ionicons name="chatbubble-outline" size={17} color={colors.mutedForeground} />
          <Text style={[styles.postActionTxt, { color: colors.mutedForeground }]}>{post.commentsCount}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.postAction}>
          <Ionicons name="share-social-outline" size={17} color={colors.mutedForeground} />
          <Text style={[styles.postActionTxt, { color: colors.mutedForeground }]}>{post.sharesCount}</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        <TouchableOpacity onPress={onSave}>
          <Ionicons
            name={isSaved ? 'bookmark' : 'bookmark-outline'}
            size={17}
            color={isSaved ? '#9B59F5' : colors.mutedForeground}
          />
        </TouchableOpacity>
      </View>

      {showComments && (
        <View style={[styles.commentsWrap, { borderTopColor: colors.border }]}>
          {comments.length === 0 ? (
            <Text style={[styles.noComments, { color: colors.mutedForeground }]}>Henüz yorum yok</Text>
          ) : comments.map(c => (
            <View key={c.id} style={styles.commentRow}>
              <UserAvatar name={c.authorName} color={c.authorAvatarColor} size={26} />
              <View style={[styles.commentBubble, { backgroundColor: colors.background }]}>
                <Text style={[styles.commentAuthor, { color: colors.primary }]}>{c.authorName}</Text>
                <Text style={[styles.commentText, { color: colors.foreground }]}>{c.content}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const {
    books, stories, poems, posts,
    togglePostLike, postLikedIds, postSavedIds, togglePostSave,
    postComments, addPostComment, addPostCommentReply,
    togglePostCommentLike, addReactionToPostComment, postCommentLikedIds,
  } = useData();
  const [activeTab, setActiveTab] = useState('Paylaşımlar');
  const [showShare, setShowShare] = useState(false);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  if (!user) return null;

  const myBooks    = books.filter(b => b.authorId === user.id);
  const myStories  = stories.filter(s => s.authorId === user.id);
  const myPoems    = poems.filter(p => p.authorId === user.id);
  const myPosts    = posts.filter(p => p.authorId === user.id);

  const handleLogout = async () => { await logout(); };
  const formatNum = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toString();
  const handleShareProfile = async () => {
    try {
      await Share.share({
        title: `${user.displayName} — LAZLANI`,
        message: `${user.displayName} (@${user.username}) profilini LAZLANI uygulamasında keşfet.`,
      });
    } catch {
      Alert.alert('Paylaşım Başarısız', 'Profil şu anda paylaşılamadı. Lütfen tekrar deneyin.');
    }
  };

  return (
    <View testID="screen-profile" style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Cover */}
        <LinearGradient
          colors={[user.coverColor, colors.background]}
          style={[styles.cover, { paddingTop: topPad }]}
        >
          <View style={styles.coverActions}>
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={handleLogout} style={styles.iconBtn}>
              <Ionicons name="log-out-outline" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/settings' as any)} style={styles.iconBtn}>
              <Ionicons name="settings-outline" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Avatar */}
        <View style={styles.avatarRow}>
          <View style={[styles.avatarBorder, { borderColor: colors.background }]}>
            <UserAvatar name={user.displayName} color={user.avatarColor} size={80} />
          </View>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            onPress={() => setShowShare(true)}
            style={[styles.shareBtn, { borderColor: colors.border }]}
          >
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/edit-profile' as any)}
            style={[styles.editBtn, { borderColor: colors.border }]}
          >
            <Text style={[styles.editBtnText, { color: colors.foreground }]}>Düzenle</Text>
          </TouchableOpacity>
        </View>

        {/* Share / More modal */}
        <Modal visible={showShare} transparent animationType="slide" onRequestClose={() => setShowShare(false)}>
          <Pressable style={styles.shareOverlay} onPress={() => setShowShare(false)} />
          <View style={[styles.shareSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.shareHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.shareTitle, { color: colors.foreground }]}>Profil Seçenekleri</Text>
            {[
              { icon: 'color-palette-outline' as const,  label: 'Tema Seç',             action: () => { setShowShare(false); router.push('/theme' as any); } },
              { icon: 'diamond-outline'      as const,  label: 'Premium Üyelik',        action: () => { setShowShare(false); router.push('/premium' as any); } },
              { icon: 'document-outline'     as const,  label: 'Taslaklar',             action: () => { setShowShare(false); router.push('/drafts' as any); } },
              { icon: 'bookmark-outline'     as const,  label: 'Yer İmleri',            action: () => { setShowShare(false); router.push('/bookmarks' as any); } },
              { icon: 'heart-outline'            as const, label: 'Favorilerim',        action: () => { setShowShare(false); router.push('/favorites' as any); } },
              { icon: 'star-outline'             as const, label: 'Önerilerim',         action: () => { setShowShare(false); router.push('/my-recommendations' as any); } },
              { icon: 'game-controller-outline'  as const, label: 'Oyun',               action: () => { setShowShare(false); router.push('/game' as any); } },
              { icon: 'grid-outline'             as const, label: 'Match-3 Oyunu',      action: () => { setShowShare(false); router.push('/match3' as any); } },
              { icon: 'share-social-outline' as const,  label: 'Profili Paylaş',        action: handleShareProfile },
              { icon: 'stats-chart-outline'  as const,  label: 'Profil İstatistikleri', action: () => Alert.alert('İstatistikler', `Toplam ${user.followersCount} takipçi · ${user.booksCount} kitap · ${user.poemsCount} şiir`) },
            ].map(item => (
              <TouchableOpacity
                key={item.label}
                onPress={() => { setShowShare(false); setTimeout(item.action, 200); }}
                style={[styles.shareRow, { borderBottomColor: colors.border }]}
              >
                <View style={[styles.shareIcon, { backgroundColor: `${colors.primary}18` }]}>
                  <Ionicons name={item.icon} size={18} color={colors.primary} />
                </View>
                <Text style={[styles.shareLabel, { color: colors.foreground }]}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={() => setShowShare(false)}
              style={[styles.shareCancelBtn, { backgroundColor: colors.secondary, marginTop: 8 }]}
            >
              <Text style={[styles.shareCancelTxt, { color: colors.foreground }]}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </Modal>

        {/* Info */}
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={[styles.displayName, { color: colors.foreground }]}>{user.displayName}</Text>
            {user.isPremium && (
              <LinearGradient
                colors={['#C2185B', '#E91E63', '#FF5722']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.profilePremiumBadge}
              >
                <Ionicons name="flash" size={11} color="#FFE082" />
                <Text style={styles.profilePremiumText}>Premium</Text>
              </LinearGradient>
            )}
          </View>
          <Text style={[styles.username, { color: colors.mutedForeground }]}>@{user.username}</Text>
          {user.bio ? <Text style={[styles.bio, { color: colors.foreground }]}>{user.bio}</Text> : null}
          <Text style={[styles.joined, { color: colors.mutedForeground }]}>
            <Ionicons name="calendar-outline" size={12} color={colors.mutedForeground} /> {user.joinedAt} tarihinden beri
          </Text>
        </View>

        {/* Stats */}
        <View style={[styles.stats, { borderColor: colors.border }]}>
          {[
            { label: 'Takipçi',  value: formatNum(user.followersCount) },
            { label: 'Takip',    value: formatNum(user.followingCount) },
            { label: 'Beğeni',   value: formatNum(user.likesReceivedCount) },
            { label: 'Kitap',    value: myBooks.length.toString() },
            { label: 'Şiir',     value: myPoems.length.toString() },
          ].map(s => (
            <View key={s.label} style={styles.stat}>
              <Text style={[styles.statVal, { color: colors.foreground }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Write button */}
        <TouchableOpacity
          onPress={() => router.push('/write' as any)}
          style={[styles.writeBtn, { marginHorizontal: 20 }]}
        >
          <LinearGradient
            colors={['#9B59F5', '#EC4899']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.writeBtnGrad}
          >
            <Ionicons name="pencil-outline" size={16} color="#fff" />
            <Text style={styles.writeBtnText}>Yeni Eser Yaz</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Admin Panel button — only for admins */}
        {user.isAdmin && (
          <TouchableOpacity
            onPress={() => router.push('/admin' as any)}
            style={[styles.adminBtn, { backgroundColor: '#7F1D1D', marginHorizontal: 20, marginBottom: 12 }]}
          >
            <Ionicons name="shield-checkmark-outline" size={16} color="#FCA5A5" />
            <Text style={styles.adminBtnText}>Yönetici Paneli</Text>
            <Ionicons name="chevron-forward" size={14} color="#FCA5A5" />
          </TouchableOpacity>
        )}

        {/* Content tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabRow}
        >
          {TABS.map(t => (
            <TouchableOpacity key={t} onPress={() => setActiveTab(t)} style={styles.tab}>
              <Text style={[styles.tabText, { color: activeTab === t ? colors.primary : colors.mutedForeground }]}>
                {t}
              </Text>
              {activeTab === t && <View style={[styles.tabBar, { backgroundColor: colors.primary }]} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Tab content */}
        <View style={styles.tabContent}>

          {/* ── Paylaşımlar ── */}
          {activeTab === 'Paylaşımlar' && (
            myPosts.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="newspaper-outline" size={40} color={colors.mutedForeground} />
                <Text style={[styles.empty, { color: colors.mutedForeground }]}>Henüz paylaşım yok</Text>
                <TouchableOpacity
                  onPress={() => router.push('/bulten' as any)}
                  style={[styles.emptyBtn, { backgroundColor: `${colors.primary}20`, borderColor: colors.primary }]}
                >
                  <Text style={[styles.emptyBtnTxt, { color: colors.primary }]}>Paylaşım Yap</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {myPosts.map(post => (
                  <ProfilePostCard
                    key={post.id}
                    post={post}
                    comments={postComments.filter(c => c.postId === post.id)}
                    isLiked={postLikedIds.has(post.id)}
                    isSaved={postSavedIds.has(post.id)}
                    onLike={() => togglePostLike(post.id)}
                    onSave={() => togglePostSave(post.id)}
                  />
                ))}
              </View>
            )
          )}

          {activeTab === 'Kitaplar' && (
            myBooks.length === 0 ? (
              <Text style={[styles.empty, { color: colors.mutedForeground }]}>Henüz kitap yok</Text>
            ) : (
              <View style={styles.grid}>
                {myBooks.map(b => (
                  <BookCard key={b.id} book={b} onPress={() => router.push(`/book/${b.id}` as any)} width={160} />
                ))}
              </View>
            )
          )}

          {activeTab === 'Hikayeler' && (
            myStories.length === 0 ? (
              <Text style={[styles.empty, { color: colors.mutedForeground }]}>Henüz hikaye yok</Text>
            ) : (
              myStories.map(s => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => router.push(`/story/${s.id}` as any)}
                  style={[styles.listItem, { backgroundColor: colors.card, borderRadius: colors.radius }]}
                >
                  <LinearGradient colors={[s.coverColor, '#0D0B24']} style={styles.miniCover} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemTitle, { color: colors.foreground }]}>{s.title}</Text>
                    <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{s.genre}</Text>
                  </View>
                </TouchableOpacity>
              ))
            )
          )}

          {activeTab === 'Şiirler' && (
            myPoems.length === 0 ? (
              <Text style={[styles.empty, { color: colors.mutedForeground }]}>Henüz şiir yok</Text>
            ) : (
              myPoems.map(p => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => router.push(`/poem/${p.id}` as any)}
                  style={[styles.listItem, { backgroundColor: colors.card, borderRadius: colors.radius }]}
                >
                  <LinearGradient colors={[p.coverColor, '#0D0B24']} style={styles.miniCover} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemTitle, { color: colors.foreground }]}>{p.title}</Text>
                  </View>
                </TouchableOpacity>
              ))
            )
          )}

          {activeTab === 'Hakkında' && (
            <View style={[styles.aboutCard, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
              <Text style={[styles.bio, { color: colors.foreground }]}>
                {user.bio || 'Henüz bir açıklama eklenmedi.'}
              </Text>
              <View style={styles.aboutRow}>
                <Ionicons name="calendar-outline" size={14} color={colors.mutedForeground} />
                <Text style={[styles.aboutText, { color: colors.mutedForeground }]}>
                  {user.joinedAt} tarihinde katıldı
                </Text>
              </View>
            </View>
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  cover: { height: 160 },
  coverActions: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 16, gap: 8 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center',
  },
  avatarRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 20, marginTop: -40 },
  avatarBorder: { borderWidth: 4, borderRadius: 46, overflow: 'hidden' },
  editBtn: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  editBtnText: { fontFamily: 'Poppins_500Medium', fontSize: 13 },
  info: { paddingHorizontal: 20, paddingTop: 12, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  displayName: { fontFamily: 'Poppins_700Bold', fontSize: 22 },
  profilePremiumBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 14,
  },
  profilePremiumText: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: 10 },
  username: { fontFamily: 'Poppins_400Regular', fontSize: 14 },
  bio: { fontFamily: 'Poppins_400Regular', fontSize: 14, lineHeight: 22 },
  joined: { fontFamily: 'Poppins_400Regular', fontSize: 12 },
  stats: {
    flexDirection: 'row', justifyContent: 'space-around',
    paddingVertical: 16, marginHorizontal: 20,
    borderTopWidth: 1, borderBottomWidth: 1, marginVertical: 12,
  },
  stat: { alignItems: 'center' },
  statVal: { fontFamily: 'Poppins_700Bold', fontSize: 16 },
  statLabel: { fontFamily: 'Poppins_400Regular', fontSize: 11 },
  writeBtn: { borderRadius: 12, overflow: 'hidden', marginBottom: 16 },
  writeBtnGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12,
  },
  writeBtnText: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: 14 },
  tabRow: { paddingHorizontal: 20, gap: 4 },
  tab: { alignItems: 'center', paddingHorizontal: 8, paddingBottom: 10, position: 'relative' },
  tabText: { fontFamily: 'Poppins_600SemiBold', fontSize: 12 },
  tabBar: { position: 'absolute', bottom: 0, left: 4, right: 4, height: 2, borderRadius: 1 },
  divider: { height: 1, marginBottom: 16 },
  tabContent: { paddingHorizontal: 20, gap: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  empty: { fontFamily: 'Poppins_400Regular', fontSize: 14, textAlign: 'center', paddingVertical: 30 },
  emptyWrap: { alignItems: 'center', paddingVertical: 30, gap: 10 },
  emptyBtn: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 8, marginTop: 4 },
  emptyBtnTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 13 },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  miniCover: { width: 50, height: 66, borderRadius: 8 },
  itemTitle: { fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
  itemSub: { fontFamily: 'Poppins_400Regular', fontSize: 12 },
  aboutCard: { padding: 16, gap: 12 },
  aboutRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aboutText: { fontFamily: 'Poppins_400Regular', fontSize: 13 },

  /* Post cards in profile */
  postCard: { borderRadius: 14, padding: 14, borderWidth: 1, gap: 6 },
  postTitle: { fontFamily: 'Poppins_700Bold', fontSize: 14 },
  postContent: { fontFamily: 'Poppins_400Regular', fontSize: 13, lineHeight: 20 },
  postTime: { fontFamily: 'Poppins_400Regular', fontSize: 11 },
  postActions: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    paddingTop: 8, borderTopWidth: 1,
  },
  postAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  postActionTxt: { fontFamily: 'Poppins_400Regular', fontSize: 12 },

  /* Comments */
  commentsWrap: { borderTopWidth: 1, paddingTop: 10, gap: 8 },
  noComments: { fontFamily: 'Poppins_400Regular', fontSize: 12, textAlign: 'center' },
  commentRow: { flexDirection: 'row', gap: 8 },
  commentBubble: { flex: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  commentAuthor: { fontFamily: 'Poppins_700Bold', fontSize: 11 },
  commentText: { fontFamily: 'Poppins_400Regular', fontSize: 12, lineHeight: 17 },

  /* Admin button */
  adminBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  adminBtnText: { flex: 1, fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: '#FCA5A5' },

  /* Share button */
  shareBtn: { borderWidth: 1, borderRadius: 20, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginRight: 8 },

  /* Share modal */
  shareOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  shareSheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, paddingHorizontal: 20, paddingBottom: 36,
  },
  shareHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 14 },
  shareTitle: { fontFamily: 'Poppins_700Bold', fontSize: 16, marginBottom: 12 },
  shareRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14, borderBottomWidth: 1,
  },
  shareIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  shareLabel: { flex: 1, fontFamily: 'Poppins_500Medium', fontSize: 14 },
  shareCancelBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  shareCancelTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
});
