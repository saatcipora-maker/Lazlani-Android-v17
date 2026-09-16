import React, { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AdminLog, Book, Bookmark, Chapter, Comment, ContactMessage, Conversation, DergiPost, Message, Notification, OzelComment, OzelCommentReply, OzelPost, Poem, Post, PostComment, PostReply, PurchaseRequest, PurchaseType, ReadingList, RecommendationStatus, Story, SupportTicket, TicketStatus, User } from '@/data/types';
import { SAMPLE_USERS } from '@/data/sampleData';
import { DEFAULT_BANNED_WORDS, FilterLevel, filterContent } from '@/utils/contentFilter';
import { cleanupPersistedDemoData } from '@/utils/demoDataCleanup';
import { DEMO_DATA_ENABLED, DEMO_USER_IDS } from '@/data/demoManifest';
import {
  MESSAGES_BY_CONV,
  SAMPLE_BOOKS,
  SAMPLE_COMMENTS,
  SAMPLE_CONVERSATIONS,
  SAMPLE_NOTIFICATIONS,
  SAMPLE_POEMS,
  SAMPLE_POSTS,
  SAMPLE_STORIES,
} from '@/data/sampleData';
import type { SyncRecord } from '@workspace/api-client-react';
import { scopedSyncKey, syncEntityId, SyncService } from '@/services/syncService';
import type { QueuedSyncOperation } from '@/services/syncService';
import { planLegacyMigration } from '@/services/legacyMigrationPlanner';
import type { LegacyMigrationInput } from '@/services/legacyMigrationPlanner';
import {
  shouldApplyAggregateVersion,
  type AggregateVersion,
} from '@/services/aggregateVersion';
import {
  absoluteAggregateValue,
  reconcileCommentCount,
  resolveCommentParentId,
  sortPostsByCreatedAt,
} from '@/services/postProjection';

const SAMPLE_POST_COMMENTS: PostComment[] = [
  {
    id: 'pc1',
    postId: 'post0',
    authorId: 'u2',
    authorName: 'Mehmet Derin',
    authorAvatarColor: '#EC4899',
    content: 'Harika bir hikaye, okudum ve çok etkilendim!',
    likesCount: 12,
    reactions: { '❤️': 8, '🔥': 3 },
    replies: [
      {
        id: 'pr1',
        commentId: 'pc1',
        authorId: 'u1',
        authorName: 'Ayşe Kalem',
        authorAvatarColor: '#9B59F5',
        content: 'Teşekkür ederim, çok mutlu oldum! 🙏',
        likesCount: 5,
        createdAt: '2024-07-25T10:00:00Z',
      },
    ],
    createdAt: '2024-07-25T09:00:00Z',
  },
  {
    id: 'pc2',
    postId: 'post1',
    authorId: 'u5',
    authorName: 'Zeynep Masalcı',
    authorAvatarColor: '#3B82F6',
    content: 'Bu duygu herkese tanıdık geliyor... Yazarlık bazen öyle bir sessizlik ki...',
    likesCount: 24,
    reactions: { '😢': 15, '❤️': 9 },
    replies: [],
    createdAt: '2024-07-23T19:00:00Z',
  },
];

export function reconcileAbsoluteCount(current: number, serverValue: unknown): number {
  if (serverValue === null || serverValue === undefined || serverValue === '') return current;
  const value = Number(serverValue);
  return Number.isFinite(value) ? Math.max(0, value) : current;
}

export function reconcileAbsoluteRating(
  current: { rating: number; ratingCount: number },
  ratingAverage: unknown,
  ratingCount: unknown,
): { rating: number; ratingCount: number } {
  const nextCount = ratingCount === null || ratingCount === undefined || ratingCount === ''
    ? NaN : Number(ratingCount);
  const nextAverage = ratingAverage === null || ratingAverage === undefined || ratingAverage === ''
    ? NaN : Number(ratingAverage);
  return {
    rating: Number.isFinite(nextAverage) ? nextAverage : current.rating,
    ratingCount: Number.isFinite(nextCount) ? Math.max(0, nextCount) : current.ratingCount,
  };
}

interface DataContextType {
  books: Book[];
  stories: Story[];
  poems: Poem[];
  posts: Post[];
  comments: Comment[];
  postComments: PostComment[];
  notifications: Notification[];
  conversations: Conversation[];
  messagesByConv: Record<string, Message[]>;
  lists: ReadingList[];
  likedIds: Set<string>;
  savedIds: Set<string>;
  followedIds: Set<string>;
  postLikedIds: Set<string>;
  postSavedIds: Set<string>;
  postCommentLikedIds: Set<string>;
  userRatings: Record<string, number>;
  readProgress: Record<string, number>;
  unreadNotifCount: number;
  // Support & Contact
  supportTickets: SupportTicket[];
  contactMessages: ContactMessage[];
  adminLogs: AdminLog[];
  // Admin user management (local state)
  adminUsers: typeof SAMPLE_USERS;
  // Dergi & Özel
  dergiPosts: DergiPost[];
  ozelPosts: OzelPost[];
  dergiLikedIds: Set<string>;
  ozelLikedIds: Set<string>;
  addDergiPost: (post: DergiPost) => void;
  addOzelPost: (post: OzelPost) => void;
  toggleDergiLike: (id: string) => void;
  toggleOzelLike: (id: string) => void;
  // Özel comments
  ozelComments: OzelComment[];
  ozelCommentLikedIds: Set<string>;
  addOzelComment: (comment: OzelComment) => void;
  addOzelCommentReply: (commentId: string, reply: OzelCommentReply) => void;
  toggleOzelCommentLike: (commentId: string) => void;
  deleteOzelPost: (postId: string) => void;
  updateOzelPost: (id: string, patch: Partial<OzelPost>) => void;
  getOzelVideoCountToday: (userId: string) => number;
  incrementOzelVideoCount: (userId: string) => void;
  // Admin permission management
  adminGrantPermission: (userId: string, perm: 'canMagazineWrite' | 'canPostVideo' | 'canPostPhoto') => void;
  adminRevokePermission: (userId: string, perm: 'canMagazineWrite' | 'canPostVideo' | 'canPostPhoto') => void;
  adminBanUser: (userId: string, until?: string) => void;
  adminUnbanUser: (userId: string) => void;
  // Favorites
  favoriteIds: Set<string>;
  toggleFavorite: (id: string) => void;
  // Book edit / delete
  updateBook: (id: string, patch: Partial<Book>) => void;
  deleteBook: (id: string) => void;
  updateChapter: (bookId: string, chapterId: string, patch: Partial<Chapter>) => void;
  deleteChapter: (bookId: string, chapterId: string) => void;
  recommendBook: (id: string, status: import('@/data/types').RecommendationStatus) => void;
  // Bookmarks
  bookmarks: Bookmark[];
  addBookmark: (bm: Bookmark) => void;
  removeBookmark: (id: string) => void;
  // Draft & chapter actions
  publishDraft: (id: string, type: 'book' | 'story' | 'poem') => void;
  addChapterToBook: (bookId: string, chapter: Chapter) => void;
  // Haftanın kitabı
  weeklyBookId: string | null;
  setWeeklyBookId: (id: string | null) => void;
  // İçerik filtresi
  bannedWords: string[];
  filterLevel: FilterLevel;
  addBannedWord: (word: string) => void;
  removeBannedWord: (word: string) => void;
  setFilterLevelAdmin: (level: FilterLevel) => void;
  checkContent: (text: string) => { ok: boolean; message?: string };
  toggleLike: (id: string) => void;
  toggleSave: (id: string) => void;
  toggleFollow: (userId: string) => void;
  togglePostLike: (id: string) => void;
  togglePostSave: (id: string) => void;
  rateContent: (id: string, rating: number) => void;
  setReadProgress: (bookId: string, percent: number) => void;
  addBook: (book: Book) => void;
  addStory: (story: Story) => void;
  addPoem: (poem: Poem) => void;
  addPost: (post: Post) => void;
  updatePost: (id: string, patch: Partial<Post>) => void;
  deletePost: (id: string) => void;
  addComment: (comment: Comment) => void;
  addReply: (commentId: string, reply: import('@/data/types').Reply) => void;
  addPostComment: (comment: PostComment) => void;
  deletePostComment: (commentId: string) => void;
  addPostCommentReply: (commentId: string, reply: PostReply) => void;
  togglePostCommentLike: (commentId: string) => void;
  addReactionToPostComment: (commentId: string, emoji: string) => void;
  sendMessage: (convId: string, senderId: string, content: string, mediaUrl?: string) => void;
  deleteMessage: (convId: string, messageId: string) => void;
  startConversation: (participant: User) => string;
  toggleMessageLike: (convId: string, messageId: string, userId: string) => void;
  markNotifsRead: () => void;
  addList: (list: ReadingList) => void;
  removeList: (id: string) => void;
  addToList: (listId: string, bookId: string) => void;
  removeFromList: (listId: string, bookId: string) => void;
  // Support / Contact
  addSupportTicket: (ticket: SupportTicket) => void;
  addContactMessage: (msg: ContactMessage) => void;
  updateTicketStatus: (id: string, status: TicketStatus, reply?: string) => void;
  updateContactStatus: (id: string, status: TicketStatus, reply?: string) => void;
  // Admin actions
  adminSuspendUser: (userId: string) => void;
  adminActivateUser: (userId: string) => void;
  adminDeleteUser: (userId: string) => void;
  adminRemovePost: (postId: string) => void;
  adminRemoveComment: (commentId: string) => void;
  addAdminLog: (log: AdminLog) => void;
  // Satın alma talepleri
  purchaseRequests: PurchaseRequest[];
  requestPurchase: (type: PurchaseType, planName: string, price: string, userId: string, userName: string, vipFrameColor?: string) => void;
  approvePurchase: (requestId: string) => void;
  rejectPurchase: (requestId: string) => void;
  renewPurchase: (requestId: string) => void;
  // Mesaj okundu
  markConversationRead: (convId: string) => void;
  // Kullanıcılar (sample + kayıtlı)
  users: User[];
  addUser: (user: User) => void;
  /** AuthContext bridge; DataProvider intentionally remains outside AuthProvider. */
  setSyncSession: (userId: string | null, token: string | null, legacyOwnerUserId?: string | null) => void;
  addSyncListener: (listener: (event: any) => void) => void;
  removeSyncListener: (listener: (event: any) => void) => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const [books, setBooks] = useState<Book[]>(DEMO_DATA_ENABLED ? SAMPLE_BOOKS : []);
  const [stories, setStories] = useState<Story[]>(DEMO_DATA_ENABLED ? SAMPLE_STORIES : []);
  const [poems, setPoems] = useState<Poem[]>(DEMO_DATA_ENABLED ? SAMPLE_POEMS : []);
  const [posts, setPosts] = useState<Post[]>(DEMO_DATA_ENABLED ? SAMPLE_POSTS : []);
  const [comments, setComments] = useState<Comment[]>(DEMO_DATA_ENABLED ? SAMPLE_COMMENTS : []);
  const [postComments, setPostComments] = useState<PostComment[]>(DEMO_DATA_ENABLED ? SAMPLE_POST_COMMENTS : []);
  const [notifications, setNotifications] = useState<Notification[]>(DEMO_DATA_ENABLED ? SAMPLE_NOTIFICATIONS : []);
  const [conversations, setConversations] = useState<Conversation[]>(DEMO_DATA_ENABLED ? SAMPLE_CONVERSATIONS : []);
  const [messagesByConv, setMessagesByConv] = useState<Record<string, Message[]>>(DEMO_DATA_ENABLED ? MESSAGES_BY_CONV : {});
  const [lists, setLists] = useState<ReadingList[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [postLikedIds, setPostLikedIds] = useState<Set<string>>(new Set());
  const [postSavedIds, setPostSavedIds] = useState<Set<string>>(new Set());
  const [postCommentLikedIds, setPostCommentLikedIds] = useState<Set<string>>(new Set());
  const [userRatings, setUserRatings] = useState<Record<string, number>>({});
  const [readProgress, setReadProgressState] = useState<Record<string, number>>({});
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [contactMessages, setContactMessages] = useState<ContactMessage[]>([]);
  const [adminLogs, setAdminLogs] = useState<AdminLog[]>([]);
  const [adminUsers, setAdminUsers] = useState(DEMO_DATA_ENABLED ? SAMPLE_USERS : []);
  const [dergiPosts, setDergiPosts] = useState<DergiPost[]>([]);
  const [ozelPosts, setOzelPosts] = useState<OzelPost[]>([]);
  const [dergiLikedIds, setDergiLikedIds] = useState<Set<string>>(new Set());
  const [ozelLikedIds, setOzelLikedIds] = useState<Set<string>>(new Set());
  const [ozelComments, setOzelComments] = useState<OzelComment[]>([]);
  const [ozelCommentLikedIds, setOzelCommentLikedIds] = useState<Set<string>>(new Set());
  const [ozelDailyVideos, setOzelDailyVideos] = useState<Record<string, {count: number, date: string}>>({});
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [weeklyBookId, setWeeklyBookId] = useState<string | null>(null);
  const [bannedWords, setBannedWords] = useState<string[]>(DEFAULT_BANNED_WORDS);
  const [filterLevel, setFilterLevel] = useState<FilterLevel>('orta');
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]);
  const [users, setUsers] = useState<User[]>(DEMO_DATA_ENABLED ? [...SAMPLE_USERS] : []);
  const postsRef = useRef(posts);
  const postCommentsRef = useRef(postComments);
  const ozelCommentsRef = useRef(ozelComments);
  const syncServiceRef = useRef<SyncService | null>(null);
  const syncUserRef = useRef<string | null>(null);
  const syncGenerationRef = useRef(0);
  type InteractionState = { active: boolean; value?: string | number };
  const interactionStateRef = useRef<Map<string, InteractionState>>(new Map());
  const aggregateVersionRef = useRef<Map<string, AggregateVersion>>(new Map());
  const bookRollbackRef = useRef<Map<string, Book | undefined>>(new Map());
  const postRollbackRef = useRef<Map<string, Post | undefined>>(new Map());
  const readingStartedRef = useRef<Set<string>>(new Set());

  useEffect(() => { postsRef.current = posts; }, [posts]);
  useEffect(() => { postCommentsRef.current = postComments; }, [postComments]);
  useEffect(() => { ozelCommentsRef.current = ozelComments; }, [ozelComments]);
  const interactionKey = (actorId: string, kind: string, targetType: string, targetId: string) =>
    `${actorId}:${kind}:${targetType}:${targetId}`;
  const aggregateVersionKey = (kind: string, targetType: string, targetId: string) =>
    `${kind}:${targetType}:${targetId}`;
  const isNewAggregateVersion = (
    key: string,
    updatedAt: string,
    tieBreaker: string,
    aggregateRevision?: unknown,
  ): boolean => {
    const next = {
      updatedAt,
      tieBreaker,
      ...(typeof aggregateRevision === 'number' ? { aggregateRevision } : {}),
    };
    const previous = aggregateVersionRef.current.get(key);
    if (!shouldApplyAggregateVersion(previous, next)) return false;
    aggregateVersionRef.current.set(key, next);
    return true;
  };

  const updateRatingAggregate = (
    targetId: string,
    previousValue: number | undefined,
    nextValue: number | undefined,
  ) => {
    const update = <T extends { id: string; rating: number; ratingCount: number }>(items: T[]) => items.map(item => {
      if (item.id !== targetId) return item;
      const count = item.ratingCount;
      const total = item.rating * count;
      if (previousValue === undefined && nextValue === undefined) return item;
      if (previousValue === undefined && nextValue !== undefined) {
        return { ...item, rating: (total + nextValue) / Math.max(1, count + 1), ratingCount: count + 1 };
      }
      if (previousValue !== undefined && nextValue === undefined) {
        const nextCount = Math.max(0, count - 1);
        return { ...item, rating: nextCount ? (total - previousValue) / nextCount : 0, ratingCount: nextCount };
      }
      return {
        ...item,
        rating: count ? (total - (previousValue ?? 0) + (nextValue ?? 0)) / count : (nextValue ?? 0),
      };
    });
    setBooks(prev => {
      const next = update(prev);
      persistSyncCollection('lazlani_books_data', next);
      return next;
    });
    setStories(prev => {
      const next = update(prev);
      persistSyncCollection('lazlani_stories_data', next);
      return next;
    });
    setPoems(prev => {
      const next = update(prev);
      persistSyncCollection('lazlani_poems_data', next);
      return next;
    });
  };

  const applyAbsoluteRatingAggregate = (
    targetId: string,
    ratingAverage: unknown,
    ratingCount: unknown,
  ) => {
    const update = <T extends { id: string; rating: number; ratingCount: number }>(items: T[]) =>
      items.map(item => item.id === targetId
        ? { ...item, ...reconcileAbsoluteRating(item, ratingAverage, ratingCount) } : item);
    setBooks(prev => {
      const next = update(prev);
      persistSyncCollection('lazlani_books_data', next);
      return next;
    });
    setStories(prev => {
      const next = update(prev);
      persistSyncCollection('lazlani_stories_data', next);
      return next;
    });
    setPoems(prev => {
      const next = update(prev);
      persistSyncCollection('lazlani_poems_data', next);
      return next;
    });
  };

  const persistSyncCollection = (
    key: string,
    value: unknown,
    userId = syncUserRef.current,
    generation = syncGenerationRef.current,
  ) => {
    if (!userId || generation !== syncGenerationRef.current) return;
    const scopedKey = scopedSyncKey(key, userId);
    const serialized = JSON.stringify(value);
    void AsyncStorage.setItem(scopedKey, serialized);
  };

  const applySyncRecord = (record: SyncRecord, own: boolean) => {
    const payload = record.payload as Record<string, any>;
    const actorId = typeof payload.actorUserId === 'string' ? payload.actorUserId : undefined;
    const canonical = (value: any) => actorId ? { ...value, authorId: actorId, actorUserId: actorId } : value;
    switch (record.entityType) {
      case 'post': {
        const postId = typeof payload.id === 'string' ? payload.id : '';
        if (!postId) return;
        setPosts(prev => {
          const next = payload.deleted === true
            ? prev.filter(post => post.id !== postId)
            : sortPostsByCreatedAt(
              prev.some(post => post.id === postId)
                ? prev.map(post => post.id === postId ? { ...post, ...canonical(payload) } as Post : post)
                : [{ ...canonical(payload), id: postId } as Post, ...prev],
            );
          persistSyncCollection('lazlani_posts_data', next);
          return next;
        });
        break;
      }
      case 'book': {
        const bookPayload = canonical(payload);
        const bookId = typeof bookPayload.id === 'string' ? bookPayload.id : '';
        if (!bookId) return;
        // Drafts are owner-only records on the server. Keep this guard in
        // the projection as well so a stale journal/event cannot leak a
        // private draft into another account's local book list.
        if (bookPayload.deleted !== true && bookPayload.isDraft === true && !own) return;
        setBooks(prev => {
          const next = bookPayload.deleted === true
            ? prev.filter(book => book.id !== bookId)
            : prev.some(book => book.id === bookId)
              ? prev.map(book => book.id === bookId ? bookPayload as Book : book)
              : [bookPayload as Book, ...prev];
          persistSyncCollection('lazlani_books_data', next);
          return next;
        });
        break;
      }
      case 'message': {
        const message = canonical(payload) as Message & { deleted?: boolean };
        if (!message.id) return;
        if (message.deleted === true) {
          setMessagesByConv(prev => {
            const next = Object.fromEntries(Object.entries(prev).map(([conversationId, items]) => [
              conversationId,
              items.filter(item => item.id !== message.id),
            ]));
            persistSyncCollection('lazlani_messages', next);
            return next;
          });
          break;
        }
        if (!message.conversationId) return;
        const mediaPayload = payload.media && typeof payload.media === 'object'
          ? payload.media as Record<string, any> : undefined;
        const photoPayload = payload.photo && typeof payload.photo === 'object'
          ? payload.photo as Record<string, any> : undefined;
        const mediaUrl = message.mediaUrl
          ?? (typeof mediaPayload?.url === 'string' ? mediaPayload.url : undefined)
          ?? (typeof photoPayload?.url === 'string' ? photoPayload.url : undefined);
        setMessagesByConv(prev => {
          const current = prev[message.conversationId] ?? [];
          const canonicalMessage = {
            ...message,
            senderId: actorId ?? message.senderId,
            type: mediaUrl ? 'photo' as const : (message.type ?? 'text') as 'text' | 'photo',
            ...(mediaUrl ? { mediaUrl } : {}),
          };
          const nextMessages = current.some(item => item.id === message.id)
            ? current.map(item => item.id === message.id ? { ...item, ...canonicalMessage } : item)
            : [...current, canonicalMessage];
          const next = { ...prev, [message.conversationId]: nextMessages };
          persistSyncCollection('lazlani_messages', next);
          return next;
        });
        setConversations(prev => {
          const isOwnMessage = own || actorId === syncUserRef.current;
          const participantId = isOwnMessage
            ? String(payload.recipientUserId ?? '')
            : String(actorId ?? '');
          const participant = users.find(user => user.id === participantId);
          const actor = actorId ? users.find(user => user.id === actorId) : undefined;
          const recipient = participantId ? users.find(user => user.id === participantId) : undefined;
          const existing = prev.some(c => c.id === message.conversationId);
          const next = existing
            ? prev.map(c => c.id === message.conversationId
              ? {
                ...c,
                participantId: c.participantId || participantId,
                participantName: c.participantName || participant?.displayName || participantId || 'Kullanıcı',
                participantAvatarColor: c.participantAvatarColor
                  || participant?.avatarColor || '#9B59F5',
                lastMessage: mediaUrl ? 'Fotoğraf' : message.content,
                lastMessageTime: message.createdAt,
              } : c)
            : [{
              id: message.conversationId,
              participantId,
              participantName: isOwnMessage
                ? String(payload.recipientName ?? recipient?.displayName ?? participantId ?? 'Kullanıcı')
                : String(payload.senderName ?? actor?.displayName ?? actorId ?? 'Kullanıcı'),
              participantAvatarColor: isOwnMessage
                ? String(payload.recipientAvatarColor ?? recipient?.avatarColor ?? '#9B59F5')
                : String(payload.senderAvatarColor ?? actor?.avatarColor ?? '#9B59F5'),
              lastMessage: mediaUrl ? 'Fotoğraf' : message.content,
              lastMessageTime: message.createdAt,
              unreadCount: own ? 0 : 1,
              isOnline: false,
            }, ...prev];
          persistSyncCollection('lazlani_conversations', next);
          return next;
        });
        break;
      }
      case 'notification': {
        const notification = {
          ...canonical(payload),
          fromUserId: actorId ?? payload.fromUserId,
        } as Notification;
        if (!notification.id) return;
        setNotifications(prev => {
          if (prev.some(item => item.id === notification.id)) return prev;
          const next = [notification, ...prev];
          persistSyncCollection('lazlani_notifications', next);
          return next;
        });
        break;
      }
      case 'comment': {
        const value = canonical(payload) as Comment | PostComment;
        if (!value.id) return;
        if (payload.deleted === true) {
          const removed = postCommentsRef.current.find(comment => comment.id === value.id);
          const parentPostId = resolveCommentParentId(payload, removed?.postId);
          setPostComments(prev => {
            const next = prev.filter(comment => comment.id !== value.id);
            postCommentsRef.current = next;
            persistSyncCollection('lazlani_post_comments', next);
            return next;
          });
          if (parentPostId) setPosts(posts => {
            const canonicalCount = Number(payload.commentsCount);
            const hasAbsoluteCount = Number.isFinite(canonicalCount)
              && isNewAggregateVersion(
                aggregateVersionKey('comments', 'post', parentPostId),
                String(record.updatedAt ?? ''),
                `${actorId ?? ''}:${record.id}`,
                payload.aggregateRevision,
              );
            const nextPosts = posts.map(post => post.id === parentPostId
              ? {
                ...post,
                commentsCount: reconcileCommentCount(
                  post.commentsCount,
                  canonicalCount,
                  -1,
                  !removed,
                  hasAbsoluteCount,
                ),
              } : post);
            persistSyncCollection('lazlani_posts_data', nextPosts);
            return nextPosts;
          });
          setComments(prev => {
            const next = prev.filter(comment => comment.id !== value.id);
            persistSyncCollection('lazlani_comments', next);
            return next;
          });
          break;
        }
        if ('postId' in value) {
          const existing = postCommentsRef.current.some(item => item.id === value.id);
          const canonicalCount = Number(payload.commentsCount);
          const hasAbsoluteCount = Number.isFinite(canonicalCount)
            && isNewAggregateVersion(
              aggregateVersionKey('comments', 'post', value.postId),
              String(record.updatedAt ?? ''),
              `${actorId ?? ''}:${record.id}`,
              payload.aggregateRevision,
            );
          setPostComments(prev => {
            const canonicalComment = { ...value, replies: value.replies ?? [], reactions: value.reactions ?? {} } as PostComment;
            const next = existing
              ? prev.map(item => item.id === value.id ? { ...item, ...canonicalComment } : item)
              : [canonicalComment, ...prev];
            postCommentsRef.current = next;
            persistSyncCollection('lazlani_post_comments', next);
            return next;
          });
          setPosts(posts => {
            const canonicalCount = Number(payload.commentsCount);
            const nextPosts = posts.map(post => post.id === value.postId
              ? {
                ...post,
                commentsCount: reconcileCommentCount(
                  post.commentsCount,
                  canonicalCount,
                  1,
                  existing,
                  hasAbsoluteCount,
                ),
              } : post);
            persistSyncCollection('lazlani_posts_data', nextPosts);
            return nextPosts;
          });
        } else {
          setComments(prev => {
            const canonicalComment = { ...value, replies: value.replies ?? [] } as Comment;
            const next = prev.some(item => item.id === value.id)
              ? prev.map(item => item.id === value.id ? { ...item, ...canonicalComment } : item)
              : [canonicalComment, ...prev];
            persistSyncCollection('lazlani_comments', next);
            return next;
          });
        }
        break;
      }
      case 'reply': {
        const reply = canonical(payload);
        if (!reply.id || !reply.commentId) return;
        setComments(prev => {
          const next = prev.map(comment => {
            if (comment.id !== reply.commentId) return comment;
            const replies = comment.replies.some(r => r.id === reply.id)
              ? comment.replies.map(r => r.id === reply.id ? { ...r, ...reply } : r)
              : [...comment.replies, reply];
            return { ...comment, replies };
          });
          persistSyncCollection('lazlani_comments', next);
          return next;
        });
        setPostComments(prev => {
          const next = prev.map(comment => {
            if (comment.id !== reply.commentId) return comment;
            const replies = comment.replies.some(r => r.id === reply.id)
              ? comment.replies.map(r => r.id === reply.id ? { ...r, ...reply } : r)
              : [...comment.replies, reply];
            return { ...comment, replies };
          });
          persistSyncCollection('lazlani_post_comments', next);
          return next;
        });
        break;
      }
      case 'ozel_comment': {
        const comment = canonical(payload) as OzelComment;
        if (!comment.id) return;
        const existing = ozelCommentsRef.current.some(item => item.id === comment.id);
        setOzelComments(prev => {
          const canonicalComment = { ...comment, replies: comment.replies ?? [] };
          const next = existing
            ? prev.map(item => item.id === comment.id ? { ...item, ...canonicalComment } : item)
            : [canonicalComment, ...prev];
          ozelCommentsRef.current = next;
          persistSyncCollection('lazlani_ozel_comments', next);
          return next;
        });
        if (!existing) setOzelPosts(prev => {
          const next = prev.map(post => post.id === comment.postId
            ? { ...post, commentsCount: post.commentsCount + 1 } : post);
          persistSyncCollection('lazlani_ozel_posts', next);
          return next;
        });
        break;
      }
      case 'ozel_reply': {
        const reply = canonical(payload) as OzelCommentReply;
        if (!reply.id || !reply.commentId) return;
        setOzelComments(prev => {
          const next = prev.map(comment => {
            if (comment.id !== reply.commentId) return comment;
            const replies = comment.replies.some(item => item.id === reply.id)
              ? comment.replies.map(item => item.id === reply.id ? { ...item, ...reply } : item)
              : [...comment.replies, reply];
            return { ...comment, replies };
          });
          ozelCommentsRef.current = next;
          persistSyncCollection('lazlani_ozel_comments', next);
          return next;
        });
        break;
      }
      case 'ozel_video': {
        const post = canonical(payload) as OzelPost;
        if (!post.id) return;
        setOzelPosts(prev => {
          const next = prev.some(item => item.id === post.id)
            ? prev.map(item => item.id === post.id ? { ...item, ...post } : item)
            : [post, ...prev];
          persistSyncCollection('lazlani_ozel_posts', next);
          return next;
        });
        break;
      }
      case 'like': {
        const targetId = String(payload.targetId ?? '');
        const targetType = String(payload.targetType ?? '');
        const active = payload.active === true;
        if (!targetId || !actorId) return;
        const key = interactionKey(actorId, 'like', targetType, targetId);
        interactionStateRef.current.set(key, { active });
        if (targetType === 'message') {
          setMessagesByConv(prev => {
            const next = Object.fromEntries(Object.entries(prev).map(([conversationId, messages]) => [
              conversationId,
              messages.map(message => message.id === targetId
                ? {
                  ...message,
                  likedBy: active
                    ? [...new Set([...(message.likedBy ?? []), actorId])]
                    : (message.likedBy ?? []).filter(id => id !== actorId),
                }
                : message),
            ]));
            persistSyncCollection('lazlani_messages', next);
            return next;
          });
          break;
        }
        const hasAbsoluteCount = payload.activeCount !== undefined && payload.activeCount !== null;
        const shouldApplyCount = hasAbsoluteCount && isNewAggregateVersion(
          aggregateVersionKey('like', targetType, targetId),
          String(record.updatedAt ?? ''),
          `${actorId}:${record.id}`,
          payload.aggregateRevision,
        );
        if (targetType !== 'message' && shouldApplyCount) {
          const activeCount = payload.activeCount;
          if (targetType === 'post') setPosts(prev => {
            const next = prev.map(item => item.id === targetId
              ? { ...item, likesCount: reconcileAbsoluteCount(item.likesCount, activeCount) } : item);
            persistSyncCollection('lazlani_posts_data', next);
            return next;
          });
          else if (targetType === 'ozel_video') setOzelPosts(prev => {
            const next = prev.map(item => item.id === targetId
              ? { ...item, likesCount: reconcileAbsoluteCount(item.likesCount, activeCount) } : item);
            persistSyncCollection('lazlani_ozel_posts', next);
            return next;
          });
          else if (targetType === 'post_comment') setPostComments(prev => {
            const next = prev.map(item => item.id === targetId
              ? { ...item, likesCount: reconcileAbsoluteCount(item.likesCount, activeCount) } : item);
            persistSyncCollection('lazlani_post_comments', next);
            return next;
          });
          else if (targetType === 'ozel_comment') setOzelComments(prev => {
            const next = prev.map(item => item.id === targetId
              ? { ...item, likesCount: reconcileAbsoluteCount(item.likesCount, activeCount) } : item);
            persistSyncCollection('lazlani_ozel_comments', next);
            return next;
          });
          else {
            const update = <T extends { id: string; likesCount: number }>(items: T[]) => items.map(item => item.id === targetId
              ? { ...item, likesCount: reconcileAbsoluteCount(item.likesCount, activeCount) } : item);
            setBooks(prev => {
              const next = update(prev);
              persistSyncCollection('lazlani_books_data', next);
              return next;
            });
            setStories(prev => {
              const next = update(prev);
              persistSyncCollection('lazlani_stories_data', next);
              return next;
            });
            setPoems(prev => {
              const next = update(prev);
              persistSyncCollection('lazlani_poems_data', next);
              return next;
            });
          }
        }
        if (actorId === syncUserRef.current || own) {
          const setter = targetType === 'post'
            ? setPostLikedIds
            : targetType === 'ozel_video' ? setOzelLikedIds : targetType === 'post_comment'
              ? setPostCommentLikedIds : setLikedIds;
          setter(prev => {
            const next = new Set(prev);
            active ? next.add(targetId) : next.delete(targetId);
            const storageKey = targetType === 'post'
              ? 'lazlani_post_likes'
              : targetType === 'ozel_video' ? 'lazlani_ozel_likes'
                : targetType === 'post_comment' ? 'lazlani_post_comment_likes' : 'lazlani_likes';
            persistSyncCollection(storageKey, [...next]);
            return next;
          });
        }
        break;
      }
      case 'reaction': {
        const targetId = String(payload.targetId ?? '');
        const value = typeof payload.value === 'string' ? payload.value : '';
        if (!targetId || !actorId) return;
        const reactionKey = interactionKey(actorId, 'reaction', 'post_comment', targetId);
        const active = payload.active !== false;
        const nextValue = active && value ? value : undefined;
        interactionStateRef.current.set(reactionKey, { active, value: nextValue });
        const valueCounts = payload.valueCounts;
        if (!valueCounts || typeof valueCounts !== 'object' || Array.isArray(valueCounts)) return;
        if (!isNewAggregateVersion(
          aggregateVersionKey('reaction', 'post_comment', targetId),
          String(record.updatedAt ?? ''),
          `${actorId}:${record.id}`,
          payload.aggregateRevision,
        )) return;
        setPostComments(prev => prev.map(comment => {
          if (comment.id !== targetId) return comment;
          const reactions = Object.fromEntries(Object.entries(valueCounts).map(([key, count]) => [
            key,
            reconcileAbsoluteCount(0, count),
          ]));
          const next = { ...comment, reactions };
          persistSyncCollection('lazlani_post_comments', prev.map(item => item.id === comment.id ? next : item));
          return next;
        }));
        break;
      }
      case 'vote': {
        const targetId = String(payload.targetId ?? '');
        const active = payload.active === true;
        const parsedRating = Number(payload.rating ?? payload.value);
        const rating = Number.isFinite(parsedRating) ? parsedRating : undefined;
        if (!targetId || !actorId) return;
        const voteKey = interactionKey(actorId, 'vote', 'content', targetId);
        const nextRating = active ? rating : undefined;
        interactionStateRef.current.set(voteKey, { active, value: nextRating });
        const hasAbsoluteRating = payload.ratingAverage !== undefined || payload.ratingCount !== undefined;
        if (hasAbsoluteRating && isNewAggregateVersion(
          aggregateVersionKey('vote', 'content', targetId),
          String(record.updatedAt ?? ''),
          `${actorId}:${record.id}`,
          payload.aggregateRevision,
        )) {
          applyAbsoluteRatingAggregate(targetId, payload.ratingAverage, payload.ratingCount);
        }
        if (actorId === syncUserRef.current || own) {
          if (targetId && !active) {
          setUserRatings(prev => {
            const next = { ...prev };
            delete next[targetId];
            persistSyncCollection('lazlani_ratings', next);
            return next;
          });
          } else if (targetId && rating !== undefined) {
          setUserRatings(prev => {
            const next = { ...prev, [targetId]: rating };
            persistSyncCollection('lazlani_ratings', next);
            return next;
          });
          }
        }
        break;
      }
      case 'reading': {
        const targetId = String(payload.targetId ?? '');
        if (!targetId) return;
        const absolute = absoluteAggregateValue(payload, 0);
        setBooks(prev => {
          const next = prev.map(book => book.id === targetId ? { ...book, readCount: absolute } : book);
          persistSyncCollection('lazlani_books_data', next);
          return next;
        });
        break;
      }
    }
  };

  const resetAccountScopedState = () => {
    // Aggregate fields are server-owned. Start each account from canonical
    // seeds; interaction records replace these values with absolute totals.
    setBooks(DEMO_DATA_ENABLED ? [...SAMPLE_BOOKS] : []);
    setStories(DEMO_DATA_ENABLED ? [...SAMPLE_STORIES] : []);
    setPoems(DEMO_DATA_ENABLED ? [...SAMPLE_POEMS] : []);
    setPosts(DEMO_DATA_ENABLED ? [...SAMPLE_POSTS] : []);
    readingStartedRef.current.clear();
    interactionStateRef.current.clear();
    aggregateVersionRef.current.clear();
    setLikedIds(new Set());
    setSavedIds(new Set());
    setFollowedIds(new Set());
    setPostLikedIds(new Set());
    setPostSavedIds(new Set());
    setPostCommentLikedIds(new Set());
    setUserRatings({});
    setReadProgressState({});
    setLists([]);
    setBookmarks([]);
    setFavoriteIds(new Set());
    setOzelPosts([]);
    setOzelComments([]);
    setOzelLikedIds(new Set());
    setOzelCommentLikedIds(new Set());
    setOzelDailyVideos({});
    setConversations(DEMO_DATA_ENABLED ? SAMPLE_CONVERSATIONS : []);
    setMessagesByConv(DEMO_DATA_ENABLED ? MESSAGES_BY_CONV : {});
    setNotifications(DEMO_DATA_ENABLED ? SAMPLE_NOTIFICATIONS : []);
    setComments(DEMO_DATA_ENABLED ? SAMPLE_COMMENTS : []);
    setPostComments(DEMO_DATA_ENABLED ? SAMPLE_POST_COMMENTS : []);
    setPurchaseRequests([]);
    bookRollbackRef.current.clear();
    interactionStateRef.current.clear();
    aggregateVersionRef.current.clear();
  };

  const hydrateAccountScopedState = async (userId: string, generation: number) => {
    const keys = [
      'lazlani_likes', 'lazlani_saves', 'lazlani_follows', 'lazlani_post_likes',
      'lazlani_post_saves', 'lazlani_post_comment_likes', 'lazlani_lists',
      'lazlani_ratings', 'lazlani_progress', 'lazlani_bookmarks', 'lazlani_favorites',
      'lazlani_ozel_posts', 'lazlani_ozel_comments', 'lazlani_ozel_likes',
      'lazlani_ozel_comment_likes', 'lazlani_ozel_daily_videos', 'lazlani_conversations',
      'lazlani_messages', 'lazlani_notifications', 'lazlani_comments',
      'lazlani_post_comments', 'lazlani_purchase_requests', 'lazlani_books_data',
      'lazlani_stories_data', 'lazlani_poems_data', 'lazlani_posts_data',
    ];
    const values = await AsyncStorage.multiGet(keys.map(key => scopedSyncKey(key, userId)));
    if (syncUserRef.current !== userId || syncGenerationRef.current !== generation) return;
    const parsed = new Map(values.map(([key, value]) => {
      if (!value) return [key, null] as const;
      try {
        return [key, JSON.parse(value)] as const;
      } catch {
        return [key, null] as const;
      }
    }));
    const get = (base: string) => parsed.get(scopedSyncKey(base, userId));
    const set = (base: string, apply: (value: any) => void) => {
      const value = get(base);
      if (value !== null && value !== undefined) apply(value);
    };
    set('lazlani_likes', value => setLikedIds(new Set(value)));
    set('lazlani_saves', value => setSavedIds(new Set(value)));
    set('lazlani_follows', value => setFollowedIds(new Set(value)));
    set('lazlani_post_likes', value => setPostLikedIds(new Set(value)));
    set('lazlani_post_saves', value => setPostSavedIds(new Set(value)));
    set('lazlani_post_comment_likes', value => setPostCommentLikedIds(new Set(value)));
    set('lazlani_lists', value => setLists(value));
    set('lazlani_ratings', value => setUserRatings(value));
    set('lazlani_progress', value => {
      setReadProgressState(value);
      if (value && typeof value === 'object') {
        Object.keys(value).forEach(bookId => readingStartedRef.current.add(`${userId}:${bookId}`));
      }
    });
    set('lazlani_bookmarks', value => setBookmarks(value));
    set('lazlani_favorites', value => setFavoriteIds(new Set(value)));
    set('lazlani_ozel_posts', value => setOzelPosts(value));
    set('lazlani_ozel_comments', value => setOzelComments(value));
    set('lazlani_ozel_likes', value => setOzelLikedIds(new Set(value)));
    set('lazlani_ozel_comment_likes', value => setOzelCommentLikedIds(new Set(value)));
    set('lazlani_ozel_daily_videos', value => setOzelDailyVideos(value));
    set('lazlani_conversations', value => setConversations(value));
    set('lazlani_messages', value => setMessagesByConv(value));
    set('lazlani_notifications', value => setNotifications(value));
    set('lazlani_comments', value => setComments(value));
    set('lazlani_post_comments', value => setPostComments(value));
    set('lazlani_purchase_requests', value => setPurchaseRequests(value));
    set('lazlani_books_data', value => setBooks(value));
    set('lazlani_stories_data', value => setStories(value));
    set('lazlani_poems_data', value => setPoems(value));
    set('lazlani_posts_data', value => setPosts(sortPostsByCreatedAt(value)));
  };

  const removeRejectedOptimisticOperation = (operation: QueuedSyncOperation) => {
    const payload = operation.payload as Record<string, any>;
    const entityId = typeof payload.id === 'string' ? payload.id : '';
    if (!entityId) return;
    switch (operation.operationType) {
      case 'create_message': {
        const conversationId = String(payload.conversationId ?? '');
        setMessagesByConv(prev => {
          const messages = (prev[conversationId] ?? []).filter(message => message.id !== entityId);
          const next = { ...prev, [conversationId]: messages };
          persistSyncCollection('lazlani_messages', next);
          return next;
        });
        setConversations(prev => {
          const next = prev.map(conversation => {
            if (conversation.id !== conversationId || conversation.lastMessage !== payload.content) {
              return conversation;
            }
            return { ...conversation, lastMessage: '', lastMessageTime: '' };
          });
          persistSyncCollection('lazlani_conversations', next);
          return next;
        });
        break;
      }
      case 'create_post':
      case 'update_post':
      case 'delete_post': {
        const previous = postRollbackRef.current.get(entityId);
        setPosts(prev => {
          const next = operation.operationType === 'create_post'
            ? previous ? prev.map(post => post.id === entityId ? previous : post) : prev.filter(post => post.id !== entityId)
            : previous ? prev.map(post => post.id === entityId ? previous : post) : prev;
          persistSyncCollection('lazlani_posts_data', sortPostsByCreatedAt(next));
          return sortPostsByCreatedAt(next);
        });
        postRollbackRef.current.delete(entityId);
        break;
      }
      case 'create_book':
      case 'update_book':
      case 'delete_book': {
        const bookId = typeof entityId === 'string' ? entityId : '';
        if (!bookId) break;
        const previous = bookRollbackRef.current.get(bookId);
        const hadPrevious = bookRollbackRef.current.has(bookId);
        setBooks(prev => {
          const next = operation.operationType === 'create_book'
            ? hadPrevious && previous
              ? prev.map(book => book.id === bookId ? previous : book)
              : prev.filter(book => book.id !== bookId)
            : previous
              ? prev.some(book => book.id === bookId)
                ? prev.map(book => book.id === bookId ? previous : book)
                : [previous, ...prev]
              : prev;
          persistSyncCollection('lazlani_books_data', next);
          return next;
        });
        bookRollbackRef.current.delete(bookId);
        break;
      }
      case 'create_comment': {
        const postId = typeof payload.postId === 'string' ? payload.postId : '';
        if (postId) {
          let removed = false;
          setPostComments(prev => {
            const next = prev.filter(comment => comment.id !== entityId);
            removed = next.length !== prev.length;
            persistSyncCollection('lazlani_post_comments', next);
            return next;
          });
          if (removed) setPosts(prev => {
              const next = prev.map(post => post.id === postId
                ? { ...post, commentsCount: Math.max(0, post.commentsCount - 1) } : post);
              persistSyncCollection('lazlani_posts_data', next);
              return next;
            });
        } else {
          setComments(prev => {
            const next = prev.filter(comment => comment.id !== entityId);
            persistSyncCollection('lazlani_comments', next);
            return next;
          });
        }
        break;
      }
      case 'create_reply': {
        const commentId = String(payload.commentId ?? '');
        setComments(prev => {
          const next = prev.map(comment => comment.id === commentId
            ? { ...comment, replies: comment.replies.filter(reply => reply.id !== entityId) } : comment);
          persistSyncCollection('lazlani_comments', next);
          return next;
        });
        setPostComments(prev => {
          const next = prev.map(comment => comment.id === commentId
            ? { ...comment, replies: comment.replies.filter(reply => reply.id !== entityId) } : comment);
          persistSyncCollection('lazlani_post_comments', next);
          return next;
        });
        break;
      }
      case 'upsert_ozel_video': {
        setOzelPosts(prev => {
          const next = prev.filter(post => post.id !== entityId);
          persistSyncCollection('lazlani_ozel_posts', next);
          return next;
        });
        break;
      }
      case 'create_ozel_comment': {
        let removed = false;
        setOzelComments(prev => {
          const next = prev.filter(comment => comment.id !== entityId);
          removed = next.length !== prev.length;
          persistSyncCollection('lazlani_ozel_comments', next);
          return next;
        });
        const postId = String(payload.postId ?? '');
        if (removed) setOzelPosts(prev => {
            const next = prev.map(post => post.id === postId
              ? { ...post, commentsCount: Math.max(0, post.commentsCount - 1) } : post);
            persistSyncCollection('lazlani_ozel_posts', next);
            return next;
          });
        break;
      }
      case 'create_ozel_reply': {
        const commentId = String(payload.commentId ?? '');
        setOzelComments(prev => {
          const next = prev.map(comment => comment.id === commentId
            ? { ...comment, replies: comment.replies.filter(reply => reply.id !== entityId) } : comment);
          persistSyncCollection('lazlani_ozel_comments', next);
          return next;
        });
        break;
      }
      default:
        break;
    }
  };

  if (!syncServiceRef.current) {
    syncServiceRef.current = new SyncService(applySyncRecord, removeRejectedOptimisticOperation);
  }

  const migrateLegacyAccountState = async (
    userId: string,
    generation: number,
    legacyOwnerUserId?: string | null,
  ): Promise<void> => {
    const markerKey = scopedSyncKey('lazlani_sync_legacy_migrated', userId);
    if (await AsyncStorage.getItem(markerKey)) return;
    if (syncUserRef.current !== userId || syncGenerationRef.current !== generation) return;
    // AuthContext captures this before replacing its persisted account key.
    // Never perform an asynchronous read here: it could observe the new user.
    if (legacyOwnerUserId !== userId) return;

    const legacyKeys = [
      'lazlani_messages', 'lazlani_conversations', 'lazlani_comments',
      'lazlani_post_comments', 'lazlani_ozel_posts', 'lazlani_ozel_comments',
      'lazlani_likes', 'lazlani_post_likes', 'lazlani_post_comment_likes',
      'lazlani_ozel_likes', 'lazlani_ozel_comment_likes', 'lazlani_ratings',
      'lazlani_reactions',
      'lazlani_notifications', 'lazlani_saves', 'lazlani_follows', 'lazlani_post_saves',
      'lazlani_lists', 'lazlani_progress', 'lazlani_bookmarks', 'lazlani_favorites',
      'lazlani_ozel_daily_videos', 'lazlani_purchase_requests', 'lazlani_books_data',
      'lazlani_stories_data', 'lazlani_poems_data', 'lazlani_posts_data',
    ];
    const legacyValues = await AsyncStorage.multiGet(legacyKeys);
    if (syncUserRef.current !== userId || syncGenerationRef.current !== generation) return;
    const parse = (value: string | null): unknown => {
      if (!value) return undefined;
      try {
        return JSON.parse(value);
      } catch {
        return undefined;
      }
    };
    const legacy = new Map(legacyValues.map(([key, value]) => [key, parse(value)]));
    const plan = planLegacyMigration({
      messagesByConv: legacy.get('lazlani_messages') as LegacyMigrationInput['messagesByConv'],
      conversations: legacy.get('lazlani_conversations') as LegacyMigrationInput['conversations'],
      comments: legacy.get('lazlani_comments') as LegacyMigrationInput['comments'],
      postComments: legacy.get('lazlani_post_comments') as LegacyMigrationInput['postComments'],
      ozelPosts: legacy.get('lazlani_ozel_posts') as LegacyMigrationInput['ozelPosts'],
      ozelComments: legacy.get('lazlani_ozel_comments') as LegacyMigrationInput['ozelComments'],
      likedIds: legacy.get('lazlani_likes') as string[],
      postLikedIds: legacy.get('lazlani_post_likes') as string[],
      postCommentLikedIds: legacy.get('lazlani_post_comment_likes') as string[],
      ozelLikedIds: legacy.get('lazlani_ozel_likes') as string[],
      ozelCommentLikedIds: legacy.get('lazlani_ozel_comment_likes') as string[],
      userRatings: legacy.get('lazlani_ratings') as Record<string, number>,
      reactions: legacy.get('lazlani_reactions') as LegacyMigrationInput['reactions'],
      passthroughScopedWrites: Object.fromEntries([
        'lazlani_notifications', 'lazlani_saves', 'lazlani_follows', 'lazlani_post_saves',
        'lazlani_lists', 'lazlani_progress', 'lazlani_bookmarks', 'lazlani_favorites',
        'lazlani_ozel_daily_videos', 'lazlani_purchase_requests', 'lazlani_books_data',
        'lazlani_stories_data', 'lazlani_poems_data', 'lazlani_posts_data',
      ].flatMap(key => legacy.has(key) && legacy.get(key) !== undefined ? [[key, legacy.get(key)]] : [])),
    }, legacyOwnerUserId, userId);
    if (!plan.eligible || syncUserRef.current !== userId || syncGenerationRef.current !== generation) return;

    const scopedKeys = Object.keys(plan.scopedWrites);
    const existingValues = await AsyncStorage.multiGet(scopedKeys.map(key => scopedSyncKey(key, userId)));
    if (syncUserRef.current !== userId || syncGenerationRef.current !== generation) return;
    const existing = new Map(existingValues.map(([key, value]) => [key, parse(value)]));
    const merge = (key: string, incoming: unknown): unknown => {
      const current = existing.get(scopedSyncKey(key, userId));
      if (current === undefined || current === null) return incoming;
      if (Array.isArray(current) && Array.isArray(incoming)) {
        if (current.every(item => typeof item !== 'object')
          && incoming.every(item => typeof item !== 'object')) {
          return [...new Set([...current, ...incoming])];
        }
        const byId = new Map(current.map(item => [item?.id, item]));
        incoming.forEach(item => { if (!byId.has(item?.id)) byId.set(item?.id, item); });
        return [...byId.values()];
      }
      if (key === 'lazlani_messages'
        && current && incoming && typeof current === 'object' && typeof incoming === 'object') {
        const merged = { ...(incoming as Record<string, unknown>), ...(current as Record<string, unknown>) };
        for (const [conversationId, incomingMessages] of Object.entries(incoming as Record<string, unknown>)) {
          const currentMessages = (current as Record<string, unknown>)[conversationId];
          if (!Array.isArray(incomingMessages) || !Array.isArray(currentMessages)) continue;
          const byId = new Map(currentMessages.map(item => [item?.id, item]));
          incomingMessages.forEach(item => { if (!byId.has(item?.id)) byId.set(item?.id, item); });
          merged[conversationId] = [...byId.values()];
        }
        return merged;
      }
      if (current && incoming && typeof current === 'object' && typeof incoming === 'object') {
        return { ...incoming, ...current };
      }
      return current;
    };
    const scopedWrites = scopedKeys.map(key => [
      scopedSyncKey(key, userId),
      JSON.stringify(merge(key, plan.scopedWrites[key])),
    ] as [string, string]);
    await AsyncStorage.multiSet(scopedWrites);
    if (syncUserRef.current !== userId || syncGenerationRef.current !== generation) return;
    await syncServiceRef.current?.enqueuePrepared(plan.operations);
    if (syncUserRef.current !== userId || syncGenerationRef.current !== generation) return;
    await AsyncStorage.setItem(markerKey, '1');
  };

  const setSyncSession = (
    userId: string | null,
    token: string | null,
    legacyOwnerUserId?: string | null,
  ) => {
    const generation = syncGenerationRef.current + 1;
    syncGenerationRef.current = generation;
    syncServiceRef.current?.setSession(null, null);
    syncUserRef.current = userId;
    resetAccountScopedState();
    if (!userId || !token) return;
    syncServiceRef.current?.prepareSession(userId);
    void migrateLegacyAccountState(userId, generation, legacyOwnerUserId)
      .catch(() => undefined)
      .then(() => hydrateAccountScopedState(userId, generation))
      .then(() => {
      if (syncUserRef.current !== userId || syncGenerationRef.current !== generation) return;
      syncServiceRef.current?.setSession(userId, token);
    });
  };

  const enqueueSync = (operationType: Parameters<SyncService['enqueue']>[0], payload: Record<string, unknown>) => {
    // Demo interactions remain local. Only authenticated sessions create
    // server work, preventing a pre-login sample action being attributed to
    // whichever user signs in later.
    if (!syncUserRef.current) return;
    void syncServiceRef.current?.enqueue(operationType, payload);
  };

  const recordOptimisticInteraction = (
    kind: string,
    targetType: string,
    targetId: string,
    state: { active: boolean; value?: string | number },
  ) => {
    if (syncUserRef.current) {
      interactionStateRef.current.set(interactionKey(syncUserRef.current, kind, targetType, targetId), state);
    }
  };

  const addBannedWord = (word: string) => {
    const w = word.trim().toLowerCase();
    if (!w || bannedWords.includes(w)) return;
    setBannedWords(prev => [...prev, w]);
  };
  const removeBannedWord = (word: string) => setBannedWords(prev => prev.filter(w => w !== word));
  const setFilterLevelAdmin = (level: FilterLevel) => setFilterLevel(level);
  const checkContent = (text: string) => filterContent(text, bannedWords, filterLevel);

  useEffect(() => {
    let active = true;
    void cleanupPersistedDemoData(AsyncStorage, !DEMO_DATA_ENABLED).then(() => {
    if (!active) return;
    // Kayıtlı kullanıcılar (sample dışı)
    AsyncStorage.getItem('lazlani_extra_users').then(v => {
      if (!v) return;
      const extra: User[] = JSON.parse(v);
      setUsers(prev => {
        const ids = new Set(prev.map(u => u.id));
        return [...prev, ...extra.filter(u => !ids.has(u.id))];
      });
    });
    });
    return () => { active = false; };
  }, []);

  const toggleLike = (id: string) => {
    setLikedIds(prev => {
      const next = new Set(prev);
      const active = !next.has(id);
      active ? next.add(id) : next.delete(id);
      persistSyncCollection('lazlani_likes', [...next]);
      const targetType = books.some(item => item.id === id) ? 'book'
        : stories.some(item => item.id === id) ? 'story'
          : poems.some(item => item.id === id) ? 'poem' : 'content';
      const delta = active ? 1 : -1;
      if (targetType === 'book') setBooks(prev => {
        const next = prev.map(item => item.id === id
          ? { ...item, likesCount: Math.max(0, item.likesCount + delta) } : item);
        persistSyncCollection('lazlani_books_data', next);
        return next;
      });
      else if (targetType === 'story') setStories(prev => {
        const next = prev.map(item => item.id === id
          ? { ...item, likesCount: Math.max(0, item.likesCount + delta) } : item);
        persistSyncCollection('lazlani_stories_data', next);
        return next;
      });
      else if (targetType === 'poem') setPoems(prev => {
        const next = prev.map(item => item.id === id
          ? { ...item, likesCount: Math.max(0, item.likesCount + delta) } : item);
        persistSyncCollection('lazlani_poems_data', next);
        return next;
      });
      recordOptimisticInteraction('like', targetType, id, { active });
      enqueueSync('toggle_like', { targetId: id, targetType, active });
      return next;
    });
  };

  const toggleSave = (id: string) => {
    setSavedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      persistSyncCollection('lazlani_saves', [...next]);
      return next;
    });
  };

  const toggleFollow = (userId: string) => {
    setFollowedIds(prev => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      persistSyncCollection('lazlani_follows', [...next]);
      return next;
    });
  };

  const togglePostLike = (id: string) => {
    setPostLikedIds(prev => {
      const next = new Set(prev);
      const active = !next.has(id);
      active ? next.add(id) : next.delete(id);
      persistSyncCollection('lazlani_post_likes', [...next]);
       setPosts(items => {
         const nextPosts = items.map(post => post.id === id
           ? { ...post, likesCount: Math.max(0, post.likesCount + (active ? 1 : -1)) } : post);
         persistSyncCollection('lazlani_posts_data', nextPosts);
         return nextPosts;
       });
      recordOptimisticInteraction('like', 'post', id, { active });
      enqueueSync('toggle_like', { targetId: id, targetType: 'post', active });
      return next;
    });
  };

  const togglePostSave = (id: string) => {
    setPostSavedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      persistSyncCollection('lazlani_post_saves', [...next]);
      return next;
    });
  };

  const togglePostCommentLike = (commentId: string) => {
    setPostCommentLikedIds(prev => {
      const next = new Set(prev);
      const wasLiked = next.has(commentId);
      wasLiked ? next.delete(commentId) : next.add(commentId);
      persistSyncCollection('lazlani_post_comment_likes', [...next]);
      setPostComments(c => c.map(cm => cm.id === commentId
        ? { ...cm, likesCount: cm.likesCount + (wasLiked ? -1 : 1) }
        : cm
      ));
      recordOptimisticInteraction('like', 'post_comment', commentId, { active: !wasLiked });
      enqueueSync('toggle_like', { targetId: commentId, targetType: 'post_comment', active: !wasLiked });
      return next;
    });
  };

  const addReactionToPostComment = (commentId: string, emoji: string) => {
    const previous = syncUserRef.current
      ? interactionStateRef.current.get(interactionKey(syncUserRef.current, 'reaction', 'post_comment', commentId))
      : undefined;
    setPostComments(prev => prev.map(c => {
      if (c.id !== commentId) return c;
      const reactions = { ...c.reactions };
      if (typeof previous?.value === 'string' && previous.value !== emoji) {
        reactions[previous.value] = Math.max(0, (reactions[previous.value] ?? 0) - 1);
      }
      reactions[emoji] = (reactions[emoji] ?? 0) + 1;
      return { ...c, reactions };
    }));
    recordOptimisticInteraction('reaction', 'post_comment', commentId, { active: true, value: emoji });
    enqueueSync('set_reaction', { targetId: commentId, targetType: 'post_comment', value: emoji, active: true });
  };

  const rateContent = (id: string, rating: number) => {
    const previous = syncUserRef.current
      ? interactionStateRef.current.get(interactionKey(syncUserRef.current, 'vote', 'content', id))
      : undefined;
    const previousRating = previous?.active && typeof previous.value === 'number'
      ? previous.value : userRatings[id];
    updateRatingAggregate(id, previousRating, rating);
    recordOptimisticInteraction('vote', 'content', id, { active: true, value: rating });
    setUserRatings(prev => {
      const next = { ...prev, [id]: rating };
      persistSyncCollection('lazlani_ratings', next);
      return next;
    });
    enqueueSync('toggle_vote', { targetId: id, targetType: 'content', rating, value: rating });
  };

  const setReadProgress = (bookId: string, percent: number) => {
    const readingKey = `${syncUserRef.current ?? 'local'}:${bookId}`;
    const shouldStartReading = Boolean(syncUserRef.current) && !readingStartedRef.current.has(readingKey);
    if (shouldStartReading) readingStartedRef.current.add(readingKey);
    setReadProgressState(prev => {
      const next = { ...prev, [bookId]: percent };
      persistSyncCollection('lazlani_progress', next);
      return next;
    });
    if (shouldStartReading) {
      recordOptimisticInteraction('reading', 'book', bookId, { active: true });
      enqueueSync('start_reading', { targetId: bookId, targetType: 'book' });
    }
  };

  const addUser = (user: User) => {
    setUsers(prev => {
      if (prev.some(u => u.id === user.id)) return prev;
      const next = [...prev, user];
      AsyncStorage.setItem('lazlani_extra_users', JSON.stringify(next.filter(u => !DEMO_USER_IDS.has(u.id))));
      return next;
    });
  };

  const addBook = (book: Book) => {
    bookRollbackRef.current.set(book.id, books.find(item => item.id === book.id));
    setBooks(prev => {
      const next = [book, ...prev.filter(item => item.id !== book.id)];
      persistSyncCollection('lazlani_books_data', next);
      return next;
    });
    enqueueSync('create_book', { ...book });
  };
  const addStory = (story: Story) => setStories(prev => {
    const next = [story, ...prev];
    persistSyncCollection('lazlani_stories_data', next);
    return next;
  });
  const addPoem = (poem: Poem) => setPoems(prev => {
    const next = [poem, ...prev];
    persistSyncCollection('lazlani_poems_data', next);
    return next;
  });
  const addPost = (post: Post) => {
    const ownerId = syncUserRef.current ?? post.authorId;
    const normalized = { ...post, id: post.id || syncEntityId('post', ownerId) };
    postRollbackRef.current.set(normalized.id, postsRef.current.find(item => item.id === normalized.id));
    setPosts(prev => {
      const next = sortPostsByCreatedAt([normalized, ...prev.filter(item => item.id !== normalized.id)]);
      persistSyncCollection('lazlani_posts_data', next);
      return next;
    });
    enqueueSync('create_post', {
      ...normalized,
      ...(normalized.imageUris?.length
        ? { media: { urls: normalized.imageUris }, photo: { url: normalized.imageUris[0] } }
        : {}),
    });
  };
  const updatePost = (id: string, patch: Partial<Post>) => {
    const current = postsRef.current.find(post => post.id === id);
    if (!current) return;
    const updated = { ...current, ...patch };
    postRollbackRef.current.set(id, current);
    setPosts(prev => {
      const next = sortPostsByCreatedAt(prev.map(post => post.id === id ? updated : post));
      persistSyncCollection('lazlani_posts_data', next);
      return next;
    });
    enqueueSync('update_post', {
      ...updated,
      ...(updated.imageUris?.length
        ? { media: { urls: updated.imageUris }, photo: { url: updated.imageUris[0] } }
        : {}),
    });
  };
  const deletePost = (id: string) => {
    const previous = postsRef.current.find(post => post.id === id);
    if (!previous) return;
    postRollbackRef.current.set(id, previous);
    setPosts(prev => {
      const next = prev.filter(post => post.id !== id);
      persistSyncCollection('lazlani_posts_data', next);
      return next;
    });
    setPostComments(prev => {
      const next = prev.filter(comment => comment.postId !== id);
      persistSyncCollection('lazlani_post_comments', next);
      return next;
    });
    enqueueSync('delete_post', { id });
  };
  const addComment = (comment: Comment) => {
    const ownerId = syncUserRef.current ?? comment.authorId;
    const normalized = { ...comment, id: syncEntityId('comment', ownerId) };
    setComments(prev => {
      const next = [normalized, ...prev];
      persistSyncCollection('lazlani_comments', next);
      return next;
    });
    enqueueSync('create_comment', { ...normalized });
  };

  const addPostComment = (comment: PostComment) => {
    const ownerId = syncUserRef.current ?? comment.authorId;
    const normalized = { ...comment, id: syncEntityId('post-comment', ownerId) };
    postCommentsRef.current = [normalized, ...postCommentsRef.current];
    setPostComments(prev => {
      const next = [normalized, ...prev];
      persistSyncCollection('lazlani_post_comments', next);
      return next;
    });
    setPosts(prev => {
      const next = prev.map(p => p.id === normalized.postId ? { ...p, commentsCount: p.commentsCount + 1 } : p);
      persistSyncCollection('lazlani_posts_data', next);
      return next;
    });
    enqueueSync('create_comment', { ...normalized });
  };

  const deletePostComment = (commentId: string) => {
    const comment = postCommentsRef.current.find(item => item.id === commentId);
    if (!comment) return;
    postCommentsRef.current = postCommentsRef.current.filter(item => item.id !== commentId);
    setPostComments(prev => {
      const next = prev.filter(item => item.id !== commentId);
      persistSyncCollection('lazlani_post_comments', next);
      return next;
    });
    setPosts(prev => {
      const next = prev.map(post => post.id === comment.postId
        ? { ...post, commentsCount: Math.max(0, post.commentsCount - 1) }
        : post);
      persistSyncCollection('lazlani_posts_data', next);
      return next;
    });
    enqueueSync('delete_comment', { id: commentId });
  };

  const addPostCommentReply = (commentId: string, reply: PostReply) => {
    const ownerId = syncUserRef.current ?? reply.authorId;
    const normalized = { ...reply, id: syncEntityId('post-reply', ownerId), commentId };
    setPostComments(prev => prev.map(c =>
      c.id === commentId ? { ...c, replies: [...c.replies, normalized] } : c
    ));
    enqueueSync('create_reply', { ...normalized, commentId });
  };

  const addReply = (commentId: string, reply: import('@/data/types').Reply) => {
    const ownerId = syncUserRef.current ?? reply.authorId;
    const normalized = { ...reply, id: syncEntityId('reply', ownerId), commentId };
    setComments(prev =>
      prev.map(c =>
        c.id === commentId ? { ...c, replies: [...c.replies, normalized] } : c
      )
    );
    enqueueSync('create_reply', { ...normalized, commentId });
  };

  const sendMessage = (convId: string, senderId: string, content: string, mediaUrl?: string) => {
    const ownerId = syncUserRef.current ?? senderId;
    const msg: Message = {
      id: syncEntityId('message', ownerId),
      conversationId: convId,
      senderId,
      content,
      type: mediaUrl ? 'photo' : 'text',
      ...(mediaUrl ? { mediaUrl } : {}),
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    setMessagesByConv(prev => {
      const next = { ...prev, [convId]: [...(prev[convId] ?? []), msg] };
      persistSyncCollection('lazlani_messages', next);
      return next;
    });
    setConversations(prev => {
      const next = prev.map(c =>
        c.id === convId ? { ...c, lastMessage: content, lastMessageTime: msg.createdAt } : c
      );
      persistSyncCollection('lazlani_conversations', next);
      return next;
    });
    const participant = conversations.find(c => c.id === convId)?.participantId;
    if (participant) enqueueSync('create_message', {
      ...msg,
      recipientUserId: participant,
      ...(mediaUrl ? { media: { url: mediaUrl }, photo: { url: mediaUrl } } : {}),
    });
  };

  const deleteMessage = (convId: string, messageId: string) => {
    setMessagesByConv(prev => {
      const next = { ...prev, [convId]: (prev[convId] ?? []).filter(message => message.id !== messageId) };
      persistSyncCollection('lazlani_messages', next);
      return next;
    });
    enqueueSync('delete_message', { id: messageId });
  };

  const startConversation = (participant: User): string => {
    const existing = conversations.find(c => c.participantId === participant.id);
    if (existing) return existing.id;

    const id = syncEntityId('conversation', syncUserRef.current ?? participant.id);
    const conversation: Conversation = {
      id,
      participantId: participant.id,
      participantName: participant.displayName,
      participantAvatarColor: participant.avatarColor,
      lastMessage: 'Yeni sohbet',
      lastMessageTime: new Date().toISOString(),
      unreadCount: 0,
      isOnline: false,
    };
    setConversations(prev => {
      const next = [conversation, ...prev];
      persistSyncCollection('lazlani_conversations', next);
      return next;
    });
    setMessagesByConv(prev => {
      const next = { ...prev, [id]: [] };
      persistSyncCollection('lazlani_messages', next);
      return next;
    });
    return id;
  };

  const toggleMessageLike = (convId: string, messageId: string, userId: string) => {
    setMessagesByConv(prev => {
      const next = {
        ...prev,
        [convId]: (prev[convId] ?? []).map(message => {
          if (message.id !== messageId) return message;
          const likedBy = new Set(message.likedBy ?? []);
          const active = !likedBy.has(userId);
          active ? likedBy.add(userId) : likedBy.delete(userId);
          if (userId === syncUserRef.current) {
            recordOptimisticInteraction('like', 'message', messageId, { active });
          }
          enqueueSync('toggle_like', { targetId: messageId, targetType: 'message', active });
          return { ...message, likedBy: [...likedBy] };
        }),
      };
      persistSyncCollection('lazlani_messages', next);
      return next;
    });
  };

  const markNotifsRead = () =>
    setNotifications(prev => {
      const next = prev.map(n => ({ ...n, isRead: true }));
      persistSyncCollection('lazlani_notifications', next);
      return next;
    });

  const markConversationRead = (convId: string) => {
    setConversations(prev => {
      const next = prev.map(c => c.id === convId ? { ...c, unreadCount: 0 } : c);
      persistSyncCollection('lazlani_conversations', next);
      return next;
    });
    setMessagesByConv(prev => {
      const next = {
        ...prev,
        [convId]: (prev[convId] ?? []).map(m => ({ ...m, isRead: true })),
      };
      persistSyncCollection('lazlani_messages', next);
      return next;
    });
  };

  const requestPurchase = (
    type: PurchaseType, planName: string, price: string,
    userId: string, userName: string, vipFrameColor?: string,
  ) => {
    const req: PurchaseRequest = {
      id: Date.now().toString(),
      userId, userName, type, planName, price, vipFrameColor,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    setPurchaseRequests(prev => {
      const next = [req, ...prev];
      persistSyncCollection('lazlani_purchase_requests', next);
      return next;
    });
  };

  const approvePurchase = (requestId: string) => {
    // NOTE: We do NOT set canPostVideo here — subscription access is derived
    // exclusively from a non-expired 'approved' purchaseRequest. The canPostVideo
    // flag is reserved for permanent admin-granted permission only.
    setPurchaseRequests(prev => {
      const next: PurchaseRequest[] = prev.map(r => {
        if (r.id !== requestId) return r;
        const expiresAt = r.type === 'ozel_abonelik'
          ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
          : r.expiresAt;
        return { ...r, status: 'approved' as const, expiresAt };
      });
      persistSyncCollection('lazlani_purchase_requests', next);
      return next;
    });
  };

  const rejectPurchase = (requestId: string) =>
    setPurchaseRequests(prev => {
      const next: PurchaseRequest[] = prev.map(r => r.id === requestId ? { ...r, status: 'rejected' as const } : r);
      persistSyncCollection('lazlani_purchase_requests', next);
      return next;
    });

  const renewPurchase = (requestId: string) => {
    setPurchaseRequests(prev => {
      const next = prev.map(r => {
        if (r.id !== requestId || r.type !== 'ozel_abonelik' || r.status !== 'approved') return r;
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        return { ...r, expiresAt };
      });
      persistSyncCollection('lazlani_purchase_requests', next);
      return next;
    });
  };

  const addList = (list: ReadingList) => {
    setLists(prev => {
      const next = [list, ...prev];
      persistSyncCollection('lazlani_lists', next);
      return next;
    });
  };

  const removeList = (id: string) => {
    setLists(prev => {
      const next = prev.filter(l => l.id !== id);
      persistSyncCollection('lazlani_lists', next);
      return next;
    });
  };

  const addToList = (listId: string, bookId: string) => {
    setLists(prev => {
      const next = prev.map(l =>
        l.id === listId && !l.bookIds.includes(bookId)
          ? { ...l, bookIds: [...l.bookIds, bookId] }
          : l
      );
      persistSyncCollection('lazlani_lists', next);
      return next;
    });
  };

  const removeFromList = (listId: string, bookId: string) => {
    setLists(prev => {
      const next = prev.map(l =>
        l.id === listId ? { ...l, bookIds: l.bookIds.filter(b => b !== bookId) } : l
      );
      persistSyncCollection('lazlani_lists', next);
      return next;
    });
  };

  const unreadNotifCount = notifications.filter(n => !n.isRead).length;

  const addSupportTicket = (ticket: SupportTicket) =>
    setSupportTickets(prev => [ticket, ...prev]);

  const addContactMessage = (msg: ContactMessage) =>
    setContactMessages(prev => [msg, ...prev]);

  const updateTicketStatus = (id: string, status: TicketStatus, reply?: string) =>
    setSupportTickets(prev => prev.map(t =>
      t.id === id ? { ...t, status, ...(reply ? { adminReply: reply } : {}) } : t
    ));

  const updateContactStatus = (id: string, status: TicketStatus, reply?: string) =>
    setContactMessages(prev => prev.map(m =>
      m.id === id ? { ...m, status, ...(reply ? { adminReply: reply } : {}) } : m
    ));

  const addAdminLog = (log: AdminLog) =>
    setAdminLogs(prev => [log, ...prev]);

  const adminSuspendUser = (userId: string) =>
    setAdminUsers(prev => prev.map(u => u.id === userId ? { ...u, isSuspended: true } : u));

  const adminActivateUser = (userId: string) =>
    setAdminUsers(prev => prev.map(u => u.id === userId ? { ...u, isSuspended: false } : u));

  const adminDeleteUser = (userId: string) =>
    setAdminUsers(prev => prev.filter(u => u.id !== userId));

  const adminRemovePost = (postId: string) =>
    setPosts(prev => prev.filter(p => p.id !== postId));

  const adminRemoveComment = (commentId: string) =>
    setPostComments(prev => prev.filter(c => c.id !== commentId));

  const toggleFavorite = (id: string) => {
    setFavoriteIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      persistSyncCollection('lazlani_favorites', [...next]);
      return next;
    });
  };

  const updateBook = (id: string, patch: Partial<Book>) => {
    const previous = books.find(book => book.id === id);
    if (!previous) return;
    const nextBook = { ...previous, ...patch };
    bookRollbackRef.current.set(id, previous);
    setBooks(prev => {
      const next = prev.map(b => b.id === id ? nextBook : b);
      persistSyncCollection('lazlani_books_data', next);
      return next;
    });
    enqueueSync('update_book', { ...nextBook });
  };

  const deleteBook = (id: string) => {
    const previous = books.find(book => book.id === id);
    if (!previous) return;
    bookRollbackRef.current.set(id, previous);
    setBooks(prev => {
      const next = prev.filter(b => b.id !== id);
      persistSyncCollection('lazlani_books_data', next);
      return next;
    });
    enqueueSync('delete_book', { id });
  };

  const updateChapter = (bookId: string, chapterId: string, patch: Partial<Chapter>) => {
    setBooks(prev => prev.map(b =>
      b.id === bookId
        ? { ...b, chapters: b.chapters.map(c => c.id === chapterId ? { ...c, ...patch } : c) }
        : b
    ));
  };

  const deleteChapter = (bookId: string, chapterId: string) => {
    setBooks(prev => prev.map(b =>
      b.id === bookId
        ? { ...b, chapters: b.chapters.filter(c => c.id !== chapterId) }
        : b
    ));
  };

  const recommendBook = (id: string, status: RecommendationStatus) => {
    setBooks(prev => prev.map(b => b.id === id ? { ...b, recommendationStatus: status } : b));
  };

  const addBookmark = (bm: Bookmark) => {
    setBookmarks(prev => {
      const next = [bm, ...prev.filter(b => !(b.targetId === bm.targetId && b.targetType === bm.targetType && b.userId === bm.userId))];
      persistSyncCollection('lazlani_bookmarks', next);
      return next;
    });
  };

  const removeBookmark = (id: string) => {
    setBookmarks(prev => {
      const next = prev.filter(b => b.id !== id);
      persistSyncCollection('lazlani_bookmarks', next);
      return next;
    });
  };

  const publishDraft = (id: string, type: 'book' | 'story' | 'poem') => {
    if (type === 'book') setBooks(prev => prev.map(b => b.id === id ? { ...b, isDraft: false } : b));
    else if (type === 'story') setStories(prev => prev.map(s => s.id === id ? { ...s, isDraft: false } : s));
    else setPoems(prev => prev.map(p => p.id === id ? { ...p, isDraft: false } : p));
  };

  const addChapterToBook = (bookId: string, chapter: Chapter) => {
    setBooks(prev => prev.map(b =>
      b.id === bookId ? { ...b, chapters: [...(b.chapters ?? []), chapter] } : b
    ));
  };

  const addDergiPost = (post: DergiPost) => setDergiPosts(prev => [post, ...prev]);
  const addOzelPost = (post: OzelPost) => {
    const ownerId = syncUserRef.current ?? post.authorId;
    const normalized = { ...post, id: syncEntityId('ozel-video', ownerId) };
    setOzelPosts(prev => {
    const next = [normalized, ...prev];
    persistSyncCollection('lazlani_ozel_posts', next);
    enqueueSync('upsert_ozel_video', { ...normalized });
    return next;
    });
  };

  const addOzelComment = (comment: OzelComment) => {
    const ownerId = syncUserRef.current ?? comment.authorId;
    const normalized = { ...comment, id: syncEntityId('ozel-comment', ownerId) };
    ozelCommentsRef.current = [normalized, ...ozelCommentsRef.current];
    setOzelComments(prev => {
      const next = [normalized, ...prev];
      persistSyncCollection('lazlani_ozel_comments', next);
      return next;
    });
    setOzelPosts(prev => {
      const next = prev.map(p =>
        p.id === normalized.postId ? { ...p, commentsCount: p.commentsCount + 1 } : p
      );
      persistSyncCollection('lazlani_ozel_posts', next);
      return next;
    });
    enqueueSync('create_ozel_comment', { ...normalized });
  };

  const addOzelCommentReply = (commentId: string, reply: OzelCommentReply) => {
    const ownerId = syncUserRef.current ?? reply.authorId;
    const normalized = { ...reply, id: syncEntityId('ozel-reply', ownerId), commentId };
    setOzelComments(prev => {
      const next = prev.map(c =>
        c.id === commentId ? { ...c, replies: [...c.replies, normalized] } : c
      );
      ozelCommentsRef.current = next;
      persistSyncCollection('lazlani_ozel_comments', next);
      return next;
    });
    enqueueSync('create_ozel_reply', { ...normalized, commentId });
  };

  const toggleOzelCommentLike = (commentId: string) => {
    setOzelCommentLikedIds(prev => {
      const next = new Set(prev);
      const wasLiked = next.has(commentId);
      wasLiked ? next.delete(commentId) : next.add(commentId);
      persistSyncCollection('lazlani_ozel_comment_likes', [...next]);
      setOzelComments(comments => {
        const updated = comments.map(comment =>
          comment.id === commentId
            ? { ...comment, likesCount: Math.max(0, comment.likesCount + (wasLiked ? -1 : 1)) }
            : comment
        );
        ozelCommentsRef.current = updated;
        persistSyncCollection('lazlani_ozel_comments', updated);
        return updated;
      });
      recordOptimisticInteraction('like', 'ozel_comment', commentId, { active: !wasLiked });
      enqueueSync('toggle_like', { targetId: commentId, targetType: 'ozel_comment', active: !wasLiked });
      return next;
    });
  };

  const deleteOzelPost = (postId: string) => {
    setOzelPosts(prev => {
      const next = prev.filter(p => p.id !== postId);
      persistSyncCollection('lazlani_ozel_posts', next);
      return next;
    });
    setOzelComments(prev => {
      const next = prev.filter(c => c.postId !== postId);
      persistSyncCollection('lazlani_ozel_comments', next);
      return next;
    });
  };

  const updateOzelPost = (id: string, patch: Partial<OzelPost>) => {
    setOzelPosts(prev => {
      const next = prev.map(p => p.id === id ? { ...p, ...patch } : p);
      persistSyncCollection('lazlani_ozel_posts', next);
      return next;
    });
  };

  const getOzelVideoCountToday = (userId: string): number => {
    const entry = ozelDailyVideos[userId];
    const today = new Date().toDateString();
    if (!entry || entry.date !== today) return 0;
    return entry.count;
  };

  const incrementOzelVideoCount = (userId: string) => {
    const today = new Date().toDateString();
    setOzelDailyVideos(prev => {
      const next = {
        ...prev,
        [userId]: {
        count: prev[userId]?.date === today ? prev[userId].count + 1 : 1,
        date: today,
        },
      };
      persistSyncCollection('lazlani_ozel_daily_videos', next);
      return next;
    });
  };

  const toggleDergiLike = (id: string) => {
    setDergiLikedIds(prev => {
      const next = new Set(prev);
      const wasLiked = next.has(id);
      wasLiked ? next.delete(id) : next.add(id);
      setDergiPosts(p => p.map(d => d.id === id ? { ...d, likesCount: d.likesCount + (wasLiked ? -1 : 1) } : d));
      return next;
    });
  };

  const toggleOzelLike = (id: string) => {
    setOzelLikedIds(prev => {
      const next = new Set(prev);
      const wasLiked = next.has(id);
      wasLiked ? next.delete(id) : next.add(id);
      persistSyncCollection('lazlani_ozel_likes', [...next]);
      setOzelPosts(posts => {
        const updated = posts.map(post =>
          post.id === id
            ? { ...post, likesCount: Math.max(0, post.likesCount + (wasLiked ? -1 : 1)) }
            : post
        );
        persistSyncCollection('lazlani_ozel_posts', updated);
        return updated;
      });
      recordOptimisticInteraction('like', 'ozel_video', id, { active: !wasLiked });
      enqueueSync('toggle_like', { targetId: id, targetType: 'ozel_video', active: !wasLiked });
      return next;
    });
  };

  type UserPerm = 'canMagazineWrite' | 'canPostVideo' | 'canPostPhoto';
  const adminGrantPermission = (userId: string, perm: UserPerm) =>
    setAdminUsers(prev => prev.map(u => u.id === userId ? { ...u, [perm]: true } : u));
  const adminRevokePermission = (userId: string, perm: UserPerm) =>
    setAdminUsers(prev => prev.map(u => u.id === userId ? { ...u, [perm]: false } : u));
  const addSyncListener = useCallback((listener: (event: any) => void) => {
    syncServiceRef.current?.addEventListener(listener);
  }, []);

  const removeSyncListener = useCallback((listener: (event: any) => void) => {
    syncServiceRef.current?.removeEventListener(listener);
  }, []);

  const adminBanUser = (userId: string, until?: string) =>
    setAdminUsers(prev => prev.map(u => u.id === userId ? { ...u, isBanned: true, bannedUntil: until ?? null } : u));
  const adminUnbanUser = (userId: string) =>
    setAdminUsers(prev => prev.map(u => u.id === userId ? { ...u, isBanned: false, bannedUntil: undefined } : u));

  return (
    <DataContext.Provider
      value={{
        books, stories, poems, posts, comments, postComments, notifications, conversations, messagesByConv, lists,
        likedIds, savedIds, followedIds, postLikedIds, postSavedIds, postCommentLikedIds, userRatings, readProgress,
        unreadNotifCount,
        supportTickets, contactMessages, adminLogs, adminUsers,
        toggleLike, toggleSave, toggleFollow, togglePostLike, togglePostSave,
        rateContent, setReadProgress,
        addBook, addStory, addPoem, addPost, updatePost, deletePost, addComment, addReply,
        addPostComment, deletePostComment, addPostCommentReply, togglePostCommentLike, addReactionToPostComment,
        sendMessage, deleteMessage, startConversation, toggleMessageLike, markNotifsRead,
        addList, removeList, addToList, removeFromList,
        addSupportTicket, addContactMessage, updateTicketStatus, updateContactStatus,
        adminSuspendUser, adminActivateUser, adminDeleteUser, adminRemovePost, adminRemoveComment, addAdminLog,
        dergiPosts, ozelPosts, dergiLikedIds, ozelLikedIds,
        addDergiPost, addOzelPost, toggleDergiLike, toggleOzelLike,
        ozelComments, ozelCommentLikedIds,
        addOzelComment, addOzelCommentReply, toggleOzelCommentLike,
        deleteOzelPost, updateOzelPost, getOzelVideoCountToday, incrementOzelVideoCount,
        adminGrantPermission, adminRevokePermission, adminBanUser, adminUnbanUser,
        favoriteIds, toggleFavorite,
        updateBook, deleteBook, updateChapter, deleteChapter, recommendBook,
        bookmarks, addBookmark, removeBookmark,
        publishDraft, addChapterToBook,
        weeklyBookId, setWeeklyBookId,
        bannedWords, filterLevel, addBannedWord, removeBannedWord, setFilterLevelAdmin, checkContent,
        purchaseRequests, requestPurchase, approvePurchase, rejectPurchase, renewPurchase,
        markConversationRead,
         users, addUser, setSyncSession, addSyncListener, removeSyncListener,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be inside DataProvider');
  return ctx;
}
