import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useGetAppBootstrap, useGetChatBootstrap } from '@workspace/api-client-react';
import { useAuth, useClerk } from '@clerk/expo';
import { Page, TopBar, Panel, Empty, LoadingState, ErrorState, Avatar, Action, ui } from '@/components/FavoriUI';
import { useColors } from '@/hooks/useColors';
import { UserPosts } from '@/components/UserPosts';

export default function ProfileScreen() {
  const colors = useColors();
  const { isSignedIn } = useAuth();
  const clerk = useClerk();
  const query = useGetAppBootstrap();
  const chat = useGetChatBootstrap({ query: { enabled: !!isSignedIn } });
  const profile = query.data?.profile;
  return <Page>
    <TopBar title="Profilim" right={<Pressable accessibilityLabel="Ayarlar" onPress={() => router.push('/settings' as Href)}><Feather name="settings" size={20} color={colors.deep} /></Pressable>} />
    {query.isLoading ? <LoadingState /> : query.isError ? <ErrorState retry={() => query.refetch()} /> : profile ? <>
      <Panel style={{ alignItems: 'center', paddingVertical: 25, gap: 12 }}>
        {profile.coverUrl ? <Image source={{ uri: profile.coverUrl }} style={{ width: '100%', height: 140, borderRadius: 14 }} contentFit="cover" /> : null}
        <Avatar name={profile.name} uri={profile.avatarUrl} size={86} />
        <View style={{ alignItems: 'center', gap: 4 }}><Text style={{ color: colors.deep, fontFamily: 'Georgia', fontSize: 24, fontWeight: '700' }}>{profile.name}</Text><Text style={{ color: colors.mutedForeground, fontSize: 13 }}>@{profile.handle}</Text></View>
        {profile.bio ? <Text style={[ui.body, { color: colors.deep, textAlign: 'center' }]}>{profile.bio}</Text> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', width: '100%', paddingTop: 10 }}>
          {[[profile.books, 'Kitap', '/(tabs)/books'], [profile.followers, 'Takipçi', '/followers'], [profile.following, 'Takip', '/followers?type=following']].map(([number, label, path]) => <Pressable key={String(label)} onPress={() => router.push(String(path) as Href)} style={{ alignItems: 'center', gap: 2 }}><Text style={{ color: colors.deep, fontWeight: '800', fontSize: 18 }}>{number}</Text><Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{label}</Text></Pressable>)}
        </View>
      </Panel>
      {isSignedIn ? <Panel style={{ gap: 10 }}><Text style={{ color: colors.deep, fontWeight: '700' }}>Profilinde paylaş</Text><Action label="Fotoğraf paylaş" icon="camera" quiet onPress={() => router.push('/compose?type=photo' as Href)} /><Action label="Yazı paylaş" icon="edit-3" quiet onPress={() => router.push('/compose?type=newsletter' as Href)} /><Action label="Yazı ve fotoğraf paylaş" icon="image" quiet onPress={() => router.push('/compose?type=photo' as Href)} /><Action label="Kitabını paylaş" icon="book-open" quiet onPress={() => router.push('/compose?type=book-review' as Href)} /><Action label="Özel videolar" icon="video" quiet onPress={() => router.push('/special' as Href)} /></Panel> : null}
      <View style={{ gap: 9 }}>
        {[
          ['book-open', 'Kitaplığım', '/(tabs)/books'],
          ['users', 'Takipçilerim', '/followers'],
          ['mail', 'Bültenlerim', '/newsletters'],
          ['shopping-bag', 'Afilli dükkânı', '/store'],
          ['message-circle', 'Mesajlarım', '/messages'],
          ['star', 'Afilli üyeliği', '/subscription'],
          ['volume-2', 'Kitabını öne çıkar', '/ads'],
        ].map(([icon, label, path]) => <Pressable key={path} onPress={() => router.push(path as Href)}><Panel style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}><Feather name={icon as any} size={18} color={colors.primary} /><Text style={{ flex: 1, color: colors.deep, fontWeight: '600' }}>{label}</Text><Feather name="chevron-right" size={18} color={colors.mutedForeground} /></Panel></Pressable>)}
      </View>
      {chat.data?.canManage ? <><Action label="Admin Paneli" icon="shield" onPress={() => router.push('/admin' as Href)} /><Action label="Tanıtım taleplerini değerlendir" icon="volume-2" quiet onPress={() => router.push('/ads' as Href)} /></> : null}
      {isSignedIn ? <UserPosts authorId={profile.id} /> : null}
      {isSignedIn ? <Action label="Oturumu kapat" icon="log-out" quiet onPress={() => void clerk.signOut()} /> : <Action label="Giriş yap veya kaydol" icon="log-in" onPress={() => router.push('/auth' as Href)} />}
    </> : <Empty title="Profilin hazır" description="Okuduklarını ve yazdıklarını paylaşmak için giriş yap." icon="user" />}
  </Page>;
}
