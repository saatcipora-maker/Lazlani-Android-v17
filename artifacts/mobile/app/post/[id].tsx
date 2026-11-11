import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import { useDeleteContentPost, useGetContentPost, useTogglePostLike } from '@workspace/api-client-react';
import { Action, Avatar, ErrorState, LoadingState, Page, Panel, TopBar } from '@/components/FavoriUI';
import { ContentImage } from '@/components/ContentMedia';
import { ConfirmDelete } from '@/components/ConfirmDelete';
import { useColors } from '@/hooks/useColors';
import { shareContent } from '@/lib/shareContent';

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { isSignedIn, userId } = useAuth();
  const client = useQueryClient();
  const query = useGetContentPost(id || '', { query: { enabled: !!id } });
  const like = useTogglePostLike();
  const remove = useDeleteContentPost();
  const [feedback, setFeedback] = useState('');
  if (query.isLoading) return <Page><TopBar title="Paylaşım" back /><LoadingState /></Page>;
  if (query.isError || !query.data) return <Page><TopBar title="Paylaşım" back /><ErrorState retry={() => void query.refetch()} /></Page>;
  const post = query.data;
  return <Page><TopBar title={post.type === 'magazine' ? 'Afilli Dergi' : post.type === 'newsletter' ? 'Bülten' : 'Paylaşım'} back />
    <Pressable onPress={() => router.push(`/profile/${post.authorId || post.handle}` as Href)}><Panel style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Avatar name={post.author} uri={post.avatarUrl} /><View><Text style={{ color: colors.deep, fontWeight: '700' }}>{post.author}</Text><Text style={{ color: colors.mutedForeground }}>{new Date(post.createdAt).toLocaleString('tr-TR')}</Text></View></Panel></Pressable>
    {post.title ? <Text style={{ fontFamily: 'PlayfairDisplay_600SemiBold', fontSize: 27, color: colors.deep }}>{post.title}</Text> : null}
    {post.imageUrl ? <ContentImage uri={post.imageUrl} /> : null}
    {post.body ? <Text selectable style={{ color: colors.deep, fontSize: 17, lineHeight: 29 }}>{post.body}</Text> : null}
    {post.bookId ? <Action label="Paylaşılan kitabı aç" icon="book-open" quiet onPress={() => router.push(`/book/${post.bookId}` as Href)} /> : null}
    <Text style={{ color: colors.mutedForeground }}>{post.views} okunma · {post.likes} beğeni · {post.comments} yorum</Text>
    {post.allowLikes ? <Action label={post.likedByMe ? 'Beğeniyi kaldır' : 'Beğen'} icon="heart" quiet disabled={like.isPending} onPress={() => !isSignedIn ? router.push('/auth') : like.mutate({ postId: post.id }, { onSuccess: () => { void client.invalidateQueries(); }, onError: (error) => setFeedback(String(error)) })} /> : null}
    {post.allowComments ? <Action label="Yorumları aç" icon="message-circle" quiet onPress={() => router.push({ pathname: '/comments/[id]', params: { id: post.id, type: 'post' } })} /> : null}
    <Action label="Paylaşım bağlantısını paylaş" icon="share-2" quiet onPress={() => void shareContent(`/post/${post.id}`, post.title || 'Afilli paylaşımı').then(setFeedback).catch(() => setFeedback('Paylaşım açılamadı.'))} />
    {post.authorId === userId ? <Action label="Paylaşımı düzenle" icon="edit-3" quiet onPress={() => router.push({ pathname: '/compose', params: { id: post.id, type: post.type } })} /> : null}
    {isSignedIn && post.canManage ? <ConfirmDelete label="Paylaşımı sil" busy={remove.isPending} onConfirm={() => remove.mutate({ postId: post.id }, { onSuccess: () => { void client.invalidateQueries(); router.replace('/(tabs)'); }, onError: (error) => setFeedback(String(error)) })} /> : null}
    {feedback ? <Text accessibilityRole="alert" style={{ color: colors.mutedForeground }}>{feedback}</Text> : null}
  </Page>;
}
