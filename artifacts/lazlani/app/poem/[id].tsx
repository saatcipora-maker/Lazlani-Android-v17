import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useData } from '@/context/DataContext';
import UserAvatar from '@/components/UserAvatar';
import StarRating from '@/components/StarRating';
import StarRatingInput from '@/components/StarRatingInput';
import CommentInput from '@/components/CommentInput';
import { SAMPLE_USERS } from '@/data/sampleData';

export default function PoemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { poems, likedIds, savedIds, toggleLike, toggleSave, userRatings, rateContent } = useData();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const poem = poems.find(p => p.id === id);
  if (!poem) return null;
  const author = SAMPLE_USERS.find(u => u.id === poem.authorId);
  const isLiked = likedIds.has(id);
  const isSaved = savedIds.has(id);
  const myRating = userRatings[id] ?? 0;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <LinearGradient colors={[poem.coverColor, colors.background]} style={[styles.hero, { paddingTop: topPad }]}>
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
          <View style={styles.poemBadge}>
            <Ionicons name="leaf-outline" size={12} color="#fff" />
            <Text style={styles.poemBadgeText}>ŞİİR</Text>
          </View>
          <Text style={styles.title}>{poem.title}</Text>
          {author && (
            <TouchableOpacity onPress={() => router.push(`/user/${author.id}` as any)} style={styles.authorRow}>
              <UserAvatar name={author.displayName} color={author.avatarColor} size={26} />
              <Text style={styles.authorName}>{author.displayName}</Text>
            </TouchableOpacity>
          )}
          <StarRating rating={poem.rating} size={13} />
        </View>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Poem card */}
        <View style={[styles.poemCard, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
          <LinearGradient
            colors={[poem.coverColor + '22', 'transparent']}
            style={[StyleSheet.absoluteFill, { borderRadius: colors.radius }]}
          />
          <Text style={[styles.poemText, { color: colors.foreground }]}>{poem.content}</Text>
        </View>

        {/* Stats */}
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="heart" size={15} color={colors.accent} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{poem.likesCount.toLocaleString()} beğeni</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="chatbubble-outline" size={15} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{poem.commentsCount} yorum</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="star" size={15} color="#F59E0B" />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{poem.rating.toFixed(1)}</Text>
          </View>
        </View>

        {/* Tags */}
        {poem.tags.length > 0 && (
          <View style={styles.tags}>
            {poem.tags.map(tag => (
              <View key={tag} style={[styles.tag, { backgroundColor: colors.secondary, borderRadius: 20 }]}>
                <Text style={[styles.tagText, { color: colors.secondaryForeground }]}>#{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Rate */}
        <View style={[styles.rateCard, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
          <Text style={[styles.rateTitle, { color: colors.foreground }]}>Bu Şiiri Puanla</Text>
          <StarRatingInput rating={myRating} onRate={r => rateContent(id, r)} size={30} />
          {myRating > 0 && (
            <Text style={[styles.rateNote, { color: colors.mutedForeground }]}>
              {['', 'Hiç beğenmedim', 'Beğenmedim', 'İdare eder', 'Beğendim', 'Harika!'][myRating]}
            </Text>
          )}
        </View>

        {/* Comments */}
        <CommentInput targetId={id} targetType="poem" />

        <View style={{ height: Platform.OS === 'web' ? 100 : 80 }} />
      </ScrollView>

      <View style={[styles.bottomBar, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: insets.bottom + 10 }]}>
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleLike(id); }}
          style={[styles.actionBtn, { backgroundColor: colors.card }]}
        >
          <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={22} color={isLiked ? '#EC4899' : colors.mutedForeground} />
          <Text style={[styles.actionCount, { color: colors.mutedForeground }]}>{poem.likesCount + (isLiked ? 1 : 0)}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.card }]}>
          <Ionicons name="chatbubble-outline" size={22} color={colors.mutedForeground} />
          <Text style={[styles.actionCount, { color: colors.mutedForeground }]}>{poem.commentsCount}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.card }]}>
          <Ionicons name="share-outline" size={22} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: { paddingBottom: 24 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
  heroInfo: { paddingHorizontal: 20, gap: 8 },
  poemBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  poemBadgeText: { color: '#fff', fontFamily: 'Poppins_600SemiBold', fontSize: 10, letterSpacing: 1 },
  title: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: 22, lineHeight: 30 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  authorName: { color: 'rgba(255,255,255,0.85)', fontFamily: 'Poppins_500Medium', fontSize: 13 },
  content: { padding: 16, gap: 14 },
  poemCard: { padding: 24, overflow: 'hidden' },
  poemText: { fontFamily: 'Poppins_400Regular', fontSize: 16, lineHeight: 30, fontStyle: 'italic' },
  metaRow: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontFamily: 'Poppins_400Regular', fontSize: 12 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { paddingHorizontal: 12, paddingVertical: 6 },
  tagText: { fontFamily: 'Poppins_500Medium', fontSize: 12 },
  rateCard: { padding: 16, gap: 10 },
  rateTitle: { fontFamily: 'Poppins_700Bold', fontSize: 15 },
  rateNote: { fontFamily: 'Poppins_400Regular', fontSize: 13 },
  bottomBar: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 10, borderTopWidth: 1 },
  actionBtn: { flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  actionCount: { fontFamily: 'Poppins_500Medium', fontSize: 13 },
});
