import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import { useCreateBookAd, useListMyBooks, useListPromotionRequests, useReviewPromotionRequest } from '@workspace/api-client-react';
import { Action, Empty, ErrorState, Field, LoadingState, Page, Panel, SectionTitle, TopBar } from '@/components/FavoriUI';
import { useColors } from '@/hooks/useColors';

const statusLabel: Record<string, string> = { pending: 'Değerlendirme bekliyor', approved: 'Onaylandı · Kitap öne çıkarıldı', rejected: 'Uygun bulunmadı' };
export default function PromotionsScreen() {
  const colors = useColors();
  const { isSignedIn } = useAuth();
  const client = useQueryClient();
  const books = useListMyBooks({ query: { enabled: !!isSignedIn } });
  const requests = useListPromotionRequests({ query: { enabled: !!isSignedIn, refetchInterval: 30000 } });
  const create = useCreateBookAd();
  const review = useReviewPromotionRequest();
  const [selected, setSelected] = useState('');
  const [budget, setBudget] = useState('');
  const [feedback, setFeedback] = useState('');
  const amount = Number(budget.replace(',', '.'));
  const refresh = () => void client.invalidateQueries();
  return <Page><TopBar title="Kitap tanıtımı" back />
    {!isSignedIn ? <Action label="Giriş yap veya kaydol" onPress={() => router.push('/auth')} /> : <>
      <Text style={{ color: colors.mutedForeground, lineHeight: 22 }}>Yayımladığın kitabın için tanıtım talebi oluştur. Bu işlem ödeme almaz ve tanıtımı kendiliğinden başlatmaz. Yönetici değerlendirmesini aşağıdan takip edebilirsin.</Text>
      <SectionTitle title="Yayımladığım kitaplar" />
      {books.isLoading ? <LoadingState /> : books.isError ? <ErrorState retry={() => void books.refetch()} /> : books.data?.some((book) => book.status === 'published') ? books.data.filter((book) => book.status === 'published').map((book) => <Pressable key={book.id} onPress={() => setSelected(book.id)}><Panel style={{ borderColor: selected === book.id ? colors.primary : colors.border }}><Text style={{ color: colors.deep }}>{selected === book.id ? '✓ ' : ''}{book.title}</Text></Panel></Pressable>) : <Empty title="Önce bir kitap yayımla" description="Yazı masandaki kitabını yayımladıktan sonra tanıtım talebi oluşturabilirsin." />}
      <Field label="Önerdiğin tanıtım bütçesi" value={budget} onChangeText={setBudget} keyboardType="decimal-pad" placeholder="Talebine eklemek istediğin tutar" />
      <Action label={create.isPending ? 'Talep gönderiliyor…' : 'Tanıtım talebini gönder'} icon="send" disabled={!selected || !Number.isFinite(amount) || amount < 1 || amount > 100000000 || create.isPending} onPress={() => create.mutate({ data: { bookId: selected, budget: amount } }, { onSuccess: () => { setSelected(''); setBudget(''); setFeedback('Talebin alındı. Herhangi bir ödeme yapılmadı.'); refresh(); }, onError: (error) => setFeedback(String(error)) })} />
      {feedback ? <Text accessibilityRole="alert" style={{ color: colors.deep }}>{feedback}</Text> : null}
      <SectionTitle title={requests.data?.some((item) => item.canManage) ? 'Tanıtım değerlendirme listesi' : 'Taleplerim'} />
      {requests.isLoading ? <LoadingState /> : requests.isError ? <ErrorState retry={() => void requests.refetch()} /> : requests.data?.length ? requests.data.map((item) => <Panel key={item.id} style={{ gap: 11 }}><Text style={{ color: colors.deep, fontWeight: '700' }}>{item.title}</Text><Text style={{ color: colors.mutedForeground }}>{statusLabel[item.status] ?? item.status}</Text><Text style={{ color: colors.mutedForeground }}>Önerilen bütçe: {item.budget.toLocaleString('tr-TR')}</Text>{item.canManage ? <><Action label="Onayla ve kitabı öne çıkar" disabled={review.isPending || item.status === 'approved'} onPress={() => review.mutate({ adId: item.id, data: { status: 'approved' } }, { onSuccess: refresh, onError: (error) => setFeedback(String(error)) })} /><Action label={item.status === 'approved' ? 'Onayı kaldır' : 'Reddet'} quiet disabled={review.isPending || item.status === 'rejected'} onPress={() => review.mutate({ adId: item.id, data: { status: 'rejected' } }, { onSuccess: refresh, onError: (error) => setFeedback(String(error)) })} /></> : null}</Panel>) : <Text style={{ color: colors.mutedForeground }}>Henüz tanıtım talebi yok.</Text>}
    </>}
  </Page>;
}
