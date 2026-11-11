import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { useCreateSpecialVideo, useDeleteSpecialVideo, useLikeSpecialVideo, useListSpecialVideos, useViewSpecialVideo } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Action, Avatar, Empty, ErrorState, Field, LoadingState, Page, Panel, TopBar } from '@/components/FavoriUI';
import { ContentVideo } from '@/components/ContentMedia';
import { ConfirmDelete } from '@/components/ConfirmDelete';
import { useContentUpload } from '@/hooks/useContentUpload';
import { useColors } from '@/hooks/useColors';

export default function SpecialScreen() {
  const colors = useColors();
  const { isSignedIn } = useAuth();
  const client = useQueryClient();
  const query = useListSpecialVideos({ query: { enabled: !!isSignedIn } });
  const publish = useCreateSpecialVideo();
  const like = useLikeSpecialVideo();
  const view = useViewSpecialVideo();
  const remove = useDeleteSpecialVideo();
  const upload = useContentUpload('video');
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const refresh = () => void client.invalidateQueries({ queryKey: ['/api/content/videos'] });
  const save = async () => {
    if (!upload.asset) return;
    try {
      await publish.mutateAsync({ data: { title: title.trim(), body: body.trim(), mediaId: upload.asset.id } });
      upload.markUsed(); setTitle(''); setBody(''); setComposing(false); setError(''); refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Video yayımlanamadı.'); }
  };
  return <Page><TopBar title="Özel" back /><Panel><Text style={{ color: colors.deep, fontWeight: '700' }}>Kayıtlı tüm okurlara ücretsiz</Text><Text style={{ color: colors.mutedForeground, lineHeight: 22, marginTop: 6 }}>Videoları indirme ve yeniden paylaşma. Bu alanda indirme veya paylaşma düğmesi sunulmaz.</Text></Panel>
    {!isSignedIn ? <Action label="Giriş yap veya kaydol" onPress={() => router.push('/auth')} /> : <>
      <Action label={composing ? 'Video formunu kapat' : 'Videonu paylaş'} icon="video" onPress={() => setComposing(!composing)} />
      {composing ? <Panel style={{ gap: 12 }}><Field label="Video başlığı" value={title} onChangeText={setTitle} maxLength={160} /><Field label="Açıklama" value={body} onChangeText={setBody} multiline maxLength={3000} /><Text style={{ color: colors.mutedForeground }}>En fazla 2 dakika / 100 MB. MP4, MOV ve WebM desteklenir.</Text><Action label={upload.busy ? 'Video yükleniyor…' : upload.asset ? 'Başka video seç' : 'Galeriden video seç'} icon="video" disabled={upload.busy || publish.isPending} quiet onPress={() => void upload.pick()} />
        {upload.asset ? <Text style={{ color: colors.deep }}>Video yüklendi ve doğrulandı. Yayımlamaya hazır.</Text> : null}
        <Action label={publish.isPending ? 'Yayımlanıyor…' : 'Videoyu yayımla'} disabled={!upload.asset || !title.trim() || upload.busy || publish.isPending} onPress={() => void save()} />
        {upload.asset ? <Action label="Seçilen videoyu kaldır" quiet onPress={() => void upload.remove()} /> : null}
      </Panel> : null}
      {error || upload.error ? <Text style={{ color: colors.destructive }}>{error || upload.error}</Text> : null}
      {query.isLoading ? <LoadingState /> : query.isError ? <ErrorState retry={() => void query.refetch()} /> : query.data?.length ? query.data.map((video) => <Panel key={video.id} style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Avatar name={video.author} uri={video.avatarUrl} /><Text style={{ color: colors.deep, fontWeight: '700' }}>{video.author}</Text></View>
        <Text style={{ color: colors.deep, fontSize: 21, fontWeight: '700' }}>{video.title}</Text>
        {playingId === video.id ? <ContentVideo mediaId={video.mediaId} onViewed={() => view.mutate({ videoId: video.id }, { onSuccess: refresh, onError: (cause) => setError(String(cause)) })} /> : <Action label="Videoyu izle" icon="play" quiet onPress={() => setPlayingId(video.id)} />}
        {video.body ? <Text style={{ color: colors.deep, lineHeight: 23 }}>{video.body}</Text> : null}
        <View style={{ flexDirection: 'row', gap: 20 }}>
          <Pressable accessibilityRole="button" disabled={like.isPending} onPress={() => like.mutate({ videoId: video.id }, { onSuccess: refresh, onError: (cause) => setError(String(cause)) })}><Text style={{ color: video.likedByMe ? colors.destructive : colors.deep }}>♥ {video.likes}</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/comments/[id]', params: { id: video.id, type: 'video' } })}><Text style={{ color: colors.deep }}>Yorumlar · {video.comments}</Text></Pressable>
          <Text style={{ color: colors.mutedForeground }}>{video.views} izlenme</Text>
        </View>
        {video.canManage ? <ConfirmDelete label="Videoyu sil" busy={remove.isPending} onConfirm={() => remove.mutate({ videoId: video.id }, { onSuccess: refresh, onError: (cause) => setError(String(cause)) })} /> : null}
      </Panel>) : <Empty title="İlk videonu paylaş" description="Kitap önerilerin ve okuma anların burada yer alsın." icon="video" />}
    </>}
  </Page>;
}
