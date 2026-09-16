import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useLoveConversations, useListLovePresence, getListLovePresenceQueryKey, LoveConversation } from '@workspace/api-client-react';
import LoveHeader from '@/components/LoveHeader';
import UserAvatar from '@/components/UserAvatar';

export default function LoveConversationsScreen() {
  const router = useRouter();
  
  const { data, isLoading } = useLoveConversations();
  const { data: presenceData } = useListLovePresence({ query: { refetchInterval: 15000, queryKey: getListLovePresenceQueryKey() } });
  
  const conversations = data?.conversations || [];
  const presenceMap = new Map((presenceData?.presence || []).map((p: any) => [p.userId, p.status]));

  return (
    <View style={styles.container}>
      <LoveHeader title="Mesajlar" />

      {isLoading ? (
        <ActivityIndicator size="large" color="#D946EF" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }: { item: LoveConversation }) => {
            const partner = item.partner as any || {};
            const isOnline = presenceMap.get(partner.id) === 'online';
            
            return (
              <TouchableOpacity 
                style={styles.card}
                onPress={() => router.push(`/love/dm/${item.id}` as any)}
              >
                <UserAvatar 
                  name={partner.displayName || partner.username || 'K'} 
                  color={partner.avatarColor || '#F472B6'}
                  size={52}
                  showOnline={isOnline}
                />
                <View style={styles.info}>
                  <Text style={styles.name} numberOfLines={1}>
                    {partner.displayName || partner.username || 'Kullanıcı'}
                  </Text>
                  <Text style={[styles.lastMessage, item.unreadCount > 0 && styles.unreadMessage]} numberOfLines={1}>
                    {item.lastMessage?.body || (item.lastMessage?.mediaObjectPath ? 'Fotoğraf gönderdi' : 'Bir sohbet başlattınız.')}
                  </Text>
                </View>
                {item.unreadCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.unreadCount}</Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={20} color="#FBCFE8" style={{ marginLeft: 8 }} />
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Henüz bir mesajlaşma yok.</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FDF2F8',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 12,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  info: {
    flex: 1,
    marginLeft: 12,
  },
  name: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 15,
    color: '#9D174D',
    marginBottom: 2,
  },
  lastMessage: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    color: '#F472B6',
  },
  unreadMessage: {
    fontFamily: 'Poppins_600SemiBold',
    color: '#D946EF',
  },
  badge: {
    backgroundColor: '#D946EF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: '#FFF',
    fontFamily: 'Poppins_700Bold',
    fontSize: 11,
  },
  emptyText: {
    textAlign: 'center',
    fontFamily: 'Poppins_400Regular',
    color: '#F472B6',
    marginTop: 40,
  }
});
