import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useAuth, useClerk } from '@clerk/expo';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { AccountAccessCard } from '@/components/AccountAccessCard';
import { Image } from 'expo-image';
import { useQueryClient } from '@tanstack/react-query';
import {
  getSearchAppQueryKey, useSearchApp, useListPosts, useGetAppBootstrap, useGetMemberships,
  useListStoreProducts, useCreateStoreProduct, useCreateStoreCheckout, useTogglePostLike,
  useGetProfileConnections, useListMessages, useSendMessage, useListBooks, useCreateBookAd,
  useUpdateMyProfile, useListRoomMessages, useSendRoomMessage,
} from '@workspace/api-client-react';
import type { StoreProductInputCategory } from '@workspace/api-client-react';
import { Page, TopBar, SectionTitle, Panel, Empty, LoadingState, ErrorState, Action, Field, PostCard, BookCard, Avatar, ui } from '@/components/FavoriUI';
import { useColors } from '@/hooks/useColors';

function needSignIn(isSignedIn?: boolean) {
  if (!isSignedIn) { router.push('/auth' as Href); return false; }
  return true;
}

export default function RouteScreen() {
  const params = useLocalSearchParams<{ slug: string; id?: string; type?: string }>();
  const slug = params.slug;
  const colors = useColors();
  const { isSignedIn } = useAuth();
  const clerk = useClerk();
  const client = useQueryClient();
  const bootstrap = useGetAppBootstrap();
  const membership = useGetMemberships();
  const posts = useListPosts({ type: slug === 'magazine' ? 'magazine' : slug === 'newsletters' ? 'newsletter' : undefined });
  const [search, setSearch] = useState('');
  const searchResult = useSearchApp({ query: search.trim() || 'kitap' }, { query: { enabled: slug === 'search' && search.trim().length > 0, queryKey: getSearchAppQueryKey({ query: search.trim() || 'kitap' }) } });
  const postLike = useTogglePostLike();
  const productQuery = useListStoreProducts();
  const createProduct = useCreateStoreProduct();
  const checkout = useCreateStoreCheckout();
  const [showProductForm, setShowProductForm] = useState(false);
  const [productTitle, setProductTitle] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [productStock, setProductStock] = useState('1');
  const [productDescription, setProductDescription] = useState('');
  const [productCategory, setProductCategory] = useState<StoreProductInputCategory>('Kitap');
  const [productImage, setProductImage] = useState<string | null>(null);
  const connectionType = params.type === 'following' ? 'following' : 'followers';
  const connections = useGetProfileConnections(bootstrap.data?.profile.id || '', connectionType, { query: { enabled: slug === 'followers' && !!isSignedIn && !!bootstrap.data?.profile.id, queryKey: ['/api/profiles', bootstrap.data?.profile.id, 'connections', connectionType] } });
  const messageQuery = useListMessages({ query: { enabled: slug === 'messages', queryKey: ['/api/messages'] } });
  const sendMessage = useSendMessage();
  const [roomId, setRoomId] = useState<'afilli' | 'magazin' | 'serbest'>('afilli');
  const roomMessages = useListRoomMessages(roomId, { query: { enabled: slug === 'author-chat' && !!isSignedIn, refetchInterval: 5000 } });
  const sendRoomMessage = useSendRoomMessage();
  const [recipient, setRecipient] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const bookList = useListBooks();
  const createAd = useCreateBookAd();
  const [adBook, setAdBook] = useState('');
  const [adBudget, setAdBudget] = useState('');
  const updateProfile = useUpdateMyProfile();
  const [profileName, setProfileName] = useState('');
  const [profileBio, setProfileBio] = useState('');
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [profileCover, setProfileCover] = useState<string | null>(null);

  useEffect(() => {
    const profile = bootstrap.data?.profile;
    if (!profile) return;
    setProfileName(profile.name);
    setProfileBio(profile.bio ?? '');
    setProfileAvatar(profile.avatarUrl ?? null);
    setProfileCover(profile.coverUrl ?? null);
  }, [bootstrap.data?.profile.id]);

  const retryAll = () => { void bootstrap.refetch(); void posts.refetch(); void productQuery.refetch(); };
  const addProductImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.7, allowsEditing: true });
    if (!result.canceled && result.assets[0]?.base64) setProductImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
  };
  const addProfileImage = async (target: 'avatar' | 'cover' = 'avatar') => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.62, allowsEditing: true, aspect: target === 'cover' ? [3, 1] : [1, 1] });
    if (!result.canceled && result.assets[0]?.base64) {
      const data = `data:image/jpeg;base64,${result.assets[0].base64}`;
      if (data.length > 3000000) { Alert.alert('Görsel çok büyük', 'Daha küçük bir görsel seç.'); return; }
      if (target === 'cover') setProfileCover(data); else setProfileAvatar(data);
    }
  };

  if (slug === 'search') return <Page>
    <TopBar title="Keşfet" back />
    <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 14, gap: 9 }}>
      <Feather name="search" size={18} color={colors.mutedForeground} /><TextInput value={search} onChangeText={setSearch} placeholder="Kitap, yazar veya okur ara" placeholderTextColor={colors.mutedForeground} autoFocus style={{ flex: 1, height: 48, color: colors.deep }} />
      {search ? <Pressable onPress={() => setSearch('')}><Feather name="x-circle" size={18} color={colors.mutedForeground} /></Pressable> : null}
    </View>
    {!search.trim() ? <><SectionTitle title="Nereye gidelim?" /><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>{['Roman', 'Şiir', 'Öykü', 'Deneme', 'Çocuk'].map((x) => <Pressable key={x} onPress={() => setSearch(x)}><Text style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border, color: colors.deep, backgroundColor: colors.card, paddingHorizontal: 15, paddingVertical: 9 }}>{x}</Text></Pressable>)}</View><Empty title="Merak ettiğin şeyi yaz" description="Kitapları, yazarları ve topluluktaki yazıları birlikte bul." icon="compass" /></> : searchResult.isLoading ? <LoadingState /> : searchResult.isError ? <ErrorState retry={() => searchResult.refetch()} /> : <>
      <SectionTitle title="Kitaplar" />
      {searchResult.data?.books.length ? searchResult.data.books.map((book) => <BookCard key={book.id} book={book} />) : <Text style={[ui.body, { color: colors.mutedForeground }]}>Bu aramada kitap bulunamadı.</Text>}
      <SectionTitle title="Okurlar" />
      {searchResult.data?.profiles.map((profile) => <Pressable key={profile.id} onPress={() => router.push(`/profile/${profile.id}` as Href)}><Panel style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Avatar name={profile.name} uri={profile.avatarUrl} /><View style={{ flex: 1 }}><Text style={{ color: colors.deep, fontWeight: '700' }}>{profile.name}</Text><Text style={[ui.caption, { color: colors.mutedForeground }]}>@{profile.handle}</Text></View><Feather name="arrow-up-right" color={colors.primary} /></Panel></Pressable>)}
      <SectionTitle title="Yazılar" />
      {searchResult.data?.posts.map((post) => <PostCard key={post.id} post={post} onLike={() => needSignIn(isSignedIn) && postLike.mutate({ postId: post.id })} onComments={() => router.push({ pathname: '/comments/[id]', params: { id: post.id, type: 'post' } } as Href)} />)}
    </>}
  </Page>;

  if (slug === 'magazine' || slug === 'newsletters') return <Page>
    <TopBar title={slug === 'magazine' ? 'Afilli dergi' : 'Bültenler'} back right={<Pressable accessibilityLabel="Yazı yaz" onPress={() => { if (needSignIn(isSignedIn)) router.push(`/compose?type=${slug === 'magazine' ? 'magazine' : 'newsletter'}` as Href); }}><Feather name="edit-3" size={19} color={colors.deep} /></Pressable>} />
    <Action label={slug === 'magazine' ? 'Dergi yazısı oluştur' : 'Bültenini paylaş'} icon="edit-3" onPress={() => needSignIn(isSignedIn) && router.push(`/compose?type=${slug === 'magazine' ? 'magazine' : 'newsletter'}` as Href)} />
    <Panel style={{ backgroundColor: colors.deep, borderColor: colors.primary, padding: 20 }}><Text style={{ fontSize: 10, color: colors.accent, letterSpacing: 1.5, fontWeight: '800' }}>{slug === 'magazine' ? 'OKURDAN OKURA' : 'POSTA KUTUNDAN'}</Text><Text style={{ fontFamily: 'Georgia', color: colors.paper, fontSize: 24, marginTop: 8, fontWeight: '700' }}>{slug === 'magazine' ? 'Söze yer aç.' : 'Bir mektup, bir okur.'}</Text><Text style={{ color: '#E8DCCB', lineHeight: 20, marginTop: 5 }}>{slug === 'magazine' ? 'Edebiyat, hayat ve kitaplar üzerine topluluktan yazılar.' : 'Bağımsız yazarların okurlarına gönderdiği notlar.'}</Text></Panel>
    <Text style={[ui.body, { color: colors.mutedForeground }]}>Kayıtlı tüm okurlar ücretsiz yazabilir. {slug === 'magazine' ? '3.000' : '1.000'} kelimeye kadar metin, fotoğraf ve kendi kitabını paylaş.</Text>
    <Image source={slug === 'magazine' ? require('../assets/images/reading-scene.jpg') : require('../assets/images/newsletter-scene.jpg')} style={{ width: '100%', height: 172, borderRadius: 18, borderWidth: 1, borderColor: colors.border }} contentFit="cover" />
    {posts.isLoading ? <LoadingState /> : posts.isError ? <ErrorState retry={() => posts.refetch()} /> : posts.data?.length ? posts.data.map((post) => <PostCard key={post.id} post={post} onLike={() => needSignIn(isSignedIn) && postLike.mutate({ postId: post.id }, { onSuccess: () => client.invalidateQueries({ queryKey: ['/api/posts'] }) })} onComments={() => router.push({ pathname: '/comments/[id]', params: { id: post.id, type: 'post' } } as Href)} onAuthor={() => router.push(`/profile/${post.handle}` as Href)} />) : <Empty title="İlk sayfa seni bekliyor" description="Topluluğun yazıları yayımlandıkça burada buluşacak." icon="feather" />}
  </Page>;

  if (slug === 'store') return <Page>
    <TopBar title="Afilli dükkânı" back right={productQuery.data?.canManage && isSignedIn ? <Pressable accessibilityLabel="Ürün ekle" onPress={() => setShowProductForm((open) => !open)}><Feather name="plus-circle" size={21} color={colors.deep} /></Pressable> : null} />
    <Text style={[ui.body, { color: colors.mutedForeground }]}>Okuma ritüeline eşlik edecek seçkiler.</Text>
    {productQuery.data?.configured === false ? <Panel><Text style={{ color: colors.deep, fontWeight: '700' }}>Mağaza şu an hazır değil</Text><Text style={[ui.body, { color: colors.mutedForeground, marginTop: 6 }]}>{productQuery.data.message}</Text></Panel> : null}
    {productQuery.data?.configured && !productQuery.data.canManage ? <Panel><Text style={{ color: colors.deep, fontWeight: '700' }}>Ürünleri yalnızca mağaza sahibi ekleyebilir</Text><Text style={[ui.body, { color: colors.mutedForeground, marginTop: 6 }]}>Mağaza sahibi hesabı henüz uygulamaya tanımlanmamış olabilir. Yayındaki ürünleri görüntüleyip Shopify ödeme sayfasına devam edebilirsiniz.</Text></Panel> : null}
    {showProductForm ? <Panel>
      <SectionTitle title="Ürününü ekle" />
      <Field label="Ürün adı" value={productTitle} onChangeText={setProductTitle} placeholder="Örn. Kumaş kaplı defter" maxLength={120} />
      <Field label="Açıklama" value={productDescription} onChangeText={setProductDescription} placeholder="Ürün hakkında kısa bilgi" multiline maxLength={2000} />
      <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Field label={`Fiyat (${productQuery.data?.currency || 'mağaza para birimi'})`} value={productPrice} onChangeText={setProductPrice} keyboardType="decimal-pad" placeholder="245" /></View><View style={{ flex: 1 }}><Field label="Stok" value={productStock} onChangeText={setProductStock} keyboardType="number-pad" placeholder="1" /></View></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 13 }}>{(['Kitap', 'Defter', 'Kalem', 'Ajanda', 'Kitap_Ayracı', 'Kalemlik'] as StoreProductInputCategory[]).map((category) => <Pressable key={category} onPress={() => setProductCategory(category)}><Text style={{ overflow: 'hidden', borderRadius: 16, borderWidth: 1, borderColor: productCategory === category ? colors.primary : colors.border, backgroundColor: productCategory === category ? colors.secondary : colors.card, color: colors.deep, paddingHorizontal: 10, paddingVertical: 7, fontSize: 11 }}>{category.replace('_', ' ')}</Text></Pressable>)}</View>
      <Action label={productImage ? 'Görsel seçildi' : 'Galeriden görsel seç'} icon="image" quiet onPress={() => void addProductImage()} />
      <View style={{ height: 10 }} />
      <Action label={createProduct.isPending ? 'Kaydediliyor…' : 'Shopify’da oluştur'} disabled={createProduct.isPending || !productTitle || Number(productPrice) <= 0} onPress={() => createProduct.mutate({ data: { title: productTitle, description: productDescription, price: Number(productPrice), quantity: Number(productStock), category: productCategory, imageUrl: productImage } }, { onSuccess: () => { setShowProductForm(false); setProductTitle(''); setProductDescription(''); setProductImage(null); client.invalidateQueries({ queryKey: ['/api/store/products'] }); }, onError: (error) => Alert.alert('Ürün oluşturulamadı', String(error)) })} />
    </Panel> : null}
    {productQuery.isLoading ? <LoadingState /> : productQuery.isError ? <ErrorState retry={() => productQuery.refetch()} /> : productQuery.data?.products?.length ? productQuery.data.products.map((product) => <Panel key={product.id} style={{ padding: 12, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
      <View style={{ width: 83, height: 98, borderRadius: 12, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>{product.imageUrl ? <Image source={{ uri: product.imageUrl }} style={{ width: 83, height: 98 }} contentFit="cover" /> : <Feather name="shopping-bag" size={24} color={colors.deep} />}</View>
      <View style={{ flex: 1, gap: 5 }}><Text style={{ color: colors.deep, fontFamily: 'Georgia', fontSize: 17, fontWeight: '700' }}>{product.title}</Text><Text numberOfLines={2} style={[ui.caption, { color: colors.mutedForeground }]}>{product.description}</Text><Text style={{ color: colors.deep, fontWeight: '800' }}>{product.price.toLocaleString('tr-TR')} {product.currency}</Text><Action label={product.availableForSale ? 'Shopify’dan satın al' : 'Stokta yok'} icon="shopping-bag" disabled={!product.availableForSale || !product.variantId || checkout.isPending} onPress={() => product.variantId && checkout.mutate({ data: { variantId: product.variantId, quantity: 1 } }, { onSuccess: (result) => void WebBrowser.openBrowserAsync(result.checkoutUrl), onError: (error) => Alert.alert('Ödeme açılamadı', String(error)) })} /></View>
    </Panel>) : productQuery.data?.configured !== false ? <Empty title="Seçki hazırlanıyor" description="Dükkânın ürünleri Shopify kataloğundan burada görünür." icon="shopping-bag" /> : null}
  </Page>;

  if (slug === 'subscription') return <Page>
    <TopBar title="Afilli üyeliği" back />
    <Panel style={{ backgroundColor: colors.deep, borderColor: colors.primary, paddingVertical: 24 }}><Text style={{ color: colors.accent, fontWeight: '800', letterSpacing: 1.3 }}>AFİLLİ OKURU</Text><Text style={{ color: colors.paper, fontFamily: 'Georgia', fontSize: 27, fontWeight: '700', marginTop: 8 }}>Tüm okurlara ücretsiz.</Text><Text style={{ color: '#E8DCCB', lineHeight: 22, marginTop: 9 }}>Dergi yaz, bülten paylaş, hikâyeni anlat ve Özel videoları izle. Abonelik ya da ödeme gerekmez.</Text></Panel>
    {!isSignedIn ? <Action label="Ücretsiz kayıt ol veya giriş yap" onPress={() => router.push('/auth' as Href)} /> : <><Action label="Dergi yazısı oluştur" icon="edit-3" onPress={() => router.push('/compose?type=magazine' as Href)} /><Action label="Özel videoları aç" icon="video" quiet onPress={() => router.push('/special' as Href)} /></>}
    <Text style={[ui.body, { color: colors.mutedForeground }]}>Dükkândaki fiziksel ürünler ayrı olarak Shopify üzerinden satılır. Ürünleri yalnızca mağaza sahibi yönetebilir.</Text>
  </Page>;

  if (slug === 'followers') {
    const list = connections.data ?? [];
    return <Page><TopBar title={connectionType === 'following' ? 'Takip ettiklerim' : 'Takipçilerim'} back /><Text style={[ui.body, { color: colors.mutedForeground }]}>Birlikte okuyan insanlar.</Text>{!isSignedIn ? <Action label="Giriş yap" onPress={() => router.push('/auth')} /> : connections.isLoading || bootstrap.isLoading ? <LoadingState /> : connections.isError ? <ErrorState retry={() => connections.refetch()} /> : list.length ? list.map((profile) => <Pressable key={profile.id} onPress={() => router.push(`/profile/${profile.id}` as Href)}><Panel style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Avatar name={profile.name} uri={profile.avatarUrl} /><View style={{ flex: 1 }}><Text style={{ color: colors.deep, fontWeight: '700' }}>{profile.name}</Text><Text style={[ui.caption, { color: colors.mutedForeground }]}>@{profile.handle}</Text></View><Feather name="chevron-right" size={18} color={colors.primary} /></Panel></Pressable>) : <Empty title="İlk okurunu keşfet" description="Takip ettiğin ve seni takip eden okurlar burada listelenir." icon="users" />}</Page>;
  }

  if (slug === 'messages') return <Page>
    <TopBar title="Mesajlar" back />
    <Action label="Yazar sohbeti ve odalar" icon="users" quiet onPress={() => router.push('/author-chat' as Href)} />
    {messageQuery.isLoading ? <LoadingState /> : messageQuery.isError ? <ErrorState retry={() => messageQuery.refetch()} /> : messageQuery.data?.length ? messageQuery.data.map((message) => <Panel key={message.id}><Text style={{ color: colors.deep, fontWeight: '700' }}>{message.sender}{message.recipient ? ` → ${message.recipient}` : ''}</Text><Text style={[ui.body, { color: colors.deep, marginTop: 4 }]}>{message.body}</Text><Text style={[ui.caption, { color: colors.mutedForeground, marginTop: 5 }]}>{new Date(message.createdAt).toLocaleString('tr-TR')}</Text></Panel>) : <Empty title="Henüz mesaj yok" description="Bir okura yazmak için aşağıdan yeni bir ileti oluştur." icon="message-circle" />}
    <Panel><SectionTitle title="Yeni mesaj" /><Field label="Alıcı" value={recipient} onChangeText={setRecipient} placeholder="Kullanıcı adı veya profil kimliği" /><Field label="Mesaj" value={messageBody} onChangeText={setMessageBody} placeholder="Merhaba…" multiline maxLength={2000} /><Action label={sendMessage.isPending ? 'Gönderiliyor…' : 'Gönder'} icon="send" disabled={!recipient.trim() || !messageBody.trim() || sendMessage.isPending} onPress={() => needSignIn(isSignedIn) && sendMessage.mutate({ data: { recipient: recipient.trim(), body: messageBody.trim() } }, { onSuccess: () => { setMessageBody(''); client.invalidateQueries({ queryKey: ['/api/messages'] }); }, onError: (e) => Alert.alert('Mesaj gönderilemedi', String(e)) })} /></Panel>
  </Page>;

  if (slug === 'author-chat') return <Page>
    <TopBar title="Afilli Yazar Sohbeti" back />
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {([['afilli', 'Afilli'], ['magazin', 'Magazin'], ['serbest', 'Serbest']] as const).map(([id, label]) => <Pressable key={id} onPress={() => setRoomId(id)} style={{ flex: 1 }}><Panel style={{ alignItems: 'center', padding: 10, backgroundColor: roomId === id ? colors.secondary : colors.card }}><Text style={{ color: colors.deep, fontWeight: '700', fontSize: 12 }}>{label}</Text></Panel></Pressable>)}
    </View>
    {!isSignedIn ? <Panel><Text style={[ui.body, { color: colors.mutedForeground }]}>Yazar sohbetine katılmak için giriş yap.</Text><Action label="Giriş yap" onPress={() => router.push('/auth' as Href)} /></Panel> : roomMessages.isLoading ? <LoadingState /> : roomMessages.isError ? <ErrorState retry={() => roomMessages.refetch()} /> : <Panel style={{ gap: 9, minHeight: 260 }}>
      {(roomMessages.data ?? []).length ? (roomMessages.data ?? []).map((message) => <View key={message.id} style={{ alignSelf: message.senderId === bootstrap.data?.profile.id ? 'flex-end' : 'flex-start', maxWidth: '88%', backgroundColor: message.senderId === bootstrap.data?.profile.id ? colors.secondary : colors.card, borderRadius: 15, padding: 10 }}><Text style={{ color: colors.deep, fontSize: 11, fontWeight: '700' }}>{message.sender}</Text><Text style={{ color: colors.deep, marginTop: 4 }}>{message.body}</Text><Text style={[ui.caption, { color: colors.mutedForeground, textAlign: 'right', marginTop: 4 }]}>{new Date(message.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</Text></View>) : <Empty title="Sohbet yeni başlıyor" description="Odaya ilk mesajı sen bırak." icon="message-circle" />}
    </Panel>}
    {isSignedIn ? <Panel><Field label="Mesaj" value={messageBody} onChangeText={setMessageBody} placeholder="Odaya mesaj yaz…" multiline maxLength={2000} /><Action label={sendRoomMessage.isPending ? 'Gönderiliyor…' : 'Mesajı gönder'} icon="send" disabled={!messageBody.trim() || sendRoomMessage.isPending} onPress={() => sendRoomMessage.mutate({ roomId, data: { body: messageBody.trim() } }, { onSuccess: () => { setMessageBody(''); client.invalidateQueries({ queryKey: ['/api/chat/rooms', roomId, 'messages'] }); }, onError: (error) => Alert.alert('Mesaj gönderilemedi', String(error)) })} /></Panel> : null}
  </Page>;

  if (slug === 'settings') return <Page>
    <TopBar title="Ayarlar" back />
    {isSignedIn && profileCover ? <Action label="Kapak görselini kaydet" icon="save" disabled={!profileName.trim() || updateProfile.isPending} onPress={() => updateProfile.mutate({ data: { name: profileName.trim(), bio: profileBio.trim(), avatarUrl: profileAvatar, coverUrl: profileCover } }, { onSuccess: () => { void client.invalidateQueries({ queryKey: ['/api/app/bootstrap'] }); Alert.alert('Kapak kaydedildi', 'Profil kapağın güncellendi.'); }, onError: (error) => Alert.alert('Kapak kaydedilemedi', String(error)) })} /> : null}
    {isSignedIn ? <Panel><Action label={profileCover ? 'Kapak görselini değiştir' : 'Profil kapağı ekle'} icon="image" quiet onPress={() => void addProfileImage('cover')} />{profileCover ? <Image source={{ uri: profileCover }} style={{ width: '100%', height: 110, borderRadius: 12, marginTop: 10 }} contentFit="cover" /> : null}<Text style={[ui.caption, { color: colors.mutedForeground, marginTop: 7 }]}>Görsel seçtikten sonra Kapak görselini kaydet düğmesine dokun.</Text></Panel> : null}
    {isSignedIn ? <>
      <Panel><SectionTitle title="Profil bilgilerin" /><Field label="Adın" value={profileName} onChangeText={setProfileName} placeholder="Ad ve soyad" maxLength={80} /><Field label="Hakkında" value={profileBio} onChangeText={setProfileBio} placeholder="Kendinden kısaca bahset" multiline maxLength={500} /><Action label={profileAvatar ? 'Profil fotoğrafı seçildi' : 'Galeriden profil fotoğrafı seç'} icon="image" quiet onPress={() => void addProfileImage()} /><View style={{ height: 4 }} /><Action label={updateProfile.isPending ? 'Kaydediliyor…' : 'Profili kaydet'} icon="save" disabled={!profileName.trim() || updateProfile.isPending} onPress={() => updateProfile.mutate({ data: { name: profileName.trim(), bio: profileBio.trim(), avatarUrl: profileAvatar } }, { onSuccess: () => { void client.invalidateQueries({ queryKey: ['/api/app/bootstrap'] }); Alert.alert('Profil güncellendi', 'Değişikliklerin kaydedildi.'); }, onError: (error) => Alert.alert('Profil kaydedilemedi', String(error)) })} /></Panel>
      <AccountAccessCard />
    </> : <Panel><SectionTitle title="Hesabın" /><Text style={[ui.body, { color: colors.mutedForeground }]}>Profil bilgilerini düzenlemek için giriş yap.</Text></Panel>}
    <Action label={isSignedIn ? 'Oturumu kapat' : 'Giriş yap'} icon={isSignedIn ? 'log-out' : 'log-in'} quiet onPress={() => isSignedIn ? void clerk.signOut() : router.push('/auth' as Href)} />
    <Pressable onPress={() => router.push('/subscription' as Href)}><Panel style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: colors.deep }}>Üyelik bilgisi</Text><Feather name="chevron-right" color={colors.primary} /></Panel></Pressable>
  </Page>;

  if (slug === 'ads') return <Page><TopBar title="Kitabını öne çıkar" back /><Text style={[ui.body, { color: colors.mutedForeground }]}>Bütçeni belirle; tanıtım talebin Afilli’ye iletilir.</Text>{bookList.isLoading ? <LoadingState /> : bookList.isError ? <ErrorState retry={() => bookList.refetch()} /> : bookList.data?.length ? bookList.data.map((book) => <Pressable key={book.id} onPress={() => setAdBook(book.id)}><Panel style={{ borderColor: adBook === book.id ? colors.primary : colors.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}><Feather name={adBook === book.id ? 'check-circle' : 'book'} color={colors.primary} size={18} /><Text style={{ color: colors.deep, flex: 1 }}>{book.title}</Text></Panel></Pressable>) : <Empty title="Henüz kitabın yok" description="Önce yazı masandan bir kitap oluştur." icon="book" />}<Field label="Tanıtım bütçesi (₺)" value={adBudget} onChangeText={setAdBudget} keyboardType="decimal-pad" placeholder="500" /><Action label={createAd.isPending ? 'İletiliyor…' : 'Tanıtım talebi gönder'} icon="send" disabled={!adBook || Number(adBudget) < 1 || createAd.isPending} onPress={() => needSignIn(isSignedIn) && createAd.mutate({ data: { bookId: adBook, budget: Number(adBudget) } }, { onSuccess: () => Alert.alert('Talep alındı', 'Kitap tanıtım talebin oluşturuldu.'), onError: (e) => Alert.alert('Talep gönderilemedi', String(e)) })} /></Page>;

  return <Page><TopBar title="Afilli" back /><Empty title="Bu sayfa bulunamadı" description="Aradığın sayfa taşınmış veya kaldırılmış olabilir." icon="compass" /><Action label="Ana akışa dön" onPress={() => router.replace('/(tabs)' as Href)} /></Page>;
}
