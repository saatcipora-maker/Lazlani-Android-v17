import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs, router, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useGetAppBootstrap } from '@workspace/api-client-react';

const items = [
  { route: 'index', label: 'Akış', icon: 'home' as const },
  { route: 'books', label: 'Kitaplarım', icon: 'book-open' as const },
  { route: 'create', label: 'Kitap Yaz', icon: 'plus' as const, raised: true },
  { route: 'notifications', label: 'Bildirimler', icon: 'bell' as const },
  { route: 'profile', label: 'Profilim', icon: 'user' as const },
];

function Bar({ state }: any) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bootstrap = useGetAppBootstrap();
  const unread = bootstrap.data?.notifications.filter((item) => !item.isRead).length ?? 0;
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10), backgroundColor: colors.paper, borderColor: colors.border }]}>
      {items.map((item, index) => {
        const focused = state.index === index;
        return (
          <Pressable
            key={item.route}
            testID={`tab-${item.route}`}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            onPress={() => {
              if (item.route === 'create') {
                router.push('/compose' as Href);
                return;
              }
              const destination = item.route === 'index' ? '/(tabs)' : `/(tabs)/${item.route}`;
              router.navigate(destination as Href);
            }}
            style={styles.tab}
          >
            {item.raised ? (
              <View style={[styles.createButton, { backgroundColor: colors.primary, borderColor: colors.paper }]}>
                <Feather name="plus" size={23} color={colors.primaryForeground} />
              </View>
            ) : (
              <Feather name={item.icon} size={20} color={focused ? colors.deep : colors.mutedForeground} />
            )}
            <Text style={[styles.label, { color: focused ? colors.deep : colors.mutedForeground, fontWeight: focused ? '700' : '500' }]}>{item.label}</Text>
            {item.route === 'notifications' && unread > 0 ? <Text style={{ position: 'absolute', right: 10, top: -4, minWidth: 16, borderRadius: 8, backgroundColor: colors.primary, color: colors.deep, textAlign: 'center', fontSize: 10 }}>{unread}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabLayout() {
  const colors = useColors();
  return (
    <Tabs tabBar={(props) => <Bar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="books" />
      <Tabs.Screen name="create" />
      <Tabs.Screen name="notifications" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', bottom: 0, left: 0, right: 0, minHeight: 76, paddingTop: 10, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-around', borderTopWidth: 1 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 54 },
  label: { fontSize: 10, letterSpacing: 0.1 },
  createButton: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 4, marginTop: -27 },
});
