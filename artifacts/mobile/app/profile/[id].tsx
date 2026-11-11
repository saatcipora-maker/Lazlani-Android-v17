import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import { useGetProfile, useToggleFollow, useListBooks } from '@workspace/api-client-react';
import { Page, TopBar, Panel, LoadingState, ErrorState, Empty, Avatar, Action, BookCard, SectionTitle, ui } from '@/components/FavoriUI';
import { useColors } from '@/hooks/useColors';
import { UserPosts } from '@/components/UserPosts';

export default function PublicProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { isSignedIn } = useAuth();
  const client = useQueryClient();
  const profile = useGetProfile(id || '', { query: { enabled: !!id, queryKey: ['/api/profiles', id] } });
  const follow = useToggleFollow();
  const books = useListBooks();
  if (profile.isLoading) return <Page><TopBar title="Okur profili" back /><LoadingState /></Page>;
  if (profile.isError || !profile.data) return <Page><TopBar title="Okur profili" back /><ErrorState retry={() => profile.refetch()} /></Page>;
  const person = profile.data;
  return <Page><TopBar title="Okur profili" back /><Panel style={{ alignItems: 'center', paddingVertical: 24, gap: 10 }}><Avatar name={person.name} uri={person.avatarUrl} size={82} /><Text style={{ color: colors.deep, fontFamily: 'Georgia', fontSize: 23, fontWeight: '700' }}>{person.name}</Text><Text style={{ color: colors.mutedForeground }}>@{person.handle}</Text>{person.bio ? <Text style={[ui.body, { color: colors.deep, textAlign: 'center' }]}>{person.bio}</Text> : null}<View style={{ flexDirection: 'row', gap: 28, marginTop: 7 }}><Text style={{ color: colors.deep }}>{person.followers} takipçi</Text><Text style={{ color: colors.deep }}>{person.books} kitap</Text></View></Panel>
    {!person.isCurrentUser ? <Action label={person.isFollowing ? 'Takibi bırak' : 'Takip et'} icon={person.isFollowing ? 'user-check' : 'user-plus'} quiet={person.isFollowing} onPress={() => { if (!isSignedIn) router.push('/auth' as Href); else follow.mutate({ profileId: person.id }, { onSuccess: () => client.invalidateQueries({ queryKey: ['/api/profiles', id] }) }); }} /> : null}
    {person.coverUrl ? <Image source={{ uri: person.coverUrl }} style={{ width: '100%', height: 130, borderRadius: 14 }} contentFit="cover" /> : null}
    {!person.isCurrentUser ? <Pressable onPress={() => router.push({ pathname: '/messages', params: { userId: person.id } } as Href)}><Panel style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Feather name="message-circle" color={colors.primary} /><Text style={{ color: colors.deep, fontWeight: '700' }}>Mesaj gönder</Text></Panel></Pressable> : null}
    <SectionTitle title="Yayınladığı Kitaplar" />
    {books.isLoading ? <LoadingState /> : books.isError ? <ErrorState retry={() => books.refetch()} /> : books.data?.some((book) => book.authorId === person.id) ? books.data.filter((book) => book.authorId === person.id).map((book) => <BookCard key={book.id} book={book} />) : <Empty title="Henüz yayınlanmış kitap yok" description="Bu okurun kitapları yayınlandığında burada görünür." icon="book-open" />}
    <UserPosts authorId={person.id} />
  </Page>;
}
