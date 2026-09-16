import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSearchLoveUsers, useListLovePresence, getSearchLoveUsersQueryKey, getListLovePresenceQueryKey } from '@workspace/api-client-react';
import LoveHeader from '@/components/LoveHeader';
import UserAvatar from '@/components/UserAvatar';

export default function LoveUsersScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const { data, isLoading } = useSearchLoveUsers({ q: query }, { query: { staleTime: 30000, queryKey: getSearchLoveUsersQueryKey({ q: query }) } });
  const { data: presenceData } = useListLovePresence({ query: { refetchInterval: 15000, queryKey: getListLovePresenceQueryKey() } });
  
  const users = data?.users || [];
  const presenceMap = new Map((presenceData?.presence || []).map((p: any) => [p.userId, p.status]));

  return (
    <View style={styles.container}>
      <LoveHeader title="Kullanıcılar" />
      
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#F472B6" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Kullanıcı ara..."
          placeholderTextColor="#F472B6"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color="#D946EF" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }: { item: any }) => (
            <TouchableOpacity 
              style={styles.userCard}
              onPress={() => router.push(`/love/profile/${item.id}` as any)}
            >
              <UserAvatar 
                name={item.displayName || item.username} 
                color={item.avatarColor || '#F472B6'}
                size={48}
                showOnline={presenceMap.get(item.id) === 'online'}
              />
              <View style={styles.userInfo}>
                <Text style={styles.displayName}>{item.displayName || item.username}</Text>
                <Text style={styles.username}>@{item.username}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#FBCFE8" />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Kullanıcı bulunamadı.</Text>
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    margin: 16,
    borderRadius: 24,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(244,114,182,0.3)',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 48,
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
    color: '#9D174D',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 12,
  },
  userCard: {
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
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  displayName: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 15,
    color: '#9D174D',
  },
  username: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    color: '#F472B6',
  },
  emptyText: {
    textAlign: 'center',
    fontFamily: 'Poppins_400Regular',
    color: '#F472B6',
    marginTop: 40,
  }
});
