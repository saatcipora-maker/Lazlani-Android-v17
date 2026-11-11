import React, { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useAuth } from '@clerk/expo';
import * as WebBrowser from 'expo-web-browser';
import { useGetAppBootstrap, useListBooks, useListMyBooks, useListStoreProducts, useToggleBookSave } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Page, TopBar, BookCard, Empty, LoadingState, ErrorState, Action, SectionTitle, Panel, ui } from '@/components/FavoriUI';
import { useColors } from '@/hooks/useColors';

export default function BooksScreen() {
  const colors = useColors();
  const { isSignedIn } = useAuth();
  const mine = useListMyBooks({ query: { enabled: !!isSignedIn } });
  const shop = useListStoreProducts();
  const client = useQueryClient();
  const [tab, setTab] = useState<'reading' | 'saved' | 'all'>('reading');
  const [query, setQuery] = useState('');
  const list = useListBooks();
  const bootstrap = useGetAppBootstrap();
  const save = useToggleBookSave();
  const books = useMemo(() => {
    const items = tab === 'reading' ? bootstrap.data?.readingBooks ?? [] : tab === 'saved' ? bootstrap.data?.savedBooks ?? [] : list.data ?? [];
    return items.filter((book) => `${book.title} ${book.author} ${book.category}`.toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr')));
  }, [tab, bootstrap.data?.readingBooks, bootstrap.data?.savedBooks, list.data, query]);
  const retry = () => { void list.refetch(); void bootstrap.refetch(); };
  return <Page>
    <TopBar title="Kitaplığım" right={<Pressable accessibilityLabel="Ara" onPress={() => setTab('all')}><Feather name="search" size={20} color={colors.deep} /></Pressable>} />
    <Text style={[ui.body, { color: colors.mutedForeground }]}>Okudukların, sakladıkların ve keşfetmek istediklerin.</Text>
    <View style={{ flexDirection: 'row', backgroundColor: colors.secondary, padding: 4, borderRadius: 15 }}>
      {[['reading', 'Okuyorum'], ['saved', 'Kaydedilenler'], ['all', 'Keşfet']].map(([key, label]) => <Pressable key={key} onPress={() => setTab(key as any)} style={{ flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 12, backgroundColor: tab === key ? colors.card : 'transparent' }}><Text style={{ color: colors.deep, fontSize: 12, fontWeight: '700' }}>{label}</Text></Pressable>)}
    </View>
    {tab === 'all' ? <TextInput value={query} onChangeText={setQuery} placeholder="Kitap veya yazar ara" placeholderTextColor={colors.mutedForeground} style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, height: 46, color: colors.deep }} /> : null}
    {(list.isLoading || bootstrap.isLoading) ? <LoadingState /> : (list.isError && tab === 'all') || (bootstrap.isError && tab !== 'all') ? <ErrorState retry={retry} /> : books.length ? books.map((book) => <BookCard key={book.id} book={book} onPress={() => router.push(`/book/${book.id}` as Href)} trailing={tab === 'saved' ? <Pressable accessibilityLabel="Kaydedilenlerden çıkar" onPress={() => save.mutate({ bookId: book.id }, { onSuccess: () => { client.invalidateQueries({ queryKey: ['/api/app/bootstrap'] }); client.invalidateQueries({ queryKey: ['/api/books'] }); } })}><Feather name="bookmark" size={18} color={colors.primary} /></Pressable> : null} />) : <Empty title="Rafın yeni hikâyelere açık" description={tab === 'reading' ? 'Bir kitap seçtiğinde okuma yolculuğun burada görünür.' : tab === 'saved' ? 'Beğendiğin kitapları sakla; sonra kaldığın yerden dön.' : 'Aramana uygun bir kitap bulunamadı.'} icon="book-open" />}
    <Pressable onPress={() => router.push('/search' as Href)} style={{ alignSelf: 'center', paddingVertical: 10 }}><Text style={{ color: colors.primary, fontWeight: '700' }}>Kitap keşfet</Text></Pressable>
    <SectionTitle title="Yazdığım Kitaplar" action="Yeni kitap" onPress={() => router.push('/compose' as Href)} />
    {!isSignedIn ? <Action label="Kitapların için giriş yap" quiet onPress={() => router.push('/auth' as Href)} /> : mine.isLoading ? <LoadingState /> : mine.isError ? <ErrorState retry={() => mine.refetch()} /> : mine.data?.length ? mine.data.map((book) => <BookCard key={book.id} book={book} onPress={() => router.push(book.status === 'draft' ? `/compose?type=book&id=${book.id}` as Href : `/book/${book.id}` as Href)} />) : <Empty title="İlk kitabını yaz" description="Taslakların ve yayınladığın kitaplar burada görünür." icon="edit-3" />}
    <SectionTitle title="Satın Aldıklarım" />
    <Panel><Text style={[ui.body, { color: colors.mutedForeground }]}>Siparişlerin ve kargo durumların Shopify müşteri hesabında güvenli biçimde tutulur.</Text><View style={{ height: 10 }} /><Action label="Shopify siparişlerimi aç" icon="shopping-bag" quiet disabled={!shop.data?.accountUrl} onPress={() => shop.data?.accountUrl && void WebBrowser.openBrowserAsync(shop.data.accountUrl)} /></Panel>
  </Page>;
}
