import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useGetAppBootstrap, useListMessages, useTogglePostLike } from '@workspace/api-client-react';
import type { Book } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/expo';
import { Page, TopBar, SectionTitle, Panel, PostCard, LoadingState, ErrorState, Avatar, ui } from '@/components/FavoriUI';
import { useColors } from '@/hooks/useColors';
import { StoriesStrip } from '@/components/StoriesStrip';

function compactCount(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}b` : String(value);
}

function BookTile({ book }: { book: Book }) {
  const colors = useColors();
  return (
    <Pressable onPress={() => router.push(`/book/${book.id}` as Href)} style={{ width: 142 }}>
      <Panel style={{ padding: 10, alignItems: 'center', gap: 7 }}>
        <View style={{ width: 83, height: 116, borderRadius: 7, backgroundColor: book.coverTone || colors.deep, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
          {book.coverUrl ? <Image source={{ uri: book.coverUrl }} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} contentFit="cover" /> : <>
            <Text style={{ color: colors.accent, fontFamily: 'Georgia', fontSize: 17, fontWeight: '700' }}>A</Text>
            <View style={{ height: 1, width: 24, backgroundColor: colors.accent, marginVertical: 5 }} />
            <Text numberOfLines={4} style={{ color: colors.paper, fontFamily: 'Georgia', fontSize: 10, fontWeight: '700', textAlign: 'center' }}>{book.title}</Text>
          </>}
        </View>
        {book.isPromoted ? <Text style={{ color: colors.primary, fontSize: 9, fontWeight: '800' }}>ÖNE ÇIKAN</Text> : null}
        <Text numberOfLines={2} style={{ color: colors.deep, fontFamily: 'Georgia', fontSize: 13, fontWeight: '700', textAlign: 'center' }}>{book.title}</Text>
        <Text numberOfLines={1} style={[ui.caption, { color: colors.mutedForeground }]}>{book.author}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}><Feather name="eye" size={11} color={colors.mutedForeground} /><Text style={[ui.caption, { color: colors.mutedForeground }]}>{compactCount(book.reads)}</Text></View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}><Feather name="heart" size={11} color={colors.mutedForeground} /><Text style={[ui.caption, { color: colors.mutedForeground }]}>{compactCount(book.likes)}</Text></View>
        </View>
      </Panel>
    </Pressable>
  );
}

function BookStrip({ title, books }: { title: string; books: Book[] }) {
  if (!books.length) return null;
  return <>
    <SectionTitle title={title} action="Tümünü gör" onPress={() => router.push('/(tabs)/books' as Href)} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 4 }}>
      {books.map((book) => <BookTile key={book.id} book={book} />)}
    </ScrollView>
  </>;
}

export default function HomeScreen() {
  const colors = useColors();
  const { isSignedIn } = useAuth();
  const client = useQueryClient();
  const bootstrap = useGetAppBootstrap();
  const messages = useListMessages({ query: { enabled: !!isSignedIn, refetchInterval: 15000 } });
  const unreadMessages = messages.data?.filter((message) => message.recipientId === bootstrap.data?.profile.id && !message.isRead).length ?? 0;
  const like = useTogglePostLike();
  if (bootstrap.isLoading) return <Page><TopBar title="Bugün" /><LoadingState /></Page>;
  if (bootstrap.isError) return <Page><TopBar title="Bugün" /><ErrorState retry={() => bootstrap.refetch()} /></Page>;
  const data = bootstrap.data;
  const posts = data?.posts ?? [];
  return (
    <Page>
      <TopBar title="Ana Sayfa" right={<View style={{ flexDirection: 'row', gap: 14 }}><Pressable accessibilityLabel={`Mesajlar, ${unreadMessages} okunmamış`} onPress={() => router.push('/messages' as Href)}><Feather name="message-circle" size={20} color={colors.deep} />{unreadMessages ? <Text style={{ position: 'absolute', top: -9, right: -8, fontSize: 9, fontWeight: '700', backgroundColor: colors.primary, color: colors.deep, borderRadius: 8, minWidth: 15, textAlign: 'center' }}>{unreadMessages}</Text> : null}</Pressable><Pressable accessibilityLabel="Ara" onPress={() => router.push('/search' as Href)}><Feather name="search" size={20} color={colors.deep} /></Pressable></View>} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
        <Pressable onPress={() => router.push('/(tabs)/profile' as Href)}><Avatar name={data?.profile.name || 'Okur'} uri={data?.profile.avatarUrl} size={45} /></Pressable>
        <View style={{ flex: 1 }}><Text style={[ui.sectionTitle, { color: colors.deep, fontSize: 19 }]}>Merhaba, {data?.profile.name?.split(' ')[0] || 'okur'}</Text><Text style={[ui.caption, { color: colors.mutedForeground }]}>Bugün hangi hikâyeye dalıyoruz?</Text></View>
        <Pressable accessibilityLabel="Bildirimler" onPress={() => router.push('/(tabs)/notifications' as Href)}><Feather name="bell" size={20} color={colors.deep} /></Pressable>
      </View>
      <StoriesStrip />
      {data?.featuredBooks?.[0] ? <Pressable onPress={() => router.push(`/book/${data.featuredBooks[0].id}` as Href)}><Panel style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.deep, borderColor: colors.primary, padding: 18 }}>
        <View style={{ flex: 1, gap: 5 }}><Text style={{ color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 }}>HAFTANIN KEŞFİ</Text><Text style={{ color: colors.paper, fontFamily: 'Georgia', fontSize: 21, fontWeight: '700' }}>{data.featuredBooks[0].title}</Text><Text style={{ color: '#E8DCCB', fontSize: 12 }}>{data.featuredBooks[0].author} · {data.featuredBooks[0].category}</Text></View>
        <Feather name="arrow-up-right" size={22} color={colors.accent} />
      </Panel></Pressable> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 9 }}>
        {[
          ['shopping-bag', 'Mağazam', '/store'],
          ['feather', 'Dergi', '/magazine'],
          ['mail', 'Bültenler', '/newsletters'],
          ['star', 'Özel', '/special'],
        ].map(([icon, label, path]) => <Pressable key={path} onPress={() => router.push(path as Href)} style={{ width: 93, minHeight: 55, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, justifyContent: 'center', alignItems: 'center', gap: 5 }}><Feather name={icon as never} size={17} color={colors.primary} /><Text style={{ color: colors.deep, fontSize: 10, fontWeight: '700' }}>{label}</Text></Pressable>)}
      </ScrollView>
      <BookStrip title="Öne Çıkan Kitaplar" books={data?.featuredBooks ?? []} />
      <BookStrip title="Size Özel" books={data?.personalBooks ?? []} />
      <BookStrip title="Yeni Kitaplar" books={data?.newBooks ?? []} />
      <SectionTitle title="Topluluktan" action="Dergi" onPress={() => router.push('/magazine' as Href)} />
      {posts.length ? posts.map((post) => <PostCard key={post.id} post={post} onLike={() => { if (!isSignedIn) router.push('/auth' as Href); else like.mutate({ postId: post.id }, { onSuccess: () => { client.invalidateQueries({ queryKey: ['/api/app/bootstrap'] }); client.invalidateQueries({ queryKey: ['/api/posts'] }); } }); }} onComments={() => router.push({ pathname: '/comments/[id]', params: { id: post.id, type: 'post' } } as Href)} onAuthor={() => router.push(`/profile/${post.handle}` as Href)} />) : <Panel><Text style={{ color: colors.mutedForeground, textAlign: 'center' }}>Akışın ilk yazısı yakında burada.</Text></Panel>}
      <View style={{ height: 20 }} />
    </Page>
  );
}
