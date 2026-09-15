import React, { useEffect, useRef } from 'react';
import {
  Animated, Platform, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs, useRouter } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { useData } from '@/context/DataContext';

const ND = Platform.OS !== 'web';

/* ── Native tab bar for Liquid Glass (iOS 26+) ─────────── */
function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <Label>Ana Sayfa</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="messages">
        <Icon sf={{ default: 'bubble.left', selected: 'bubble.left.fill' }} />
        <Label>Mesajlar</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="library">
        <Icon sf={{ default: 'books.vertical', selected: 'books.vertical.fill' }} />
        <Label>Kütüphane</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: 'person', selected: 'person.fill' }} />
        <Label>Profil</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

/* ── Tab button ─────────────────────────────────────────── */
type TabDef = {
  name: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconActive: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  badge?: number;
};

function TabButton({ item, active, onPress }: { item: TabDef; active: boolean; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;

  const press = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.85, duration: 70, useNativeDriver: ND }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: ND, tension: 300, friction: 10 }),
    ]).start();
    onPress();
  };

  const activeColor = '#EF4444';
  const inactiveColor = '#8A7EC0';

  return (
    <Pressable
      testID={`tab-${item.name}`}
      accessibilityRole="tab"
      accessibilityLabel={item.label}
      onPress={press}
      style={styles.tabBtn}
      hitSlop={8}
    >
      <Animated.View style={[styles.tabInner, { transform: [{ scale }] }]}>
        <View style={styles.iconWrap}>
          <Ionicons
            name={active ? item.iconActive : item.icon}
            size={22}
            color={active ? activeColor : inactiveColor}
          />
          {!!item.badge && (
            <View style={styles.badge}>
              <Text style={styles.badgeTxt}>{item.badge > 9 ? '9+' : item.badge}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.lbl, { color: active ? activeColor : inactiveColor },
          active && styles.lblActive]}>
          {item.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

/* ── Centre Write FAB ───────────────────────────────────── */
function WriteFab({ onPress }: { onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;

  const press = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.88, duration: 70, useNativeDriver: ND }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: ND, tension: 300, friction: 10 }),
    ]).start();
    onPress();
  };

  return (
    <Pressable
      testID="tab-write"
      accessibilityRole="button"
      accessibilityLabel="Yeni eser yaz"
      onPress={press}
      style={styles.fabWrap}
      hitSlop={6}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <LinearGradient
          colors={['#9B59F5', '#7C3AED']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.fab}
        >
          <Ionicons name="pencil" size={22} color="#fff" />
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

/* ── Custom flat bottom bar ─────────────────────────────── */
function CustomBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { conversations } = useData();
  const unread = conversations.reduce((s, c) => s + c.unreadCount, 0);

  const routes = state.routes;
  const activeIdx = state.index;
  const isActive = (name: string) => routes[activeIdx]?.name === name;
  const jump = (name: string) => navigation.navigate(name);

  const LEFT: TabDef[] = [
    { name: 'index',    icon: 'home-outline',   iconActive: 'home',   label: 'Ana Sayfa' },
    { name: 'messages', icon: 'chatbubble-outline', iconActive: 'chatbubble', label: 'Mesajlar', badge: unread || undefined },
  ];
  const RIGHT: TabDef[] = [
    { name: 'library',  icon: 'book-outline',   iconActive: 'book',   label: 'Kütüphane' },
    { name: 'profile',  icon: 'person-outline', iconActive: 'person', label: 'Profil' },
  ];

  const botPad = Platform.OS === 'web' ? 0 : insets.bottom;

  return (
    <View style={[styles.bar, { paddingBottom: botPad, backgroundColor: '#15122E' }]}>
      {/* Top border gradient */}
      <LinearGradient
        colors={['rgba(155,89,245,0.4)', 'rgba(155,89,245,0)']}
        start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={styles.topBorder}
      />

      <View style={styles.row}>
        {LEFT.map(t => (
          <TabButton key={t.name} item={t} active={isActive(t.name)} onPress={() => jump(t.name)} />
        ))}

        <WriteFab onPress={() => router.push('/write' as any)} />

        {RIGHT.map(t => (
          <TabButton key={t.name} item={t} active={isActive(t.name)} onPress={() => jump(t.name)} />
        ))}
      </View>
    </View>
  );
}

/* ── Tab layout shell ───────────────────────────────────── */
function ClassicTabLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="messages" />
      <Tabs.Screen name="library" />
      <Tabs.Screen name="profile" />
      {/* Discover still routable but not shown in bar */}
      <Tabs.Screen name="discover" options={{ href: null }} />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) return <NativeTabLayout />;
  return <ClassicTabLayout />;
}

const styles = StyleSheet.create({
  bar: {
    width: '100%',
    borderTopWidth: 0,
  },
  topBorder: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
    paddingHorizontal: 4,
  },
  tabBtn: { flex: 1, alignItems: 'center' },
  tabInner: { alignItems: 'center', gap: 4, paddingVertical: 2 },
  iconWrap: { position: 'relative', width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  lbl: { fontFamily: 'Poppins_400Regular', fontSize: 10, letterSpacing: 0.1 },
  lblActive: { fontFamily: 'Poppins_600SemiBold' },
  badge: {
    position: 'absolute', top: -4, right: -6,
    backgroundColor: '#EC4899', borderRadius: 8, minWidth: 15, height: 15,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  badgeTxt: { color: '#fff', fontSize: 8, fontFamily: 'Poppins_700Bold' },
  fabWrap: { alignItems: 'center', justifyContent: 'center', paddingBottom: 10 },
  fab: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#9B59F5', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 12, elevation: 10,
  },
});
