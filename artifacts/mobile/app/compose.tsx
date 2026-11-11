import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useAuth } from '@clerk/expo';
import * as ImagePicker from 'expo-image-picker';
import { useQueryClient } from '@tanstack/react-query';
import { useCreateBook, useCreatePost, useGetContentPost, useListMyBooks, useUpdateBook, useUpdateContentPost, type PostInput } from '@workspace/api-client-react';
import { Page, TopBar, Panel, Field, Action, LoadingState, ErrorState, ui } from '@/components/FavoriUI';
import { useColors } from '@/hooks/useColors';
import { useContentUpload } from '@/hooks/useContentUpload';
import { ContentImage } from '@/components/ContentMedia';

const wordCount = (value: string) => value.trim() ? value.trim().split(/\s+/).length : 0;

export default function ComposeScreen() {
  const { type = 'magazine', id } = useLocalSearchParams<{ type?: string; id?: string }>();
  const kind = Array.isArray(type) ? type[0] : type;
  const isBook = kind === 'book';
  const isNewsletter = kind === 'newsletter';
  const isPhoto = kind === 'photo';
  const postType = isNewsletter ? 'newsletter' : isPhoto ? 'photo' : kind === 'book-review' ? 'book-review' : 'magazine';
  const cap = isNewsletter ? 1000 : 3000;
  const colors = useColors();
  const { isSignedIn, userId } = useAuth();
  const client = useQueryClient();
  const createBook = useCreateBook();
  const updateBook = useUpdateBook();
  const createPost = useCreatePost();
  const updatePost = useUpdateContentPost();
  const upload = useContentUpload('post');
  const selectedId = Array.isArray(id) ? id[0] : id;
  const myBooks = useListMyBooks({ query: { enabled: Boolean(isSignedIn && (!isBook || selectedId)) } });
  const postQuery = useGetContentPost(selectedId ?? '', { query: { enabled: !!selectedId && !isBook && !!isSignedIn } });
  const existingBook = myBooks.data?.find((book) => book.id === selectedId);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Roman');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [allowLikes, setAllowLikes] = useState(true);
  const [allowComments, setAllowComments] = useState(true);
  const [bookId, setBookId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const currentCount = wordCount(isBook ? body : body);
  useEffect(() => {
    if (!existingBook) return;
    setTitle(existingBook.title);
    setCategory(existingBook.category);
    setDescription(existingBook.description);
    setBody(existingBook.content);
    setImageUrl(existingBook.coverUrl ?? null);
  }, [existingBook?.id]);
  useEffect(() => {
    const post = postQuery.data;
    if (!post) return;
    setTitle(post.title); setBody(post.body); setImageUrl(post.imageUrl ?? null);
    setAllowLikes(post.allowLikes); setAllowComments(post.allowComments); setBookId(post.bookId ?? null);
  }, [postQuery.data?.id]);
  const chooseImage = async () => {
    if (!isBook) {
      const asset = await upload.pick();
      if (asset) setImageUrl(asset.path);
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.65, allowsEditing: true });
      if (!result.canceled && result.assets[0]?.base64) setImageUrl(`data:${result.assets[0].mimeType || 'image/jpeg'};base64,${result.assets[0].base64}`);
    } catch { setError('Kapak seçilemedi. Fotoğraf iznini ve bağlantını kontrol et.'); }
  };
  const save = (status: 'draft' | 'published') => {
    if (!isSignedIn) { router.push('/auth' as Href); return; }
    setError('');
    if (isBook && (!title.trim() || (status === 'published' && !body.trim()))) { setError('Kitap adı ve yayımlamak için metin gerekli.'); return; }
    if (!isBook && (!body.trim() && !imageUrl && !bookId)) { setError('Bir metin yaz, fotoğraf ekle veya kitabını seç.'); return; }
    if (isPhoto && !imageUrl) { setError('Bir fotoğraf seç.'); return; }
    if (!isBook && currentCount > cap) { setError(`Bu yazı en fazla ${cap.toLocaleString('tr-TR')} kelime olabilir.`); return; }
    if (isBook) {
      const data = { title: title.trim(), category, description: description.trim(), content: body.trim(), coverUrl: imageUrl, status };
      const onSaved = (book: { id: string }) => {
        void client.invalidateQueries({ queryKey: ['/api/books'] });
        void client.invalidateQueries({ queryKey: ['/api/books/mine'] });
        void client.invalidateQueries({ queryKey: ['/api/app/bootstrap'] });
        router.replace(status === 'published' ? `/book/${book.id}` as Href : '/(tabs)/create' as Href);
      };
      if (selectedId) {
        updateBook.mutate({ bookId: selectedId, data }, { onSuccess: onSaved, onError: (e) => setError(String(e)) });
      } else {
        createBook.mutate({ data }, { onSuccess: onSaved, onError: (e) => setError(String(e)) });
      }
    } else {
      const data: PostInput = { type: postType, title: title.trim(), body: body.trim(), imageUrl, bookId, allowLikes, allowComments };
      const options = { onSuccess: (post: { id: string }) => { upload.markUsed(); void client.invalidateQueries(); router.replace(`/post/${post.id}` as Href); }, onError: (e: unknown) => setError(String(e)) };
      if (selectedId) updatePost.mutate({ postId: selectedId, data }, options);
      else createPost.mutate({ data }, options);
    }
  };

  if (isBook && selectedId && myBooks.isLoading) return <Page><TopBar title="Taslak açılıyor" back /><LoadingState /></Page>;
  if (isBook && selectedId && myBooks.isError) return <Page><TopBar title="Taslak açılamadı" back /><ErrorState retry={() => myBooks.refetch()} /></Page>;
  if (isBook && selectedId && myBooks.isSuccess && !existingBook) return <Page><TopBar title="Taslak bulunamadı" back /><Panel><Text style={{ color: colors.deep }}>Bu kitap hesabında bulunamadı veya artık bir taslak değil.</Text></Panel><Action label="Yazı masama dön" onPress={() => router.replace('/(tabs)/create' as Href)} /></Page>;
  if (!isSignedIn) return <Page><TopBar title="Paylaşım yap" back /><Panel><Text style={{ color: colors.deep }}>Kitap, dergi, bülten ve fotoğraf paylaşımı kayıtlı tüm okurlara ücretsizdir.</Text><Action label="Giriş yap veya kaydol" onPress={() => router.push('/auth')} /></Panel></Page>;
  if (!isBook && selectedId && postQuery.isLoading) return <Page><TopBar title="Paylaşım açılıyor" back /><LoadingState /></Page>;
  if (!isBook && selectedId && postQuery.isError) return <Page><TopBar title="Paylaşım açılamadı" back /><ErrorState retry={() => void postQuery.refetch()} /></Page>;
  if (!isBook && selectedId && postQuery.data?.authorId !== userId) return <Page><TopBar title="Paylaşımı düzenle" back /><Panel><Text style={{ color: colors.deep }}>Yalnızca kendi paylaşımını düzenleyebilirsin.</Text></Panel></Page>;

  return <Page>
    <TopBar title={isBook ? 'Kitap yaz' : isNewsletter ? 'Bülten yaz' : isPhoto ? 'Fotoğraf paylaş' : kind === 'book-review' ? 'Kitabını paylaş' : 'Dergi yazısı'} back />
    {error || upload.error ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{error || upload.error}</Text> : null}
    {isBook ? <>
      <Field label="Kitabın adı" value={title} onChangeText={setTitle} placeholder="Hikâyenin adı" maxLength={120} />
      <Text style={{ color: colors.deep, fontSize: 13, fontWeight: '700', marginBottom: 8 }}>Kategori</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>{['Roman', 'Hikâye', 'Şiir', 'Fantastik', 'Bilim Kurgu', 'Tarihi', 'Polisiye', 'Aşk', 'Korku', 'Kişisel Gelişim', 'Çocuk', 'Macera'].map((item) => <Pressable key={item} onPress={() => setCategory(item)}><Text style={{ borderRadius: 16, overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 8, color: colors.deep, backgroundColor: category === item ? colors.secondary : colors.card, borderWidth: 1, borderColor: category === item ? colors.primary : colors.border }}>{item}</Text></Pressable>)}</View>
      <Field label="Kısa tanıtım" value={description} onChangeText={setDescription} placeholder="Kitabını birkaç cümleyle anlat" multiline maxLength={2000} />
      <Field label="Metin" value={body} onChangeText={setBody} placeholder="İlk cümlenle başla…" multiline maxLength={100000} />
      <Action label={imageUrl ? 'Kapak görseli seçildi' : 'Galeriden kapak seç'} icon="image" quiet onPress={() => void chooseImage()} />
      {imageUrl ? <ContentImage uri={imageUrl} /> : null}
      <View style={{ height: 5 }} />
       <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Action label="Taslak olarak kaydet" icon="save" quiet disabled={createBook.isPending || updateBook.isPending} onPress={() => save('draft')} /></View><View style={{ flex: 1 }}><Action label="Yayımla" icon="send" disabled={createBook.isPending || updateBook.isPending} onPress={() => save('published')} /></View></View>
       <Text style={[ui.caption, { textAlign: 'center', color: colors.mutedForeground }]}>{selectedId ? 'Mevcut taslağın güncelleniyor.' : 'Taslak ve yayımlama işlemleri hesabına kaydedilir.'}</Text>
    </> : <>
      <Field label="Başlık" value={title} onChangeText={setTitle} placeholder="Yazına bir başlık ver" maxLength={160} />
      <Field label={isNewsletter ? 'Bülten metni' : 'Yazı metni'} value={body} onChangeText={setBody} placeholder="Söylemek istediğinle başla…" multiline maxLength={20000} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: -7 }}><Text style={[ui.caption, { color: currentCount > cap ? colors.destructive : colors.mutedForeground }]}>{currentCount.toLocaleString('tr-TR')} / {cap.toLocaleString('tr-TR')} kelime</Text><Text style={[ui.caption, { color: colors.mutedForeground }]}>Yaklaşık {Math.max(1, Math.ceil(currentCount / 220))} dk okuma</Text></View>
      <Action label={upload.busy ? 'Görsel yükleniyor…' : imageUrl ? 'Görseli değiştir' : 'Galeriden görsel ekle'} disabled={upload.busy} icon="image" quiet onPress={() => void chooseImage()} />
      {imageUrl ? <><ContentImage uri={imageUrl} /><Action label="Görseli kaldır" quiet onPress={() => { if (upload.asset) void upload.remove(); setImageUrl(null); }} /></> : null}
      <Panel><Text style={{ color: colors.deep, fontWeight: '700', marginBottom: 10 }}>Yayımladığım bir kitabı ekle</Text><Action label={bookId ? 'Kitap ekini kaldır' : 'Kitap seçilmedi'} quiet onPress={() => setBookId(null)} />{myBooks.data?.filter((book) => book.status === 'published').map((book) => <Pressable key={book.id} onPress={() => setBookId(book.id)} style={{ paddingVertical: 12 }}><Text style={{ color: book.id === bookId ? colors.primary : colors.deep }}>{book.id === bookId ? '✓ ' : ''}{book.title}</Text></Pressable>)}</Panel>
      <View style={{ flexDirection: 'row', gap: 9 }}>
        <Pressable onPress={() => setAllowLikes(!allowLikes)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Feather name={allowLikes ? 'check-square' : 'square'} color={colors.primary} /><Text style={{ color: colors.deep, fontSize: 12 }}>Beğenilere açık</Text></Pressable>
        <Pressable onPress={() => setAllowComments(!allowComments)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Feather name={allowComments ? 'check-square' : 'square'} color={colors.primary} /><Text style={{ color: colors.deep, fontSize: 12 }}>Yorumlara açık</Text></Pressable>
      </View>
      <Action label={createPost.isPending || updatePost.isPending ? 'Kaydediliyor…' : selectedId ? 'Değişiklikleri kaydet' : 'Yayımla'} icon="send" disabled={createPost.isPending || updatePost.isPending || upload.busy || (!body.trim() && !imageUrl && !bookId) || currentCount > cap} onPress={() => save('published')} />
    </>}
  </Page>;
}
