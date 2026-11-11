import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { fetch } from 'expo/fetch';
import { useBeginContentUpload, useCompleteContentUpload, useDiscardContentUpload } from '@workspace/api-client-react';

export function useContentUpload(purpose: 'post' | 'story' | 'video') {
  const begin = useBeginContentUpload();
  const complete = useCompleteContentUpload();
  const discard = useDiscardContentUpload();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [asset, setAsset] = useState<{ id: string; path: string } | null>(null);
  const active = useRef(true);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; controller.current?.abort(); }; }, []);
  const pick = async () => {
    if (busy) return null;
    setBusy(true);
    setError('');
    let allocation: string | null = null;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: purpose === 'video' ? ['videos'] : ['images'], quality: 0.8, allowsEditing: false, videoMaxDuration: 120 });
      if (result.canceled || !result.assets[0]) return null;
      const selected = result.assets[0];
      if (purpose === 'video' && selected.duration && selected.duration > 120000) throw new Error('En fazla 2 dakikalık bir video seç.');
      let uri = selected.uri;
      let mime = selected.mimeType ?? (uri.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4');
      if (purpose !== 'video') {
        const image = await manipulateAsync(uri, [{ resize: { width: Math.min(selected.width || 1600, 1600) } }], { compress: 0.8, format: SaveFormat.JPEG });
        uri = image.uri;
        mime = 'image/jpeg';
      }
      const file = Platform.OS === 'web'
        ? purpose === 'video' && selected.file ? selected.file : await (await fetch(uri)).blob()
        : new File(uri);
      const supported = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'] as const;
      const contentType = supported.find((item) => item === mime);
      if (!contentType) throw new Error('Bu dosya türü desteklenmiyor. JPEG/PNG/WebP görsel veya MP4/MOV/WebM video seç.');
      const limit = purpose === 'video' ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
      if (!file.size || file.size > limit) throw new Error(purpose === 'video' ? 'Video en fazla 100 MB olabilir.' : 'Görsel en fazla 10 MB olabilir.');
      if (!active.current) return null;
      const upload = await begin.mutateAsync({ data: { purpose, mime: contentType, size: file.size } });
      allocation = upload.id;
      controller.current = new AbortController();
      const response = await fetch(upload.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': contentType }, signal: controller.current.signal });
      if (!response.ok) throw new Error('Dosya yüklenemedi. Bağlantını kontrol edip yeniden dene.');
      if (!active.current) throw new Error('Yükleme iptal edildi.');
      const uploaded = await complete.mutateAsync({ mediaId: upload.id });
      if (asset) await discard.mutateAsync({ mediaId: asset.id });
      setAsset(uploaded);
      allocation = null;
      return uploaded;
    } catch (cause) {
      if (allocation) {
        try { await discard.mutateAsync({ mediaId: allocation }); } catch { /* Unlinked allocations expire and are cleaned on the account's next upload. */ }
      }
      if (active.current) setError(cause instanceof Error ? cause.message : 'Dosya yüklenemedi.');
      return null;
    } finally { if (active.current) setBusy(false); }
  };
  const remove = async () => {
    if (!asset || busy) return;
    try { await discard.mutateAsync({ mediaId: asset.id }); setAsset(null); setError(''); }
    catch { setError('Dosya kaldırılamadı. Yeniden dene.'); }
  };
  return { pick, remove, busy, error, asset, markUsed: () => setAsset(null) };
}
