export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string;
  bio: string;
  avatarColor: string;
  coverColor: string;
  avatarUrl?: string;
  coverUrl?: string;
  theme?: string; // ThemeName — stored as string to avoid circular import
  followersCount: number;
  followingCount: number;
  likesReceivedCount: number;
  booksCount: number;
  storiesCount: number;
  poemsCount: number;
  isPremium: boolean;
  isVip?: boolean;
  vipFrameColor?: string;
  vipContentColor?: string;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  isSuspended?: boolean;
  isBanned?: boolean;
  bannedUntil?: string | null; // null = kalıcı ban
  canMagazineWrite?: boolean;
  canPostVideo?: boolean;
  canPostPhoto?: boolean;
  joinedAt: string;
}

export interface DergiPost {
  id: string;
  title: string;
  coverUrl?: string;
  coverColor: string;
  authorId: string;
  authorName: string;
  authorAvatarColor: string;
  content: string;
  excerpt: string;
  category: string;
  likesCount: number;
  commentsCount: number;
  createdAt: string;
  tags: string[];
}

export interface OzelPost {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatarColor: string;
  title?: string;
  description?: string;
  mediaType: 'video' | 'photo';
  mediaUri: string;
  thumbnailUri?: string;
  durationSeconds?: number;
  expiresAt?: string;
  likesCount: number;
  commentsCount: number;
  createdAt: string;
}

export type TicketType = 'teknik' | 'hata' | 'sikayet' | 'oneri';
export type TicketStatus = 'bekliyor' | 'isleniyor' | 'cozuldu';

export interface SupportTicket {
  id: string;
  type: TicketType;
  subject: string;
  description: string;
  userId: string;
  userName: string;
  userAvatarColor: string;
  status: TicketStatus;
  adminReply?: string;
  createdAt: string;
}

export interface ContactMessage {
  id: string;
  subject: string;
  message: string;
  userId: string;
  userName: string;
  userAvatarColor: string;
  status: TicketStatus;
  adminReply?: string;
  createdAt: string;
}

export interface AdminLog {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  adminId: string;
  createdAt: string;
}

export interface Chapter {
  id: string;
  bookId: string;
  title: string;
  content: string;
  summary?: string;
  wordCount: number;
  order: number;
  isDraft: boolean;
  createdAt: string;
}

export type RecommendationStatus = 'none' | 'pending' | 'approved' | 'rejected';

export interface Book {
  id: string;
  title: string;
  coverColor: string;
  coverUrl?: string;
  authorId: string;
  authorName: string;
  authorAvatarColor: string;
  description: string;
  genre: string;
  chapters: Chapter[];
  likesCount: number;
  commentsCount: number;
  rating: number;
  ratingCount: number;
  readCount: number;
  isFeatured: boolean;
  isEditorChoice: boolean;
  isDraft: boolean;
  recommendationStatus?: RecommendationStatus;
  createdAt: string;
  tags: string[];
}

export interface Story {
  id: string;
  title: string;
  coverColor: string;
  coverUrl?: string;
  authorId: string;
  authorName: string;
  authorAvatarColor: string;
  description: string;
  content: string;
  genre: string;
  likesCount: number;
  commentsCount: number;
  rating: number;
  ratingCount: number;
  readCount: number;
  isDraft: boolean;
  createdAt: string;
  tags: string[];
}

export interface Poem {
  id: string;
  title: string;
  coverColor: string;
  coverUrl?: string;
  authorId: string;
  authorName: string;
  authorAvatarColor: string;
  content: string;
  likesCount: number;
  commentsCount: number;
  rating: number;
  ratingCount: number;
  isDraft: boolean;
  createdAt: string;
  tags: string[];
}

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatarColor: string;
  title?: string;
  content: string;
  imageUris?: string[];
  contentType?: 'text' | 'photo' | 'story' | 'book';
  linkedContentId?: string;
  linkedContentTitle?: string;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  savesCount?: number;
  createdAt: string;
}

export interface PostComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorAvatarColor: string;
  content: string;
  likesCount: number;
  reactions: Record<string, number>;
  replies: PostReply[];
  createdAt: string;
}

export interface PostReply {
  id: string;
  commentId: string;
  parentReplyId?: string;
  authorId: string;
  authorName: string;
  authorAvatarColor: string;
  content: string;
  likesCount: number;
  createdAt: string;
}

export interface Comment {
  id: string;
  targetId: string;
  targetType: 'book' | 'story' | 'poem' | 'post';
  authorId: string;
  authorName: string;
  authorAvatarColor: string;
  content: string;
  likesCount: number;
  replies: Reply[];
  createdAt: string;
}

export interface Reply {
  id: string;
  commentId: string;
  parentReplyId?: string;
  authorId: string;
  authorName: string;
  authorAvatarColor: string;
  content: string;
  likesCount: number;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: 'text';
  isRead: boolean;
  createdAt: string;
  likedBy?: string[];
}

export interface Conversation {
  id: string;
  participantId: string;
  participantName: string;
  participantAvatarColor: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  isOnline: boolean;
}

export interface ReadingList {
  id: string;
  name: string;
  description: string;
  coverColor: string;
  bookIds: string[];
  createdAt: string;
}

export interface Bookmark {
  id: string;
  userId: string;
  targetId: string;
  targetType: 'book' | 'story' | 'poem';
  chapterId?: string;
  scrollPercent?: number;
  note?: string;
  color?: string;
  createdAt: string;
}

export type PurchaseType = 'premium' | 'yazarlik_rozeti' | 'vip' | 'ozel_abonelik';

export interface PurchaseRequest {
  id: string;
  userId: string;
  userName: string;
  type: PurchaseType;
  planName: string;
  price: string;
  vipFrameColor?: string;
  status: 'pending' | 'approved' | 'rejected';
  expiresAt?: string; // ISO date — set when status becomes 'approved'
  createdAt: string;
}

export interface OzelCommentReply {
  id: string;
  commentId: string;
  authorId: string;
  authorName: string;
  authorAvatarColor: string;
  content: string;
  likesCount: number;
  createdAt: string;
}

export interface OzelComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorAvatarColor: string;
  content: string;
  likesCount: number;
  replies: OzelCommentReply[];
  createdAt: string;
}

export interface Notification {
  id: string;
  type: 'like' | 'comment' | 'reply' | 'follow' | 'rating' | 'feature';
  fromUserId: string;
  fromUsername: string;
  fromAvatarColor: string;
  targetType?: 'book' | 'story' | 'poem' | 'post';
  targetId?: string;
  targetTitle?: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}
