import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useListNotifications, useMarkNotificationRead } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Page, TopBar, Panel, Empty, LoadingState, ErrorState, Avatar, ui } from '@/components/FavoriUI';
import { useColors } from '@/hooks/useColors';

export default function NotificationsScreen() {
  const colors = useColors();
  const client = useQueryClient();
  const query = useListNotifications();
  const mark = useMarkNotificationRead();
  const icons: Record<string, keyof typeof Feather.glyphMap> = { comment: 'message-circle', like: 'heart', save: 'bookmark', follow: 'user-plus' };
  return <Page>
    <TopBar title="Bildirimler" />
    <Text style={[ui.body, { color: colors.mutedForeground }]}>Okur halkandaki yenilikler.</Text>
    {query.isLoading ? <LoadingState /> : query.isError ? <ErrorState retry={() => query.refetch()} /> : query.data?.length ? query.data.map((item) => <Pressable key={item.id} onPress={() => {
      if (!item.isRead) mark.mutate({ notificationId: item.id }, { onSuccess: () => { client.invalidateQueries({ queryKey: ['/api/notifications'] }); client.invalidateQueries({ queryKey: ['/api/app/bootstrap'] }); } });
      if (item.relatedBookId) router.push(`/book/${item.relatedBookId}` as Href);
      else if (item.relatedProfileId) router.push(`/profile/${item.relatedProfileId}` as Href);
    }}><Panel style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderColor: item.isRead ? colors.border : colors.primary, backgroundColor: item.isRead ? colors.card : colors.paper }}>
      <Avatar name={item.actorName} uri={item.actorAvatarUrl} />
      <View style={{ flex: 1, gap: 3 }}><Text style={[ui.body, { color: colors.deep }]}><Text style={{ fontWeight: '700' }}>{item.actorName}</Text> {item.text}</Text><Text style={[ui.caption, { color: colors.mutedForeground }]}>{item.timeLabel}</Text></View>
      <Feather name={icons[item.action] || 'bell'} size={17} color={colors.primary} />
    </Panel></Pressable>) : <Empty title="Şimdilik sessiz" description="Yeni yorumlar, beğeniler ve takipler burada görünür." icon="bell" />}
  </Page>;
}
