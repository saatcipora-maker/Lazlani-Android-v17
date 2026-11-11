import React, { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetBookComments, useAddBookComment, useGetPostComments, useAddPostComment,
  useListVideoComments, useAddVideoComment, useDeleteContentComment,
} from '@workspace/api-client-react';
import { Page, TopBar, Panel, Empty, LoadingState, ErrorState, Avatar, ui } from '@/components/FavoriUI';
import { useColors } from '@/hooks/useColors';
import { ConfirmDelete } from '@/components/ConfirmDelete';

export default function CommentsScreen() {
  const { id, type } = useLocalSearchParams<{ id: string; type?: string }>();
  const isPost = type === 'post';
  const isVideo = type === 'video';
  const colors = useColors();
  const { isSignedIn, userId } = useAuth();
  const client = useQueryClient();
  const bookComments = useGetBookComments(id || '', { query: { enabled: !!id && !isPost && !isVideo, queryKey: ['/api/books', id, 'comments'] } });
  const postComments = useGetPostComments(id || '', { query: { enabled: !!id && isPost, queryKey: ['/api/posts', id, 'comments'] } });
  const addBook = useAddBookComment();
  const addPost = useAddPostComment();
  const videoComments = useListVideoComments(id || '', { query: { enabled: !!id && isVideo && !!isSignedIn } });
  const addVideo = useAddVideoComment();
  const remove = useDeleteContentComment();
  const [error, setError] = useState('');
  const [body, setBody] = useState('');
  const query = isVideo ? videoComments : isPost ? postComments : bookComments;
  const comments = query.data ?? [];
  const send = () => {
    if (!isSignedIn) { router.push('/auth' as Href); return; }
    if (!body.trim()) return;
    const done = () => { setBody(''); setError(''); void client.invalidateQueries(); };
    if (isVideo) addVideo.mutate({ videoId: id || '', data: { body: body.trim() } }, { onSuccess: done, onError: (e) => setError(String(e)) });
    else if (isPost) addPost.mutate({ postId: id || '', data: { body: body.trim() } }, { onSuccess: done, onError: (e) => setError(String(e)) });
    else addBook.mutate({ bookId: id || '', data: { body: body.trim() } }, { onSuccess: done, onError: (e) => setError(String(e)) });
  };
  return <Page>
    <TopBar title="Yorumlar" back />
    {error ? <Text style={{ color: colors.destructive }}>{error}</Text> : null}
    {query.isLoading ? <LoadingState /> : query.isError ? <ErrorState retry={() => query.refetch()} /> : comments.length ? comments.map((comment) => <Panel key={comment.id} style={{ flexDirection: 'row', gap: 11, padding: 13 }}><Avatar name={comment.author} uri={comment.avatarUrl} size={37} /><View style={{ flex: 1, gap: 5 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}><Text style={{ color: colors.deep, fontWeight: '700' }}>{comment.author}</Text><Text style={[ui.caption, { color: colors.mutedForeground }]}>{new Date(comment.createdAt).toLocaleDateString('tr-TR')}</Text></View><Text style={[ui.body, { color: colors.deep }]}>{comment.body}</Text>{comment.authorId === userId ? <ConfirmDelete label="Yorumumu sil" description="Yorumun kalıcı olarak silinecek." busy={remove.isPending} onConfirm={() => remove.mutate({ commentId: comment.id }, { onSuccess: () => void client.invalidateQueries(), onError: (cause) => setError(String(cause)) })} /> : null}</View></Panel>) : <Empty title="İlk sözü sen söyle" description="Bu içerik için henüz yorum yok." icon="message-circle" />}
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 9, borderTopWidth: 1, borderColor: colors.border, paddingTop: 12 }}>
      <TextInput value={body} onChangeText={setBody} placeholder="Düşünceni yaz…" placeholderTextColor={colors.mutedForeground} multiline maxLength={2000} style={{ flex: 1, minHeight: 46, maxHeight: 130, borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 11, color: colors.deep, backgroundColor: colors.card }} />
      <Pressable accessibilityLabel="Yorumu gönder" onPress={send} disabled={!body.trim() || addBook.isPending || addPost.isPending || addVideo.isPending} style={{ width: 45, height: 45, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, opacity: body.trim() ? 1 : 0.5 }}><Feather name="send" size={18} color={colors.primaryForeground} /></Pressable>
    </View>
  </Page>;
}
