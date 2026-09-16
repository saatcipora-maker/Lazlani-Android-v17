import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useLoveUserProfile, useCreateLoveConversation } from '@workspace/api-client-react';
import LoveHeader from '@/components/LoveHeader';
import UserAvatar from '@/components/UserAvatar';
import { LinearGradient } from 'expo-linear-gradient';

export default function LoveProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  
  const { data, isLoading } = useLoveUserProfile(id!);
  const createConvMutation = useCreateLoveConversation();

  const handleMessage = () => {
    if (!id) return;
    createConvMutation.mutate({ data: { userId: id } }, {
      onSuccess: (conv) => {
        router.push(`/love/dm/${conv.id}` as any);
      }
    });
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <LoveHeader title="Profil" />
        <View style={styles.center}><ActivityIndicator size="large" color="#D946EF" /></View>
      </View>
    );
  }

  if (!data?.user) {
    return (
      <View style={styles.container}>
        <LoveHeader title="Profil" />
        <View style={styles.center}><Text style={styles.errorText}>Kullanıcı bulunamadı</Text></View>
      </View>
    );
  }

  const user = data.user as any;
  const presence = data.presence as any;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#FCE7F3', '#FDF2F8']}
        style={StyleSheet.absoluteFill}
      />
      <LoveHeader title="Profil" />
      
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.avatarSection}>
          <UserAvatar 
            name={user.displayName || user.username} 
            color={user.avatarColor || '#F472B6'}
            size={100}
            showOnline={presence?.status === 'online'}
          />
          <Text style={styles.displayName}>{user.displayName || user.username}</Text>
          <Text style={styles.username}>@{user.username}</Text>
          {!!user.bio && <Text style={styles.bio}>{user.bio}</Text>}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity 
            style={styles.messageBtn} 
            onPress={handleMessage}
            disabled={createConvMutation.isPending}
          >
            {createConvMutation.isPending ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="chatbubbles" size={20} color="#FFF" />
                <Text style={styles.messageBtnText}>Mesaj Gönder</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FDF2F8',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontFamily: 'Poppins_500Medium',
    color: '#BE185D',
  },
  content: {
    padding: 24,
    alignItems: 'center',
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  displayName: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 22,
    color: '#831843',
    marginTop: 16,
  },
  username: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 15,
    color: '#D946EF',
    marginBottom: 12,
  },
  bio: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
    color: '#9D174D',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  actions: {
    width: '100%',
    paddingHorizontal: 20,
  },
  messageBtn: {
    backgroundColor: '#D946EF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 24,
    gap: 8,
    shadowColor: '#D946EF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  messageBtnText: {
    fontFamily: 'Poppins_600SemiBold',
    color: '#FFF',
    fontSize: 16,
  }
});
