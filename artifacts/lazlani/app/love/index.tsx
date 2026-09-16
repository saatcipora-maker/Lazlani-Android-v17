import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Platform,
  ScrollView,
  Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { LinearGradient } from 'expo-linear-gradient';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import { useLoveRoom, loveMessages, useSendLoveMessage, useGetLoveSettings, useUpdateLoveSettings, useEditLoveMessage, useDeleteLoveMessage, useReportLoveContent, getLoveMessagesQueryKey, LoveMessage } from '@workspace/api-client-react';
import { useAuth } from '@/context/AuthContext';
import { useLoveRealtime } from '@/hooks/useLoveRealtime';
import LoveHeader from '@/components/LoveHeader';
import LoveComposer from '@/components/LoveComposer';
import LoveMessageItem from '@/components/LoveMessageItem';
import { mergeLoveMessages } from '@/utils/messageMerge';

export default function LoveGeneralChat() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const { data: room, isLoading: roomLoading, error: roomError } = useLoveRoom();
  const roomId = room?.id;
  
  useLoveRealtime(roomId);

  const { data: settingsData } = useGetLoveSettings();
  const updateSettingsMutation = useUpdateLoveSettings();

  const isSoundEnabled = settingsData?.settings?.sound ?? true;
  
  const toggleSound = () => {
    updateSettingsMutation.mutate({ data: { sound: !isSoundEnabled } });
  };

  const {
    data: messagesData,
    isLoading: messagesLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInfiniteQuery({
    queryKey: [`/api/love/conversations/${roomId}/messages`],
    queryFn: ({ pageParam }) => loveMessages(roomId!, { limit: 50, before: pageParam as string | undefined }),
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    initialPageParam: undefined as string | undefined,
    enabled: !!roomId,
  });
  
  const sendMutation = useSendLoveMessage();
  const editMutation = useEditLoveMessage();
  const deleteMutation = useDeleteLoveMessage();
  const reportMutation = useReportLoveContent();

  const [editingMessage, setEditingMessage] = useState<LoveMessage | null>(null);

  const updateMessageCache = (updater: (messages: LoveMessage[]) => LoveMessage[]) => {
    if (!roomId) return;
    queryClient.setQueriesData({ queryKey: [`/api/love/conversations/${roomId}/messages`] }, (oldData: any) => {
      if (!oldData) return oldData;
      if (oldData.pages) {
        const newPages = oldData.pages.map((page: any, index: number) => {
          if (index === 0) return { ...page, messages: updater(page.messages || []) };
          return page;
        });
        return { ...oldData, pages: newPages };
      }
      return { ...oldData, messages: updater(oldData.messages || []) };
    });
  };

  const handleSend = async (text: string, mediaPath?: string, mediaType?: string) => {
    if (!roomId) return;

    if (editingMessage) {
      if (!text.trim()) return;
      editMutation.mutate({ id: editingMessage.id, data: { body: text.trim() } }, {
        onSuccess: (data) => {
          updateMessageCache(messages => mergeLoveMessages(messages, data.message));
          setEditingMessage(null);
        },
        onError: () => Alert.alert('Hata', 'Mesaj güncellenemedi.')
      });
      return;
    }

    if (!text.trim() && !mediaPath) return;
    const clientMessageId = Date.now().toString() + Math.random().toString(36).substring(2, 9);
    
    sendMutation.mutate({
      id: roomId,
      data: {
        clientMessageId,
        body: text.trim(),
        mediaObjectPath: mediaPath,
        mediaType: mediaType,
      }
    }, {
      onSuccess: (data) => {
        updateMessageCache(messages => mergeLoveMessages(messages, data.message));
      },
      onError: () => Alert.alert('Hata', 'Mesaj gönderilemedi.')
    });
  };

  const handleEdit = (messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (msg) setEditingMessage(msg);
  };

  const handleDelete = (messageId: string) => {
    deleteMutation.mutate({ id: messageId }, {
      onSuccess: () => {
        if (!roomId) return;
        queryClient.invalidateQueries({ queryKey: [`/api/love/conversations/${roomId}/messages`] });
      },
      onError: () => Alert.alert('Hata', 'Mesaj silinemedi.')
    });
  };

  const handleReport = (messageId: string) => {
    reportMutation.mutate({ data: { reason: "Uygunsuz içerik", messageId } }, {
      onSuccess: () => Alert.alert('Başarılı', 'Şikayetiniz alındı.'),
      onError: () => Alert.alert('Hata', 'Şikayet edilemedi.')
    });
  };

  const messages = (messagesData?.pages.flatMap(p => p.messages) || [])
    .filter(message => !message.deletedAt);

  const rightAction = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.headerActions}>
      <TouchableOpacity style={styles.headerBtn} onPress={() => router.replace('/(tabs)' as any)}>
        <Ionicons name="home" size={20} color="#D946EF" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.headerBtn} onPress={() => user && router.push(`/love/profile/${user.id}` as any)}>
        <Ionicons name="person-circle" size={22} color="#D946EF" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.headerBtn} onPress={toggleSound}>
        <Ionicons name={isSoundEnabled ? "musical-notes" : "volume-mute"} size={22} color="#D946EF" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/love/conversations')}>
        <Ionicons name="chatbubbles" size={22} color="#D946EF" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/love/users')}>
        <Ionicons name="people" size={22} color="#D946EF" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/love/settings')}>
        <Ionicons name="settings-outline" size={22} color="#D946EF" />
      </TouchableOpacity>
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#FFF0F5', '#FCE7F3', '#FBCFE8']}
        style={StyleSheet.absoluteFill}
      />
      <LoveHeader 
        title={room?.title || 'LAZLANİ LOVE'} 
        onBack={() => router.replace('/(tabs)' as any)} 
        rightAction={rightAction}
      />

      <KeyboardAvoidingView 
        style={styles.keyboardView} 
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {roomLoading || messagesLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#D946EF" />
          </View>
        ) : roomError ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>Bağlantı kurulamadı.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => router.replace('/(tabs)' as any)}>
              <Text style={styles.retryText}>Geri Dön</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={messages}
            inverted
            keyExtractor={item => item.id}
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) fetchNextPage();
            }}
            onEndReachedThreshold={0.5}
            ListFooterComponent={isFetchingNextPage ? <ActivityIndicator size="small" color="#D946EF" /> : null}
            renderItem={({ item }) => (
              <LoveMessageItem 
                message={item} 
                isOwn={item.senderId === user?.id} 
                onEdit={handleEdit}
                onDelete={handleDelete}
                onReport={handleReport}
              />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
          />
        )}

        <View style={{ paddingBottom: insets.bottom || 16, backgroundColor: 'rgba(255,255,255,0.7)' }}>
          <LoveComposer 
            onSend={handleSend} 
            disabled={!roomId || sendMutation.isPending || editMutation.isPending}
            editingMessage={editingMessage}
            onCancelEdit={() => setEditingMessage(null)}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FDF2F8', // base fallback
  },
  keyboardView: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerBtn: {
    padding: 8,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontFamily: 'Poppins_500Medium',
    color: '#BE185D',
    marginBottom: 16,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#FBCFE8',
    borderRadius: 20,
  },
  retryText: {
    fontFamily: 'Poppins_600SemiBold',
    color: '#9D174D',
  },
});
