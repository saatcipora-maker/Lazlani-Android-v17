import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import type { Book, Post } from '@workspace/api-client-react';
import { ContentImage } from '@/components/ContentMedia';
import { shareContent } from '@/lib/shareContent';

export function Page({ children, scroll = true }: { children: React.ReactNode; scroll?: boolean }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const inner = <View style={[ui.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 110 }]}>{children}</View>;
  return <View style={[ui.page, { backgroundColor: colors.background }]}>{scroll ? <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{inner}</ScrollView> : inner}</View>;
}

export function TopBar({ title, back = false, right }: { title: string; back?: boolean; right?: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={ui.topbar}>
      {back ? <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} hitSlop={12} accessibilityLabel="Geri"><Feather name="arrow-left" size={21} color={colors.deep} /></Pressable> : <Text style={[ui.wordmark, { color: colors.deep }]}>Afilli</Text>}
      <Text style={[ui.topTitle, { color: colors.deep }]}>{title}</Text>
      <View style={{ minWidth: 28, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

export function SectionTitle({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  const colors = useColors();
  return <View style={ui.sectionLine}><Text style={[ui.sectionTitle, { color: colors.deep }]}>{title}</Text>{action ? <Pressable onPress={onPress}><Text style={[ui.actionText, { color: colors.primary }]}>{action}</Text></Pressable> : null}</View>;
}

export function Action({ label, onPress, icon, quiet = false, disabled = false }: { label: string; onPress: () => void; icon?: keyof typeof Feather.glyphMap; quiet?: boolean; disabled?: boolean }) {
  const colors = useColors();
  return <Pressable testID={`action-${label}`} onPress={onPress} disabled={disabled} style={({ pressed }) => [ui.action, { backgroundColor: quiet ? colors.card : colors.primary, borderColor: colors.primary, opacity: disabled ? 0.5 : pressed ? 0.78 : 1 }]}>{icon ? <Feather name={icon} size={16} color={quiet ? colors.deep : colors.primaryForeground} /> : null}<Text style={[ui.actionLabel, { color: quiet ? colors.deep : colors.primaryForeground }]}>{label}</Text></Pressable>;
}

export function Field({ label, value, onChangeText, placeholder, multiline = false, maxLength, keyboardType, secureTextEntry }: any) {
  const colors = useColors();
  return <View style={{ gap: 7, marginBottom: 14 }}><Text style={[ui.fieldLabel, { color: colors.deep }]}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} multiline={multiline} maxLength={maxLength} keyboardType={keyboardType} secureTextEntry={secureTextEntry} textAlignVertical={multiline ? 'top' : 'center'} style={[ui.input, { backgroundColor: colors.paper, borderColor: colors.border, color: colors.deep, minHeight: multiline ? 124 : 48 }]} /></View>;
}

export function Panel({ children, style }: { children: React.ReactNode; style?: any }) {
  const colors = useColors();
  return <View style={[ui.panel, { backgroundColor: colors.card, borderColor: colors.border }, style]}>{children}</View>;
}

export function Empty({ title, description, icon = 'book-open' }: { title: string; description: string; icon?: keyof typeof Feather.glyphMap }) {
  const colors = useColors();
  return <Panel style={ui.empty}><View style={[ui.emptyIcon, { backgroundColor: colors.secondary }]}><Feather name={icon} size={22} color={colors.deep} /></View><Text style={[ui.emptyTitle, { color: colors.deep }]}>{title}</Text><Text style={[ui.body, { color: colors.mutedForeground, textAlign: 'center' }]}>{description}</Text></Panel>;
}

export function LoadingState() {
  const colors = useColors();
  return <View style={{ gap: 14 }}>{[0, 1, 2].map((x) => <View key={x} style={[ui.skeleton, { backgroundColor: colors.secondary }]} />)}</View>;
}

export function ErrorState({ message, retry }: { message?: string; retry: () => void }) {
  const colors = useColors();
  return <Panel style={ui.empty}><Feather name="alert-circle" size={24} color={colors.destructive} /><Text style={[ui.body, { color: colors.deep, textAlign: 'center' }]}>{message || 'İçerik yüklenemedi. Bağlantınızı kontrol edip yeniden deneyin.'}</Text><Action label="Yeniden dene" icon="rotate-cw" onPress={retry} quiet /></Panel>;
}

export function Avatar({ name, uri, size = 42 }: { name: string; uri?: string | null; size?: number }) {
  const colors = useColors();
  return uri ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" /> : <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border }}><Text style={{ fontFamily: 'Georgia', color: colors.deep, fontSize: size * 0.38 }}>{name.slice(0, 1).toLocaleUpperCase('tr')}</Text></View>;
}

export function BookCard({ book, onPress, trailing }: { book: Book; onPress?: () => void; trailing?: React.ReactNode }) {
  const colors = useColors();
  return <Pressable onPress={onPress || (() => router.push(`/book/${book.id}` as never))} style={({ pressed }) => [ui.bookCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}>
    <View style={[ui.cover, { backgroundColor: book.coverTone || colors.deep }]}>
      {book.coverUrl ? <Image source={{ uri: book.coverUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <><Text style={ui.coverMark}>A</Text><View style={ui.coverRule} /><Text style={ui.coverText} numberOfLines={3}>{book.title}</Text></>}
    </View>
    <View style={{ flex: 1, paddingVertical: 3, justifyContent: 'space-between' }}>
      <View><Text style={[ui.bookTitle, { color: colors.deep }]} numberOfLines={2}>{book.title}</Text><Text style={[ui.bookAuthor, { color: colors.mutedForeground }]}>{book.author}</Text></View>
      {book.progress > 0 ? <View><View style={[ui.progressTrack, { backgroundColor: colors.secondary }]}><View style={[ui.progressFill, { backgroundColor: colors.primary, width: `${Math.min(100, book.progress)}%` }]} /></View><Text style={[ui.caption, { color: colors.mutedForeground }]}>{book.progress}% tamamlandı</Text></View> : <Text style={[ui.caption, { color: colors.mutedForeground }]}>{book.category}</Text>}
    </View>
    {trailing}
  </Pressable>;
}

export function PostCard({ post, onLike, onComments, onAuthor }: { post: Post; onLike?: () => void; onComments?: () => void; onAuthor?: () => void }) {
  const colors = useColors();
  const [feedback, setFeedback] = useState('');
  const open = () => router.push(`/post/${post.id}` as Href);
  return <Panel style={{ marginBottom: 13, padding: 16 }}>
    <Pressable style={ui.postAuthor} onPress={onAuthor ?? (() => router.push(`/profile/${post.authorId || post.handle}` as Href))}><Avatar name={post.author} uri={post.avatarUrl} /><View style={{ flex: 1 }}><Text style={[ui.authorName, { color: colors.deep }]}>{post.author}</Text><Text style={[ui.caption, { color: colors.mutedForeground }]}>@{post.handle} · {post.type === 'newsletter' ? 'Bülten' : post.type === 'magazine' ? 'Dergi yazısı' : post.type === 'book-review' ? 'Kitap değerlendirmesi' : 'Paylaşım'}</Text></View></Pressable>
    <Pressable onPress={open} accessibilityLabel="Paylaşımın tamamını aç">
      {post.title ? <Text style={[ui.postTitle, { color: colors.deep }]}>{post.title}</Text> : null}
      {post.body ? <Text style={[ui.body, { color: colors.deep }]} numberOfLines={5}>{post.body}</Text> : null}
      {post.imageUrl ? <ContentImage uri={post.imageUrl} style={ui.postImage} /> : null}
      <Text style={{ color: colors.primary, fontSize: 12, marginTop: 9 }}>Tamamını aç →</Text>
    </Pressable>
    {post.bookId ? <Pressable onPress={() => router.push(`/book/${post.bookId}` as Href)}><Text style={{ color: colors.primary, marginTop: 10 }}>Eklenen kitabı aç →</Text></Pressable> : null}
    <View style={ui.postActions}>
      {post.allowLikes ? <Pressable onPress={onLike} style={ui.inlineAction}><Feather name={post.likedByMe ? 'heart' : 'heart'} size={18} color={post.likedByMe ? colors.destructive : colors.deep} /><Text style={[ui.caption, { color: colors.deep }]}>{post.likes}</Text></Pressable> : null}
      {post.allowComments ? <Pressable onPress={onComments} style={ui.inlineAction}><Feather name="message-circle" size={18} color={colors.deep} /><Text style={[ui.caption, { color: colors.deep }]}>{post.comments}</Text></Pressable> : null}
      <Pressable accessibilityLabel="Paylaşım bağlantısını paylaş" onPress={() => void shareContent(`/post/${post.id}`, post.title || 'Afilli paylaşımı').then(setFeedback).catch(() => setFeedback('Paylaşım açılamadı. Yeniden dene.'))}><Feather name="share-2" size={18} color={colors.deep} /></Pressable>
      <View style={{ flex: 1 }} /><Text style={[ui.caption, { color: colors.mutedForeground }]}>{post.views} okunma</Text>
    </View>
    {feedback ? <Text style={{ color: colors.mutedForeground }}>{feedback}</Text> : null}
  </Panel>;
}

export const ui = StyleSheet.create({
  page: { flex: 1 }, content: { paddingHorizontal: 19, gap: 15 },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 46 },
  wordmark: { fontFamily: 'PlayfairDisplay_600SemiBold_Italic', fontSize: 25 }, topTitle: { fontFamily: 'PlayfairDisplay_600SemiBold', fontSize: 21, flex: 1, textAlign: 'center' },
  sectionLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }, sectionTitle: { fontFamily: 'Georgia', fontSize: 21, fontWeight: '600' }, actionText: { fontSize: 13, fontWeight: '700' },
  action: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, minHeight: 42, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' }, actionLabel: { fontWeight: '700', fontSize: 13 },
  fieldLabel: { fontSize: 13, fontWeight: '700' }, input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, lineHeight: 22 },
  panel: { borderWidth: 1, borderRadius: 20, padding: 15 }, empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 28, gap: 10 }, emptyIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }, emptyTitle: { fontFamily: 'Georgia', fontSize: 19, fontWeight: '600' }, body: { fontSize: 14, lineHeight: 22 }, caption: { fontSize: 11, lineHeight: 17 }, skeleton: { height: 120, borderRadius: 18, opacity: 0.65 },
  bookCard: { flexDirection: 'row', gap: 13, borderRadius: 18, borderWidth: 1, padding: 11, minHeight: 130, marginBottom: 10 }, cover: { width: 76, height: 108, borderRadius: 9, padding: 9, justifyContent: 'space-between', overflow: 'hidden' }, coverMark: { fontFamily: 'Georgia', fontSize: 19, color: '#F5EEE3' }, coverRule: { width: 24, height: 1, backgroundColor: '#D4AF37' }, coverText: { fontFamily: 'Georgia', color: '#FFF8EC', fontSize: 11, lineHeight: 14, fontWeight: '700' }, bookTitle: { fontFamily: 'Georgia', fontSize: 17, lineHeight: 21, fontWeight: '700' }, bookAuthor: { marginTop: 4, fontSize: 12 }, progressTrack: { height: 4, borderRadius: 5, overflow: 'hidden', marginBottom: 5 }, progressFill: { height: '100%', borderRadius: 5 },
  postAuthor: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }, authorName: { fontWeight: '700', fontSize: 14 }, postTitle: { fontFamily: 'Georgia', fontSize: 19, fontWeight: '700', marginBottom: 7 }, postImage: { height: 190, width: '100%', borderRadius: 14, marginTop: 12 }, postActions: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 14 }, inlineAction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});

export function LoadingInline() {
  const colors = useColors();
  return <View style={{ padding: 20, alignItems: 'center' }}><ActivityIndicator color={colors.primary} /></View>;
}
