import React, { useState } from 'react';
import {
  Modal, Platform, Pressable, ScrollView, Share,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { Post, PostComment, PostReply } from '@/data/types';
import UserAvatar from './UserAvatar';
import { SAMPLE_USERS } from '@/data/sampleData';

const EMOJIS = ['❤️', '😂', '😮', '😢', '🔥'];

interface Props {
  post: Post;
  isLiked: boolean;
  isSaved: boolean;
  onLike: () => void;
  onSave: () => void;
  postComments: PostComment[];
  onAddComment: (comment: PostComment) => void;
  onAddReply: (commentId: string, reply: PostReply) => void;
  onToggleCommentLike: (commentId: string) => void;
  onAddReaction: (commentId: string, emoji: string) => void;
  commentLikedIds: Set<string>;
  currentUserId: string;
  currentUserName: string;
  currentUserAvatarColor: string;
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'şimdi';
  if (diff < 3600) return `${Math.floor(diff / 60)}dk`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa`;
  return `${Math.floor(diff / 86400)}g`;
}

function ReactionBar({ reactions, onReact }: { reactions: Record<string, number>; onReact: (e: string) => void }) {
  const [open, setOpen] = useState(false);
  const colors = useColors();
  const total = Object.values(reactions).reduce((a, b) => a + b, 0);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {total > 0 && (
        <View style={[styles.reactionBubble, { backgroundColor: colors.card }]}>
          {Object.entries(reactions).slice(0, 3).map(([e, n]) => (
            <Text key={e} style={styles.reactionEmoji}>{e}</Text>
          ))}
          <Text style={[styles.reactionCount, { color: colors.mutedForeground }]}>{total}</Text>
        </View>
      )}
      {open && (
        <View style={[styles.emojiPicker, { backgroundColor: colors.card }]}>
          {EMOJIS.map(e => (
            <TouchableOpacity
              key={e}
              onPress={() => { onReact(e); setOpen(false); }}
              style={styles.emojiBtn}
            >
              <Text style={{ fontSize: 20 }}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <TouchableOpacity
        onPress={() => setOpen(o => !o)}
        style={[styles.addReactionBtn, { borderColor: colors.border }]}
      >
        <Text style={{ fontSize: 14 }}>😊</Text>
        <Ionicons name="add" size={12} color={colors.mutedForeground} />
      </TouchableOpacity>
    </View>
  );
}

function CommentItem({
  comment, onLike, isLiked, onReply, onReact, commentLikedIds,
  currentUserId, currentUserName, currentUserAvatarColor, onAddReply,
}: {
  comment: PostComment;
  onLike: () => void;
  isLiked: boolean;
  onReply: (name: string) => void;
  onReact: (emoji: string) => void;
  commentLikedIds: Set<string>;
  currentUserId: string;
  currentUserName: string;
  currentUserAvatarColor: string;
  onAddReply: (commentId: string, reply: PostReply) => void;
}) {
  const colors = useColors();
  const [showReplies, setShowReplies] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [showReplyInput, setShowReplyInput] = useState(false);

  const sendReply = () => {
    if (!replyText.trim()) return;
    onAddReply(comment.id, {
      id: `pr-${Date.now()}`,
      commentId: comment.id,
      authorId: currentUserId,
      authorName: currentUserName,
      authorAvatarColor: currentUserAvatarColor,
      content: replyText.trim(),
      likesCount: 0,
      createdAt: new Date().toISOString(),
    });
    setReplyText('');
    setShowReplyInput(false);
    setShowReplies(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={styles.commentItem}>
      <UserAvatar name={comment.authorName} color={comment.authorAvatarColor} size={30} />
      <View style={{ flex: 1 }}>
        <View style={[styles.commentBubble, { backgroundColor: colors.card }]}>
          <Text style={[styles.commentAuthor, { color: colors.primary }]}>{comment.authorName}</Text>
          <Text style={[styles.commentText, { color: colors.foreground }]}>{comment.content}</Text>
        </View>

        <ReactionBar
          reactions={comment.reactions}
          onReact={onReact}
        />

        <View style={styles.commentActions}>
          <TouchableOpacity onPress={onLike} style={styles.commentAction}>
            <Ionicons
              name={isLiked ? 'heart' : 'heart-outline'}
              size={13}
              color={isLiked ? '#EC4899' : colors.mutedForeground}
            />
            <Text style={[styles.commentActionTxt, { color: colors.mutedForeground }]}>
              {comment.likesCount}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setShowReplyInput(v => !v); onReply(comment.authorName); }}
            style={styles.commentAction}
          >
            <Text style={[styles.commentActionTxt, { color: colors.mutedForeground }]}>Yanıtla</Text>
          </TouchableOpacity>
          <Text style={[styles.commentActionTxt, { color: colors.mutedForeground }]}>
            {timeAgo(comment.createdAt)}
          </Text>
        </View>

        {showReplyInput && (
          <View style={[styles.replyInputRow, { borderColor: colors.border }]}>
            <TextInput
              style={[styles.replyInput, { color: colors.foreground, borderColor: colors.border }]}
              placeholder={`@${comment.authorName} yanıtla...`}
              placeholderTextColor={colors.mutedForeground}
              value={replyText}
              onChangeText={setReplyText}
              autoFocus
            />
            <TouchableOpacity onPress={sendReply} disabled={!replyText.trim()}>
              <Ionicons name="send" size={18} color={replyText.trim() ? colors.primary : colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        )}

        {comment.replies.length > 0 && (
          <TouchableOpacity onPress={() => setShowReplies(v => !v)} style={styles.showRepliesBtn}>
            <View style={[styles.replyLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.showRepliesTxt, { color: colors.primary }]}>
              {showReplies ? 'Yanıtları gizle' : `${comment.replies.length} yanıt`}
            </Text>
          </TouchableOpacity>
        )}

        {showReplies && comment.replies.map(reply => (
          <View key={reply.id} style={styles.replyItem}>
            <UserAvatar name={reply.authorName} color={reply.authorAvatarColor} size={24} />
            <View style={[styles.commentBubble, { backgroundColor: colors.card, flex: 1 }]}>
              <Text style={[styles.commentAuthor, { color: colors.primary, fontSize: 11 }]}>{reply.authorName}</Text>
              <Text style={[styles.commentText, { color: colors.foreground, fontSize: 12 }]}>{reply.content}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function PostCard({
  post, isLiked, isSaved, onLike, onSave,
  postComments, onAddComment, onAddReply, onToggleCommentLike, onAddReaction,
  commentLikedIds, currentUserId, currentUserName, currentUserAvatarColor,
}: Props) {
  const colors = useColors();
  const router = useRouter();
  const user = SAMPLE_USERS.find(u => u.id === post.authorId);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [replyTarget, setReplyTarget] = useState('');

  const myComments = postComments.filter(c => c.postId === post.id);

  const handleLike = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onLike();
  };

  const handleSave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSave();
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `${post.title ? post.title + '\n' : ''}${post.content}\n\n— Lazlani`,
      });
    } catch (_) {}
  };

  const sendComment = () => {
    if (!commentText.trim()) return;
    onAddComment({
      id: `pc-${Date.now()}`,
      postId: post.id,
      authorId: currentUserId,
      authorName: currentUserName,
      authorAvatarColor: currentUserAvatarColor,
      content: commentText.trim(),
      likesCount: 0,
      reactions: {},
      replies: [],
      createdAt: new Date().toISOString(),
    });
    setCommentText('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Header */}
      <View style={styles.header}>
        <UserAvatar name={post.authorName} color={post.authorAvatarColor} size={38} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: colors.foreground }]}>{post.authorName}</Text>
          {user && (
            <Text style={[styles.username, { color: colors.mutedForeground }]}>
              @{user.username} · {timeAgo(post.createdAt)}
            </Text>
          )}
        </View>
        <Ionicons name="ellipsis-horizontal" size={20} color={colors.mutedForeground} />
      </View>

      {/* Title */}
      {post.title && (
        <Text style={[styles.title, { color: colors.foreground }]}>{post.title}</Text>
      )}

      {/* Content */}
      <Text style={[styles.content, { color: colors.foreground }]}>{post.content}</Text>

      {/* Linked content badge */}
      {post.contentType && post.contentType !== 'text' && post.linkedContentTitle && (
        <TouchableOpacity
          onPress={() => {
            if (post.contentType === 'story' && post.linkedContentId) {
              router.push(`/story/${post.linkedContentId}` as any);
            } else if (post.contentType === 'book' && post.linkedContentId) {
              router.push(`/book/${post.linkedContentId}` as any);
            }
          }}
          style={[styles.linkedCard, { backgroundColor: colors.background, borderColor: colors.border }]}
        >
          <LinearGradient
            colors={['#9B59F5', '#EC4899']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.linkedIcon}
          >
            <Ionicons
              name={post.contentType === 'book' ? 'book' : post.contentType === 'story' ? 'document-text' : 'sparkles'}
              size={16}
              color="#fff"
            />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={[styles.linkedType, { color: colors.mutedForeground }]}>
              {post.contentType === 'book' ? 'Kitap' : post.contentType === 'story' ? 'Hikaye' : 'Şiir'}
            </Text>
            <Text style={[styles.linkedTitle, { color: colors.foreground }]} numberOfLines={1}>
              {post.linkedContentTitle}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>
      )}

      {/* Action bar */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.action} onPress={handleLike}>
          <Ionicons
            name={isLiked ? 'heart' : 'heart-outline'}
            size={20}
            color={isLiked ? '#EC4899' : colors.mutedForeground}
          />
          <Text style={[styles.actionText, { color: colors.mutedForeground }]}>
            {post.likesCount + (isLiked ? 1 : 0)}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.action} onPress={() => setShowComments(v => !v)}>
          <Ionicons name="chatbubble-outline" size={20} color={colors.mutedForeground} />
          <Text style={[styles.actionText, { color: colors.mutedForeground }]}>
            {post.commentsCount}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.action} onPress={handleShare}>
          <Ionicons name="share-social-outline" size={20} color={colors.mutedForeground} />
          <Text style={[styles.actionText, { color: colors.mutedForeground }]}>
            {post.sharesCount}
          </Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        <TouchableOpacity style={styles.action} onPress={handleSave}>
          <Ionicons
            name={isSaved ? 'bookmark' : 'bookmark-outline'}
            size={20}
            color={isSaved ? '#9B59F5' : colors.mutedForeground}
          />
        </TouchableOpacity>
      </View>

      {/* Comments section */}
      {showComments && (
        <KeyboardAvoidingView
          style={[styles.commentsSection, { borderTopColor: colors.border }]}
          behavior="padding"
          keyboardVerticalOffset={0}
        >
          {myComments.length === 0 && (
            <Text style={[styles.noComments, { color: colors.mutedForeground }]}>
              İlk yorumu sen yap!
            </Text>
          )}
          {myComments.map(comment => (
            <CommentItem
              key={comment.id}
              comment={comment}
              onLike={() => onToggleCommentLike(comment.id)}
              isLiked={commentLikedIds.has(comment.id)}
              onReply={(name) => setReplyTarget(name)}
              onReact={(emoji) => onAddReaction(comment.id, emoji)}
              commentLikedIds={commentLikedIds}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              currentUserAvatarColor={currentUserAvatarColor}
              onAddReply={onAddReply}
            />
          ))}

          {/* Comment input */}
          <View style={[styles.commentInputRow, { borderTopColor: colors.border }]}>
            <UserAvatar name={currentUserName} color={currentUserAvatarColor} size={28} />
            <View style={[styles.commentInputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <TextInput
                style={[styles.commentInput, { color: colors.foreground }]}
                placeholder={replyTarget ? `@${replyTarget} yanıtla...` : 'Yorum yaz...'}
                placeholderTextColor={colors.mutedForeground}
                value={commentText}
                onChangeText={setCommentText}
                multiline
                scrollEnabled
                blurOnSubmit={false}
              />
            </View>
            <TouchableOpacity onPress={sendComment} disabled={!commentText.trim()}>
              <Ionicons
                name="send"
                size={20}
                color={commentText.trim() ? colors.primary : colors.mutedForeground}
              />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16, borderRadius: 16,
    borderWidth: 1, marginBottom: 12, overflow: 'hidden',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, paddingBottom: 8 },
  name: { fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
  username: { fontFamily: 'Poppins_400Regular', fontSize: 12 },
  title: { fontFamily: 'Poppins_700Bold', fontSize: 15, paddingHorizontal: 14, marginBottom: 4 },
  content: { fontFamily: 'Poppins_400Regular', fontSize: 14, lineHeight: 22, paddingHorizontal: 14, paddingBottom: 10 },
  linkedCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 14, marginBottom: 10, padding: 10,
    borderRadius: 12, borderWidth: 1,
  },
  linkedIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  linkedType: { fontFamily: 'Poppins_400Regular', fontSize: 11 },
  linkedTitle: { fontFamily: 'Poppins_600SemiBold', fontSize: 13 },
  actions: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)',
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5, marginRight: 16 },
  actionText: { fontFamily: 'Poppins_400Regular', fontSize: 13 },

  /* Comments */
  commentsSection: { borderTopWidth: 1, paddingTop: 10, paddingHorizontal: 14, paddingBottom: 10, gap: 10 },
  noComments: { fontFamily: 'Poppins_400Regular', fontSize: 13, textAlign: 'center', paddingVertical: 8 },
  commentItem: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  commentBubble: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  commentAuthor: { fontFamily: 'Poppins_700Bold', fontSize: 12 },
  commentText: { fontFamily: 'Poppins_400Regular', fontSize: 13, lineHeight: 18 },
  commentActions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, paddingLeft: 4 },
  commentAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  commentActionTxt: { fontFamily: 'Poppins_400Regular', fontSize: 11 },
  showRepliesBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, paddingLeft: 4 },
  replyLine: { width: 20, height: 1 },
  showRepliesTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 11 },
  replyItem: { flexDirection: 'row', gap: 6, marginTop: 6, marginLeft: 16 },
  replyInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  replyInput: { flex: 1, borderBottomWidth: 1, paddingVertical: 4, fontFamily: 'Poppins_400Regular', fontSize: 13 },

  /* Reactions */
  reactionBubble: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontFamily: 'Poppins_400Regular', fontSize: 11, marginLeft: 2 },
  addReactionBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  emojiPicker: {
    position: 'absolute', bottom: 28, left: 0,
    flexDirection: 'row', gap: 4, padding: 8, borderRadius: 20,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 5, zIndex: 100,
  },
  emojiBtn: { padding: 4 },

  /* Comment input */
  commentInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderTopWidth: 1, paddingTop: 10, marginTop: 4,
  },
  commentInputWrap: {
    flex: 1, borderWidth: 1, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  commentInput: { fontFamily: 'Poppins_400Regular', fontSize: 13, maxHeight: 80 },
});
