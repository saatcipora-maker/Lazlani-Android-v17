import React, { useEffect } from 'react';
import { FlatList, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useData } from '@/context/DataContext';
import { Notification } from '@/data/types';
import UserAvatar from '@/components/UserAvatar';

const TYPE_ICONS: Record<string, { name: string; color: string }> = {
  like: { name: 'heart', color: '#EC4899' },
  comment: { name: 'chatbubble', color: '#9B59F5' },
  reply: { name: 'arrow-undo', color: '#3B82F6' },
  follow: { name: 'person-add', color: '#22C55E' },
  rating: { name: 'star', color: '#F59E0B' },
  feature: { name: 'flash', color: '#F59E0B' },
};

function timeAgo(iso: string) {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return 'şimdi';
  const diff = Math.max(0, (Date.now() - timestamp) / 1000);
  if (diff < 3600) return `${Math.floor(diff / 60)}dk`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa`;
  return `${Math.floor(diff / 86400)}g önce`;
}

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { notifications, markNotifsRead } = useData();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  useEffect(() => {
    const timer = setTimeout(markNotifsRead, 1500);
    return () => clearTimeout(timer);
  }, []);

  const handleNotificationPress = (item: Notification) => {
    if (item.targetType && item.targetId) {
      if (item.targetType === 'post') {
        router.push('/(tabs)' as any);
        return;
      }
      router.push(`/${item.targetType}/${item.targetId}` as any);
      return;
    }
    if (item.type === 'follow' && item.fromUserId) {
      router.push(`/user/${item.fromUserId}` as any);
    }
  };

  const renderItem = ({ item }: { item: Notification }) => {
    const icon = TYPE_ICONS[item.type] ?? { name: 'notifications', color: colors.primary };
    return (
      <TouchableOpacity
        onPress={() => handleNotificationPress(item)}
        disabled={!item.targetId && item.type !== 'follow'}
        accessibilityRole="button"
        accessibilityLabel={`${item.fromUsername} bildirimi`}
        style={[
          styles.item,
          !item.isRead && { backgroundColor: colors.card + '80' },
          { borderBottomColor: colors.border },
        ]}
        activeOpacity={0.7}
      >
        <View style={{ position: 'relative' }}>
          <UserAvatar name={item.fromUsername} color={item.fromAvatarColor} size={46} />
          <View style={[styles.typeIcon, { backgroundColor: icon.color }]}>
            <Ionicons name={icon.name as any} size={10} color="#fff" />
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.message, { color: colors.foreground }]}>
            <Text style={styles.username}>{item.fromUsername}</Text>
            {' '}{item.message}
          </Text>
          {item.targetTitle && (
            <Text style={[styles.target, { color: colors.primary }]} numberOfLines={1}>
              "{item.targetTitle}"
            </Text>
          )}
          <Text style={[styles.time, { color: colors.mutedForeground }]}>{timeAgo(item.createdAt)}</Text>
        </View>
        {!item.isRead && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Bildirimler</Text>
        <TouchableOpacity onPress={markNotifsRead}>
          <Text style={[styles.readAll, { color: colors.primary }]}>Tümü Okundu</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={notifications}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="notifications-outline" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Bildirim Yok</Text>
          </View>
        }
        contentContainerStyle={Platform.OS === 'web' ? { paddingBottom: 80 } : {}}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 16 },
  backBtn: { padding: 4 },
  title: { fontFamily: 'Poppins_700Bold', fontSize: 22, flex: 1 },
  readAll: { fontFamily: 'Poppins_500Medium', fontSize: 13 },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1,
  },
  typeIcon: {
    position: 'absolute', bottom: -2, right: -2, width: 18, height: 18,
    borderRadius: 9, alignItems: 'center', justifyContent: 'center',
  },
  message: { fontFamily: 'Poppins_400Regular', fontSize: 14, lineHeight: 20 },
  username: { fontFamily: 'Poppins_700Bold' },
  target: { fontFamily: 'Poppins_500Medium', fontSize: 12, marginTop: 2 },
  time: { fontFamily: 'Poppins_400Regular', fontSize: 11, marginTop: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10 },
  emptyText: { fontFamily: 'Poppins_500Medium', fontSize: 16 },
});
