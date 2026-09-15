import React, { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useData } from '@/context/DataContext';
import StarRating from '@/components/StarRating';
import StarRatingInput from '@/components/StarRatingInput';
import UserAvatar from '@/components/UserAvatar';
import CommentInput from '@/components/CommentInput';
import { SAMPLE_USERS } from '@/data/sampleData';

export default function StoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { stories, likedIds, savedIds, toggleLike, toggleSave, userRatings, rateContent } = useData();
  const [expanded, setExpanded] = useState(false);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const story = stories.find(s => s.id === id);
  if (!story) return null;

  const author = SAMPLE_USERS.find(u => u.id === story.authorId);
  const isLiked = likedIds.has(id);
  const isSaved = savedIds.has(id);
  const myRating = userRatings[id] ?? 0;
  const previewLength = 600;
  const isLong = story.content.length > previewLength;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <LinearGradient colors={[story.coverColor, colors.background]} style={[styles.hero, { paddingTop: topPad }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleSave(id); }}
            style={styles.iconBtn}
          >
            <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={22} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.heroInfo}>
          <Text style={styles.genre}>{story.genre}</Text>
          <Text style={styles.title}>{story.title}</Text>
          {author && (
            <TouchableOpacity onPress={() => router.push(`/user/${author.id}` as any)} style={styles.authorRow}>
              <UserAvatar name={author.displayName} color={author.avatarColor} size={26} />
              <Text style={styles.authorName}>{author.displayName}</Text>
            </TouchableOpacity>
          )}
          <StarRating rating={story.rating} size={13} />
        </View>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Stats */}
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="heart" size={15} color={colors.accent} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{story.likesCount.toLocaleString()} beğeni</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="eye-outline" size={15} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{story.readCount.toLocaleString()} okunma</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="chatbubble-outline" size={15} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{story.commentsCount} yorum</Text>
          </View>
        </View>

        {story.description ? (
          <Text style={[styles.desc, { color: colors.mutedForeground }]}>{story.description}</Text>
        ) : null}

        {/* Tags */}
        {story.tags.length > 0 && (
          <View style={styles.tags}>
            {story.tags.map(tag => (
              <View key={tag} style={[styles.tag, { backgroundColor: colors.secondary, borderRadius: 20 }]}>
                <Text style={[styles.tagText, { color: colors.secondaryForeground }]}>#{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Story body */}
        <View style={[styles.storyBody, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
          <Text style={[styles.storyText, { color: colors.foreground }]}>
            {expanded || !isLong ? story.content : story.content.slice(0, previewLength) + '...'}
          </Text>
          {isLong && (
            <TouchableOpacity onPress={() => setExpanded(!expanded)} style={styles.expandRow}>
              <Text style={[styles.expandBtn, { color: colors.primary }]}>
                {expanded ? 'Daha az göster' : 'Tamamını oku'}
              </Text>
              <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Rate */}
        <View style={[styles.rateCard, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
          <Text style={[styles.rateTitle, { color: colors.foreground }]}>Bu Hikayeyi Puanla</Text>
          <StarRatingInput rating={myRating} onRate={r => rateContent(id, r)} size={30} />
          {myRating > 0 && (
            <Text style={[styles.rateNote, { color: colors.mutedForeground }]}>
              {['', 'Hiç beğenmedim', 'Beğenmedim', 'İdare eder', 'Beğendim', 'Harika!'][myRating]}
            </Text>
          )}
        </View>

        {/* Comments */}
        <CommentInput targetId={id} targetType="story" />

        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={[styles.bottomBar, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: insets.bottom + 10 }]}>
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleLike(id); }}
          style={[styles.actionBtn, { backgroundColor: colors.card }]}
        >
          <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={20} color={isLiked ? '#EC4899' : colors.mutedForeground} />
          <Text style={[styles.actionCount, { color: colors.mutedForeground }]}>{story.likesCount + (isLiked ? 1 : 0)}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.card }]}>
          <Ionicons name="share-outline" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.readFullBtn}
          onPress={() => setExpanded(true)}
        >
          <LinearGradient colors={['#9B59F5', '#EC4899']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.readFullGrad}>
            <Text style={styles.readFullText}>Hikayeyi Oku</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: { paddingBottom: 20 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
  heroInfo: { paddingHorizontal: 20, gap: 6 },
  genre: { color: 'rgba(255,255,255,0.7)', fontFamily: 'Poppins_500Medium', fontSize: 12 },
  title: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: 22, lineHeight: 30 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  authorName: { color: 'rgba(255,255,255,0.85)', fontFamily: 'Poppins_500Medium', fontSize: 13 },
  content: { padding: 16, gap: 14 },
  metaRow: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontFamily: 'Poppins_400Regular', fontSize: 12 },
  desc: { fontFamily: 'Poppins_400Regular', fontSize: 14, lineHeight: 22 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { paddingHorizontal: 12, paddingVertical: 6 },
  tagText: { fontFamily: 'Poppins_500Medium', fontSize: 12 },
  storyBody: { padding: 20 },
  storyText: { fontFamily: 'Poppins_400Regular', fontSize: 15, lineHeight: 28 },
  expandRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 14 },
  expandBtn: { fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
  rateCard: { padding: 16, gap: 10 },
  rateTitle: { fontFamily: 'Poppins_700Bold', fontSize: 15 },
  rateNote: { fontFamily: 'Poppins_400Regular', fontSize: 13 },
  bottomBar: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 10, borderTopWidth: 1 },
  actionBtn: { width: 52, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 },
  actionCount: { fontFamily: 'Poppins_500Medium', fontSize: 12 },
  readFullBtn: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  readFullGrad: { paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  readFullText: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: 15 },
});
