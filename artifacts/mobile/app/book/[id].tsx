import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import { useGetBook, getGetBookQueryKey, useToggleBookLike, useToggleBookSave, useDeleteContentBook } from '@workspace/api-client-react';
import { Page, TopBar, Panel, Action, LoadingState, ErrorState, ui } from '@/components/FavoriUI';
import { useColors } from '@/hooks/useColors';
import { ConfirmDelete } from '@/components/ConfirmDelete';
import { ContentImage } from '@/components/ContentMedia';
import { shareContent } from '@/lib/shareContent';

export default function BookDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { isSignedIn, userId } = useAuth();
  const client = useQueryClient();
  const query = useGetBook(id || '', { query: { queryKey: getGetBookQueryKey(id || ''), enabled: !!id } });
  const like = useToggleBookLike();
  const save = useToggleBookSave();
  const remove = useDeleteContentBook();
  const [feedback, setFeedback] = useState('');
  if (query.isLoading) return <Page><TopBar title="Kitap" back /><LoadingState /></Page>;
  if (query.isError || !query.data) return <Page><TopBar title="Kitap" back /><ErrorState retry={() => query.refetch()} /></Page>;
  const book = query.data;
  const gate = (callback: () => void) => { if (!isSignedIn) router.push('/auth' as Href); else callback(); };
  return <Page>
    <TopBar title="Kitap detayı" back />
    <View style={{ alignItems: 'center', paddingVertical: 8 }}>
      {book.coverUrl ? <ContentImage uri={book.coverUrl} style={{ width: 150, height: 215, borderRadius: 14 }} /> : <View style={{ width: 150, height: 215, borderRadius: 14, backgroundColor: book.coverTone || colors.deep, padding: 18, justifyContent: 'space-between', borderWidth: 1, borderColor: colors.primary }}>
        <Text style={{ color: colors.accent, fontFamily: 'Georgia', fontSize: 30 }}>A</Text><View style={{ height: 1, width: 40, backgroundColor: colors.accent }} /><Text style={{ color: colors.paper, fontFamily: 'Georgia', fontSize: 20, fontWeight: '700' }}>{book.title}</Text>
      </View>}
    </View>
    <Text style={{ color: colors.deep, fontFamily: 'Georgia', fontSize: 28, fontWeight: '700', textAlign: 'center' }}>{book.title}</Text>
    <Pressable disabled={!book.authorId} onPress={() => router.push(`/profile/${book.authorId}` as Href)}><Text style={{ color: colors.mutedForeground, textAlign: 'center' }}>{book.author} · {book.category}</Text></Pressable>
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 22 }}><Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{book.reads} okuma</Text><Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{book.likes} beğeni</Text><Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{book.comments} yorum</Text></View>
    <Panel><Text style={[ui.body, { color: colors.deep }]}>{book.description || 'Yazarın bu eser için henüz bir tanıtım metni bulunmuyor.'}</Text></Panel>
    <Action label={book.progress > 0 ? 'Okumaya devam et' : 'Okumaya başla'} icon="book-open" onPress={() => router.push(`/read/${book.id}` as Href)} />
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 24 }}>
      <Pressable accessibilityLabel={book.likedByMe ? 'Beğeniyi kaldır' : 'Kitabı beğen'} onPress={() => gate(() => like.mutate({ bookId: book.id }, { onSuccess: () => { client.invalidateQueries({ queryKey: getGetBookQueryKey(book.id) }); client.invalidateQueries({ queryKey: ['/api/books'] }); } }))}><Feather name="heart" size={21} color={book.likedByMe ? colors.destructive : colors.deep} /></Pressable>
      <Pressable accessibilityLabel={book.savedByMe ? 'Kaydedilenlerden çıkar' : 'Kitabı kaydet'} onPress={() => gate(() => save.mutate({ bookId: book.id }, { onSuccess: () => { client.invalidateQueries({ queryKey: getGetBookQueryKey(book.id) }); client.invalidateQueries({ queryKey: ['/api/app/bootstrap'] }); } }))}><Feather name="bookmark" size={21} color={book.savedByMe ? colors.primary : colors.deep} /></Pressable>
      <Pressable accessibilityLabel="Yorumlar" onPress={() => router.push(`/comments/${book.id}` as Href)}><Feather name="message-circle" size={21} color={colors.deep} /></Pressable>
    </View>
    <Action label="Kitap bağlantısını paylaş" icon="share-2" quiet onPress={() => void shareContent(`/book/${book.id}`, book.title).then(setFeedback).catch(() => setFeedback('Paylaşım açılamadı.'))} />
    {book.authorId === userId ? <><Action label="Kitabımı düzenle" icon="edit-3" quiet onPress={() => router.push({ pathname: '/compose', params: { type: 'book', id: book.id } })} /><ConfirmDelete label="Kitabımı sil" description="Kitabın, yorumları ve bağlı okuma kayıtları kalıcı olarak silinecek. Bu işlem geri alınamaz." busy={remove.isPending} onConfirm={() => remove.mutate({ bookId: book.id }, { onSuccess: () => { void client.invalidateQueries(); router.replace('/(tabs)/books'); }, onError: (error) => setFeedback(String(error)) })} /></> : null}
    {feedback ? <Text style={{ color: colors.mutedForeground }}>{feedback}</Text> : null}
  </Page>;
}
