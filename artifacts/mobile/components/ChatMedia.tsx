import React, { useEffect, useState } from 'react';
import { Image, type ImageProps } from 'expo-image';
import { useAuth } from '@clerk/expo';

// App Storage photos require the same session as chat reads, including in Expo
// Go where the image loader does not share browser cookies.
export function ChatMedia({ uri, ...props }: Omit<ImageProps, 'source'> & { uri: string }) {
  const { getToken, userId } = useAuth();
  const protectedPhoto = uri.startsWith('/api/chat/');
  const [session, setSession] = useState<{ uri: string; userId: string; token: string } | null>(null);
  useEffect(() => {
    let active = true;
    if (protectedPhoto && userId) {
      void getToken().then((token) => {
        if (active && token) setSession({ uri, userId, token });
      }).catch(() => { if (active) setSession(null); });
    }
    return () => { active = false; };
  }, [uri, userId, protectedPhoto, getToken]);
  if (protectedPhoto && (!session || session.uri !== uri || session.userId !== userId)) return null;
  const source = protectedPhoto
    ? { uri: `https://${process.env.EXPO_PUBLIC_DOMAIN}${uri}`, headers: { Authorization: `Bearer ${session!.token}` } }
    : { uri };
  return <Image {...props} source={source} cachePolicy={protectedPhoto ? 'none' : 'disk'} />;
}
