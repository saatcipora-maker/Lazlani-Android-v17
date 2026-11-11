import React from 'react';
import { Text } from 'react-native';
import { router, type Href } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import { useListPosts, useTogglePostLike } from '@workspace/api-client-react';
import { ErrorState, LoadingState, PostCard, SectionTitle } from '@/components/FavoriUI';
import { useColors } from '@/hooks/useColors';

export function UserPosts({ authorId }: { authorId: string }) {
  const colors = useColors();
  const { isSignedIn } = useAuth();
  const client = useQueryClient();
  const query = useListPosts({ authorId }, { query: { enabled: !!authorId } });
  const like = useTogglePostLike();
  return <><SectionTitle title="Paylaşımlar" />{query.isLoading ? <LoadingState /> : query.isError ? <ErrorState retry={() => void query.refetch()} /> : query.data?.length ? query.data.map((post) => <PostCard key={post.id} post={post} onLike={() => !isSignedIn ? router.push('/auth') : like.mutate({ postId: post.id }, { onSuccess: () => void client.invalidateQueries() })} onComments={() => router.push(`/comments/${post.id}?type=post` as Href)} />) : <Text style={{ color: colors.mutedForeground }}>Henüz paylaşım yok.</Text>}</>;
}
