import React, { useState } from 'react';
import { FlatList, Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { Conversation } from '@/data/types';
import UserAvatar from '@/components/UserAvatar';

function timeLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = diffMs / 3600000;
  if (diffH < 24) return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

export default function MessagesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { conversations, users, startConversation } = useData();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
  const [showPicker, setShowPicker] = useState(false);

  // Only show users not already in a conversation
  const existingIds = new Set(conversations.map(c => c.participantId));
  const newUsers = users.filter(u => u.id !== user?.id && !existingIds.has(u.id));

  const renderItem = ({ item }: { item: Conversation }) => (
    <TouchableOpacity
      onPress={() => router.push(`/chat/${item.id}` as any)}
      style={[styles.item, { borderBottomColor: colors.border }]}
      activeOpacity={0.7}
    >
      <View style={{ position: 'relative' }}>
        <UserAvatar name={item.participantName} color={item.participantAvatarColor} size={52} showOnline={item.isOnline} />
      </View>
      <View style={styles.itemContent}>
        <View style={styles.itemTop}>
          <Text style={[styles.name, { color: colors.foreground }]}>{item.participantName}</Text>
          <Text style={[styles.time, { color: colors.mutedForeground }]}>{timeLabel(item.lastMessageTime)}</Text>
        </View>
        <View style={styles.itemBottom}>
          <Text style={[styles.preview, { color: colors.mutedForeground }]} numberOfLines={1}>{item.lastMessage}</Text>
          {item.unreadCount > 0 && (
            <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.unreadText}>{item.unreadCount}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View testID="screen-messages" style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Mesajlar</Text>
        {totalUnread > 0 && (
          <View style={[styles.totalBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.totalBadgeText}>{totalUnread}</Text>
          </View>
        )}
        <TouchableOpacity style={styles.newBtn} onPress={() => setShowPicker(true)}>
          <Ionicons name="create-outline" size={24} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Mesaj Yok</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      {/* New conversation picker */}
      <Modal visible={showPicker} transparent animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowPicker(false)} />
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Yeni Mesaj</Text>
          <Text style={[styles.sheetSub, { color: colors.mutedForeground }]}>Mesaj göndermek istediğin kişiyi seç</Text>
          <FlatList
            data={newUsers}
            keyExtractor={u => u.id}
            style={{ maxHeight: 340 }}
            renderItem={({ item: u }) => (
              <TouchableOpacity
                style={[styles.pickerRow, { borderBottomColor: colors.border }]}
                onPress={() => {
                  setShowPicker(false);
                  const existing = conversations.find(c => c.participantId === u.id);
                  const conversationId = existing?.id ?? startConversation(u);
                  router.push(`/chat/${conversationId}` as any);
                }}
              >
                <UserAvatar name={u.displayName} color={u.avatarColor} size={46} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pickerName, { color: colors.foreground }]}>{u.displayName}</Text>
                  <Text style={[styles.pickerSub, { color: colors.mutedForeground }]}>@{u.username}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={[styles.noUsers, { color: colors.mutedForeground }]}>
                Mesaj gönderebileceğiniz yeni kullanıcı bulunamadı.
              </Text>
            }
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20,
    paddingBottom: 16, gap: 8,
  },
  title: { fontFamily: 'Poppins_700Bold', fontSize: 28, flex: 1 },
  totalBadge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  totalBadgeText: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: 11 },
  newBtn: { padding: 4 },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1,
  },
  itemContent: { flex: 1 },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  name: { fontFamily: 'Poppins_600SemiBold', fontSize: 15 },
  time: { fontFamily: 'Poppins_400Regular', fontSize: 12 },
  itemBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  preview: { fontFamily: 'Poppins_400Regular', fontSize: 13, flex: 1, marginRight: 8 },
  unreadBadge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  unreadText: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: 11 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10 },
  emptyText: { fontFamily: 'Poppins_500Medium', fontSize: 16 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, paddingHorizontal: 20,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 14 },
  sheetTitle: { fontFamily: 'Poppins_700Bold', fontSize: 18, marginBottom: 4 },
  sheetSub: { fontFamily: 'Poppins_400Regular', fontSize: 13, marginBottom: 14 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  pickerName: { fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
  pickerSub: { fontFamily: 'Poppins_400Regular', fontSize: 12, marginTop: 2 },
  noUsers: { fontFamily: 'Poppins_400Regular', fontSize: 13, textAlign: 'center', paddingVertical: 24 },
});
