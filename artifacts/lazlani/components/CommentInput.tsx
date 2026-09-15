import React, { useState } from 'react';
import {
  StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { Comment, Reply } from '@/data/types';
import UserAvatar from './UserAvatar';

interface Props {
  targetId: string;
  targetType: 'book' | 'story' | 'poem' | 'post';
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)   return 'az önce';
  if (diff < 3600) return `${Math.floor(diff / 60)}dk`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa`;
  return `${Math.floor(diff / 86400)}g`;
}

/* ── Single reply row ─────────────────────────────────────── */
function ReplyRow({
  reply, depth, onReply,
}: {
  reply: Reply;
  depth: number;
  onReply: (name: string, replyId: string) => void;
}) {
  const colors = useColors();
  const [liked, setLiked] = useState(false);
  const indent = Math.min(depth, 2) * 20;

  return (
    <View style={[styles.replyRow, { marginLeft: indent }]}>
      <UserAvatar name={reply.authorName} color={reply.authorAvatarColor} size={28} />
      <View style={{ flex: 1 }}>
        <View style={styles.commentBubble}>
          <View style={[styles.bubble, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.bubbleName, { color: colors.foreground }]}>{reply.authorName}</Text>
            <Text style={[styles.bubbleText, { color: colors.foreground }]}>{reply.content}</Text>
          </View>
          <View style={styles.commentActions}>
            <Text style={[styles.commentTime, { color: colors.mutedForeground }]}>{timeAgo(reply.createdAt)}</Text>
            <TouchableOpacity
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setLiked(l => !l); }}
              style={styles.actionBtn}
            >
              <Ionicons name={liked ? 'heart' : 'heart-outline'} size={13} color={liked ? '#EC4899' : colors.mutedForeground} />
              <Text style={[styles.actionCount, { color: colors.mutedForeground }]}>{reply.likesCount + (liked ? 1 : 0)}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onReply(reply.authorName, reply.id)} style={styles.actionBtn}>
              <Text style={[styles.replyBtn, { color: colors.mutedForeground }]}>Yanıtla</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

/* ── Comment thread ───────────────────────────────────────── */
function CommentThread({
  comment, onAddReply,
}: {
  comment: Comment;
  onAddReply: (commentId: string, parentReplyId: string | undefined, authorName: string) => void;
}) {
  const colors = useColors();
  const [liked, setLiked] = useState(false);
  const [showReplies, setShowReplies] = useState(false);

  return (
    <View style={styles.thread}>
      {/* Top-level comment */}
      <View style={styles.commentRow}>
        <UserAvatar name={comment.authorName} color={comment.authorAvatarColor} size={36} />
        <View style={{ flex: 1 }}>
          <View style={styles.commentBubble}>
            <View style={[styles.bubble, { backgroundColor: colors.card }]}>
              <Text style={[styles.bubbleName, { color: colors.foreground }]}>{comment.authorName}</Text>
              <Text style={[styles.bubbleText, { color: colors.foreground }]}>{comment.content}</Text>
            </View>
            <View style={styles.commentActions}>
              <Text style={[styles.commentTime, { color: colors.mutedForeground }]}>{timeAgo(comment.createdAt)}</Text>
              <TouchableOpacity
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setLiked(l => !l); }}
                style={styles.actionBtn}
              >
                <Ionicons name={liked ? 'heart' : 'heart-outline'} size={13} color={liked ? '#EC4899' : colors.mutedForeground} />
                <Text style={[styles.actionCount, { color: colors.mutedForeground }]}>{comment.likesCount + (liked ? 1 : 0)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onAddReply(comment.id, undefined, comment.authorName)}
                style={styles.actionBtn}
              >
                <Text style={[styles.replyBtn, { color: colors.primary }]}>Yanıtla</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Show/hide replies toggle */}
          {comment.replies.length > 0 && (
            <TouchableOpacity
              onPress={() => setShowReplies(s => !s)}
              style={styles.toggleReplies}
            >
              <View style={[styles.replyLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.toggleText, { color: colors.primary }]}>
                {showReplies ? 'Yanıtları gizle' : `${comment.replies.length} yanıt gör`}
              </Text>
            </TouchableOpacity>
          )}

          {/* Replies */}
          {showReplies && comment.replies.map(r => (
            <ReplyRow
              key={r.id}
              reply={r}
              depth={1}
              onReply={(name, replyId) => onAddReply(comment.id, replyId, name)}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

/* ── Main export ──────────────────────────────────────────── */
export default function CommentInput({ targetId, targetType }: Props) {
  const colors = useColors();
  const { user } = useAuth();
  const { comments, addComment, addReply } = useData();
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<{ commentId: string; parentReplyId?: string; name: string } | null>(null);

  const targetComments = comments.filter(c => c.targetId === targetId && c.targetType === targetType);

  const handleSend = () => {
    if (!text.trim() || !user) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (replyTo) {
      const reply: Reply = {
        id: Date.now().toString(),
        commentId: replyTo.commentId,
        parentReplyId: replyTo.parentReplyId,
        authorId: user.id,
        authorName: user.displayName,
        authorAvatarColor: user.avatarColor,
        content: text.trim(),
        likesCount: 0,
        createdAt: new Date().toISOString(),
      };
      addReply(replyTo.commentId, reply);
      setReplyTo(null);
    } else {
      const comment: Comment = {
        id: Date.now().toString(),
        targetId,
        targetType,
        authorId: user.id,
        authorName: user.displayName,
        authorAvatarColor: user.avatarColor,
        content: text.trim(),
        likesCount: 0,
        replies: [],
        createdAt: new Date().toISOString(),
      };
      addComment(comment);
    }
    setText('');
  };

  return (
    <View style={styles.root}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
        Yorumlar ({targetComments.length})
      </Text>

      {targetComments.length === 0 && (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>
          Henüz yorum yok. İlk yorumu sen yap!
        </Text>
      )}

      {targetComments.map(c => (
        <CommentThread
          key={c.id}
          comment={c}
          onAddReply={(commentId, parentReplyId, name) => setReplyTo({ commentId, parentReplyId, name })}
        />
      ))}

      {/* Reply indicator */}
      {replyTo && (
        <View style={[styles.replyIndicator, { backgroundColor: colors.secondary, borderRadius: 8 }]}>
          <Ionicons name="return-down-forward" size={14} color={colors.primary} />
          <Text style={[styles.replyIndicatorText, { color: colors.mutedForeground }]}>
            <Text style={{ color: colors.primary }}>@{replyTo.name}</Text> kullanıcısına yanıt veriyorsun
          </Text>
          <TouchableOpacity onPress={() => setReplyTo(null)}>
            <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      )}

      {/* Input row */}
      {user && (
        <View style={[styles.inputRow, { backgroundColor: colors.card, borderRadius: colors.radius, borderColor: colors.border }]}>
          <UserAvatar name={user.displayName} color={user.avatarColor} size={32} imageUri={user.avatarUrl} />
          <TextInput
            style={[styles.input, { color: colors.foreground }]}
            placeholder={replyTo ? `@${replyTo.name}'a yanıtla...` : 'Yorumunu yaz...'}
            placeholderTextColor={colors.mutedForeground}
            value={text}
            onChangeText={setText}
            multiline
           scrollEnabled
           blurOnSubmit={false}
          />
          <TouchableOpacity onPress={handleSend} disabled={!text.trim()} style={[styles.sendBtn, { opacity: text.trim() ? 1 : 0.4 }]}>
            <Ionicons name="send" size={18} color="#9B59F5" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  sectionTitle: { fontFamily: 'Poppins_700Bold', fontSize: 16 },
  empty: { fontFamily: 'Poppins_400Regular', fontSize: 13, textAlign: 'center', paddingVertical: 16 },
  thread: { marginBottom: 4 },
  commentRow: { flexDirection: 'row', gap: 10 },
  replyRow:   { flexDirection: 'row', gap: 8, marginTop: 8 },
  commentBubble: { flex: 1, gap: 4 },
  bubble: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleName: { fontFamily: 'Poppins_600SemiBold', fontSize: 12, marginBottom: 3 },
  bubbleText: { fontFamily: 'Poppins_400Regular', fontSize: 13, lineHeight: 20 },
  commentActions: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: 4 },
  commentTime:    { fontFamily: 'Poppins_400Regular', fontSize: 11 },
  actionBtn:  { flexDirection: 'row', alignItems: 'center', gap: 3 },
  actionCount: { fontFamily: 'Poppins_400Regular', fontSize: 11 },
  replyBtn: { fontFamily: 'Poppins_600SemiBold', fontSize: 11 },
  toggleReplies: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingLeft: 4 },
  replyLine: { width: 24, height: 1 },
  toggleText: { fontFamily: 'Poppins_600SemiBold', fontSize: 12 },
  replyIndicator: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 },
  replyIndicatorText: { flex: 1, fontFamily: 'Poppins_400Regular', fontSize: 12 },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    padding: 10, borderWidth: 1, marginTop: 4,
  },
  input: { flex: 1, fontFamily: 'Poppins_400Regular', fontSize: 14, maxHeight: 100 },
  sendBtn: { padding: 4 },
});
