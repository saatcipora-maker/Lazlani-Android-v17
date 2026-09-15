import type { SyncOperationType } from '@workspace/api-client-react';

export interface LegacyMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  [key: string]: unknown;
}

export interface LegacyConversation {
  id: string;
  participantId?: string;
  [key: string]: unknown;
}

export interface LegacyRecord {
  id: string;
  authorId?: string;
  postId?: string;
  commentId?: string;
  replies?: LegacyRecord[];
  [key: string]: unknown;
}

export interface LegacyReaction {
  targetId: string;
  targetType: string;
  value: string;
  active?: boolean;
}

export interface LegacyMigrationInput {
  messagesByConv?: Record<string, LegacyMessage[]>;
  conversations?: LegacyConversation[];
  comments?: LegacyRecord[];
  postComments?: LegacyRecord[];
  ozelPosts?: LegacyRecord[];
  ozelComments?: LegacyRecord[];
  likedIds?: string[];
  postLikedIds?: string[];
  postCommentLikedIds?: string[];
  ozelLikedIds?: string[];
  ozelCommentLikedIds?: string[];
  userRatings?: Record<string, number>;
  reactions?: LegacyReaction[];
  passthroughScopedWrites?: Record<string, unknown>;
}

export interface LegacyOperation {
  clientOperationId: string;
  operationType: SyncOperationType;
  payload: Record<string, unknown>;
}

export interface LegacyMigrationPlan {
  eligible: boolean;
  scopedWrites: Record<string, unknown>;
  operations: LegacyOperation[];
}

export function legacySyncEntityId(kind: string, userId: string, legacyId: string): string {
  return `legacy-${kind.length}:${kind}-${userId.length}:${userId}-${legacyId.length}:${legacyId}`;
}

function operationId(kind: string, userId: string, legacyId: string): string {
  return legacySyncEntityId(`operation-${kind}`, userId, legacyId);
}

function ownId(kind: string, userId: string, id: string, owner: string): string {
  return owner === userId ? legacySyncEntityId(kind, userId, id) : id;
}

function transformRecord(
  record: LegacyRecord,
  kind: string,
  userId: string,
  parentId?: string,
): LegacyRecord {
  const id = ownId(kind, userId, record.id, String(record.authorId ?? ''));
  const result: LegacyRecord = { ...record, id };
  if (parentId) result.commentId = parentId;
  if (record.replies) {
    result.replies = record.replies.map(reply =>
      transformRecord(reply, `${kind}-reply`, userId, id));
  }
  return result;
}

function ownedRecord(
  record: LegacyRecord,
  userId: string,
): boolean {
  return record.authorId === userId;
}

export function planLegacyMigration(
  input: LegacyMigrationInput,
  storedAuthUserId: string | undefined,
  userId: string,
): LegacyMigrationPlan {
  if (!storedAuthUserId || storedAuthUserId !== userId) {
    return { eligible: false, scopedWrites: {}, operations: [] };
  }

  const conversations = (input.conversations ?? []).map(conversation => ({
    ...conversation,
    id: legacySyncEntityId('conversation', userId, conversation.id),
  }));
  const conversationIds = new Map((input.conversations ?? []).map(conversation => [
    conversation.id,
    legacySyncEntityId('conversation', userId, conversation.id),
  ]));
  const postCommentIds = new Map((input.postComments ?? []).map(comment => [
    comment.id,
    ownedRecord(comment, userId) ? legacySyncEntityId('post-comment', userId, comment.id) : comment.id,
  ]));
  const ozelPostIds = new Map((input.ozelPosts ?? []).map(post => [
    post.id,
    ownedRecord(post, userId) ? legacySyncEntityId('ozel-video', userId, post.id) : post.id,
  ]));
  const ozelCommentIds = new Map((input.ozelComments ?? []).map(comment => [
    comment.id,
    ownedRecord(comment, userId) ? legacySyncEntityId('ozel-comment', userId, comment.id) : comment.id,
  ]));
  const operations: LegacyOperation[] = [];
  const messagesByConv: Record<string, LegacyMessage[]> = {};
  for (const [legacyConversationId, messages] of Object.entries(input.messagesByConv ?? {})) {
    const conversationId = conversationIds.get(legacyConversationId)
      ?? legacySyncEntityId('conversation', userId, legacyConversationId);
    messagesByConv[conversationId] = messages.map(message => {
      const normalized = { ...message, id: ownId('message', userId, message.id, message.senderId), conversationId };
      if (message.senderId === userId) {
        const conversation = (input.conversations ?? []).find(item => item.id === legacyConversationId);
        if (conversation?.participantId) {
          operations.push({
            clientOperationId: operationId('message', userId, message.id),
            operationType: 'create_message',
            payload: {
              ...normalized,
              recipientUserId: conversation.participantId,
            },
          });
        }
      }
      return normalized;
    });
  }

  const mapRecords = (
    records: LegacyRecord[] | undefined,
    kind: string,
    operationType: SyncOperationType,
    parentMap?: Map<string, string>,
  ): LegacyRecord[] => (records ?? []).map(record => {
    const parentId = typeof record.postId === 'string' ? record.postId : undefined;
    const normalized = transformRecord(record, kind, userId, undefined);
    if (parentId && parentMap?.has(parentId)) {
      normalized.postId = parentMap.get(parentId);
    }
    if (ownedRecord(record, userId)) {
      operations.push({
        clientOperationId: operationId(kind, userId, record.id),
        operationType,
        payload: { ...normalized, replies: [] },
      });
    }
    const normalizedReplies = normalized.replies ?? [];
    (record.replies ?? []).forEach((reply, index) => {
      const normalizedReply = normalizedReplies[index];
      if (ownedRecord(reply, userId) && normalizedReply) {
        operations.push({
          clientOperationId: operationId(`${kind}-reply`, userId, reply.id),
          operationType: kind.startsWith('ozel-') ? 'create_ozel_reply' : 'create_reply',
          payload: { ...normalizedReply, commentId: normalized.id },
        });
      }
    });
    return normalized;
  });

  const comments = mapRecords(input.comments, 'comment', 'create_comment');
  const postComments = mapRecords(input.postComments, 'post-comment', 'create_comment');
  const ozelPosts = (input.ozelPosts ?? []).map(post => {
    const normalized = transformRecord(post, 'ozel-video', userId);
    if (ownedRecord(post, userId)) {
      operations.push({
        clientOperationId: operationId('ozel-video', userId, post.id),
        operationType: 'upsert_ozel_video',
        payload: { ...normalized },
      });
    }
    return normalized;
  });
  const ozelComments = mapRecords(input.ozelComments, 'ozel-comment', 'create_ozel_comment', ozelPostIds);
  const remapIds = (ids: string[] | undefined, idMap: Map<string, string>): string[] =>
    (ids ?? []).map(id => idMap.get(id) ?? id);
  const remappedPostCommentLikes = remapIds(input.postCommentLikedIds, postCommentIds);
  const remappedOzelLikes = remapIds(input.ozelLikedIds, ozelPostIds);
  const remappedOzelCommentLikes = remapIds(input.ozelCommentLikedIds, ozelCommentIds);

  const scopedWrites: Record<string, unknown> = {
    lazlani_conversations: conversations,
    lazlani_messages: messagesByConv,
    lazlani_comments: comments,
    lazlani_post_comments: postComments,
    lazlani_ozel_posts: ozelPosts,
    lazlani_ozel_comments: ozelComments,
    lazlani_likes: input.likedIds ?? [],
    lazlani_post_likes: input.postLikedIds ?? [],
    lazlani_post_comment_likes: remappedPostCommentLikes,
    lazlani_ozel_likes: remappedOzelLikes,
    lazlani_ozel_comment_likes: remappedOzelCommentLikes,
    lazlani_ratings: input.userRatings ?? {},
    ...(input.passthroughScopedWrites ?? {}),
  };
  const addLikes = (ids: string[] | undefined, kind: string, targetType: string) => {
    for (const targetId of ids ?? []) {
      operations.push({
        clientOperationId: operationId(`${kind}-${targetType}`, userId, targetId),
        operationType: 'toggle_like',
        payload: { targetId, targetType, active: true },
      });
    }
  };
  addLikes(input.likedIds, 'like', 'content');
  addLikes(input.postLikedIds, 'like', 'post');
  addLikes(remappedPostCommentLikes, 'like', 'post_comment');
  addLikes(remappedOzelLikes, 'like', 'ozel_video');
  addLikes(remappedOzelCommentLikes, 'like', 'ozel_comment');
  for (const [targetId, rating] of Object.entries(input.userRatings ?? {})) {
    operations.push({
      clientOperationId: operationId('vote', userId, targetId),
      operationType: 'toggle_vote',
      payload: { targetId, targetType: 'content', active: true, rating, value: rating },
    });
  }
  for (const reaction of input.reactions ?? []) {
    const reactionMap = reaction.targetType === 'post_comment'
      ? postCommentIds
      : reaction.targetType === 'ozel_comment'
        ? ozelCommentIds
        : reaction.targetType === 'ozel_video' ? ozelPostIds : undefined;
    const targetId = reactionMap?.get(reaction.targetId) ?? reaction.targetId;
    operations.push({
      clientOperationId: operationId(`reaction-${reaction.targetType}`, userId, targetId),
      operationType: 'set_reaction',
      payload: {
        targetId,
        targetType: reaction.targetType,
        value: reaction.value,
        active: reaction.active !== false,
      },
    });
  }
  return { eligible: true, scopedWrites, operations };
}