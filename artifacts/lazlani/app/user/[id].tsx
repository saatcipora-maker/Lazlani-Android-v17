import React, { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import UserAvatar from '@/components/UserAvatar';
import BookCard from '@/components/BookCard';

const TABS = ['Kitaplar', 'Hikayeler', 'Şiirler'];

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const { books, stories, poems, followedIds, toggleFollow, users, startConversation } = useData();
  const [activeTab, setActiveTab] = useState('Kitaplar');
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const profile = users.find(u => u.id === id);
  if (!profile) return null;

  const isFollowing = followedIds.has(id);
  const isOwn = currentUser?.id === id;

  const userBooks = books.filter(b => b.authorId === id);
  const userStories = stories.filter(s => s.authorId === id);
  const userPoems = poems.filter(p => p.authorId === id);

  const formatNum = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toString();

  const handleFollow = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleFollow(id);
  };

  const handleMessage = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const conversationId = startConversation(profile);
    router.push(`/chat/${conversationId}` as any);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <LinearGradient colors={[profile.coverColor, colors.background]} style={[styles.cover, { paddingTop: topPad }]}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn}>
              <Ionicons name="ellipsis-horizontal" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        <View style={styles.avatarSection}>
          <View style={[styles.avatarBorder, { borderColor: colors.background }]}>
            <UserAvatar name={profile.displayName} color={profile.avatarColor} size={80} />
          </View>
          {!isOwn && (
            <View style={styles.profileActions}>
              <TouchableOpacity onPress={handleMessage} style={[styles.messageBtn, { borderColor: colors.border }]}>
                <Ionicons name="chatbubble-outline" size={17} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleFollow} style={[styles.followBtn, { borderRadius: 20, overflow: 'hidden' }]}>
                {isFollowing ? (
                  <View style={[styles.followingBtnInner, { borderColor: colors.border, borderRadius: 20 }]}>
                    <Text style={[styles.followBtnText, { color: colors.foreground }]}>Takip Ediliyor</Text>
                  </View>
                ) : (
                  <LinearGradient colors={['#9B59F5', '#EC4899']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.followBtnInner}>
                    <Text style={[styles.followBtnText, { color: '#fff' }]}>Takip Et</Text>
                  </LinearGradient>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={[styles.displayName, { color: colors.foreground }]}>{profile.displayName}</Text>
            {profile.isPremium && (
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
          <Text style={[styles.username, { color: colors.mutedForeground }]}>@{profile.username}</Text>
          {profile.bio ? <Text style={[styles.bio, { color: colors.foreground }]}>{profile.bio}</Text> : null}
        </View>

        <View style={[styles.stats, { borderColor: colors.border }]}>
          {[
            { label: 'Takipçi', value: formatNum(profile.followersCount) },
            { label: 'Takip', value: formatNum(profile.followingCount) },
            { label: 'Beğeni', value: formatNum(profile.likesReceivedCount) },
            { label: 'Eser', value: (userBooks.length + userStories.length + userPoems.length).toString() },
          ].map(s => (
            <View key={s.label} style={styles.stat}>
              <Text style={[styles.statVal, { color: colors.foreground }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.tabRow}>
          {TABS.map(t => (
            <TouchableOpacity key={t} onPress={() => setActiveTab(t)} style={styles.tab}>
              <Text style={[styles.tabText, { color: activeTab === t ? colors.primary : colors.mutedForeground }]}>{t}</Text>
              {activeTab === t && <View style={[styles.tabBar, { backgroundColor: colors.primary }]} />}
            </TouchableOpacity>
          ))}
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <View style={styles.tabContent}>
          {activeTab === 'Kitaplar' && (
            userBooks.length === 0 ? (
              <Text style={[styles.empty, { color: colors.mutedForeground }]}>Kitap yok</Text>
            ) : (
              <View style={styles.grid}>
                {userBooks.map(b => (
                  <BookCard key={b.id} book={b} onPress={() => router.push(`/book/${b.id}` as any)} width={160} />
                ))}
              </View>
            )
          )}
          {activeTab === 'Hikayeler' && (
            userStories.length === 0 ? (
              <Text style={[styles.empty, { color: colors.mutedForeground }]}>Hikaye yok</Text>
            ) : (
              userStories.map(s => (
                <TouchableOpacity key={s.id} onPress={() => router.push(`/story/${s.id}` as any)}
                  style={[styles.listItem, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
                  <LinearGradient colors={[s.coverColor, '#0D0B24']} style={styles.miniCover} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemTitle, { color: colors.foreground }]}>{s.title}</Text>
                    <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>{s.genre}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              ))
            )
          )}
          {activeTab === 'Şiirler' && (
            userPoems.length === 0 ? (
              <Text style={[styles.empty, { color: colors.mutedForeground }]}>Şiir yok</Text>
            ) : (
              userPoems.map(p => (
                <TouchableOpacity key={p.id} onPress={() => router.push(`/poem/${p.id}` as any)}
                  style={[styles.listItem, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
                  <LinearGradient colors={[p.coverColor, '#0D0B24']} style={styles.miniCover} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemTitle, { color: colors.foreground }]}>{p.title}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              ))
            )
          )}
        </View>

        <View style={{ height: Platform.OS === 'web' ? 100 : 80 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  cover: { height: 160 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
  avatarSection: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 20, marginTop: -40, gap: 12 },
  avatarBorder: { borderWidth: 4, borderRadius: 46, overflow: 'hidden' },
  profileActions: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8 },
  messageBtn: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  followBtn: {},
  followBtnInner: { paddingHorizontal: 20, paddingVertical: 10 },
  followingBtnInner: { paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1 },
  followBtnText: { fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
  info: { paddingHorizontal: 20, paddingTop: 12, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  displayName: { fontFamily: 'Poppins_700Bold', fontSize: 20 },
  profilePremiumBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 14,
  },
  profilePremiumText: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: 10 },
  username: { fontFamily: 'Poppins_400Regular', fontSize: 13 },
  bio: { fontFamily: 'Poppins_400Regular', fontSize: 14, lineHeight: 22, marginTop: 4 },
  stats: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 16, marginHorizontal: 20, borderTopWidth: 1, borderBottomWidth: 1, marginVertical: 12 },
  stat: { alignItems: 'center' },
  statVal: { fontFamily: 'Poppins_700Bold', fontSize: 16 },
  statLabel: { fontFamily: 'Poppins_400Regular', fontSize: 11 },
  tabRow: { flexDirection: 'row', paddingHorizontal: 20 },
  tab: { flex: 1, alignItems: 'center', paddingBottom: 10, position: 'relative' },
  tabText: { fontFamily: 'Poppins_600SemiBold', fontSize: 13 },
  tabBar: { position: 'absolute', bottom: 0, left: 8, right: 8, height: 2, borderRadius: 1 },
  divider: { height: 1, marginBottom: 16 },
  tabContent: { paddingHorizontal: 20, gap: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  empty: { fontFamily: 'Poppins_400Regular', fontSize: 14, textAlign: 'center', paddingVertical: 30 },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  miniCover: { width: 50, height: 66, borderRadius: 8 },
  itemTitle: { fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
  itemSub: { fontFamily: 'Poppins_400Regular', fontSize: 12 },
});
