import React, { useEffect, useLayoutEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '@clerk/expo';
import { setAuthTokenGetter } from '@workspace/api-client-react';

/** Replacing the entire scope also discards drafts, selected readers and mutations. */
export function AuthSessionBoundary({ children, fallback = null }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const { userId, isLoaded, getToken } = useAuth();
  if (!isLoaded) return fallback;
  return <SessionScope key={userId ?? 'guest'} getToken={getToken} fallback={fallback}>{children}</SessionScope>;
}

function SessionScope({ children, getToken, fallback }: {
  children: React.ReactNode;
  getToken: () => Promise<string | null>;
  fallback?: React.ReactNode;
}) {
  const [client] = useState(() => new QueryClient());
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    let active = true;
    setAuthTokenGetter(async () => {
      const token = await getToken();
      return active ? token ?? null : null;
    });
    setReady(true);
    return () => {
      active = false;
      setAuthTokenGetter(null);
    };
  }, [getToken]);
  useEffect(() => () => {
    void client.cancelQueries();
    client.clear();
  }, [client]);
  return <QueryClientProvider client={client}>{ready ? children : fallback}</QueryClientProvider>;
}
