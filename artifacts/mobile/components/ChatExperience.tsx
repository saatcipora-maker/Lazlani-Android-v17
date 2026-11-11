import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useAuth } from '@clerk/expo';
import {
  useGetAppBootstrap, useGetChatBootstrap, useGetProfile, useListMessages, useListMyBooks,
  useListRoomMessages, useReadConversation, useSendMessage, useSendRoomMessage, useSetChatBlock,
  useRequestChatPhotoUpload, cancelChatPhotoUpload,
} from '@workspace/api-client-react';
import type { ChatUser } from '@workspace/api-client-react';
import { Action, Avatar, Empty, ErrorState, Field, LoadingState, Page, Panel, TopBar, ui } from './FavoriUI';
import { useColors } from '@/hooks/useColors';
import { ChatMedia } from './ChatMedia';

type RoomId = 'general' | 'afilli' | 'magazin' | 'serbest';
const emojis = ['😀', '❤️', '📚', '☕', '✨', '🔥', '👏', '🎉', '💡', '🖋️', '📖', '🌟'];

export function ChatExperience({ mode }: { mode: 'inbox' | 'room' }) {
  const colors = useColors();
  const { isSignedIn } = useAuth();
  const params = useLocalSearchParams<{ userId?: string }>();
  const me = useGetAppBootstrap();
  const setup = useGetChatBootstrap({ query: { enabled: !!isSignedIn, refetchInterval: 15000 } });
  const targetProfile = useGetProfile(params.userId || '', { query: { enabled: !!isSignedIn && !!params.userId } });
  const inbox = useListMessages({ query: { enabled: !!isSignedIn && mode === 'inbox', refetchInterval: 5000 } });
  const [roomId, setRoomId] = useState<RoomId>('general');
  const room = useListRoomMessages(roomId, { query: { enabled: !!isSignedIn && mode === 'room', refetchInterval: 4000 } });
  const books = useListMyBooks({ query: { enabled: !!isSignedIn && mode === 'room' } });
  const sendRoom = useSendRoomMessage();
  const requestPhoto = useRequestChatPhotoUpload();
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoBusy = useRef(false);
  const photoActive = useRef(true);
  useEffect(() => {
    photoActive.current = true;
    return () => { photoActive.current = false; };
  }, []);
  const sendPrivate = useSendMessage();
  const markRead = useReadConversation();
  const block = useSetChatBlock();
  const [selected, setSelected] = useState<ChatUser | null>(null);
  const [userMenu, setUserMenu] = useState<ChatUser | null>(null);
  const [panel, setPanel] = useState<'users' | 'rooms' | 'plus' | 'gifs' | 'emoji' | 'books' | null>(null);
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [zoom, setZoom] = useState<string | null>(null);
  const openedUserParam = useRef<string | null>(null);
  const currentRoom = setup.data?.rooms.find((item) => item.id === roomId);
  const users = setup.data?.users ?? [];
  const blocked = selected ? setup.data?.blockedIds.includes(selected.id) : false;
  const conversations = useMemo(() => {
    const latest = new Map<string, NonNullable<typeof inbox.data>[number]>();
    for (const message of inbox.data ?? []) if (message.otherId && !latest.has(message.otherId)) latest.set(message.otherId, message);
    return [...latest.values()].filter((message) => `${message.recipient} ${message.body}`.toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr')));
  }, [inbox.data, search]);
  const privateMessages = (inbox.data ?? []).filter((message) => message.otherId === selected?.id).slice().reverse();

  useEffect(() => {
    if (params.userId && users.length && openedUserParam.current !== params.userId) {
      const profile = targetProfile.data;
      const user = users.find((item) => item.id === params.userId) ?? (profile ? { id: profile.id, name: profile.name, handle: profile.handle, avatarUrl: profile.avatarUrl, online: false, isBlocked: false } : null);
      if (user) { setSelected(user); openedUserParam.current = params.userId; }
    }
  }, [params.userId, setup.data?.users, targetProfile.data]);
  useEffect(() => {
    if (selected && privateMessages.some((message) => message.recipientId === me.data?.profile.id && !message.isRead)) {
      markRead.mutate({ data: { profileId: selected.id } }, { onSuccess: () => { void inbox.refetch(); } });
    }
  }, [selected?.id, inbox.data?.[0]?.id]);

  function openConversation(user: ChatUser) {
    setUserMenu(null);
    if (mode === 'room') router.push({ pathname: '/messages', params: { userId: user.id } } as Href);
    else setSelected(user);
  }
  function sendRoomContent(data: { body: string; kind?: 'text' | 'image' | 'gif' | 'book'; uploadId?: string; gifId?: string; bookId?: string }) {
    sendRoom.mutate({ roomId, data }, {
      onSuccess: () => { setText(''); setPanel(null); void room.refetch(); void setup.refetch(); },
      onError: (error) => Alert.alert('Gönderilemedi', String(error)),
    });
  }
  async function pickPhoto() {
    if (photoBusy.current) return;
    if ((setup.data?.photoCount ?? 0) >= 5) { Alert.alert('Günlük sınır', 'Günde en fazla 5 fotoğraf paylaşabilirsin.'); return; }
    const selectedRoom = roomId;
    photoBusy.current = true;
    setUploadingPhoto(true);
    let uploadId: string | undefined;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.55, allowsEditing: true });
      const asset = result.assets?.[0];
      if (result.canceled || !asset || !photoActive.current) return;
      const file = Platform.OS === 'web' ? asset.file ?? await (await fetch(asset.uri)).blob() : new File(asset.uri);
      const contentType = file.type || asset.mimeType || 'image/jpeg';
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(contentType) || file.size <= 0 || file.size > 2250000) {
        Alert.alert('Fotoğraf geçersiz', 'JPEG, PNG, WebP veya GIF ve en fazla 2,25 MB fotoğraf seç.');
        return;
      }
      const upload = await requestPhoto.mutateAsync({ roomId: selectedRoom, data: { size: file.size, contentType: contentType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' } });
      uploadId = upload.uploadId;
      if (!photoActive.current) return;
      const response = Platform.OS === 'web'
        ? await fetch(upload.uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file })
        : await expoFetch(upload.uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file });
      if (!response.ok) throw new Error('Fotoğraf yüklenemedi.');
      if (!photoActive.current) return;
      await sendRoom.mutateAsync({ roomId: selectedRoom, data: { body: '', kind: 'image', uploadId } });
      uploadId = undefined;
      if (photoActive.current) { setPanel(null); void room.refetch(); void setup.refetch(); }
    } catch (error) {
      if (photoActive.current) { Alert.alert('Gönderilemedi', String(error)); void setup.refetch(); }
    } finally {
      // The server also cleans abandoned uploads when navigation/network loss
      // prevents this best-effort cancellation from reaching it.
      if (uploadId && photoActive.current) void cancelChatPhotoUpload(uploadId).catch(() => {});
      photoBusy.current = false;
      if (photoActive.current) setUploadingPhoto(false);
    }
  }
  const userRow = (user: ChatUser) => <Pressable key={user.id} onPress={() => setUserMenu(user)}><Panel style={{ padding: 10, flexDirection: 'row', gap: 10, alignItems: 'center' }}><Avatar name={user.name} uri={user.avatarUrl} size={35} /><View style={{ flex: 1 }}><Text style={{ color: colors.deep, fontWeight: '700' }}>{user.name}</Text><Text style={[ui.caption, { color: colors.mutedForeground }]}>{user.online ? 'Şimdi aktif' : `@${user.handle}`}</Text></View>{setup.data?.blockedIds.includes(user.id) ? <Text style={{ color: colors.destructive }}>Engelli</Text> : null}</Panel></Pressable>;

  if (!isSignedIn) return <Page><TopBar title="Afilli sohbet" back /><Empty title="Sohbete katıl" description="Mesajların hesabına bağlı ve kalıcı olarak saklanır. Devam etmek için giriş yap." icon="message-circle" /><Action label="Giriş yap" onPress={() => router.push('/auth' as Href)} /></Page>;
  return <Page>
    <TopBar title={selected ? selected.name : mode === 'room' ? 'Afilli' : 'Mesajlar'} back />
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <View style={{ flex: 1 }}><Action label={mode === 'room' ? `${users.filter((item) => item.online).length} aktif okur` : 'Yeni mesaj'} icon="users" quiet onPress={() => setPanel(panel === 'users' ? null : 'users')} /></View>
      <View style={{ flex: 1 }}><Action label={mode === 'room' ? 'Atilla · Odalar' : 'Yazar Sohbeti'} icon="message-circle" quiet onPress={() => mode === 'room' ? setPanel(panel === 'rooms' ? null : 'rooms') : router.push('/author-chat' as Href)} /></View>
    </View>
    {setup.isError ? <ErrorState retry={() => setup.refetch()} /> : null}
    {panel === 'users' ? <Panel><Text style={[ui.sectionTitle, { color: colors.deep }]}>Okurlar</Text>{users.filter((user) => user.id !== me.data?.profile.id).map(userRow)}</Panel> : null}
    {panel === 'rooms' ? <Panel><Text style={[ui.sectionTitle, { color: colors.deep }]}>Odalar</Text>{setup.data?.rooms.map((item) => <Pressable key={item.id} onPress={() => { setRoomId(item.id); setPanel(null); }}><Panel style={{ marginTop: 9, backgroundColor: item.id === roomId ? colors.secondary : colors.paper }}><Text style={{ color: colors.deep, fontWeight: '700' }}>{item.title}</Text><Text style={[ui.caption, { color: colors.mutedForeground }]}>{item.description}</Text></Panel></Pressable>)}</Panel> : null}
    {mode === 'inbox' && !selected ? <>
      <Field label="Mesajlarda ara" value={search} onChangeText={setSearch} placeholder="Ad veya mesaj…" />
      {inbox.isLoading ? <LoadingState /> : inbox.isError ? <ErrorState retry={() => inbox.refetch()} /> : conversations.length ? conversations.map((message) => <Pressable key={message.otherId} onPress={() => {
        const user = users.find((item) => item.id === message.otherId);
        setSelected(user ?? { id: message.otherId!, name: message.recipient || message.sender, handle: '', avatarUrl: message.avatarUrl, online: false, isBlocked: false });
      }}><Panel style={{ flexDirection: 'row', gap: 11, alignItems: 'center' }}><Avatar name={message.recipient || message.sender} uri={message.avatarUrl} /><View style={{ flex: 1 }}><Text style={{ color: colors.deep, fontWeight: '700' }}>{message.recipient || message.sender}</Text><Text numberOfLines={1} style={[ui.caption, { color: colors.mutedForeground }]}>{message.body}</Text></View>{message.recipientId === me.data?.profile.id && !message.isRead ? <Text style={{ color: colors.primary }}>●</Text> : null}</Panel></Pressable>) : <Empty title="Henüz mesaj yok" description="Yeni mesaj düğmesinden bir okur seç." icon="mail" />}
    </> : <>
      {selected ? <View style={{ flexDirection: 'row', gap: 8 }}><Action label="Gelen mesajlara dön" quiet onPress={() => setSelected(null)} /><Action label="Okur seçenekleri" quiet onPress={() => setUserMenu(selected)} /></View> : <Text style={[ui.caption, { color: colors.mutedForeground }]}>{currentRoom?.title || 'Afilli'} odası · {currentRoom?.description}</Text>}
      {(mode === 'room' ? room.isLoading : inbox.isLoading) ? <LoadingState /> : (mode === 'room' ? room.isError : inbox.isError) ? <ErrorState retry={() => mode === 'room' ? room.refetch() : inbox.refetch()} /> : <Panel style={{ gap: 12, minHeight: 250 }}>
        {mode === 'room' ? (room.data ?? []).map((message) => <View key={message.id} style={{ alignSelf: message.senderId === me.data?.profile.id ? 'flex-end' : 'flex-start', maxWidth: '90%', backgroundColor: message.senderId === me.data?.profile.id ? colors.secondary : colors.paper, padding: 11, borderRadius: 15 }}>
          <Pressable onPress={() => { const user = users.find((item) => item.id === message.senderId); if (user && user.id !== me.data?.profile.id) setUserMenu(user); }}><Text style={{ color: colors.deep, fontWeight: '700', fontSize: 11 }}>{message.sender}</Text></Pressable>
          {message.mediaUrl ? <Pressable onPress={() => setZoom(message.mediaUrl!)}><ChatMedia uri={message.mediaUrl} style={{ width: 210, height: 150, borderRadius: 10, marginTop: 6 }} contentFit="cover" /></Pressable> : null}
          {message.kind === 'book' && message.bookId ? <Pressable onPress={() => router.push(`/book/${message.bookId}` as Href)}><Text style={{ color: colors.deep, fontWeight: '700', marginTop: 7 }}>Kitap: {message.bookTitle || 'Kitabı görüntüle'} →</Text></Pressable> : null}
          {message.body ? <Text style={{ color: colors.deep, marginTop: 5 }}>{message.body}</Text> : null}
          <Text style={[ui.caption, { color: colors.mutedForeground, textAlign: 'right', marginTop: 3 }]}>{new Date(message.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</Text>
        </View>) : privateMessages.map((message) => <View key={message.id} style={{ alignSelf: message.senderId === me.data?.profile.id ? 'flex-end' : 'flex-start', backgroundColor: message.senderId === me.data?.profile.id ? colors.secondary : colors.paper, maxWidth: '90%', padding: 11, borderRadius: 15 }}><Text style={{ color: colors.deep }}>{message.body}</Text><Text style={[ui.caption, { color: colors.mutedForeground, textAlign: 'right' }]}>{new Date(message.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</Text></View>)}
        {(mode === 'room' ? !room.data?.length : !privateMessages.length) ? <Text style={[ui.body, { color: colors.mutedForeground, textAlign: 'center' }]}>Sohbeti ilk mesajınla başlat.</Text> : null}
      </Panel>}
      {panel === 'emoji' ? <Panel style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 15 }}>{emojis.map((emoji) => <Pressable key={emoji} onPress={() => { setText((value) => value + emoji); setPanel(null); }}><Text style={{ fontSize: 26 }}>{emoji}</Text></Pressable>)}</Panel> : null}
      {mode === 'room' && panel === 'plus' ? <Panel><Action label={uploadingPhoto ? 'Fotoğraf yükleniyor…' : `Fotoğraf paylaş (${setup.data?.photoCount ?? 0}/5)`} icon="camera" quiet disabled={uploadingPhoto || sendRoom.isPending || (setup.data?.photoCount ?? 0) >= 5} onPress={() => void pickPhoto()} /><View style={{ height: 8 }} /><Action label="Kitabını paylaş" icon="book" quiet onPress={() => setPanel('books')} /></Panel> : null}
      {mode === 'room' && panel === 'books' ? <Panel>{books.isLoading ? <LoadingState /> : books.data?.some((book) => book.status === 'published') ? books.data.filter((book) => book.status === 'published').map((book) => <Pressable key={book.id} disabled={sendRoom.isPending} onPress={() => sendRoomContent({ body: '', kind: 'book', bookId: book.id })}><Text style={{ color: colors.deep, padding: 10 }}>{book.title} →</Text></Pressable>) : <Text style={{ color: colors.mutedForeground }}>Önce bir kitap yayınla.</Text>}</Panel> : null}
      {mode === 'room' && panel === 'gifs' ? <Panel style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>{setup.data?.gifs.length ? setup.data.gifs.map((gif) => <Pressable key={gif.id} disabled={sendRoom.isPending} onPress={() => sendRoomContent({ body: '', kind: 'gif', gifId: gif.id })}><Image source={{ uri: gif.url }} style={{ width: 90, height: 80, borderRadius: 9 }} contentFit="cover" /></Pressable>) : <Text style={{ color: colors.mutedForeground }}>Yönetici henüz GIF eklemedi.</Text>}</Panel> : null}
      <Panel>
        {blocked ? <Text style={{ color: colors.destructive }}>Bu okuru engelledin. Mesaj göndermek için engeli kaldır.</Text> : <>
          <Field label={mode === 'room' ? 'Odaya mesaj yaz' : 'Özel mesaj'} value={text} onChangeText={setText} multiline maxLength={2000} placeholder={mode === 'room' ? 'Düşüncelerini paylaş…' : 'Yalnızca yazı ve emoji…'} />
          <View style={{ flexDirection: 'row', gap: 7, marginBottom: 10 }}>
            {mode === 'room' ? <Action label="Ekle" icon="plus" quiet onPress={() => setPanel(panel === 'plus' ? null : 'plus')} /> : null}
            <Action label="Emoji" icon="smile" quiet onPress={() => setPanel(panel === 'emoji' ? null : 'emoji')} />
            {mode === 'room' ? <Action label="GIF" quiet disabled={!currentRoom?.allowGifs} onPress={() => setPanel(panel === 'gifs' ? null : 'gifs')} /> : null}
          </View>
          <Action label={sendRoom.isPending || sendPrivate.isPending ? 'Gönderiliyor…' : 'Gönder'} icon="send" disabled={!text.trim() || sendRoom.isPending || sendPrivate.isPending} onPress={() => {
            if (mode === 'room') sendRoomContent({ body: text.trim(), kind: 'text' });
            else if (selected) sendPrivate.mutate({ data: { recipient: selected.id, body: text.trim() } }, { onSuccess: () => { setText(''); void inbox.refetch(); }, onError: (error) => Alert.alert('Gönderilemedi', String(error)) });
          }} />
        </>}
      </Panel>
    </>}
    <Modal visible={!!userMenu} transparent animationType="fade" onRequestClose={() => setUserMenu(null)}><View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 24 }}><Panel><Text style={[ui.sectionTitle, { color: colors.deep }]}>{userMenu?.name}</Text><View style={{ height: 12 }} /><Action label="Özel mesaj yaz" icon="mail" onPress={() => userMenu && openConversation(userMenu)} /><View style={{ height: 8 }} /><Action label="Profili gör" icon="user" quiet onPress={() => { if (userMenu) router.push(`/profile/${userMenu.id}` as Href); setUserMenu(null); }} /><View style={{ height: 8 }} /><Action label={userMenu && setup.data?.blockedIds.includes(userMenu.id) ? 'Engeli kaldır' : 'Bu okuru engelle'} icon="slash" quiet disabled={block.isPending} onPress={() => userMenu && block.mutate({ profileId: userMenu.id, data: { blocked: !setup.data?.blockedIds.includes(userMenu.id) } }, { onSuccess: () => { setUserMenu(null); void setup.refetch(); }, onError: (error) => Alert.alert('İşlem yapılamadı', String(error)) })} /><View style={{ height: 8 }} /><Action label="Kapat" quiet onPress={() => setUserMenu(null)} /></Panel></View></Modal>
    <Modal visible={!!zoom} transparent onRequestClose={() => setZoom(null)}><Pressable onPress={() => setZoom(null)} style={{ flex: 1, backgroundColor: '#000E', justifyContent: 'center' }}>{zoom ? <ChatMedia uri={zoom} style={{ width: '100%', height: '80%' }} contentFit="contain" /> : null}<Text style={{ color: 'white', textAlign: 'center' }}>Kapatmak için dokun</Text></Pressable></Modal>
  </Page>;
}
