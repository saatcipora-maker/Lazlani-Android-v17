import React, { useState } from 'react';
import {
  Alert, FlatList, Image, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { Post } from '@/data/types';
import PostCard from '@/components/PostCard';

type ContentType = 'text' | 'photo' | 'story' | 'book';

export default function BultenScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const {
    posts, postComments, postLikedIds, postSavedIds, postCommentLikedIds,
    togglePostLike, togglePostSave, addPost, addPostComment, addPostCommentReply,
    togglePostCommentLike, addReactionToPostComment,
    stories, books, checkContent,
  } = useData();

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const [showModal, setShowModal] = useState(false);

  /* ── New post form state ── */
  const [postTitle, setPostTitle] = useState('');
  const [postContent, setPostContent] = useState('');
  const [postType, setPostType] = useState<ContentType>('text');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [linkedContentId, setLinkedContentId] = useState('');
  const [linkedContentTitle, setLinkedContentTitle] = useState('');
  const [showLinkedPicker, setShowLinkedPicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!user) return null;

  const TYPE_OPTIONS: { key: ContentType; icon: string; label: string }[] = [
    { key: 'text', icon: 'document-text-outline', label: 'Yazı' },
    { key: 'photo', icon: 'image-outline', label: 'Fotoğraf' },
    { key: 'story', icon: 'book-outline', label: 'Hikaye' },
    { key: 'book', icon: 'library-outline', label: 'Kitap' },
  ];

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled) {
      setSelectedImages(prev => [...prev, ...result.assets.map(a => a.uri)].slice(0, 4));
    }
  };

  const resetForm = () => {
    setPostTitle('');
    setPostContent('');
    setPostType('text');
    setSelectedImages([]);
    setLinkedContentId('');
    setLinkedContentTitle('');
    setShowLinkedPicker(false);
  };

  const submitPost = () => {
    if (!postContent.trim() && selectedImages.length === 0) return;
    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const newPost: Post = {
      id: `post-${Date.now()}`,
      authorId: user.id,
      authorName: user.displayName,
      authorAvatarColor: user.avatarColor,
      title: postTitle.trim() || undefined,
      content: postContent.trim(),
      imageUris: selectedImages.length > 0 ? selectedImages : undefined,
      contentType: postType,
      linkedContentId: linkedContentId || undefined,
      linkedContentTitle: linkedContentTitle || undefined,
      likesCount: 0,
      commentsCount: 0,
      sharesCount: 0,
      savesCount: 0,
      createdAt: new Date().toISOString(),
    };

    const checkText = [postTitle, postContent].filter(Boolean).join(' ');
    const filterResult = checkContent(checkText);
    if (!filterResult.ok) {
      Alert.alert('İçerik Filtresi', filterResult.message ?? 'Uygunsuz içerik tespit edildi.');
      setIsSubmitting(false);
      return;
    }
    addPost(newPost);
    resetForm();
    setIsSubmitting(false);
    setShowModal(false);
  };

  const renderPost = ({ item }: { item: Post }) => (
    <PostCard
      post={item}
      isLiked={postLikedIds.has(item.id)}
      isSaved={postSavedIds.has(item.id)}
      onLike={() => togglePostLike(item.id)}
      onSave={() => togglePostSave(item.id)}
      postComments={postComments.filter(c => c.postId === item.id)}
      onAddComment={addPostComment}
      onAddReply={addPostCommentReply}
      onToggleCommentLike={togglePostCommentLike}
      onAddReaction={addReactionToPostComment}
      commentLikedIds={postCommentLikedIds}
      currentUserId={user.id}
      currentUserName={user.displayName}
      currentUserAvatarColor={user.avatarColor}
    />
  );

  const contentItems = postType === 'story' ? stories : books;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient
        colors={['#3D3468', colors.background]}
        style={[styles.header, { paddingTop: topPad + 8 }]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#E0D8FF" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Bültenler</Text>
          <Text style={styles.headerSub}>Topluluk paylaşımları</Text>
        </View>
        <TouchableOpacity
          onPress={() => setShowModal(true)}
          style={styles.newPostBtn}
        >
          <LinearGradient
            colors={['#9B59F5', '#EC4899']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.newPostGrad}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.newPostTxt}>Paylaş</Text>
          </LinearGradient>
        </TouchableOpacity>
      </LinearGradient>

      {/* Feed */}
      <FlatList
        data={posts}
        keyExtractor={item => item.id}
        renderItem={renderPost}
        contentContainerStyle={styles.feed}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="newspaper-outline" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>
              Henüz paylaşım yok. İlk paylaşımı yap!
            </Text>
          </View>
        }
      />

      {/* Create post modal */}
      <Modal
        visible={showModal}
        animationType="slide"
        transparent
        onRequestClose={() => { setShowModal(false); resetForm(); }}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior="padding"
            style={{ flex: 1, justifyContent: 'flex-end' }}
          >
            <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
              {/* Modal header */}
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => { setShowModal(false); resetForm(); }}>
                  <Text style={[styles.cancelTxt, { color: colors.mutedForeground }]}>İptal</Text>
                </TouchableOpacity>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Yeni Paylaşım</Text>
                <TouchableOpacity
                  onPress={submitPost}
                  disabled={isSubmitting || (!postContent.trim() && selectedImages.length === 0)}
                >
                  <LinearGradient
                    colors={['#9B59F5', '#EC4899']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={[
                      styles.publishBtn,
                      { opacity: isSubmitting || (!postContent.trim() && selectedImages.length === 0) ? 0.4 : 1 },
                    ]}
                  >
                    <Text style={styles.publishTxt}>Paylaş</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
                {/* Type selector */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow}>
                  {TYPE_OPTIONS.map(opt => (
                    <TouchableOpacity
                      key={opt.key}
                      onPress={() => {
                        setPostType(opt.key);
                        setLinkedContentId('');
                        setLinkedContentTitle('');
                      }}
                      style={[
                        styles.typeBtn,
                        { borderColor: postType === opt.key ? colors.primary : colors.border },
                        postType === opt.key && { backgroundColor: `${colors.primary}20` },
                      ]}
                    >
                      <Ionicons
                        name={opt.icon as any}
                        size={16}
                        color={postType === opt.key ? colors.primary : colors.mutedForeground}
                      />
                      <Text style={[
                        styles.typeTxt,
                        { color: postType === opt.key ? colors.primary : colors.mutedForeground },
                      ]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Title input */}
                <TextInput
                  style={[styles.titleInput, { color: colors.foreground, borderBottomColor: colors.border }]}
                  placeholder="Başlık ekle (isteğe bağlı)"
                  placeholderTextColor={colors.mutedForeground}
                  value={postTitle}
                  onChangeText={setPostTitle}
                />

                {/* Content input */}
                <TextInput
                  style={[styles.contentInput, { color: colors.foreground }]}
                  placeholder="Ne paylaşmak istiyorsun?"
                  placeholderTextColor={colors.mutedForeground}
                  value={postContent}
                  onChangeText={setPostContent}
                  multiline
                  textAlignVertical="top"
                  autoFocus
                />

                {/* Photo picker (for photo type) */}
                {postType === 'photo' && (
                  <View style={styles.imageSection}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageRow}>
                      {selectedImages.map((uri, i) => (
                        <View key={i} style={styles.imageWrap}>
                          <Image source={{ uri }} style={styles.previewImg} />
                          <TouchableOpacity
                            onPress={() => setSelectedImages(prev => prev.filter((_, idx) => idx !== i))}
                            style={styles.removeImg}
                          >
                            <Ionicons name="close-circle" size={20} color="#EF4444" />
                          </TouchableOpacity>
                        </View>
                      ))}
                      {selectedImages.length < 4 && (
                        <TouchableOpacity onPress={pickImage} style={[styles.addImgBtn, { borderColor: colors.border }]}>
                          <Ionicons name="add-circle-outline" size={32} color={colors.primary} />
                          <Text style={[styles.addImgTxt, { color: colors.mutedForeground }]}>Fotoğraf Ekle</Text>
                        </TouchableOpacity>
                      )}
                    </ScrollView>
                  </View>
                )}

                {/* Story / Book picker */}
                {(postType === 'story' || postType === 'book') && (
                  <View style={styles.linkedSection}>
                    <Text style={[styles.linkedLabel, { color: colors.mutedForeground }]}>
                      {postType === 'story' ? 'Hikaye seç' : 'Kitap seç'}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setShowLinkedPicker(v => !v)}
                      style={[styles.linkedPicker, { borderColor: colors.border, backgroundColor: colors.card }]}
                    >
                      <Ionicons
                        name={postType === 'story' ? 'document-text-outline' : 'library-outline'}
                        size={18}
                        color={linkedContentTitle ? colors.primary : colors.mutedForeground}
                      />
                      <Text style={[styles.linkedPickerTxt, { color: linkedContentTitle ? colors.foreground : colors.mutedForeground }]}>
                        {linkedContentTitle || `Bir ${postType === 'story' ? 'hikaye' : 'kitap'} seç...`}
                      </Text>
                      <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
                    </TouchableOpacity>

                    {showLinkedPicker && (
                      <View style={[styles.linkedDropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        {contentItems.map((item: any) => (
                          <TouchableOpacity
                            key={item.id}
                            onPress={() => {
                              setLinkedContentId(item.id);
                              setLinkedContentTitle(item.title);
                              setShowLinkedPicker(false);
                            }}
                            style={[styles.linkedOption, { borderBottomColor: colors.border }]}
                          >
                            <LinearGradient
                              colors={[item.coverColor, item.coverColor + '88']}
                              style={styles.linkedOptionCover}
                            >
                              <Text style={styles.linkedOptionInitial}>{item.title[0]}</Text>
                            </LinearGradient>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.linkedOptionTitle, { color: colors.foreground }]} numberOfLines={1}>
                                {item.title}
                              </Text>
                              <Text style={[styles.linkedOptionSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                                {item.genre ?? item.authorName}
                              </Text>
                            </View>
                            {linkedContentId === item.id && (
                              <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                            )}
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 14,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(155,89,245,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: '#E0D8FF', fontFamily: 'Poppins_700Bold', fontSize: 17 },
  headerSub: { color: '#C8B8FF', fontFamily: 'Poppins_400Regular', fontSize: 12 },
  newPostBtn: { borderRadius: 20, overflow: 'hidden' },
  newPostGrad: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8 },
  newPostTxt: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: 13 },

  feed: { paddingTop: 12, paddingBottom: 100 },
  emptyWrap: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTxt: { fontFamily: 'Poppins_400Regular', fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },

  /* Modal */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  cancelTxt: { fontFamily: 'Poppins_500Medium', fontSize: 14 },
  modalTitle: { fontFamily: 'Poppins_700Bold', fontSize: 16 },
  publishBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20 },
  publishTxt: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: 13 },
  modalBody: { padding: 16, gap: 14, paddingBottom: 40 },

  /* Type row */
  typeRow: { gap: 8 },
  typeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
  },
  typeTxt: { fontFamily: 'Poppins_500Medium', fontSize: 13 },

  /* Inputs */
  titleInput: {
    fontFamily: 'Poppins_600SemiBold', fontSize: 16,
    borderBottomWidth: 1, paddingVertical: 8,
  },
  contentInput: {
    fontFamily: 'Poppins_400Regular', fontSize: 15,
    lineHeight: 24, minHeight: 120,
  },

  /* Images */
  imageSection: { gap: 8 },
  imageRow: { gap: 10 },
  imageWrap: { position: 'relative' },
  previewImg: { width: 100, height: 100, borderRadius: 12 },
  removeImg: { position: 'absolute', top: -6, right: -6 },
  addImgBtn: {
    width: 100, height: 100, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  addImgTxt: { fontFamily: 'Poppins_400Regular', fontSize: 10, textAlign: 'center' },

  /* Linked content */
  linkedSection: { gap: 8 },
  linkedLabel: { fontFamily: 'Poppins_500Medium', fontSize: 13 },
  linkedPicker: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 12, borderWidth: 1,
  },
  linkedPickerTxt: { flex: 1, fontFamily: 'Poppins_400Regular', fontSize: 14 },
  linkedDropdown: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  linkedOption: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderBottomWidth: 1,
  },
  linkedOptionCover: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  linkedOptionInitial: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: 16 },
  linkedOptionTitle: { fontFamily: 'Poppins_600SemiBold', fontSize: 13 },
  linkedOptionSub: { fontFamily: 'Poppins_400Regular', fontSize: 11 },
});
