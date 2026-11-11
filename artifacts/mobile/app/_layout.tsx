import React, { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { setBaseUrl } from '@workspace/api-client-react';
import { AuthSessionBoundary } from '@/components/AuthSessionBoundary';
import { PlayfairDisplay_600SemiBold, PlayfairDisplay_700Bold, PlayfairDisplay_600SemiBold_Italic } from '@expo-google-fonts/playfair-display';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);

function AppLoading() {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: '#F5EFE6' }}><ActivityIndicator size="large" color="#C9A24B" /><Text style={{ color: '#3E2A1A', fontSize: 18 }}>Afilli açılıyor…</Text></View>;
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false, headerBackTitle: 'Geri', headerTintColor: '#4A2C1A', contentStyle: { backgroundColor: '#F5EEE3' } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="auth" options={{ title: 'Afilli’ye katıl' }} />
      <Stack.Screen name="book/[id]" options={{ title: 'Kitap' }} />
      <Stack.Screen name="read/[id]" options={{ title: 'Okuma' }} />
      <Stack.Screen name="comments/[id]" options={{ title: 'Yorumlar' }} />
      <Stack.Screen name="+not-found" options={{ title: 'Sayfa bulunamadı' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_700Bold,
    PlayfairDisplay_600SemiBold_Italic,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return <AppLoading />;

  return (
    <ClerkProvider publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ''} tokenCache={tokenCache} proxyUrl={process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <AuthSessionBoundary fallback={<AppLoading />}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </AuthSessionBoundary>
        </ErrorBoundary>
      </SafeAreaProvider>
    </ClerkProvider>
  );
}
