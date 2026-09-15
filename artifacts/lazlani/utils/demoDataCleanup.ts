import {
  DEMO_BOOK_IDS,
  DEMO_COMMENT_IDS,
  DEMO_CONTENT_IDS,
  DEMO_CONVERSATION_IDS,
  DEMO_DATASET_VERSION,
  DEMO_MESSAGE_IDS,
  DEMO_POST_IDS,
  DEMO_USER_IDS,
} from '@/data/demoManifest';

interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface DemoCleanupReport {
  datasetVersion: string;
  mode: 'dry-run' | 'apply';
  removedByKey: Record<string, number>;
  ambiguousKeys: string[];
  totalRemoved: number;
}

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stringField = (value: unknown, field: string): string | undefined =>
  isRecord(value) && typeof value[field] === 'string' ? value[field] as string : undefined;

const filterIdList = (value: unknown, blocked: Set<string>): unknown =>
  Array.isArray(value) ? value.filter(id => typeof id !== 'string' || !blocked.has(id)) : value;

const filterEntityArray = (
  value: unknown,
  blockedIds: Set<string>,
  removeDemoAuthors = false,
): unknown => {
  if (!Array.isArray(value)) return value;
  return value.filter(item => {
    const id = stringField(item, 'id');
    const authorId = stringField(item, 'authorId');
    const userId = stringField(item, 'userId');
    return !(id && blockedIds.has(id))
      && !(removeDemoAuthors && authorId && DEMO_USER_IDS.has(authorId))
      && !(removeDemoAuthors && userId && DEMO_USER_IDS.has(userId));
  });
};

const cleanupLists = (value: unknown): unknown => {
  if (!Array.isArray(value)) return value;
  return value.map(item => {
    if (!isRecord(item)) return item;
    return { ...item, bookIds: filterIdList(item.bookIds, DEMO_BOOK_IDS) };
  });
};

const cleanupBookmarks = (value: unknown): unknown => {
  if (!Array.isArray(value)) return value;
  return value.filter(item => {
    const userId = stringField(item, 'userId');
    const targetId = stringField(item, 'targetId');
    return !(userId && DEMO_USER_IDS.has(userId))
      && !(targetId && DEMO_CONTENT_IDS.has(targetId));
  });
};

const cleanupConversations = (value: unknown): unknown => {
  if (!Array.isArray(value)) return value;
  return value.filter(item => {
    const id = stringField(item, 'id');
    const participantId = stringField(item, 'participantId');
    return !(id && DEMO_CONVERSATION_IDS.has(id))
      && !(participantId && DEMO_USER_IDS.has(participantId));
  });
};

const cleanupMessages = (value: unknown): unknown => {
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([conversationId]) => !DEMO_CONVERSATION_IDS.has(conversationId))
      .map(([conversationId, messages]) => [
        conversationId,
        Array.isArray(messages)
          ? messages
            .filter(message => {
              const id = stringField(message, 'id');
              const senderId = stringField(message, 'senderId');
              return !(id && DEMO_MESSAGE_IDS.has(id))
                && !(senderId && DEMO_USER_IDS.has(senderId));
            })
            .map(message => {
              if (!isRecord(message) || !Array.isArray(message.likedBy)) return message;
              return { ...message, likedBy: filterIdList(message.likedBy, DEMO_USER_IDS) };
            })
          : messages,
      ]),
  );
};

const cleanupOzelComments = (value: unknown): unknown => {
  if (!Array.isArray(value)) return value;
  return value
    .filter(comment => {
      const authorId = stringField(comment, 'authorId');
      return !(authorId && DEMO_USER_IDS.has(authorId));
    })
    .map(comment => {
      if (!isRecord(comment) || !Array.isArray(comment.replies)) return comment;
      return {
        ...comment,
        replies: comment.replies.filter(reply => {
          const authorId = stringField(reply, 'authorId');
          return !(authorId && DEMO_USER_IDS.has(authorId));
        }),
      };
    });
};

const cleanupRecordKeys = (value: unknown, blocked: Set<string>): unknown => {
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !blocked.has(key)));
};

const TRANSFORMS: Record<string, (value: unknown) => unknown> = {
  lazlani_extra_users: value => filterEntityArray(value, DEMO_USER_IDS),
  lazlani_books_data: value => filterEntityArray(value, DEMO_BOOK_IDS, true),
  lazlani_stories_data: value => filterEntityArray(value, new Set(['s1', 's2', 's3']), true),
  lazlani_poems_data: value => filterEntityArray(value, new Set(['p1', 'p2', 'p3']), true),
  lazlani_posts_data: value => filterEntityArray(value, DEMO_POST_IDS, true),
  lazlani_ozel_posts: value => filterEntityArray(value, new Set(), true),
  lazlani_ozel_comments: cleanupOzelComments,
  lazlani_conversations: cleanupConversations,
  lazlani_messages: cleanupMessages,
  lazlani_purchase_requests: value => filterEntityArray(value, new Set(), true),
  lazlani_bookmarks: cleanupBookmarks,
  lazlani_lists: cleanupLists,
  lazlani_likes: value => filterIdList(value, DEMO_CONTENT_IDS),
  lazlani_saves: value => filterIdList(value, DEMO_CONTENT_IDS),
  lazlani_favorites: value => filterIdList(value, DEMO_CONTENT_IDS),
  lazlani_follows: value => filterIdList(value, DEMO_USER_IDS),
  lazlani_post_likes: value => filterIdList(value, DEMO_POST_IDS),
  lazlani_post_saves: value => filterIdList(value, DEMO_POST_IDS),
  lazlani_post_comment_likes: value => filterIdList(value, DEMO_COMMENT_IDS),
  lazlani_ratings: value => cleanupRecordKeys(value, DEMO_CONTENT_IDS),
  lazlani_progress: value => cleanupRecordKeys(value, DEMO_BOOK_IDS),
  lazlani_ozel_daily_videos: value => cleanupRecordKeys(value, DEMO_USER_IDS),
};

const countUnits = (value: unknown): number => {
  if (Array.isArray(value)) {
    return value.reduce(
      (total: number, item) => total + 1 + (isRecord(item)
        ? Object.values(item).reduce(
          (nestedTotal: number, nested) =>
            nestedTotal + (Array.isArray(nested) || isRecord(nested) ? countUnits(nested) : 0),
          0,
        )
        : 0),
      0,
    );
  }
  if (isRecord(value)) {
    return Object.values(value).reduce(
      (total: number, item) => total + 1
        + (Array.isArray(item) || isRecord(item) ? countUnits(item) : 0),
      0,
    );
  }
  return 0;
};

export async function cleanupPersistedDemoData(
  storage: StorageAdapter,
  apply: boolean,
): Promise<DemoCleanupReport> {
  const updates: Array<{ key: string; value: string }> = [];
  const removedByKey: Record<string, number> = {};
  const ambiguousKeys: string[] = [];

  for (const [key, transform] of Object.entries(TRANSFORMS)) {
    const raw = await storage.getItem(key);
    if (!raw) continue;
    try {
      const before: unknown = JSON.parse(raw);
      const after = transform(before);
      const removed = Math.max(0, countUnits(before) - countUnits(after));
      if (removed > 0 || JSON.stringify(before) !== JSON.stringify(after)) {
        removedByKey[key] = removed;
        updates.push({ key, value: JSON.stringify(after) });
      }
    } catch {
      // Malformed or unknown data is ambiguous; preserve it rather than guessing.
      ambiguousKeys.push(key);
    }
  }

  const report: DemoCleanupReport = {
    datasetVersion: DEMO_DATASET_VERSION,
    mode: apply ? 'apply' : 'dry-run',
    removedByKey,
    ambiguousKeys,
    totalRemoved: Object.values(removedByKey).reduce((sum, count) => sum + count, 0),
  };

  console.info('[demo-cleanup] dry-run', { ...report, mode: 'dry-run' });
  if (apply) {
    await Promise.all(updates.map(update => storage.setItem(update.key, update.value)));
    console.info('[demo-cleanup] applied', report);
  }
  return report;
}