import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from '@expo-google-fonts/poppins';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { DataProvider } from '@/context/DataContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { setBaseUrl } from '@workspace/api-client-react';
import { apiOrigin } from '@/services/apiOrigin';

setBaseUrl(apiOrigin());

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === 'auth';
    if (!user && !inAuthGroup) {
      router.replace('/auth/login');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [user, loading, segments]);

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="auth" options={{ headerShown: false }} />
      <Stack.Screen name="book/[id]" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="story/[id]" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="poem/[id]" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="user/[id]" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="chat/[id]" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="notifications" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="write" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
      <Stack.Screen name="reader/[id]" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
      <Stack.Screen name="edit-profile" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="settings" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="minnit-chat" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
      <Stack.Screen name="bulten" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="terms" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="privacy" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="copyright" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="support" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="contact" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="admin" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
      <Stack.Screen name="dergi"  options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="ozel"   options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="bremil"      options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="lazlani-ai"  options={{ headerShown: false, animation: 'slide_from_bottom' }} />
      <Stack.Screen name="category"    options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="theme"         options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="drafts"            options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="favorites"         options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="my-recommendations" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="edit-book"         options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="match3"            options={{ headerShown: false, animation: 'slide_from_bottom' }} />
      <Stack.Screen name="premium"       options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="cart"          options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="game"          options={{ headerShown: false, animation: 'slide_from_bottom' }} />
      <Stack.Screen name="write-chapter" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
      <Stack.Screen name="bookmarks"     options={{ headerShown: false, animation: 'slide_from_right' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <ThemeProvider>
                <DataProvider>
                  <AuthProvider>
                    <RootLayoutNav />
                  </AuthProvider>
                </DataProvider>
              </ThemeProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
