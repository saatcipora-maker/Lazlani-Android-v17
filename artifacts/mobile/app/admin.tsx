import React, { useState } from 'react';
import { Alert, Modal, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@clerk/expo';
import { router, type Href } from 'expo-router';
import {
  useAddChatGifs, useDeleteChatGif, useGetAppBootstrap, useGetChatBootstrap,
  useListChatAdminUsers, useSetChatRoomPolicy, useSetChatUserStatus,
} from '@workspace/api-client-react';
import { Action, Empty, ErrorState, Field, LoadingState, Page, Panel, TopBar, ui } from '@/components/FavoriUI';
import { useColors } from '@/hooks/useColors';

export default function AdminScreen() {
  const colors = useColors();
  const { isSignedIn } = useAuth();
  const me = useGetAppBootstrap();
  const setup = useGetChatBootstrap({ query: { enabled: !!isSignedIn } });
  const users = useListChatAdminUsers({ query: { enabled: !!setup.data?.canManage } });
  const policy = useSetChatRoomPolicy();
  const add = useAddChatGifs();
  const remove = useDeleteChatGif();
  const status = useSetChatUserStatus();
  const [urls, setUrls] = useState('');
  const [category, setCategory] = useState('Genel');
  const [search, setSearch] = useState('');
  const [confirmation, setConfirmation] = useState<{ title: string; run: () => void } | null>(null);
  const fail = (error: unknown) => Alert.alert('İşlem yapılamadı', String(error));
  function upload(items: { url: string; category: string }[]) {
    if (!items.length || items.length > 20 || items.reduce((size, item) => size + item.url.length, 0) > 8000000) {
      Alert.alert('Yükleme sınırı', 'Tek seferde en fazla 20 GIF ve toplam 8 MB seçebilirsin.'); return;
    }
    add.mutate({ data: { items } }, { onSuccess: () => { setUrls(''); void setup.refetch(); }, onError: fail });
  }
  async function pickGifs() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, base64: true, quality: 1 });
    if (result.canceled) return;
    const items = result.assets.filter((asset) => asset.mimeType === 'image/gif' && !!asset.base64).map((asset) => ({ url: `data:image/gif;base64,${asset.base64}`, category: category.trim() || 'Genel' }));
    if (items.length !== result.assets.length) { Alert.alert('Yalnızca GIF', 'Bu alanda yalnızca GIF dosyaları yüklenebilir. Diğer görseller yüklenmedi.'); }
    if (items.length) upload(items);
  }
  if (!isSignedIn) return <Page><TopBar title="Yönetici paneli" back /><Empty title="Giriş gerekli" description="Yönetici araçları yalnızca atanmış yönetici hesabına açıktır." icon="lock" /><Action label="Giriş yap" onPress={() => router.push('/auth' as Href)} /></Page>;
  if (setup.isLoading) return <Page><TopBar title="Yönetici paneli" back /><LoadingState /></Page>;
  if (setup.isError) return <Page><TopBar title="Yönetici paneli" back /><ErrorState retry={() => setup.refetch()} /></Page>;
  if (!setup.data?.canManage) return <Page><TopBar title="Yönetici paneli" back /><Empty title="Yönetici yetkin yok" description="Bu hesap yönetici olarak atanmadı. Sabit veya varsayılan bir yönetici şifresi kullanılmaz." icon="shield" /><Text style={[ui.caption, { color: colors.mutedForeground }]}>Uygulama sahibi, yönetici hesabının Clerk kimliğini sunucudaki AFILLI_ADMIN_USER_ID ayarına ekleyebilir. Kendi hesap kimliğin Ayarlar ekranında bulunur.</Text></Page>;
  return <Page>
    <TopBar title="Admin Paneli" back />
    <Text style={{ color: colors.primary, fontWeight: '800' }}>Doğrulanmış Afilli yöneticisi</Text>
    <Panel><Text style={[ui.sectionTitle, { color: colors.deep }]}>Odalar Yönetimi</Text>{setup.data.rooms.map((room) => <View key={room.id} style={{ marginTop: 14 }}><Text style={{ color: colors.deep, fontWeight: '700', marginBottom: 7 }}>{room.title} · GIF paylaşımı</Text><Action label={room.allowGifs ? 'Açık · Kapat' : 'Kapalı · Aç'} quiet disabled={policy.isPending} onPress={() => policy.mutate({ roomId: room.id, data: { allowGifs: !room.allowGifs } }, { onSuccess: () => { void setup.refetch(); }, onError: fail })} /></View>)}</Panel>
    <Panel><Text style={[ui.sectionTitle, { color: colors.deep }]}>GIF Yönetimi ({setup.data.gifs.length})</Text><View style={{ height: 12 }} /><Field label="Kategori" value={category} onChangeText={setCategory} maxLength={40} /><Action label="Galeriden toplu GIF yükle" icon="image" quiet disabled={add.isPending} onPress={() => void pickGifs()} /><View style={{ height: 12 }} /><Field label="HTTPS GIF bağlantıları" value={urls} onChangeText={setUrls} multiline maxLength={10000} placeholder="Her satıra bir GIF bağlantısı" /><Action label={add.isPending ? 'Yükleniyor…' : 'Bağlantıları arşive ekle'} icon="plus" disabled={!urls.trim() || add.isPending} onPress={() => upload(urls.split(/\n/).map((url) => url.trim()).filter(Boolean).map((url) => ({ url, category: category.trim() || 'Genel' })))} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 14 }}>{setup.data.gifs.map((gif) => <View key={gif.id} style={{ width: 94, gap: 5 }}><Image source={{ uri: gif.url }} style={{ width: 94, height: 80, borderRadius: 10 }} contentFit="cover" /><Text numberOfLines={1} style={[ui.caption, { color: colors.deep }]}>{gif.category}</Text><Action label="Kaldır" quiet disabled={remove.isPending} onPress={() => setConfirmation({ title: 'Bu GIF arşivden kaldırılsın mı?', run: () => remove.mutate({ gifId: gif.id }, { onSuccess: () => { void setup.refetch(); }, onError: fail }) })} /></View>)}</View>
    </Panel>
    <Panel><Text style={[ui.sectionTitle, { color: colors.deep }]}>Tüm Kullanıcılar</Text><View style={{ height: 12 }} /><Field label="Kullanıcı ara" value={search} onChangeText={setSearch} placeholder="Ad veya kullanıcı adı" />{users.isLoading ? <LoadingState /> : users.isError ? <ErrorState retry={() => users.refetch()} /> : users.data?.filter((user) => `${user.name} ${user.handle}`.toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr'))).map((user) => <View key={user.id} style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.border, gap: 6 }}><Text style={{ color: colors.deep, fontWeight: '700' }}>{user.name}</Text><Text style={[ui.caption, { color: colors.mutedForeground }]}>@{user.handle} · {user.isBlocked ? 'Engelli' : 'Etkin'}</Text>{user.id !== me.data?.profile.id ? <Action label={user.isBlocked ? 'Hesabın engelini kaldır' : 'Hesabı engelle'} quiet disabled={status.isPending} onPress={() => setConfirmation({ title: `${user.name} için hesap ${user.isBlocked ? 'engeli kaldırılsın' : 'engellensin'} mı?`, run: () => status.mutate({ profileId: user.id, data: { blocked: !user.isBlocked } }, { onSuccess: () => { void users.refetch(); }, onError: fail }) })} /> : <Text style={[ui.caption, { color: colors.primary }]}>Yönetici hesabın</Text>}</View>)}</Panel>
    <Modal transparent visible={!!confirmation} onRequestClose={() => setConfirmation(null)}><View style={{ flex: 1, backgroundColor: '#0009', justifyContent: 'center', padding: 24 }}><Panel><Text style={[ui.sectionTitle, { color: colors.deep }]}>{confirmation?.title}</Text><Text style={[ui.body, { color: colors.mutedForeground, marginVertical: 12 }]}>Bu işlem uygulamadaki erişimi değiştirir. Devam etmek istediğine emin misin?</Text><Action label="Evet, onayla" onPress={() => { confirmation?.run(); setConfirmation(null); }} /><View style={{ height: 8 }} /><Action label="Vazgeç" quiet onPress={() => setConfirmation(null)} /></Panel></View></Modal>
  </Page>;
}
