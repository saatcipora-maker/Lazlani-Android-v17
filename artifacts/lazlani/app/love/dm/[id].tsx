import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Platform,
  Text,
  TouchableOpacity,
  Alert
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { LinearGradient } from 'expo-linear-gradient';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import { loveMessages, useSendLoveMessage, useMarkLoveConversationRead, useEditLoveMessage, useDeleteLoveMessage, useReportLoveContent, getLoveMessagesQueryKey, LoveMessage } from '@workspace/api-client-react';
import { useAuth } from '@/context/AuthContext';
import { useLoveRealtime } from '@/hooks/useLoveRealtime';
import LoveHeader from '@/components/LoveHeader';
import LoveComposer from '@/components/LoveComposer';
import LoveMessageItem from '@/components/LoveMessageItem';
import { mergeLoveMessages } from '@/utils/messageMerge';

export default function LoveDMScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  useLoveRealtime(id);

  const {
    data: messagesData,
    isLoading: messagesLoading,
    error: messagesError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInfiniteQuery({
    queryKey: [`/api/love/conversations/${id}/messages`],
    queryFn: ({ pageParam }) => loveMessages(id!, { limit: 50, before: pageParam as string | undefined }),
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    initialPageParam: undefined as string | undefined,
    enabled: !!id,
  });
  
  const sendMutation = useSendLoveMessage();
  const markReadMutation = useMarkLoveConversationRead();
  const editMutation = useEditLoveMessage();
  const deleteMutation = useDeleteLoveMessage();
  const reportMutation = useReportLoveContent();

  const messages = (messagesData?.pages.flatMap(p => p.messages) || [])
    .filter(message => !message.deletedAt);

  const lastReadRef = useRef<string | null>(null);

  useEffect(() => {
    if (id && messages.length > 0) {
      const lastMsg = messages[0];
      if (lastMsg && lastMsg.senderId !== user?.id && lastReadRef.current !== lastMsg.id) {
        lastReadRef.current = lastMsg.id;
        markReadMutation.mutate({ id, data: { messageId: lastMsg.id } });
      }
    }
  }, [id, messages, user?.id]);

  const [editingMessage, setEditingMessage] = useState<LoveMessage | null>(null);

  const updateMessageCache = (updater: (messages: LoveMessage[]) => LoveMessage[]) => {
    if (!id) return;
    queryClient.setQueriesData({ queryKey: [`/api/love/conversations/${id}/messages`] }, (oldData: any) => {
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
    if (!id) return;

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
      id,
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
        if (!id) return;
        queryClient.invalidateQueries({ queryKey: [`/api/love/conversations/${id}/messages`] });
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

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#FFF0F5', '#FCE7F3', '#FBCFE8']}
        style={StyleSheet.absoluteFill}
      />
      <LoveHeader 
        title="Sohbet" 
        onBack={() => router.back()} 
      />

      <KeyboardAvoidingView 
        style={styles.keyboardView} 
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {messagesLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#D946EF" />
          </View>
        ) : messagesError ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>Sohbet yüklenemedi.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => router.back()}>
              <Text style={styles.retryText}>Geri</Text>
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
            disabled={!id || sendMutation.isPending || editMutation.isPending}
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
    backgroundColor: '#FDF2F8',
  },
  keyboardView: {
    flex: 1,
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
