import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, AppState,
  Modal, Platform, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import UserAvatar from '@/components/UserAvatar';
import { OzelComment, OzelCommentReply, OzelPost } from '@/data/types';

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'şimdi';
  if (diff < 3600) return `${Math.floor(diff / 60)}dk`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa`;
  return `${Math.floor(diff / 86400)}g`;
}

function timeLeft(expiresAt: string) {
  const diff = (new Date(expiresAt).getTime() - Date.now()) / 1000;
  if (diff <= 0) return null;
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  if (days > 0) return `${days}g ${hours}sa kaldı`;
  return `${hours}sa kaldı`;
}

function formatTurkishDate(iso: string) {
  const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const d = new Date(iso);
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// ─── Subscribe Modal ────────────────────────────────────────────────────────

function SubscribeModal({
  visible, onClose, status, onRequest,
}: {
  visible: boolean;
  onClose: () => void;
  status: 'none' | 'pending' | 'approved' | 'expired';
  onRequest: () => void;
}) {
  const colors = useColors();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={[styles.modalIcon, { backgroundColor: `${colors.primary}18` }]}>
              <Ionicons name="sparkles" size={24} color={colors.primary} />
            </View>
            <TouchableOpacity onPress={onClose} style={styles.modalClose}>
              <Ionicons name="close" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Özel Bölüm Aboneliği</Text>
          <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
            Aylık Abonelik — 100 TL/ay
          </Text>

          {/* Info box */}
          <View style={[styles.infoBox, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}25` }]}>
            <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
              Paylaşımlarınız 15 gün boyunca yayında kalır ve günde 50 saniyelik video paylaşabilirsiniz.
            </Text>
          </View>

          {/* Benefits */}
          <View style={styles.benefitsList}>
            {[
              'Günde 4 video paylaşabilirsiniz',
              'Videolar 15 gün boyunca yayında kalır',
              '50 saniyelik video yükleyebilirsiniz',
              'Özel bölüm videolarını indirebilirsiniz',
            ].map((b, i) => (
              <View key={i} style={styles.benefitRow}>
                <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                <Text style={[styles.benefitText, { color: colors.foreground }]}>{b}</Text>
              </View>
            ))}
          </View>

          {/* Action */}
          {(status === 'none' || status === 'expired') && (
            <>
              {status === 'expired' && (
                <View style={[styles.statusPill, { backgroundColor: '#EF444420', marginBottom: 8 }]}>
                  <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
                  <Text style={[styles.statusText, { color: '#EF4444' }]}>Aboneliğinizin süresi doldu.</Text>
                </View>
              )}
              <TouchableOpacity
                onPress={() => { onRequest(); onClose(); }}
                style={[styles.requestBtn, { backgroundColor: colors.primary }]}
              >
                <Ionicons name="sparkles" size={18} color={colors.primaryForeground} />
                <Text style={[styles.requestBtnText, { color: colors.primaryForeground }]}>
                  {status === 'expired' ? 'Yenileme Talebi Gönder' : 'Talep Gönder'}
                </Text>
              </TouchableOpacity>
            </>
          )}
          {status === 'pending' && (
            <View style={[styles.statusPill, { backgroundColor: '#F59E0B20' }]}>
              <Ionicons name="time-outline" size={16} color="#F59E0B" />
              <Text style={[styles.statusText, { color: '#F59E0B' }]}>Talebiniz inceleniyor...</Text>
            </View>
          )}
          {status === 'approved' && (
            <View style={[styles.statusPill, { backgroundColor: '#22C55E20' }]}>
              <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
              <Text style={[styles.statusText, { color: '#22C55E' }]}>Aboneliğiniz aktif!</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Comment Item ─────────────────────────────────────────────────────────────

function CommentItem({
  comment, isLiked, onLike, onReply, replyLikedIds,
}: {
  comment: OzelComment;
  isLiked: boolean;
  onLike: (id: string) => void;
  onReply: (commentId: string, authorName: string) => void;
  replyLikedIds: Set<string>;
}) {
  const colors = useColors();
  const [showReplies, setShowReplies] = useState(false);
  return (
    <View style={styles.commentItem}>
      <UserAvatar name={comment.authorName} color={comment.authorAvatarColor} size={26} />
      <View style={{ flex: 1 }}>
        <View style={[styles.commentBubble, { backgroundColor: colors.muted }]}>
          <Text style={[styles.commentAuthor, { color: colors.foreground }]}>{comment.authorName}</Text>
          <Text style={[styles.commentContent, { color: colors.foreground }]}>{comment.content}</Text>
        </View>
        <View style={styles.commentMeta}>
          <Text style={[styles.commentTime, { color: colors.mutedForeground }]}>{timeAgo(comment.createdAt)}</Text>
          <TouchableOpacity onPress={() => onLike(comment.id)} style={styles.commentAction}>
            <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={13} color={isLiked ? '#EC4899' : colors.mutedForeground} />
            {comment.likesCount > 0 && (
              <Text style={[styles.commentActionText, { color: colors.mutedForeground }]}>{comment.likesCount}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onReply(comment.id, comment.authorName)} style={styles.commentAction}>
            <Text style={[styles.commentActionText, { color: colors.primary }]}>Yanıtla</Text>
          </TouchableOpacity>
          {comment.replies.length > 0 && (
            <TouchableOpacity onPress={() => setShowReplies(p => !p)} style={styles.commentAction}>
              <Text style={[styles.commentActionText, { color: colors.primary }]}>
                {showReplies ? 'Gizle' : `${comment.replies.length} yanıt`}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Replies */}
        {showReplies && comment.replies.map(reply => (
          <View key={reply.id} style={styles.replyItem}>
            <UserAvatar name={reply.authorName} color={reply.authorAvatarColor} size={22} />
            <View style={{ flex: 1 }}>
              <View style={[styles.commentBubble, { backgroundColor: colors.input }]}>
                <Text style={[styles.commentAuthor, { color: colors.foreground }]}>{reply.authorName}</Text>
                <Text style={[styles.commentContent, { color: colors.foreground }]}>{reply.content}</Text>
              </View>
              <Text style={[styles.commentTime, { color: colors.mutedForeground }]}>{timeAgo(reply.createdAt)}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Post Card ────────────────────────────────────────────────────────────────

function PostCard({
  post, liked, onLike, onDownload, isSubscriber,
  comments, commentLikedIds, onToggleCommentLike, onAddComment, onAddReply,
  currentUserId, onDelete, onEdit,
  activeVideoId, onVideoPlay,
}: {
  post: OzelPost;
  liked: boolean;
  onLike: () => void;
  onDownload: () => void;
  isSubscriber: boolean;
  comments: OzelComment[];
  commentLikedIds: Set<string>;
  onToggleCommentLike: (id: string) => void;
  onAddComment: (text: string) => void;
  onAddReply: (commentId: string, authorName: string, text: string) => void;
  currentUserId?: string;
  onDelete: () => void;
  onEdit: (title: string, description: string) => void;
  activeVideoId: string | null;
  onVideoPlay: (id: string) => void;
}) {
  const colors = useColors();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [replyTarget, setReplyTarget] = useState<{ id: string; name: string } | null>(null);
  const [replyText, setReplyText] = useState('');

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState(post.title ?? '');
  const [editDesc, setEditDesc] = useState(post.description ?? '');

  const isOwner = !!currentUserId && currentUserId === post.authorId;

  const handleMenuPress = () => {
    Alert.alert(
      'Video Seçenekleri',
      undefined,
      [
        {
          text: 'Düzenle',
          onPress: () => {
            setEditTitle(post.title ?? '');
            setEditDesc(post.description ?? '');
            setShowEditModal(true);
          },
        },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Videoyu Sil',
              'Bu videoyu silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
              [
                { text: 'İptal', style: 'cancel' },
                { text: 'Sil', style: 'destructive', onPress: onDelete },
              ],
            );
          },
        },
        { text: 'İptal', style: 'cancel' },
      ],
    );
  };

  const handleSaveEdit = () => {
    onEdit(editTitle.trim(), editDesc.trim());
    setShowEditModal(false);
  };
  const exp = post.expiresAt ? timeLeft(post.expiresAt) : null;

  // Video player state
  const videoRef = useRef<Video>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [positionMillis, setPositionMillis] = useState(0);
  const [durationMillis, setDurationMillis] = useState(0);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoRetryKey, setVideoRetryKey] = useState(0);
  const [videoAspectRatio, setVideoAspectRatio] = useState(16 / 9);
  const seekBarWidthRef = useRef(0);
  const durationRef = useRef(0);

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const handleSeekTo = async (locationX: number) => {
    if (!videoRef.current || seekBarWidthRef.current === 0 || durationRef.current === 0) return;
    const ratio = Math.min(1, Math.max(0, locationX / seekBarWidthRef.current));
    try {
      await videoRef.current.setPositionAsync(ratio * durationRef.current);
    } catch {}
  };

  const handlePlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      if ('error' in status && status.error) {
        setIsLoading(false);
        setVideoError('Video oynatılamadı. Dosya bozuk, taşınmış veya desteklenmeyen bir biçimde olabilir.');
      }
      return;
    }
    setIsPlaying(status.isPlaying);
    setIsLoading(status.isBuffering);
    setPositionMillis(status.positionMillis ?? 0);
    if (status.durationMillis != null && status.durationMillis > 0) {
      setDurationMillis(status.durationMillis);
      durationRef.current = status.durationMillis;
    }
    // Auto-show controls when paused or ended
    if (!status.isPlaying) setShowControls(true);
    if (status.didJustFinish) {
      videoRef.current?.setPositionAsync(0);
      setIsPlaying(false);
      setShowControls(true);
    }
  };

  const retryVideo = () => {
    setVideoError(null);
    setIsLoading(true);
    setVideoRetryKey(value => value + 1);
  };

  // Pause this video whenever a different video becomes active
  useEffect(() => {
    if (activeVideoId !== null && activeVideoId !== post.id && isPlaying) {
      videoRef.current?.pauseAsync().catch(() => {});
    }
  }, [activeVideoId, post.id]);

  const togglePlayPause = async () => {
    if (!videoRef.current) return;
    try {
      if (isPlaying) {
        await videoRef.current.pauseAsync();
      } else {
        onVideoPlay(post.id);
        setShowControls(false);
        await videoRef.current.playAsync();
      }
    } catch {
      // ignore if component unmounts mid-call
    }
  };

  const toggleMute = async () => {
    if (!videoRef.current) return;
    const next = !isMuted;
    setIsMuted(next);
    try {
      await videoRef.current.setIsMutedAsync(next);
    } catch {}
  };

  const handleFullscreen = async () => {
    if (!videoRef.current) return;
    if (Platform.OS === 'ios') {
      try {
        await videoRef.current.presentFullscreenPlayer();
      } catch {
        // presentFullscreenPlayer can reject if component unmounts
      }
    } else {
      // Android: show modal fullscreen
      setShowFullscreen(true);
      // Pause the inline player; the modal player starts from scratch
      try { await videoRef.current.pauseAsync(); } catch {}
    }
  };

  const handleSendComment = () => {
    const t = commentText.trim();
    if (!t) return;
    onAddComment(t);
    setCommentText('');
  };

  const handleSendReply = () => {
    if (!replyTarget) return;
    const t = replyText.trim();
    if (!t) return;
    onAddReply(replyTarget.id, replyTarget.name, t);
    setReplyText('');
    setReplyTarget(null);
  };

  return (
    <View style={[styles.postCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Edit modal */}
      <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={() => setShowEditModal(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior="padding"
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.editSheet, { backgroundColor: colors.card }]}>
              <View style={styles.editHeader}>
                <Text style={[styles.editTitle, { color: colors.foreground }]}>Videoyu Düzenle</Text>
                <TouchableOpacity onPress={() => setShowEditModal(false)} style={styles.modalClose}>
                  <Ionicons name="close" size={22} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>BAŞLIK</Text>
              <TextInput
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="Başlık ekleyin..."
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
                maxLength={100}
              />
              <Text style={[styles.label, { color: colors.mutedForeground }]}>AÇIKLAMA</Text>
              <TextInput
                value={editDesc}
                onChangeText={setEditDesc}
                placeholder="Açıklama yazın..."
                placeholderTextColor={colors.mutedForeground}
                multiline
                textAlignVertical="top"
                scrollEnabled={false}
                style={[styles.textarea, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
                maxLength={500}
              />
              <TouchableOpacity
                onPress={handleSaveEdit}
                style={[styles.requestBtn, { backgroundColor: colors.primary, marginTop: 4 }]}
              >
                <Text style={[styles.requestBtnText, { color: colors.primaryForeground }]}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Android fullscreen modal */}
      <Modal
        visible={showFullscreen}
        transparent={false}
        animationType="fade"
        supportedOrientations={['portrait', 'landscape']}
        onRequestClose={() => setShowFullscreen(false)}
      >
        <View style={styles.fsModalContainer}>
          <Video
            source={{ uri: post.mediaUri }}
            style={styles.fsVideo}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
            isMuted={isMuted}
            useNativeControls
          />
          <TouchableOpacity
            style={styles.fsCloseBtn}
            onPress={() => setShowFullscreen(false)}
            activeOpacity={0.8}
          >
            <Ionicons name="close-circle" size={36} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Media */}
      <TouchableOpacity
        activeOpacity={1}
        onPress={() => setShowControls(p => !p)}
        style={styles.mediaContainer}
      >
        <Video
          key={`${post.id}-${videoRetryKey}`}
          ref={videoRef}
          source={{ uri: post.mediaUri }}
          style={[styles.postMedia, { aspectRatio: videoAspectRatio }]}
          resizeMode={ResizeMode.CONTAIN}
          onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
          onLoadStart={() => {
            setVideoError(null);
            setIsLoading(true);
          }}
          onReadyForDisplay={({ naturalSize }) => {
            if (naturalSize.width > 0 && naturalSize.height > 0) {
              setVideoAspectRatio(Math.max(0.65, Math.min(1.9, naturalSize.width / naturalSize.height)));
            }
            setIsLoading(false);
          }}
          onError={() => {
            setIsLoading(false);
            setVideoError('Video yüklenemedi. İnternet bağlantınızı veya dosyayı kontrol edin.');
          }}
          shouldPlay={false}
          isLooping={false}
          isMuted={isMuted}
        />

        {videoError && (
          <View style={styles.videoErrorOverlay}>
            <Ionicons name="alert-circle-outline" size={34} color="#fff" />
            <Text style={styles.videoErrorText}>{videoError}</Text>
            <TouchableOpacity onPress={retryVideo} style={styles.videoRetryBtn}>
              <Ionicons name="refresh" size={16} color="#fff" />
              <Text style={styles.videoRetryText}>Tekrar Dene</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Loading indicator */}
        {isLoading && (
          <View style={styles.videoOverlay}>
            <ActivityIndicator size="large" color="rgba(255,255,255,0.9)" />
          </View>
        )}

        {/* Controls overlay */}
        {!isLoading && !videoError && showControls && (
          <View style={styles.videoControlsOverlay}>
            {/* Center play/pause */}
            <TouchableOpacity onPress={togglePlayPause} style={styles.playPauseBtn} activeOpacity={0.8}>
              <Ionicons
                name={isPlaying ? 'pause-circle' : 'play-circle'}
                size={52}
                color="rgba(255,255,255,0.92)"
              />
            </TouchableOpacity>
            {/* Bottom-right controls */}
            <View style={styles.videoBottomControls}>
              <TouchableOpacity onPress={toggleMute} style={styles.videoIconBtn} activeOpacity={0.8}>
                <Ionicons
                  name={isMuted ? 'volume-mute' : 'volume-high'}
                  size={18}
                  color="#fff"
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleFullscreen} style={styles.videoIconBtn} activeOpacity={0.8}>
                <Ionicons name="expand" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Progress bar — always visible when video is loaded */}
        {durationMillis > 0 && (
          <View
            style={styles.progressContainer}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderTerminationRequest={() => false}
          >
            <Text style={styles.progressTimeText}>{formatTime(positionMillis)}</Text>
            <View
              style={styles.progressTrack}
              onLayout={e => { seekBarWidthRef.current = e.nativeEvent.layout.width; }}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderTerminationRequest={() => false}
              onResponderGrant={e => handleSeekTo(e.nativeEvent.locationX)}
              onResponderMove={e => handleSeekTo(e.nativeEvent.locationX)}
            >
              <View style={[styles.progressFill, { width: `${(positionMillis / durationMillis) * 100}%` as any }]} />
              <View style={[styles.progressThumb, { left: `${(positionMillis / durationMillis) * 100}%` as any }]} />
            </View>
            <Text style={styles.progressTimeText}>{formatTime(durationMillis)}</Text>
          </View>
        )}

        {exp && (
          <View style={styles.expBadge}>
            <Ionicons name="time-outline" size={11} color="#F59E0B" />
            <Text style={styles.expText}>{exp}</Text>
          </View>
        )}
        <View style={[styles.videoBadge, { position: 'absolute', top: 10, left: 10 }]}>
          <Ionicons name="videocam" size={12} color="#fff" />
          {post.durationSeconds && (
            <Text style={styles.videoBadgeText}>{Math.ceil(post.durationSeconds)}s</Text>
          )}
        </View>
      </TouchableOpacity>

      {/* Body */}
      <View style={styles.postBody}>
        <View style={styles.postAuthorRow}>
          <UserAvatar name={post.authorName} color={post.authorAvatarColor} size={30} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.postAuthor, { color: colors.foreground }]}>{post.authorName}</Text>
            <Text style={[styles.postTime, { color: colors.mutedForeground }]}>{timeAgo(post.createdAt)}</Text>
          </View>
          {isOwner && (
            <TouchableOpacity onPress={handleMenuPress} style={styles.menuBtn} activeOpacity={0.7}>
              <Ionicons name="ellipsis-horizontal" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
        {post.title && <Text style={[styles.postTitle, { color: colors.foreground }]}>{post.title}</Text>}
        {post.description && (
          <Text style={[styles.postDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{post.description}</Text>
        )}

        {/* Actions */}
        <View style={styles.postActions}>
          <TouchableOpacity onPress={onLike} style={styles.postAction}>
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? '#EC4899' : colors.mutedForeground} />
            <Text style={[styles.postActionText, { color: colors.mutedForeground }]}>{post.likesCount}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowComments(p => !p)} style={styles.postAction}>
            <Ionicons name="chatbubble-outline" size={20} color={colors.mutedForeground} />
            <Text style={[styles.postActionText, { color: colors.mutedForeground }]}>{post.commentsCount}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onDownload} style={[styles.postAction, { marginLeft: 'auto' }]}>
            <Ionicons
              name="download-outline"
              size={20}
              color={isSubscriber ? colors.primary : colors.mutedForeground}
            />
            {!isSubscriber && (
              <Text style={[styles.postActionText, { color: colors.mutedForeground, fontSize: 10 }]}>Abone ol</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Comments section */}
        {showComments && (
          <View style={[styles.commentsSection, { borderTopColor: colors.border }]}>
            {comments.length === 0 ? (
              <Text style={[styles.noComments, { color: colors.mutedForeground }]}>Henüz yorum yok. İlk yorumu sen yap!</Text>
            ) : (
              comments.map(c => (
                <CommentItem
                  key={c.id}
                  comment={c}
                  isLiked={commentLikedIds.has(c.id)}
                  onLike={onToggleCommentLike}
                  onReply={(id, name) => { setReplyTarget({ id, name }); setReplyText(''); }}
                  replyLikedIds={commentLikedIds}
                />
              ))
            )}

            {/* Reply input */}
            {replyTarget && (
              <View style={[styles.replyInputRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Ionicons name="return-up-forward-outline" size={14} color={colors.primary} />
                <Text style={[styles.replyTargetName, { color: colors.primary }]}>{replyTarget.name}</Text>
                <TouchableOpacity onPress={() => setReplyTarget(null)} style={{ marginLeft: 'auto' }}>
                  <Ionicons name="close" size={14} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            )}

            {/* Comment input */}
            <View style={[styles.commentInputRow, { borderTopColor: colors.border }]}>
              <TextInput
                value={replyTarget ? replyText : commentText}
                onChangeText={replyTarget ? setReplyText : setCommentText}
                placeholder={replyTarget ? `${replyTarget.name}'a yanıt...` : 'Yorum yaz...'}
                placeholderTextColor={colors.mutedForeground}
                style={[styles.commentInput, { backgroundColor: colors.input, color: colors.foreground }]}
                maxLength={300}
              />
              <TouchableOpacity
                onPress={replyTarget ? handleSendReply : handleSendComment}
                style={[styles.sendBtn, { backgroundColor: colors.primary }]}
              >
                <Ionicons name="send" size={16} color={colors.primaryForeground} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function OzelScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const {
    ozelPosts, addOzelPost, toggleOzelLike, ozelLikedIds, checkContent,
    ozelComments, ozelCommentLikedIds, addOzelComment, addOzelCommentReply, toggleOzelCommentLike,
    deleteOzelPost, updateOzelPost,
    purchaseRequests, requestPurchase,
    getOzelVideoCountToday, incrementOzelVideoCount,
  } = useData();

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 32 : insets.bottom + 16;

  // ── Clock state for real-time expiry detection ─────────────────────────────
  // Refreshed every 30 seconds while screen is open, and on screen focus /
  // app foreground so the expiry boundary is enforced without navigation.
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') setNow(Date.now());
    });
    return () => sub.remove();
  }, []);

  useFocusEffect(useCallback(() => {
    setNow(Date.now());
  }, []));

  // Subscription status derived from purchaseRequests
  const myRequests = user
    ? purchaseRequests.filter(r => r.userId === user.id && r.type === 'ozel_abonelik')
    : [];
  // Use the approved request with the latest expiresAt so renewals take effect
  const myApproved = myRequests
    .filter(r => r.status === 'approved')
    .sort((a, b) => {
      const ta = a.expiresAt ? new Date(a.expiresAt).getTime() : 0;
      const tb = b.expiresAt ? new Date(b.expiresAt).getTime() : 0;
      return tb - ta; // newest expiry first
    })[0];
  // Most recent pending request
  const myPending = myRequests
    .filter(r => r.status === 'pending')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const isSubExpired = myApproved
    ? myApproved.expiresAt != null && new Date(myApproved.expiresAt).getTime() <= now
    : false;
  // Priority: active approved > pending renewal (over expired) > expired > none.
  // A pending renewal over an expired subscription shows 'pending' so the user
  // sees the correct state and cannot submit duplicate requests.
  const subStatus: 'none' | 'pending' | 'approved' | 'expired' =
    myApproved && !isSubExpired ? 'approved'
    : myPending ? 'pending'
    : myApproved && isSubExpired ? 'expired'
    : 'none';
  // Access is granted by a non-expired subscription, an admin-granted permanent
  // canPostVideo permission (set only via adminGrantPermission, never via
  // approvePurchase), or the admin bypass.
  const isSubscriber = (subStatus === 'approved') || !!(user?.canPostVideo) || !!(user?.isAdmin);

  // Active video coordination — only one video plays at a time
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);

  // Create video state
  const [showCreate, setShowCreate] = useState(false);
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState('');
  const [videoDesc, setVideoDesc] = useState('');
  const [videoDuration, setVideoDuration] = useState<number | undefined>();
  const [previewError, setPreviewError] = useState(false);

  // Close the create form if the subscription expires while it is open
  useEffect(() => {
    if (showCreate && !isSubscriber) {
      setShowCreate(false);
      Alert.alert('Abonelik Sona Erdi', 'Aboneliğinizin süresi dolduğu için video paylaşım formu kapatıldı.');
    }
  }, [isSubscriber, showCreate]);

  // Active posts (auto-expire filter)
  const activePosts = ozelPosts.filter(p => {
    if (p.expiresAt) return new Date(p.expiresAt).getTime() > Date.now();
    return true;
  });

  const handleSubscribeRequest = () => {
    if (!user) return;
    // Prevent duplicate pending requests
    if (subStatus === 'pending') {
      Alert.alert('Talep Zaten Var', 'Abonelik talebiniz zaten inceleniyor.');
      return;
    }
    requestPurchase('ozel_abonelik', 'Aylık Abonelik', '100 TL', user.id, user.displayName);
    Alert.alert('Talep Gönderildi', 'Abonelik talebiniz alındı. Yönetici onayladığında aktif olacaktır.');
  };

  const handlePickVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('İzin gerekli', 'Galeriye erişim için izin vermeniz gerekiyor.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      videoMaxDuration: 50,
      quality: 0.8,
    });
    if (!res.canceled && res.assets[0]) {
      const dur = res.assets[0].duration ?? 0;
      if (dur > 50000) {
        Alert.alert('Süre Hatası', 'Video en fazla 50 saniye olabilir.');
        return;
      }
      setVideoUri(res.assets[0].uri);
      setPreviewError(false);
      setVideoDuration(dur ? Math.ceil(dur / 1000) : undefined);
    }
  };

  const handlePublish = () => {
    if (!videoUri) { Alert.alert('Video gerekli', 'Önce bir video seçin.'); return; }
    if (!user) return;
    // Guard: block publish if subscription expired between opening and submitting
    if (!isSubscriber) {
      Alert.alert('Abonelik Gerekli', 'Aboneliğinizin süresi dolmuş. Video paylaşabilmek için yenileme yapmanız gerekiyor.');
      setShowCreate(false);
      return;
    }

    // Daily limit check (admin bypasses)
    if (!user.isAdmin) {
      const todayCount = getOzelVideoCountToday(user.id);
      if (todayCount >= 4) {
        Alert.alert('Günlük Limit', 'Bugün en fazla 4 video paylaşabilirsiniz. Yarın tekrar deneyin.');
        return;
      }
    }

    if (videoTitle.trim() || videoDesc.trim()) {
      const check = checkContent([videoTitle, videoDesc].join(' '));
      if (!check.ok) { Alert.alert('İçerik Filtresi', check.message ?? 'Uygunsuz içerik tespit edildi.'); return; }
    }

    const expiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();

    const post: OzelPost = {
      id: Date.now().toString(),
      authorId: user.id,
      authorName: user.displayName,
      authorAvatarColor: user.avatarColor,
      title: videoTitle.trim() || undefined,
      description: videoDesc.trim() || undefined,
      mediaType: 'video',
      mediaUri: videoUri,
      durationSeconds: videoDuration,
      expiresAt,
      likesCount: 0,
      commentsCount: 0,
      createdAt: new Date().toISOString(),
    };
    addOzelPost(post);
    if (!user.isAdmin) incrementOzelVideoCount(user.id);
    setVideoUri(null); setVideoTitle(''); setVideoDesc(''); setVideoDuration(undefined);
    setShowCreate(false);
  };

  const handleDownload = (post: OzelPost) => {
    if (!isSubscriber) {
      setShowSubscribeModal(true);
      return;
    }
    Alert.alert('İndirme', `"${post.title ?? 'Video'}" indirme başlatıldı.`);
  };

  const handleAddComment = (postId: string, text: string) => {
    if (!user) return;
    const comment: OzelComment = {
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      postId,
      authorId: user.id,
      authorName: user.displayName,
      authorAvatarColor: user.avatarColor,
      content: text,
      likesCount: 0,
      replies: [],
      createdAt: new Date().toISOString(),
    };
    addOzelComment(comment);
  };

  const handleAddReply = (commentId: string, _authorName: string, text: string) => {
    if (!user) return;
    const reply: OzelCommentReply = {
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      commentId,
      authorId: user.id,
      authorName: user.displayName,
      authorAvatarColor: user.avatarColor,
      content: text,
      likesCount: 0,
      createdAt: new Date().toISOString(),
    };
    addOzelCommentReply(commentId, reply);
  };

  // ── Create video form ──────────────────────────────────────────────────────
  if (showCreate) {
    return (
      <KeyboardAvoidingView
        style={[styles.root, { backgroundColor: colors.background }]}
        behavior="padding"
        keyboardVerticalOffset={topPad + 60}
      >
        <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => setShowCreate(false)} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Özel Video Paylaş</Text>
          <TouchableOpacity onPress={handlePublish} style={[styles.pubBtn, { backgroundColor: colors.primary }]}>
            <Text style={[styles.pubBtnText, { color: colors.primaryForeground }]}>Paylaş</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={[styles.form, { paddingBottom: botPad + 60 }]} keyboardShouldPersistTaps="handled">

          {/* Info banner */}
          <View style={[styles.infoBox, { backgroundColor: '#78350F20', borderColor: '#F59E0B40' }]}>
            <Ionicons name="time-outline" size={16} color="#F59E0B" />
            <Text style={[styles.infoText, { color: '#F59E0B' }]}>
              Videolar 15 gün sonra otomatik silinir. Günde en fazla 4 video paylaşabilirsiniz.
            </Text>
          </View>

          {/* Daily count */}
          {!user?.isAdmin && (
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <Text style={[styles.dailyCount, { color: colors.mutedForeground }]}>
                Bugün: {getOzelVideoCountToday(user?.id ?? '')} / 4 video
              </Text>
            </View>
          )}

          {/* Video picker */}
          <TouchableOpacity onPress={handlePickVideo}
            style={[styles.mediaPicker, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {videoUri ? (
              <>
                {previewError ? (
                  <View style={styles.previewError}>
                    <Ionicons name="alert-circle-outline" size={34} color={colors.destructive} />
                    <Text style={[styles.previewErrorText, { color: colors.mutedForeground }]}>
                      Video önizlenemedi. Farklı bir video seçin.
                    </Text>
                  </View>
                ) : (
                  <>
                    <Video
                      source={{ uri: videoUri }}
                      style={styles.mediaPreview}
                      resizeMode={ResizeMode.CONTAIN}
                      shouldPlay={false}
                      isMuted
                      onError={() => setPreviewError(true)}
                    />
                    <View pointerEvents="none" style={[styles.videoOverlay, StyleSheet.absoluteFillObject]}>
                      <Ionicons name="play-circle" size={40} color="rgba(255,255,255,0.9)" />
                    </View>
                  </>
                )}
              </>
            ) : (
              <>
                <Ionicons name="videocam-outline" size={40} color={colors.primary} />
                <Text style={[styles.mediaPickerText, { color: colors.primary }]}>Video Seç (maks. 50 saniye)</Text>
                <Text style={[styles.mediaPickerSub, { color: colors.mutedForeground }]}>Galerinizden video seçin</Text>
              </>
            )}
          </TouchableOpacity>
          {videoUri && (
            <TouchableOpacity onPress={handlePickVideo}
              style={[styles.changeMedia, { borderColor: colors.border }]}>
              <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 13, color: colors.primary }}>Değiştir</Text>
            </TouchableOpacity>
          )}
          {videoDuration && (
            <Text style={[styles.durationLabel, { color: colors.mutedForeground }]}>
              Süre: {videoDuration} saniye
            </Text>
          )}

          {/* Title */}
          <Text style={[styles.label, { color: colors.mutedForeground }]}>BAŞLIK (İSTEĞE BAĞLI)</Text>
          <TextInput value={videoTitle} onChangeText={setVideoTitle}
            placeholder="Başlık ekleyin..."
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            maxLength={100} />

          <Text style={[styles.label, { color: colors.mutedForeground }]}>AÇIKLAMA (İSTEĞE BAĞLI)</Text>
          <TextInput value={videoDesc} onChangeText={setVideoDesc}
            placeholder="Açıklama yazın..."
            placeholderTextColor={colors.mutedForeground}
            multiline textAlignVertical="top" scrollEnabled={false}
            style={[styles.textarea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            maxLength={500} />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Main list ──────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <SubscribeModal
        visible={showSubscribeModal}
        onClose={() => setShowSubscribeModal(false)}
        status={subStatus}
        onRequest={handleSubscribeRequest}
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <View style={[styles.ozelIcon, { backgroundColor: `${colors.primary}18` }]}>
            <Ionicons name="sparkles" size={18} color={colors.primary} />
          </View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Özel</Text>
        </View>
        {isSubscriber && (
          <TouchableOpacity onPress={() => setShowCreate(true)} style={[styles.addBtn, { backgroundColor: `${colors.primary}18` }]}>
            <Ionicons name="add" size={22} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      <KeyboardAvoidingView style={styles.mainKeyboardRoot} behavior="padding" keyboardVerticalOffset={0}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.listContent, { paddingBottom: botPad }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >

        {/* Subscribe banner (non-subscribers) */}
        {!isSubscriber && (
          <View style={[styles.subscribeBanner, {
            backgroundColor: colors.card,
            borderColor: subStatus === 'expired' ? '#EF444440' : colors.border,
          }]}>
            <View style={[styles.bannerIcon, { backgroundColor: subStatus === 'expired' ? '#EF444420' : `${colors.primary}18` }]}>
              <Ionicons name={subStatus === 'expired' ? 'alert-circle' : 'sparkles'} size={28} color={subStatus === 'expired' ? '#EF4444' : colors.primary} />
            </View>
            <Text style={[styles.bannerTitle, { color: colors.foreground }]}>
              {subStatus === 'expired' ? 'Aboneliğinizin Süresi Doldu' : 'Özel Bölüme Katıl'}
            </Text>
            <Text style={[styles.bannerSub, { color: colors.mutedForeground }]}>
              {subStatus === 'expired'
                ? `Aboneliğiniz ${myApproved?.expiresAt ? formatTurkishDate(myApproved.expiresAt) + ' tarihinde' : ''} sona erdi. Yenileme talebi göndererek tekrar aktif edebilirsiniz.`
                : `Aylık 100 TL ile özel videoları indirip paylaşabilirsin.\nGünde 4 video, 50 saniye, 15 gün yayın.`}
            </Text>
            {(subStatus === 'none' || subStatus === 'expired') && (
              <TouchableOpacity
                onPress={() => setShowSubscribeModal(true)}
                style={[styles.subscribeBannerBtn, { backgroundColor: subStatus === 'expired' ? '#EF4444' : colors.primary }]}
              >
                <Ionicons name={subStatus === 'expired' ? 'refresh' : 'sparkles'} size={16} color="#fff" />
                <Text style={[styles.subscribeBannerBtnText, { color: '#fff' }]}>
                  {subStatus === 'expired' ? 'Yenileme Talebi Gönder' : 'Abone Ol'}
                </Text>
              </TouchableOpacity>
            )}
            {subStatus === 'pending' && (
              <View style={[styles.statusPill, { backgroundColor: '#F59E0B20', alignSelf: 'center' }]}>
                <Ionicons name="time-outline" size={14} color="#F59E0B" />
                <Text style={[styles.statusText, { color: '#F59E0B' }]}>Talebiniz inceleniyor...</Text>
              </View>
            )}
          </View>
        )}

        {/* Active subscription indicator */}
        {isSubscriber && subStatus === 'approved' && (
          <View style={[styles.activeSubBadge, { backgroundColor: '#22C55E15', borderColor: '#22C55E30' }]}>
            <Ionicons name="checkmark-circle" size={14} color="#22C55E" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.activeSubText, { color: '#22C55E' }]}>
                {myApproved?.expiresAt
                  ? `Abonelik: ${formatTurkishDate(myApproved.expiresAt)}'ya kadar aktif`
                  : 'Aboneliğiniz aktif'}
              </Text>
              <Text style={[styles.activeSubText, { color: '#22C55E', opacity: 0.75, fontSize: 11 }]}>
                Bugün: {getOzelVideoCountToday(user?.id ?? '')} / 4 video
              </Text>
            </View>
          </View>
        )}

        {/* Post list — only rendered for active subscribers */}
        {isSubscriber && activePosts.length === 0 && (
          <View style={styles.emptyWrap}>
            <Ionicons name="videocam-outline" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Henüz video yok</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              İlk özel videoyu paylaşan sen ol
            </Text>
          </View>
        )}
        {isSubscriber && activePosts.map(post => (
          <PostCard
            key={post.id}
            post={post}
            liked={ozelLikedIds.has(post.id)}
            onLike={() => toggleOzelLike(post.id)}
            onDownload={() => handleDownload(post)}
            isSubscriber={isSubscriber}
            comments={ozelComments.filter(c => c.postId === post.id)}
            commentLikedIds={ozelCommentLikedIds}
            onToggleCommentLike={toggleOzelCommentLike}
            onAddComment={(text) => handleAddComment(post.id, text)}
            onAddReply={handleAddReply}
            currentUserId={user?.id}
            onDelete={() => deleteOzelPost(post.id)}
            onEdit={(title, description) => updateOzelPost(post.id, { title: title || undefined, description: description || undefined })}
            activeVideoId={activeVideoId}
            onVideoPlay={setActiveVideoId}
          />
        ))}
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  mainKeyboardRoot: { flex: 1 },
  // Header
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  headerTitle: { fontFamily: 'Poppins_700Bold', fontSize: 17 },
  ozelIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  addBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  // List
  listContent: { padding: 16, gap: 16 },
  // Subscribe banner
  subscribeBanner: { borderRadius: 18, borderWidth: 1, padding: 20, alignItems: 'center', gap: 10, marginBottom: 4 },
  bannerIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  bannerTitle: { fontFamily: 'Poppins_700Bold', fontSize: 17, textAlign: 'center' },
  bannerSub: { fontFamily: 'Poppins_400Regular', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  subscribeBannerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, marginTop: 4 },
  subscribeBannerBtnText: { fontFamily: 'Poppins_700Bold', fontSize: 15 },
  // Active sub badge
  activeSubBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, marginBottom: 4 },
  activeSubText: { fontFamily: 'Poppins_500Medium', fontSize: 12 },
  // Post card
  postCard: { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  mediaContainer: { position: 'relative', backgroundColor: '#050505' },
  postMedia: { width: '100%', minHeight: 210, maxHeight: 620 },
  videoOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
  videoControlsOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.18)' },
  videoErrorOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, backgroundColor: 'rgba(18,18,24,0.92)' },
  videoErrorText: { color: '#fff', fontFamily: 'Poppins_500Medium', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  videoRetryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  videoRetryText: { color: '#fff', fontFamily: 'Poppins_600SemiBold', fontSize: 12 },
  playPauseBtn: { alignItems: 'center', justifyContent: 'center' },
  videoBottomControls: { position: 'absolute', bottom: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  videoIconBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  // Fullscreen modal (Android)
  fsModalContainer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  fsVideo: { width: '100%', height: '100%' },
  fsCloseBtn: { position: 'absolute', top: 44, right: 16 },
  // Progress bar
  progressContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: 'rgba(0,0,0,0.45)' },
  progressTimeText: { color: 'rgba(255,255,255,0.9)', fontFamily: 'Poppins_500Medium', fontSize: 10, minWidth: 30, textAlign: 'center' },
  progressTrack: { flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2, position: 'relative' },
  progressFill: { height: 3, backgroundColor: '#fff', borderRadius: 2 },
  progressThumb: { position: 'absolute', top: -4, width: 11, height: 11, borderRadius: 6, backgroundColor: '#fff', marginLeft: -5.5, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 3 },
  expBadge: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  expText: { color: '#F59E0B', fontFamily: 'Poppins_600SemiBold', fontSize: 10 },
  videoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  videoBadgeText: { color: '#fff', fontFamily: 'Poppins_600SemiBold', fontSize: 10 },
  // Post body
  postBody: { padding: 14, gap: 8 },
  postAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  postAuthor: { fontFamily: 'Poppins_600SemiBold', fontSize: 13 },
  postTime: { fontFamily: 'Poppins_400Regular', fontSize: 11 },
  postTitle: { fontFamily: 'Poppins_700Bold', fontSize: 15 },
  postDesc: { fontFamily: 'Poppins_400Regular', fontSize: 13, lineHeight: 20 },
  postActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  postAction: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  postActionText: { fontFamily: 'Poppins_400Regular', fontSize: 14 },
  // Comments
  commentsSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 10 },
  noComments: { fontFamily: 'Poppins_400Regular', fontSize: 12, textAlign: 'center', paddingVertical: 8 },
  commentItem: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  commentBubble: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  commentAuthor: { fontFamily: 'Poppins_600SemiBold', fontSize: 12 },
  commentContent: { fontFamily: 'Poppins_400Regular', fontSize: 13, lineHeight: 18 },
  commentMeta: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, marginLeft: 4 },
  commentTime: { fontFamily: 'Poppins_400Regular', fontSize: 11 },
  commentAction: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  commentActionText: { fontFamily: 'Poppins_500Medium', fontSize: 12 },
  replyItem: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginLeft: 34, marginTop: 6 },
  replyInputRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, marginTop: 4 },
  replyTargetName: { fontFamily: 'Poppins_500Medium', fontSize: 12 },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  commentInput: { flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontFamily: 'Poppins_400Regular', fontSize: 13 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  // Empty state
  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontFamily: 'Poppins_700Bold', fontSize: 16 },
  emptyText: { fontFamily: 'Poppins_400Regular', fontSize: 14, textAlign: 'center' },
  // Create form
  form: { padding: 16, gap: 12 },
  mediaPicker: { borderWidth: 1.5, borderRadius: 14, borderStyle: 'dashed', minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 10, overflow: 'hidden' },
  mediaPreview: { width: '100%', height: 240, backgroundColor: '#050505' },
  previewError: { width: '100%', minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  previewErrorText: { fontFamily: 'Poppins_500Medium', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  mediaPickerText: { fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
  mediaPickerSub: { fontFamily: 'Poppins_400Regular', fontSize: 12 },
  changeMedia: { alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 14, borderWidth: 1, borderRadius: 8 },
  durationLabel: { fontFamily: 'Poppins_400Regular', fontSize: 12, textAlign: 'center', marginTop: -4 },
  dailyCount: { fontFamily: 'Poppins_400Regular', fontSize: 12, marginBottom: -4 },
  label: { fontFamily: 'Poppins_600SemiBold', fontSize: 10, letterSpacing: 1, marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontFamily: 'Poppins_400Regular', fontSize: 14 },
  textarea: { borderWidth: 1, borderRadius: 12, padding: 12, fontFamily: 'Poppins_400Regular', fontSize: 14, minHeight: 100 },
  pubBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  pubBtnText: { fontFamily: 'Poppins_700Bold', fontSize: 13 },
  // Subscribe modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 12 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  modalIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  modalClose: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontFamily: 'Poppins_700Bold', fontSize: 20 },
  modalSub: { fontFamily: 'Poppins_500Medium', fontSize: 15, marginTop: -4 },
  benefitsList: { gap: 8, marginTop: 4 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  benefitText: { fontFamily: 'Poppins_400Regular', fontSize: 14, flex: 1 },
  requestBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, marginTop: 8 },
  requestBtnText: { fontFamily: 'Poppins_700Bold', fontSize: 16 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, marginTop: 8, alignSelf: 'stretch', justifyContent: 'center' },
  statusText: { fontFamily: 'Poppins_500Medium', fontSize: 14 },
  // Edit modal
  editSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 12 },
  editHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  editTitle: { fontFamily: 'Poppins_700Bold', fontSize: 18 },
  // Three-dot menu
  menuBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17 },
  // Shared
  infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1 },
  infoText: { flex: 1, fontFamily: 'Poppins_400Regular', fontSize: 12, lineHeight: 18 },
});
