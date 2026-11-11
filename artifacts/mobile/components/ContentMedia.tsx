import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useEvent } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useGetContentMediaUrl } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

export function ContentImage({ uri, mediaId, style }: { uri?: string | null; mediaId?: string | null; style?: React.ComponentProps<typeof Image>['style'] }) {
  const colors = useColors();
  const [zoomed, setZoomed] = useState(false);
  const id = mediaId || uri?.match(/^\/api\/content\/media\/([A-Za-z0-9_-]+)$/)?.[1];
  const source = useGetContentMediaUrl(id ?? '', { query: { enabled: !!id, staleTime: 240000 } });
  const url = id ? source.data?.url : uri;
  if (id && source.isError) return <Pressable onPress={() => void source.refetch()} style={{ padding: 18 }}><Text style={{ color: colors.destructive }}>Görsel yüklenemedi. Yeniden dene.</Text></Pressable>;
  if (!url) return <View style={[{ height: 160, borderRadius: 14, backgroundColor: colors.secondary }, style]} />;
  return <><Pressable accessibilityLabel="Fotoğrafı tam ekran aç" onPress={(event) => { event.stopPropagation(); setZoomed(true); }}><Image source={{ uri: url }} style={style ?? { width: '100%', height: 260, borderRadius: 14 }} contentFit="contain" /></Pressable>
    <Modal visible={zoomed} transparent animationType="fade" onRequestClose={() => setZoomed(false)}><View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', paddingTop: 55, paddingBottom: 30, paddingHorizontal: 12 }}><Pressable accessibilityLabel="Tam ekran fotoğrafı kapat" onPress={() => setZoomed(false)} style={{ padding: 15, alignSelf: 'flex-end' }}><Text style={{ color: '#fff', fontSize: 16 }}>Kapat ✕</Text></Pressable><Image source={{ uri: url }} style={{ flex: 1, width: '100%' }} contentFit="contain" /></View></Modal>
  </>;
}

function Player({ url, onViewed }: { url: string; onViewed: () => void }) {
  const colors = useColors();
  const [muted, setMuted] = useState(false);
  const player = useVideoPlayer(url, (instance) => { instance.loop = false; });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const viewed = useRef(false);
  useEffect(() => { if (isPlaying && !viewed.current) { viewed.current = true; onViewed(); } }, [isPlaying, onViewed]);
  return <View style={{ gap: 8 }}>
    <VideoView player={player} style={{ width: '100%', height: 390, borderRadius: 16, backgroundColor: colors.deep }} nativeControls={false} allowsPictureInPicture={false} />
    {status === 'loading' ? <Text style={{ color: colors.mutedForeground }}>Video yükleniyor…</Text> : null}
    {status === 'error' ? <Pressable onPress={() => void player.replaceAsync(url)}><Text style={{ color: colors.destructive }}>Video oynatılamadı. Yeniden dene veya başka bir MP4 dosyası seç.</Text></Pressable> : null}
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <Pressable accessibilityRole="button" onPress={() => isPlaying ? player.pause() : player.play()} style={{ flex: 1, backgroundColor: colors.primary, padding: 13, borderRadius: 14 }}><Text style={{ textAlign: 'center', color: colors.deep, fontWeight: '700' }}>{isPlaying ? 'Duraklat' : 'Videoyu oynat'}</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => { player.muted = !muted; setMuted(!muted); }} style={{ backgroundColor: colors.secondary, padding: 13, borderRadius: 14 }}><Text style={{ color: colors.deep }}>{muted ? 'Sesi aç' : 'Sesi kapat'}</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => { player.currentTime = 0; player.play(); }} style={{ padding: 13 }}><Text style={{ color: colors.deep }}>Başa al</Text></Pressable>
    </View>
  </View>;
}
export function ContentVideo({ mediaId, onViewed }: { mediaId: string; onViewed: () => void }) {
  const source = useGetContentMediaUrl(mediaId, { query: { staleTime: 240000 } });
  const colors = useColors();
  if (source.isError) return <Pressable onPress={() => void source.refetch()}><Text style={{ color: colors.destructive }}>Video yüklenemedi. Yeniden dene.</Text></Pressable>;
  return source.data ? <Player url={source.data.url} onViewed={onViewed} /> : <Text style={{ color: colors.mutedForeground }}>Video hazırlanıyor…</Text>;
}
