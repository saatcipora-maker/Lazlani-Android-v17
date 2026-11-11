import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { useListStories } from '@workspace/api-client-react';
import { Avatar, SectionTitle } from '@/components/FavoriUI';
import { useColors } from '@/hooks/useColors';

export function StoriesStrip() {
  const colors = useColors();
  const { isSignedIn } = useAuth();
  const stories = useListStories({ query: { enabled: !!isSignedIn, refetchInterval: 60000 } });
  const open = (id?: string) => router.push((!isSignedIn ? '/auth' : id ? `/stories?id=${id}` : '/stories') as Href);
  return <View style={{ gap: 10 }}>
    <SectionTitle title="Okur halkası" action="Tümünü gör" onPress={() => open()} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
      <Pressable accessibilityLabel="Hikâye paylaş" onPress={() => open()} style={{ width: 67, alignItems: 'center', gap: 6 }}><View style={{ width: 59, height: 59, borderRadius: 30, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card }}><Feather name="plus" size={23} color={colors.primary} /></View><Text style={{ fontSize: 11, color: colors.deep }}>Hikâyem</Text></Pressable>
      {(stories.data ?? []).map((story) => <Pressable key={story.id} onPress={() => open(story.id)} style={{ width: 67, alignItems: 'center', gap: 6 }}>
        <View style={{ borderRadius: 30, padding: 3, borderWidth: 1.5, borderColor: story.seen ? colors.border : colors.primary }}><Avatar name={story.author} uri={story.avatarUrl} size={53} /></View>
        <Text numberOfLines={1} style={{ fontSize: 11, color: colors.deep }}>{story.author.split(' ')[0]}</Text>
      </Pressable>)}
    </ScrollView>
    {stories.isError ? <Pressable onPress={() => void stories.refetch()}><Text style={{ color: colors.destructive }}>Hikâyeler yüklenemedi. Yeniden dene.</Text></Pressable> : null}
  </View>;
}
