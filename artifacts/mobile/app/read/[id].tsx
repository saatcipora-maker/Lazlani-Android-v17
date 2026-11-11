import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useQueryClient } from '@tanstack/react-query';
import { useGetBook, getGetBookQueryKey, useUpdateBookProgress } from '@workspace/api-client-react';
import { Page, TopBar, LoadingState, ErrorState, Action, ui } from '@/components/FavoriUI';
import { useColors } from '@/hooks/useColors';

export default function Reader() {
  const { id } = useLocalSearchParams<{ id: string }>();
  usePreventScreenCapture();
  const colors = useColors();
  const client = useQueryClient();
  const query = useGetBook(id || '', { query: { queryKey: getGetBookQueryKey(id || ''), enabled: !!id } });
  const progress = useUpdateBookProgress();
  const [page, setPage] = useState<number | null>(null);
  if (query.isLoading) return <Page><TopBar title="Okuma" back /><LoadingState /></Page>;
  if (query.isError || !query.data) return <Page><TopBar title="Okuma" back /><ErrorState retry={() => query.refetch()} /></Page>;
  const book = query.data;
  const current = page ?? book.progress;
  const setProgress = (value: number) => {
    const next = Math.max(0, Math.min(100, value));
    setPage(next);
    progress.mutate({ bookId: book.id, data: { progress: next } }, { onSuccess: () => { client.invalidateQueries({ queryKey: getGetBookQueryKey(book.id) }); client.invalidateQueries({ queryKey: ['/api/app/bootstrap'] }); } });
  };
  return <View style={{ flex: 1, backgroundColor: colors.paper }}>
    <View style={{ paddingHorizontal: 20, paddingTop: 8 }}><TopBar title={book.title} back /></View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 21, marginTop: 8 }}><View style={{ flex: 1, height: 4, borderRadius: 5, backgroundColor: colors.secondary }}><View style={{ height: 4, width: `${current}%`, backgroundColor: colors.primary, borderRadius: 5 }} /></View><Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{current}%</Text></View>
    <View style={{ flex: 1, paddingHorizontal: 25, paddingVertical: 32, justifyContent: 'center' }}>
      <Text style={{ color: colors.primary, fontSize: 11, letterSpacing: 1.6, fontWeight: '700', marginBottom: 18 }}>BÖLÜM · {Math.max(1, Math.ceil(current / 12))}</Text>
      <Text style={{ color: colors.deep, fontFamily: 'Georgia', fontSize: 23, lineHeight: 38 }}>{book.content || book.description || 'Bu kitapta henüz okunabilir bir metin bulunmuyor.'}</Text>
      <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 25 }}>— {book.author}</Text>
    </View>
    <View style={{ padding: 20, paddingBottom: 30, borderTopWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Pressable accessibilityLabel="Önceki sayfa" onPress={() => setProgress(current - 5)}><Feather name="chevron-left" size={24} color={colors.deep} /></Pressable>
      <Action label={current >= 100 ? 'Tamamlandı' : 'İlerlemeyi kaydet'} icon="check" quiet onPress={() => setProgress(current + 5)} />
      <Pressable accessibilityLabel="Sonraki sayfa" onPress={() => setProgress(current + 5)}><Feather name="chevron-right" size={24} color={colors.deep} /></Pressable>
    </View>
  </View>;
}
