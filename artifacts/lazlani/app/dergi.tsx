import React, { useState } from 'react';
import {
  Alert, Image, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import UserAvatar from '@/components/UserAvatar';
import { DergiPost } from '@/data/types';

const CATEGORIES = ['Edebiyat','Kültür','Sanat','Deneme','Eleştiri','Röportaj','Araştırma'];
const COVER_COLORS = ['#1E3A5F','#4C1D95','#7F1D1D','#065F46','#78350F','#1E3A8A','#581C87'];

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600) return `${Math.floor(diff / 60)}dk`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa`;
  return `${Math.floor(diff / 86400)}g`;
}

function wordCount(s: string) { return s.trim().split(/\s+/).filter(Boolean).length; }

export default function DergiScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { dergiPosts, addDergiPost, toggleDergiLike, dergiLikedIds, checkContent } = useData();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 32 : insets.bottom + 16;

  const [view, setView] = useState<'list' | 'create' | 'read'>('list');
  const [reading, setReading] = useState<DergiPost | null>(null);

  // Create form state
  const [title, setTitle]       = useState('');
  const [content, setContent]   = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [coverColor, setCoverColor] = useState(COVER_COLORS[0]);
  const [tags, setTags]         = useState('');
  const [publishing, setPublishing] = useState(false);

  const canWrite = user?.canMagazineWrite || user?.isAdmin;
  const wc = wordCount(content);

  const pickCover = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('İzin gerekli', 'Galeriye erişim için izin vermeniz gerekiyor.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [16, 9], quality: 0.9 });
    if (!res.canceled) setCoverUri(res.assets[0].uri);
  };

  const handlePublish = () => {
    if (!title.trim()) { Alert.alert('Hata', 'Başlık zorunludur.'); return; }
    if (wc < 10) { Alert.alert('Hata', 'İçerik çok kısa. En az 10 kelime gereklidir.'); return; }
    if (!user) return;
    const filterResult = checkContent([title, content].join(' '));
    if (!filterResult.ok) { Alert.alert('İçerik Filtresi', filterResult.message ?? 'Uygunsuz içerik tespit edildi.'); return; }
    setPublishing(true);
    const post: DergiPost = {
      id: Date.now().toString(),
      title: title.trim(),
      coverUrl: coverUri ?? undefined,
      coverColor,
      authorId: user.id,
      authorName: user.displayName,
      authorAvatarColor: user.avatarColor,
      content: content.trim(),
      excerpt: content.trim().slice(0, 200) + (content.length > 200 ? '…' : ''),
      category,
      likesCount: 0,
      commentsCount: 0,
      createdAt: new Date().toISOString(),
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
    };
    addDergiPost(post);
    setPublishing(false);
    setTitle(''); setContent(''); setTags(''); setCoverUri(null);
    setView('list');
  };

  /* ── Read Article ── */
  if (view === 'read' && reading) {
    const liked = dergiLikedIds.has(reading.id);
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => { setView('list'); setReading(null); }} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>{reading.title}</Text>
          <TouchableOpacity onPress={() => toggleDergiLike(reading.id)} style={styles.likeBtn}>
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={22} color={liked ? '#EC4899' : colors.mutedForeground} />
          </TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.articleContent, { paddingBottom: botPad }]}>
          {reading.coverUrl ? (
            <Image source={{ uri: reading.coverUrl }} style={styles.articleCover} />
          ) : (
            <LinearGradient colors={[reading.coverColor, reading.coverColor + '66']} style={styles.articleCover}>
              <Text style={styles.articleCoverTitle}>{reading.title}</Text>
            </LinearGradient>
          )}
          <View style={styles.articleMeta}>
            <View style={[styles.catBadge, { backgroundColor: `${colors.primary}18` }]}>
              <Text style={[styles.catText, { color: colors.primary }]}>{reading.category}</Text>
            </View>
            <Text style={[styles.articleDate, { color: colors.mutedForeground }]}>{timeAgo(reading.createdAt)} önce</Text>
          </View>
          <Text style={[styles.articleTitle, { color: colors.foreground }]}>{reading.title}</Text>
          <View style={styles.articleAuthorRow}>
            <UserAvatar name={reading.authorName} color={reading.authorAvatarColor} size={32} />
            <Text style={[styles.articleAuthor, { color: colors.mutedForeground }]}>{reading.authorName}</Text>
            <Text style={[styles.articleWC, { color: colors.mutedForeground }]}>{wordCount(reading.content).toLocaleString('tr')} kelime</Text>
          </View>
          <Text style={[styles.articleBody, { color: colors.foreground }]}>{reading.content}</Text>
          <View style={[styles.articleFooter, { borderTopColor: colors.border }]}>
            <TouchableOpacity onPress={() => toggleDergiLike(reading.id)} style={styles.articleAction}>
              <Ionicons name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? '#EC4899' : colors.mutedForeground} />
              <Text style={[styles.articleActionText, { color: colors.mutedForeground }]}>{reading.likesCount + (liked ? 1 : 0)}</Text>
            </TouchableOpacity>
            <View style={styles.articleAction}>
              <Ionicons name="chatbubble-outline" size={20} color={colors.mutedForeground} />
              <Text style={[styles.articleActionText, { color: colors.mutedForeground }]}>{reading.commentsCount}</Text>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  /* ── Create Article ── */
  if (view === 'create') {
    return (
      <KeyboardAvoidingView
        style={[styles.root, { backgroundColor: colors.background }]}
        behavior="padding"
        keyboardVerticalOffset={topPad + 60}
      >
        <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => setView('list')} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Dergi Yazısı</Text>
          <TouchableOpacity onPress={handlePublish} disabled={publishing}>
            <LinearGradient colors={['#9B59F5','#EC4899']} start={{ x:0,y:0 }} end={{ x:1,y:0 }} style={styles.pubBtn}>
              <Text style={styles.pubBtnText}>{publishing ? '…' : 'Yayımla'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={[styles.form, { paddingBottom: botPad + 60 }]} keyboardShouldPersistTaps="handled">

          {/* Cover */}
          <TouchableOpacity onPress={pickCover} activeOpacity={0.85}>
            {coverUri ? (
              <Image source={{ uri: coverUri }} style={[styles.createCover, { borderRadius: 12 }]} />
            ) : (
              <LinearGradient colors={[coverColor, coverColor + '88']} style={[styles.createCover, { borderRadius: 12 }]}>
                <Ionicons name="image-outline" size={32} color="rgba(255,255,255,0.7)" />
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontFamily: 'Poppins_500Medium', fontSize: 13 }}>Kapak Görseli Ekle</Text>
              </LinearGradient>
            )}
          </TouchableOpacity>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
            {COVER_COLORS.map(c => (
              <TouchableOpacity key={c} onPress={() => setCoverColor(c)}
                style={[{ width: 28, height: 28, borderRadius: 8, backgroundColor: c }, coverColor === c && { borderWidth: 3, borderColor: '#fff' }]} />
            ))}
          </ScrollView>

          {/* Category */}
          <Text style={[styles.label, { color: colors.mutedForeground }]}>KATEGORİ</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
            {CATEGORIES.map(c => (
              <TouchableOpacity key={c} onPress={() => setCategory(c)}
                style={[styles.chip, { backgroundColor: category === c ? colors.primary : colors.card, borderColor: category === c ? colors.primary : colors.border }]}>
                <Text style={[styles.chipText, { color: category === c ? colors.primaryForeground : colors.foreground }]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Title */}
          <Text style={[styles.label, { color: colors.mutedForeground }]}>BAŞLIK</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="Yazının başlığı..."
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} maxLength={150} />

          {/* Tags */}
          <Text style={[styles.label, { color: colors.mutedForeground }]}>ETİKETLER (virgülle ayır)</Text>
          <TextInput value={tags} onChangeText={setTags} placeholder="edebiyat, kültür, sanat"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />

          {/* Content */}
          <View style={styles.contentHeader}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>İÇERİK</Text>
            <Text style={[styles.wcBadge, { color: wc >= 100 ? '#22C55E' : colors.primary }]}>{wc.toLocaleString('tr')} kelime</Text>
          </View>
          <TextInput value={content} onChangeText={setContent}
            placeholder="Yazınızı buraya yazın. Kapsamlı ve derinlikli bir içerik hazırlayın..."
            placeholderTextColor={colors.mutedForeground} multiline textAlignVertical="top" scrollEnabled={false}
            style={[styles.textarea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
          />

        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  /* ── Article List ── */
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={[styles.dergiIcon, { backgroundColor: `${colors.primary}18` }]}>
            <Ionicons name="newspaper" size={18} color={colors.primary} />
          </View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Dergi</Text>
        </View>
        {canWrite ? (
          <TouchableOpacity onPress={() => setView('create')} style={[styles.writeBtn, { backgroundColor: `${colors.primary}18` }]}>
            <Ionicons name="pencil" size={16} color={colors.primary} />
          </TouchableOpacity>
        ) : <View style={{ width: 36 }} />}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.listContent, { paddingBottom: botPad }]}>
        {!canWrite && (
          <View style={[styles.writersOnly, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}25` }]}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
            <Text style={[styles.writersOnlyText, { color: colors.mutedForeground }]}>
              Dergi yazarlığı yönetici tarafından yetkilendirilen kullanıcılara açıktır.
            </Text>
          </View>
        )}

        {dergiPosts.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="newspaper-outline" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Henüz dergi yazısı yok</Text>
          </View>
        ) : dergiPosts.map(post => {
          const liked = dergiLikedIds.has(post.id);
          return (
            <TouchableOpacity key={post.id} onPress={() => { setReading(post); setView('read'); }} activeOpacity={0.85}>
              <View style={[styles.articleCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {post.coverUrl ? (
                  <Image source={{ uri: post.coverUrl }} style={styles.cardCover} />
                ) : (
                  <LinearGradient colors={[post.coverColor, post.coverColor + '66']} style={styles.cardCover}>
                    <Text style={styles.cardCoverTitle} numberOfLines={2}>{post.title}</Text>
                  </LinearGradient>
                )}
                <View style={styles.cardBody}>
                  <View style={styles.cardMeta}>
                    <View style={[styles.catBadge, { backgroundColor: `${colors.primary}18` }]}>
                      <Text style={[styles.catText, { color: colors.primary }]}>{post.category}</Text>
                    </View>
                    <Text style={[styles.cardTime, { color: colors.mutedForeground }]}>{timeAgo(post.createdAt)}</Text>
                  </View>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>{post.title}</Text>
                  <Text style={[styles.cardExcerpt, { color: colors.mutedForeground }]} numberOfLines={3}>{post.excerpt}</Text>
                  <View style={styles.cardFooter}>
                    <UserAvatar name={post.authorName} color={post.authorAvatarColor} size={22} />
                    <Text style={[styles.cardAuthor, { color: colors.mutedForeground }]}>{post.authorName}</Text>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity onPress={() => toggleDergiLike(post.id)} style={styles.cardAction}>
                      <Ionicons name={liked ? 'heart' : 'heart-outline'} size={16} color={liked ? '#EC4899' : colors.mutedForeground} />
                      <Text style={[styles.cardActionText, { color: colors.mutedForeground }]}>{post.likesCount + (liked ? 1 : 0)}</Text>
                    </TouchableOpacity>
                    <View style={styles.cardAction}>
                      <Ionicons name="chatbubble-outline" size={16} color={colors.mutedForeground} />
                      <Text style={[styles.cardActionText, { color: colors.mutedForeground }]}>{post.commentsCount}</Text>
                    </View>
                    <Text style={[styles.cardWC, { color: colors.mutedForeground }]}>{wordCount(post.content).toLocaleString('tr')} k.</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  headerTitle: { flex: 1, fontFamily: 'Poppins_700Bold', fontSize: 17 },
  dergiIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  writeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  likeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, gap: 14 },
  writersOnly: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  writersOnlyText: { flex: 1, fontFamily: 'Poppins_400Regular', fontSize: 12, lineHeight: 18 },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontFamily: 'Poppins_400Regular', fontSize: 14 },
  articleCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  cardCover: { width: '100%', height: 160, alignItems: 'center', justifyContent: 'center', padding: 16 },
  cardCoverTitle: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: 18, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  cardBody: { padding: 14, gap: 6 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  catText: { fontFamily: 'Poppins_600SemiBold', fontSize: 10 },
  cardTime: { fontFamily: 'Poppins_400Regular', fontSize: 11 },
  cardTitle: { fontFamily: 'Poppins_700Bold', fontSize: 16 },
  cardExcerpt: { fontFamily: 'Poppins_400Regular', fontSize: 13, lineHeight: 20 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  cardAuthor: { fontFamily: 'Poppins_500Medium', fontSize: 12 },
  cardAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardActionText: { fontFamily: 'Poppins_400Regular', fontSize: 12 },
  cardWC: { fontFamily: 'Poppins_400Regular', fontSize: 11 },
  // Create form
  form: { padding: 16, gap: 12 },
  createCover: { width: '100%', height: 180, alignItems: 'center', justifyContent: 'center', gap: 8 },
  label: { fontFamily: 'Poppins_600SemiBold', fontSize: 10, letterSpacing: 1, marginTop: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipText: { fontFamily: 'Poppins_500Medium', fontSize: 12 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontFamily: 'Poppins_400Regular', fontSize: 14 },
  contentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  wcBadge: { fontFamily: 'Poppins_700Bold', fontSize: 12 },
  textarea: { borderWidth: 1, borderRadius: 12, padding: 14, fontFamily: 'Poppins_400Regular', fontSize: 15, lineHeight: 26, minHeight: 500 },
  pubBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  pubBtnText: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: 13 },
  // Read article
  articleContent: { padding: 0, paddingBottom: 40 },
  articleCover: { width: '100%', height: 220, alignItems: 'center', justifyContent: 'center', padding: 20 },
  articleCoverTitle: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: 22, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  articleMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 16 },
  articleDate: { fontFamily: 'Poppins_400Regular', fontSize: 12 },
  articleTitle: { fontFamily: 'Poppins_700Bold', fontSize: 22, lineHeight: 32, paddingHorizontal: 20, marginTop: 8 },
  articleAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12 },
  articleAuthor: { fontFamily: 'Poppins_500Medium', fontSize: 13, flex: 1 },
  articleWC: { fontFamily: 'Poppins_400Regular', fontSize: 12 },
  articleBody: { fontFamily: 'Poppins_400Regular', fontSize: 15, lineHeight: 28, paddingHorizontal: 20, paddingBottom: 16 },
  articleFooter: { flexDirection: 'row', gap: 20, paddingHorizontal: 20, paddingTop: 16, borderTopWidth: 1 },
  articleAction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  articleActionText: { fontFamily: 'Poppins_500Medium', fontSize: 14 },
});
