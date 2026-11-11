import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const favoriProfilesTable = pgTable(
  "favori_profiles",
  {
    id: text("id").primaryKey(),
    handle: text("handle").notNull(),
    name: text("name").notNull(),
    avatarUrl: text("avatar_url"),
    coverUrl: text("cover_url"),
    bio: text("bio").notNull().default(""),
    isBlocked: boolean("is_blocked").notNull().default(false),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("favori_profiles_handle_idx").on(table.handle)],
);

export const favoriBooksTable = pgTable("favori_books", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  author: text("author").notNull(),
  authorId: text("author_id"),
  category: text("category").notNull(),
  description: text("description").notNull().default(""),
  content: text("content").notNull().default(""),
  coverUrl: text("cover_url"),
  coverTone: text("cover_tone").notNull().default("#356044"),
  reads: integer("reads").notNull().default(0),
  likes: integer("likes").notNull().default(0),
  commentCount: integer("comment_count").notNull().default(0),
  isPromoted: boolean("is_promoted").notNull().default(false),
  status: text("status").notNull().default("published"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const favoriPostsTable = pgTable("favori_posts", {
  id: text("id").primaryKey(),
  authorId: text("author_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull().default(""),
  body: text("body").notNull(),
  imageUrl: text("image_url"),
  bookId: text("book_id"),
  likes: integer("likes").notNull().default(0),
  commentCount: integer("comment_count").notNull().default(0),
  views: integer("views").notNull().default(0),
  allowLikes: boolean("allow_likes").notNull().default(true),
  allowComments: boolean("allow_comments").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const favoriReactionsTable = pgTable(
  "favori_reactions",
  {
    userId: text("user_id").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    kind: text("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "favori_reactions_pk",
      columns: [table.userId, table.targetType, table.targetId, table.kind],
    }),
  ],
);

export const favoriFollowsTable = pgTable(
  "favori_follows",
  {
    followerId: text("follower_id").notNull(),
    followingId: text("following_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "favori_follows_pk",
      columns: [table.followerId, table.followingId],
    }),
  ],
);

export const favoriReadingProgressTable = pgTable(
  "favori_reading_progress",
  {
    userId: text("user_id").notNull(),
    bookId: text("book_id").notNull(),
    progress: integer("progress").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "favori_reading_progress_pk",
      columns: [table.userId, table.bookId],
    }),
  ],
);

export const favoriCommentsTable = pgTable("favori_comments", {
  id: text("id").primaryKey(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  authorId: text("author_id").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const favoriNotificationsTable = pgTable("favori_notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  actorName: text("actor_name").notNull(),
  actorAvatarUrl: text("actor_avatar_url"),
  action: text("action").notNull(),
  text: text("text").notNull(),
  timeLabel: text("time_label").notNull(),
  relatedBookId: text("related_book_id"),
  relatedProfileId: text("related_profile_id"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const favoriMessagesTable = pgTable("favori_messages", {
  id: text("id").primaryKey(),
  senderId: text("sender_id").notNull(),
  recipientId: text("recipient_id").notNull(),
  senderName: text("sender_name").notNull(),
  body: text("body").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const favoriRoomMessagesTable = pgTable("favori_room_messages", {
  id: text("id").primaryKey(),
  roomId: text("room_id").notNull(),
  senderId: text("sender_id").notNull(),
  senderName: text("sender_name").notNull(),
  body: text("body").notNull(),
  kind: text("kind").notNull().default("text"),
  // New photos contain private App Storage paths; legacy data URIs remain readable.
  mediaUrl: text("media_url"),
  bookId: text("book_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Durable cleanup ledger for finalization and retries after cancellation/success.
// An independent staging sweep also catches PUTs completing after ledger cleanup.
export const favoriChatPhotoUploadsTable = pgTable("favori_chat_photo_uploads", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  roomId: text("room_id").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  state: text("state").notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const favoriBookAdsTable = pgTable("favori_book_ads", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  bookId: text("book_id").notNull(),
  budget: integer("budget").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const favoriShopImagesTable = pgTable("favori_shop_images", {
  shopifyProductId: text("shopify_product_id").primaryKey(),
  imageData: text("image_data"),
  category: text("category").notNull().default("Kitap"),
});
