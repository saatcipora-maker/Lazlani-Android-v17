import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { useListMyBooks } from '@workspace/api-client-react';
import { Page, TopBar, Panel, SectionTitle, Empty, LoadingState, ErrorState, ui } from '@/components/FavoriUI';
import { useColors } from '@/hooks/useColors';

export default function CreateScreen() {
  const colors = useColors();
  const { isSignedIn } = useAuth();
  const books = useListMyBooks({ query: { enabled: Boolean(isSignedIn) } });
  const writings = books.data ?? [];
  return <Page>
    <TopBar title="Yazı masam" />
    <Text style={[ui.body, { color: colors.mutedForeground }]}>Aklındaki hikâyeye bir sayfa aç.</Text>
    <Pressable onPress={() => router.push('/compose?type=book' as Href)}><Panel style={{ backgroundColor: colors.deep, borderColor: colors.primary, minHeight: 150, justifyContent: 'space-between' }}><Feather name="book-open" color={colors.accent} size={22} /><Text style={{ color: colors.paper, fontFamily: 'Georgia', fontSize: 25, fontWeight: '700' }}>Kitabını yaz</Text><Text style={{ color: '#E8DCCB', fontSize: 13 }}>Bir taslak başlat ya da tamamladığın eseri yayımla.</Text></Panel></Pressable>
    <View style={{ flexDirection: 'row', gap: 10 }}>
      {[
        { icon: 'feather' as const, title: 'Dergi yazısı', type: 'magazine', text: 'Fikrini toplulukla paylaş' },
        { icon: 'mail' as const, title: 'Bülten', type: 'newsletter', text: 'Okuruna mektup gönder' },
      ].map((item) => <Pressable key={item.type} onPress={() => router.push(`/compose?type=${item.type}` as Href)} style={{ flex: 1 }}><Panel style={{ minHeight: 125, justifyContent: 'space-between' }}><Feather name={item.icon} size={18} color={colors.primary} /><Text style={{ color: colors.deep, fontWeight: '700' }}>{item.title}</Text><Text style={[ui.caption, { color: colors.mutedForeground }]}>{item.text}</Text></Panel></Pressable>)}
    </View>
    <SectionTitle title="Kitaplarım ve taslaklarım" />
    {!isSignedIn ? <Panel style={{ alignItems: 'center', gap: 10 }}><Text style={[ui.body, { color: colors.deep, textAlign: 'center' }]}>Taslaklarını kaydetmek ve yeniden açmak için giriş yap.</Text><Pressable onPress={() => router.push('/auth' as Href)}><Text style={{ color: colors.primary, fontWeight: '800' }}>Giriş yap</Text></Pressable></Panel> : books.isLoading ? <LoadingState /> : books.isError ? <ErrorState retry={() => books.refetch()} /> : writings.length ? writings.map((book) => <Pressable key={book.id} onPress={() => router.push(book.status === 'draft' ? `/compose?type=book&id=${encodeURIComponent(book.id)}` as Href : `/book/${book.id}` as Href)}><Panel style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><View style={{ width: 43, height: 54, backgroundColor: colors.secondary, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}><Feather name={book.status === 'draft' ? 'file-text' : 'book-open'} size={18} color={colors.deep} /></View><View style={{ flex: 1 }}><Text style={{ color: colors.deep, fontFamily: 'Georgia', fontSize: 16, fontWeight: '700' }}>{book.title}</Text><Text style={[ui.caption, { color: colors.mutedForeground }]}>{book.category} · {book.status === 'draft' ? 'Taslak — düzenlemek için dokun' : 'Yayımlandı'}</Text></View><Feather name="chevron-right" size={18} color={colors.mutedForeground} /></Panel></Pressable>) : <Empty title="Henüz yazın yok" description="İlk cümleni yazıp taslak olarak kaydedebilir veya kitabını yayımlayabilirsin." icon="edit-3" />}
  </Page>;
}
