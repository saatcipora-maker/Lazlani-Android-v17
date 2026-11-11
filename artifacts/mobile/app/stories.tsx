import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { useCreateStory, useDeleteStory, useListStories, useViewStory } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Action, Avatar, Empty, ErrorState, Field, LoadingState, Page, Panel, TopBar } from '@/components/FavoriUI';
import { ContentImage } from '@/components/ContentMedia';
import { ConfirmDelete } from '@/components/ConfirmDelete';
import { useContentUpload } from '@/hooks/useContentUpload';
import { useColors } from '@/hooks/useColors';

export default function StoriesScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { isSignedIn } = useAuth();
  const colors = useColors();
  const client = useQueryClient();
  const stories = useListStories({ query: { enabled: !!isSignedIn } });
  const create = useCreateStory();
  const remove = useDeleteStory();
  const seen = useViewStory();
  const upload = useContentUpload('story');
  const [body, setBody] = useState('');
  const [selected, setSelected] = useState(id ?? '');
  const [error, setError] = useState('');
  const recorded = useRef(new Set<string>());
  const active = stories.data?.find((story) => story.id === selected);
  useEffect(() => {
    if (active && !recorded.current.has(active.id)) {
      recorded.current.add(active.id);
      seen.mutate({ storyId: active.id }, { onSuccess: () => void client.invalidateQueries({ queryKey: ['/api/content/stories'] }), onError: () => { recorded.current.delete(active.id); setError('Görüldü bilgisi kaydedilemedi. Bağlantını kontrol et.'); } });
    }
  }, [active?.id]);
  const publish = async () => {
    setError('');
    try {
      const story = await create.mutateAsync({ data: { body: body.trim(), mediaId: upload.asset?.id ?? null } });
      upload.markUsed(); setBody(''); setSelected(story.id);
      await client.invalidateQueries({ queryKey: ['/api/content/stories'] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Hikâye yayımlanamadı.'); }
  };
  return <Page><TopBar title="Okur hikâyeleri" back />
    {!isSignedIn ? <Panel><Text style={{ color: colors.deep }}>Hikâyeler kayıtlı tüm okurlara ücretsizdir.</Text><Action label="Giriş yap veya kaydol" onPress={() => router.push('/auth')} /></Panel> : <>
      {active ? <Panel style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Avatar name={active.author} uri={active.avatarUrl} /><Text style={{ color: colors.deep, fontWeight: '700', flex: 1 }}>{active.author}</Text><Text style={{ color: colors.mutedForeground }}>{new Date(active.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</Text></View>
        {active.mediaId ? <ContentImage mediaId={active.mediaId} /> : null}
        {active.body ? <Text style={{ color: colors.deep, fontSize: 19, lineHeight: 29 }}>{active.body}</Text> : null}
        <View style={{ flexDirection: 'row', gap: 12 }}>{['Önceki', 'Sonraki'].map((label, index) => <Action key={label} label={label} quiet onPress={() => { const rows = stories.data ?? []; const next = rows.indexOf(active) + (index ? 1 : -1); if (rows[next]) setSelected(rows[next].id); }} disabled={!stories.data?.[(stories.data?.indexOf(active) ?? 0) + (index ? 1 : -1)]} />)}</View>
        {active.canManage ? <ConfirmDelete key={active.id} label="Hikâyeyi sil" busy={remove.isPending} onConfirm={() => remove.mutate({ storyId: active.id }, { onSuccess: () => { setSelected(''); void stories.refetch(); }, onError: (cause) => setError(String(cause)) })} /> : null}
      </Panel> : null}
      <Panel style={{ gap: 10 }}><Text style={{ color: colors.deep, fontWeight: '700', fontSize: 19 }}>Hikâyeni paylaş</Text><Text style={{ color: colors.mutedForeground }}>Hikâyeler 24 saat görünür. Fotoğraf, yazı veya ikisini birlikte paylaşabilirsin.</Text><Field label="Hikâye metni" value={body} onChangeText={setBody} multiline maxLength={1000} placeholder="Bugün ne okuyorsun?" />
        <Action label={upload.busy ? 'Fotoğraf yükleniyor…' : upload.asset ? 'Fotoğrafı değiştir' : 'Fotoğraf seç'} icon="image" quiet disabled={upload.busy || create.isPending} onPress={() => void upload.pick()} />
        {upload.asset ? <><ContentImage mediaId={upload.asset.id} /><Action label="Fotoğrafı kaldır" quiet onPress={() => void upload.remove()} /></> : null}
        {error || upload.error ? <Text style={{ color: colors.destructive }}>{error || upload.error}</Text> : null}
        <Action label={create.isPending ? 'Yayımlanıyor…' : 'Hikâyeyi yayımla'} disabled={create.isPending || upload.busy || (!body.trim() && !upload.asset)} onPress={() => void publish()} />
      </Panel>
      {stories.isLoading ? <LoadingState /> : stories.isError ? <ErrorState retry={() => void stories.refetch()} /> : stories.data?.length ? stories.data.map((story) => <Action key={story.id} label={`${story.author}${story.seen ? ' · Görüldü' : ' · Yeni'}`} quiet onPress={() => setSelected(story.id)} />) : <Empty title="Henüz hikâye yok" description="İlk hikâyeyi sen paylaş." />}
    </>}
  </Page>;
}
