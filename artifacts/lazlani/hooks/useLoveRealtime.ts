import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import {
  getLoveConversationsQueryKey,
} from '@workspace/api-client-react';
import { mergeLoveMessages } from '@/utils/messageMerge';

export function useLoveRealtime(activeConversationId?: string) {
  const queryClient = useQueryClient();
  const { addSyncListener, removeSyncListener } = useData();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const handleEvent = (event: any) => {
      // Backend wraps love events with love: true
      if (event.entityType !== 'love' && !event.payload?.love) return;

      const envelope = event.payload;
      if (!envelope || !envelope.love) return;

      const { type, conversationId, payload } = envelope;

      if (type === 'message' && conversationId && payload) {
        const message = payload;
        
        // 1. Update message queries
        queryClient.setQueriesData({ queryKey: [`/api/love/conversations/${conversationId}/messages`] }, (oldData: any) => {
          if (!oldData) return oldData;
          
          if (oldData.pages) {
            // Infinite query structure
            const newPages = oldData.pages.map((page: any, index: number) => {
              if (index === 0) {
                return { ...page, messages: mergeLoveMessages(page.messages || [], message) };
              }
              return page;
            });
            return { ...oldData, pages: newPages };
          }
          
          // Regular query structure
          return {
            ...oldData,
            messages: mergeLoveMessages(oldData.messages || [], message),
          };
        });

        // 2. Update conversation list
        queryClient.setQueriesData({ queryKey: getLoveConversationsQueryKey() }, (oldData: any) => {
          if (!oldData) return oldData;
          
          let found = false;
          const newConversations = (oldData.conversations || []).map((conv: any) => {
            if (conv.id === conversationId) {
              found = true;
              
              // Only increment unread if we're not currently looking at this room and the message is from someone else
              const isUnread = message.senderId !== user.id && conversationId !== activeConversationId;
              
              return {
                ...conv,
                lastMessage: { ...message, id: message.id, createdAt: message.createdAt },
                updatedAt: message.createdAt,
                unreadCount: isUnread ? (conv.unreadCount || 0) + 1 : (conv.unreadCount || 0)
              };
            }
            return conv;
          });

          if (!found) {
            queryClient.invalidateQueries({ queryKey: getLoveConversationsQueryKey() });
            return oldData; 
          }

          return {
            ...oldData,
            conversations: newConversations.sort((a: any, b: any) => 
              new Date(b.updatedAt || b.lastMessage?.createdAt || 0).getTime() - 
              new Date(a.updatedAt || a.lastMessage?.createdAt || 0).getTime()
            ),
          };
        });
      }
      
      if (type === 'read' && conversationId) {
        queryClient.invalidateQueries({ queryKey: getLoveConversationsQueryKey() });
      }
      
      if (type === 'reaction' && conversationId) {
        queryClient.invalidateQueries({ queryKey: [`/api/love/conversations/${conversationId}/messages`] });
      }
    };

    addSyncListener(handleEvent);
    return () => {
      removeSyncListener(handleEvent);
    };
  }, [user, addSyncListener, removeSyncListener, queryClient, activeConversationId]);
}
