import { fetch as expoFetch } from 'expo/fetch';
import {
  finalizeUpload,
  requestUploadUrl,
  type UploadUrlRequestContentType,
  type UploadUrlRequestNamespace,
} from '@workspace/api-client-react';
import { apiUrl } from '@/services/apiOrigin';

const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

function contentType(value: string): UploadUrlRequestContentType | null {
  switch (value.toLowerCase()) {
    case 'image/jpeg':
    case 'image/png':
    case 'image/webp':
      return value.toLowerCase() as UploadUrlRequestContentType;
    default:
      return null;
  }
}

function fileName(namespace: UploadUrlRequestNamespace, type: string): string {
  const extension = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  return `${namespace}-${Date.now()}.${extension}`;
}

export async function uploadSocialMedia(
  localUri: string,
  namespace: UploadUrlRequestNamespace,
): Promise<string> {
  if (/^https?:\/\//i.test(localUri)) return localUri;
  const localResponse = await expoFetch(localUri);
  if (!localResponse.ok) throw new Error('Seçilen fotoğraf okunamadı.');
  const blob = await localResponse.blob();
  const type = contentType(blob.type || 'image/jpeg');
  if (!type) throw new Error('Yalnız JPEG, PNG veya WebP fotoğraflar yüklenebilir.');
  if (blob.size < 1 || blob.size > MAX_MEDIA_BYTES) {
    throw new Error('Fotoğraf en fazla 10 MB olabilir.');
  }
  const upload = await requestUploadUrl({
    name: fileName(namespace, type),
    size: blob.size,
    contentType: type,
    namespace,
  });
  const uploadResponse = await expoFetch(upload.uploadURL, {
    method: 'PUT',
    headers: { 'Content-Type': type },
    body: blob,
  });
  if (!uploadResponse.ok) throw new Error('Fotoğraf depolamaya yüklenemedi.');
  const finalized = await finalizeUpload({
    objectPath: upload.objectPath,
    size: blob.size,
    contentType: type,
  });
  return apiUrl(`/api/storage${finalized.objectPath}`);
}

export const uploadSocialPostImage = (uri: string) => uploadSocialMedia(uri, 'social-posts');
export const uploadDmPhoto = (uri: string) => uploadSocialMedia(uri, 'dm-photos');

