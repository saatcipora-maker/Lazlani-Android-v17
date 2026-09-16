import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { AppState, AppStateStatus } from 'react-native';
import { useHeartbeatLovePresence } from '@workspace/api-client-react';

export default function LoveLayout() {
  const heartbeat = useHeartbeatLovePresence();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    
    const sendHeartbeat = () => {
      heartbeat.mutate({ data: { status: 'online' } });
    };

    const handleAppState = (state: AppStateStatus) => {
      if (state === 'active') {
        sendHeartbeat();
        timer = setInterval(sendHeartbeat, 30000); // 30s
      } else {
        clearInterval(timer);
      }
    };

    // Initial heartbeat if app is active
    if (AppState.currentState === 'active') {
      sendHeartbeat();
      timer = setInterval(sendHeartbeat, 30000);
    }

    const sub = AppState.addEventListener('change', handleAppState);
    
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="users" />
      <Stack.Screen name="conversations" />
      <Stack.Screen name="dm/[id]" />
      <Stack.Screen name="profile/[id]" />
      <Stack.Screen name="admin" />
    </Stack>
  );
}
