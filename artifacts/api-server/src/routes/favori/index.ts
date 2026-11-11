import { clerkClient, getAuth } from "@clerk/express";
import {
  db,
  afilliUserBlocksTable,
  favoriBookAdsTable,
  favoriBooksTable,
  favoriCommentsTable,
  favoriFollowsTable,
  favoriMessagesTable,
  favoriNotificationsTable,
  favoriPostsTable,
  favoriProfilesTable,
  favoriReadingProgressTable,
  favoriReactionsTable,
  favoriRoomMessagesTable,
  favoriShopImagesTable,
} from "@workspace/db";
import {
  AddBookCommentBody,
  AddBookCommentResponse,
  AddPostCommentBody,
  AddPostCommentResponse,
  CreateBookAdBody,
  CreateBookAdResponse,
  CreateBookBody,
  CreateBookResponse,
  CreatePostBody,
  CreatePostResponse,
  CreateStoreCheckoutBody,
  CreateStoreCheckoutResponse,
  CreateStoreProductBody,
  GetAppBootstrapResponse,
  GetBookParams,
  GetBookResponse,
  GetMembershipsResponse,
  GetPostCommentsParams,
  GetPostCommentsResponse,
  GetProfileConnectionsParams,
  GetProfileConnectionsResponse,
  GetProfileParams,
  GetProfileResponse,
  ListBooksResponse,
  ListMyBooksResponse,
  ListMessagesResponse,
  ListRoomMessagesResponse,
  ListNotificationsResponse,
  ListPostsQueryParams,
  ListPostsResponse,
  ListStoreProductsResponse,
  MarkNotificationReadParams,
  MarkNotificationReadResponse,
  SearchAppQueryParams,
  SearchAppResponse,
  SendMessageBody,
  SendMessageResponse,
  SendRoomMessageBody,
  SendRoomMessageResponse,
  ToggleBookLikeParams,
  ToggleBookLikeResponse,
  ToggleBookSaveParams,
  ToggleBookSaveResponse,
  ToggleFollowParams,
  ToggleFollowResponse,
  TogglePostLikeParams,
  TogglePostLikeResponse,
  UpdateBookProgressBody,
  UpdateBookProgressParams,
  UpdateBookProgressResponse,
  UpdateBookBody,
  UpdateMyProfileBody,
  UpdateMyProfileResponse,
} from "@workspace/api-zod";
import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
} from "drizzle-orm";
import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { createStoreProduct, StoreProductCreationError } from "../../lib/storeProductCreation";
import { createCheckoutUrl, shopifyStorefrontRequest } from "../../lib/shopifyStorefrontClient";
import { DEMO_PROFILE_ID, ensureSampleData, newId, storySamples } from "./seed";
import { createChatRouter } from "./chat";
import { ContentError, createContentRouter, freeAccess, linkPostMedia, validatePost, validateContentImage } from "./content";
import { contentMutation } from "../../lib/contentLifecycle";

const router: IRouter = Router();

function requestUserId(req: Request): string | null {
  return getAuth(req).userId ?? null;
}

async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = requestUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Devam etmek için giriş yapın." });
    return;
  }
  const [profile] = await db.select({ isBlocked: favoriProfilesTable.isBlocked }).from(favoriProfilesTable).where(eq(favoriProfilesTable.id, userId)).limit(1);
  if (profile?.isBlocked) {
    res.status(403).json({ error: "Hesabınız yönetici tarafından engellendi." });
    return;
  }
  next();
}

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function idForViewer(userId: string | null): string {
  return userId ?? DEMO_PROFILE_ID;
}

function canManageStore(userId: string | null): boolean {
  const ownerId = process.env.FAVORI_SHOP_OWNER_USER_ID?.trim();
  return Boolean(ownerId && userId && ownerId === userId);
}

function makeHandle(userId: string): string {
  const suffix = userId.replace(/[^a-z0-9]/gi, "").slice(-10).toLowerCase();
  return `okur_${suffix || "yeni"}`;
}

async function ensureUserProfile(userId: string): Promise<typeof favoriProfilesTable.$inferSelect> {
  const [existing] = await db
    .select()
    .from(favoriProfilesTable)
    .where(eq(favoriProfilesTable.id, userId))
    .limit(1);
  if (existing) return existing;

  const identity = await clerkClient.users.getUser(userId);
  const displayName = [identity.firstName, identity.lastName].filter(Boolean).join(" ").trim() || identity.username || "Yeni Okur";
  const [profile] = await db
    .insert(favoriProfilesTable)
    .values({
      id: userId,
      handle: makeHandle(userId),
      name: displayName,
      avatarUrl: identity.hasImage ? identity.imageUrl : null,
      bio: "Afilli topluluğuna yeni katıldım.",
    })
    .onConflictDoNothing()
    .returning();
  if (profile) return profile;

  const [racedProfile] = await db
    .select()
    .from(favoriProfilesTable)
    .where(eq(favoriProfilesTable.id, userId))
    .limit(1);
  if (!racedProfile) throw new Error("Profil oluşturulamadı.");
  return racedProfile;
}

async function getProfileDto(profileId: string, viewerId: string | null) {
  const [profile] = await db
    .select()
    .from(favoriProfilesTable)
    .where(
      or(
        eq(favoriProfilesTable.id, profileId),
        eq(favoriProfilesTable.handle, profileId),
      ),
    )
    .limit(1);
  if (!profile) return null;

  const [followers] = await db
    .select({ value: count() })
    .from(favoriFollowsTable)
    .where(eq(favoriFollowsTable.followingId, profile.id));
  const [following] = await db
    .select({ value: count() })
    .from(favoriFollowsTable)
    .where(eq(favoriFollowsTable.followerId, profile.id));
  const [books] = await db
    .select({ value: count() })
    .from(favoriBooksTable)
    .where(
      and(
        eq(favoriBooksTable.authorId, profile.id),
        eq(favoriBooksTable.status, "published"),
      ),
    );

  let isFollowing = false;
  if (viewerId) {
    const [follow] = await db
      .select({ followerId: favoriFollowsTable.followerId })
      .from(favoriFollowsTable)
      .where(
        and(
          eq(favoriFollowsTable.followerId, viewerId),
          eq(favoriFollowsTable.followingId, profile.id),
        ),
      )
      .limit(1);
    isFollowing = Boolean(follow);
  }

  return {
    id: profile.id,
    handle: profile.handle,
    name: profile.name,
    avatarUrl: profile.avatarUrl,
    coverUrl: profile.coverUrl,
    bio: profile.bio,
    followers: followers?.value ?? 0,
    following: following?.value ?? 0,
    books: books?.value ?? 0,
    isFollowing,
    isCurrentUser: profile.id === viewerId,
  };
}

async function getBookDto(
  book: typeof favoriBooksTable.$inferSelect,
  viewerId: string | null,
) {
  let likedByMe = false;
  let savedByMe = false;
  let progress = 0;
  if (viewerId) {
    const reactions = await db
      .select({ kind: favoriReactionsTable.kind })
      .from(favoriReactionsTable)
      .where(
        and(
          eq(favoriReactionsTable.userId, viewerId),
          eq(favoriReactionsTable.targetType, "book"),
          eq(favoriReactionsTable.targetId, book.id),
        ),
      );
    likedByMe = reactions.some((reaction) => reaction.kind === "like");
    savedByMe = reactions.some((reaction) => reaction.kind === "save");
    const [reading] = await db
      .select({ progress: favoriReadingProgressTable.progress })
      .from(favoriReadingProgressTable)
      .where(
        and(
          eq(favoriReadingProgressTable.userId, viewerId),
          eq(favoriReadingProgressTable.bookId, book.id),
        ),
      )
      .limit(1);
    progress = reading?.progress ?? 0;
  }

  return {
    id: book.id,
    title: book.title,
    author: book.author,
    authorId: book.authorId,
    category: book.category,
    description: book.description,
    content: book.content,
    coverUrl: book.coverUrl,
    coverTone: book.coverTone,
    reads: book.reads,
    likes: book.likes,
    comments: book.commentCount,
    isPromoted: book.isPromoted,
    status: book.status,
    progress,
    likedByMe,
    savedByMe,
  };
}

async function getPostDto(
  post: typeof favoriPostsTable.$inferSelect,
  viewerId: string | null,
) {
  const [author] = await db
    .select()
    .from(favoriProfilesTable)
    .where(eq(favoriProfilesTable.id, post.authorId))
    .limit(1);
  let likedByMe = false;
  if (viewerId) {
    const [like] = await db
      .select({ userId: favoriReactionsTable.userId })
      .from(favoriReactionsTable)
      .where(
        and(
          eq(favoriReactionsTable.userId, viewerId),
          eq(favoriReactionsTable.targetType, "post"),
          eq(favoriReactionsTable.targetId, post.id),
          eq(favoriReactionsTable.kind, "like"),
        ),
      )
      .limit(1);
    likedByMe = Boolean(like);
  }
  return {
    id: post.id,
    authorId: post.authorId,
    canManage: post.authorId === viewerId || (!!viewerId && process.env.AFILLI_ADMIN_USER_ID?.trim() === viewerId),
    author: author?.name ?? "Afilli Okuru",
    handle: author?.handle ?? "okur",
    avatarUrl: author?.avatarUrl ?? null,
    type: post.type,
    title: post.title,
    body: post.body,
    imageUrl: post.imageUrl,
    bookId: post.bookId,
    likes: post.likes,
    comments: post.commentCount,
    views: post.views,
    likedByMe,
    allowLikes: post.allowLikes,
    allowComments: post.allowComments,
    createdAt: post.createdAt.toISOString(),
  };
}

async function getCommentDtos(targetType: string, targetId: string) {
  const rows = await db
    .select()
    .from(favoriCommentsTable)
    .where(
      and(
        eq(favoriCommentsTable.targetType, targetType),
        eq(favoriCommentsTable.targetId, targetId),
      ),
    )
    .orderBy(desc(favoriCommentsTable.createdAt))
    .limit(100);

  return Promise.all(
    rows.map(async (comment) => {
      const [author] = await db
        .select()
        .from(favoriProfilesTable)
        .where(eq(favoriProfilesTable.id, comment.authorId))
        .limit(1);
      return {
        id: comment.id,
        authorId: comment.authorId,
        author: author?.name ?? "Afilli Okuru",
        avatarUrl: author?.avatarUrl ?? null,
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
      };
    }),
  );
}

async function createComment(
  req: Request,
  res: Response,
  targetType: "book" | "post",
  targetId: string,
  body: string,
): Promise<void> {
  const userId = requestUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Yorum yazmak için giriş yapın." });
    return;
  }
  await ensureUserProfile(userId);

  if (targetType === "book") {
    const [target] = await db
      .select()
      .from(favoriBooksTable)
      .where(eq(favoriBooksTable.id, targetId))
      .limit(1);
    if (!target) {
      res.status(404).json({ error: "Kitap bulunamadı." });
      return;
    }
    await db
      .update(favoriBooksTable)
      .set({ commentCount: sql`${favoriBooksTable.commentCount} + 1` })
      .where(eq(favoriBooksTable.id, targetId));
    if (target.authorId && target.authorId !== userId) {
      await db.insert(favoriNotificationsTable).values({
        id: newId("notice"),
        userId: target.authorId,
        actorName:
          (await ensureUserProfile(userId)).name,
        action: "comment",
        text: "Kitabınıza yeni bir yorum yaptı.",
        timeLabel: "şimdi",
      });
    }
  } else {
    const [target] = await db
      .select()
      .from(favoriPostsTable)
      .where(eq(favoriPostsTable.id, targetId))
      .limit(1);
    if (!target) {
      res.status(404).json({ error: "Gönderi bulunamadı." });
      return;
    }
    if (!target.allowComments) {
      res.status(403).json({ error: "Bu gönderide yorumlar kapalı." });
      return;
    }
    await db
      .update(favoriPostsTable)
      .set({ commentCount: sql`${favoriPostsTable.commentCount} + 1` })
      .where(eq(favoriPostsTable.id, targetId));
    if (target.authorId !== userId) {
      await db.insert(favoriNotificationsTable).values({
        id: newId("notice"),
        userId: target.authorId,
        actorName: (await ensureUserProfile(userId)).name,
        action: "comment",
        text: "Gönderinize yeni bir yorum yaptı.",
        timeLabel: "şimdi",
      });
    }
  }

  const profile = await ensureUserProfile(userId);
  const [comment] = await db
    .insert(favoriCommentsTable)
    .values({
      id: newId("comment"),
      targetType,
      targetId,
      authorId: userId,
      body,
    })
    .returning();
  res.status(201).json(
    (targetType === "book" ? AddBookCommentResponse : AddPostCommentResponse).parse({
      id: comment.id,
      author: profile.name,
      avatarUrl: profile.avatarUrl,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
    }),
  );
}

async function toggleLike(
  userId: string,
  targetType: "book" | "post",
  targetId: string,
) {
  const [existing] = await db
    .select()
    .from(favoriReactionsTable)
    .where(
      and(
        eq(favoriReactionsTable.userId, userId),
        eq(favoriReactionsTable.targetType, targetType),
        eq(favoriReactionsTable.targetId, targetId),
        eq(favoriReactionsTable.kind, "like"),
      ),
    )
    .limit(1);

  let active: boolean;
  if (existing) {
    await db
      .delete(favoriReactionsTable)
      .where(
        and(
          eq(favoriReactionsTable.userId, userId),
          eq(favoriReactionsTable.targetType, targetType),
          eq(favoriReactionsTable.targetId, targetId),
          eq(favoriReactionsTable.kind, "like"),
        ),
      );
    active = false;
  } else {
    await db
      .insert(favoriReactionsTable)
      .values({ userId, targetType, targetId, kind: "like" })
      .onConflictDoNothing();
    active = true;
  }

  if (targetType === "book") {
    await db
      .update(favoriBooksTable)
      .set({
        likes: active
          ? sql`${favoriBooksTable.likes} + 1`
          : sql`GREATEST(${favoriBooksTable.likes} - 1, 0)`,
      })
      .where(eq(favoriBooksTable.id, targetId));
    const [book] = await db
      .select({ likes: favoriBooksTable.likes })
      .from(favoriBooksTable)
      .where(eq(favoriBooksTable.id, targetId))
      .limit(1);
    if (active) {
      const [owner] = await db
        .select({ authorId: favoriBooksTable.authorId })
        .from(favoriBooksTable)
        .where(eq(favoriBooksTable.id, targetId))
        .limit(1);
      if (owner?.authorId && owner.authorId !== userId) {
        await db.insert(favoriNotificationsTable).values({
          id: newId("notice"),
          userId: owner.authorId,
          actorName: (await ensureUserProfile(userId)).name,
          action: "like",
          text: "Kitabınızı beğendi.",
          timeLabel: "şimdi",
          relatedBookId: targetId,
        });
      }
    }
    return { active, count: book?.likes ?? 0, value: book?.likes ?? 0 };
  }

  await db
    .update(favoriPostsTable)
    .set({
      likes: active
        ? sql`${favoriPostsTable.likes} + 1`
        : sql`GREATEST(${favoriPostsTable.likes} - 1, 0)`,
    })
    .where(eq(favoriPostsTable.id, targetId));
  const [post] = await db
    .select({ likes: favoriPostsTable.likes })
    .from(favoriPostsTable)
    .where(eq(favoriPostsTable.id, targetId))
    .limit(1);
  if (active) {
    const [owner] = await db
      .select({ authorId: favoriPostsTable.authorId })
      .from(favoriPostsTable)
      .where(eq(favoriPostsTable.id, targetId))
      .limit(1);
    if (owner?.authorId && owner.authorId !== userId) {
      await db.insert(favoriNotificationsTable).values({
        id: newId("notice"),
        userId: owner.authorId,
        actorName: (await ensureUserProfile(userId)).name,
        action: "like",
        text: "Gönderinizi beğendi.",
        timeLabel: "şimdi",
      });
    }
  }
  return { active, count: post?.likes ?? 0, value: post?.likes ?? 0 };
}

router.use(createContentRouter({ requireAuth, requestUserId, ensureUserProfile, getPostDto }));

router.get("/app/bootstrap", async (req, res): Promise<void> => {
  await ensureSampleData();
  const viewerId = idForViewer(requestUserId(req));
  if (viewerId !== DEMO_PROFILE_ID) await ensureUserProfile(viewerId);

  const rows = await db
    .select()
    .from(favoriBooksTable)
    .where(eq(favoriBooksTable.status, "published"))
    .orderBy(desc(favoriBooksTable.createdAt));
  const bookDtos = await Promise.all(rows.map((book) => getBookDto(book, viewerId)));
  const popular = [...bookDtos].sort((a, b) => (b.likes + b.reads / 10) - (a.likes + a.reads / 10));
  const interests = new Set(bookDtos.filter((book) => book.progress > 0 || book.savedByMe).map((book) => book.category));
  const personal = [...popular].sort((a, b) => Number(interests.has(b.category)) - Number(interests.has(a.category)));
  const postRows = await db
    .select()
    .from(favoriPostsTable)
    .orderBy(desc(favoriPostsTable.createdAt))
    .limit(30);
  const posts = await Promise.all(postRows.map((post) => getPostDto(post, viewerId)));
  const notifications = await db
    .select()
    .from(favoriNotificationsTable)
    .where(eq(favoriNotificationsTable.userId, viewerId))
    .orderBy(desc(favoriNotificationsTable.createdAt))
    .limit(30);
  const profile = await getProfileDto(viewerId, viewerId);
  const response = {
    profile,
    stories: [],
    featuredBooks: (bookDtos.some((book) => book.isPromoted) ? bookDtos.filter((book) => book.isPromoted) : popular).slice(0, 12),
    personalBooks: personal.slice(0, 12),
    newBooks: bookDtos.slice(0, 12),
    recommendedBooks: popular.slice(0, 12),
    readingBooks: bookDtos.filter((book) => book.progress > 0),
    savedBooks: bookDtos.filter((book) => book.savedByMe),
    posts,
    notifications: notifications.map((notification) => ({
      id: notification.id,
      actorName: notification.actorName,
      actorAvatarUrl: notification.actorAvatarUrl,
      action: notification.action,
      text: notification.text,
      timeLabel: notification.timeLabel,
      relatedBookId: notification.relatedBookId,
      relatedProfileId: notification.relatedProfileId,
      isRead: notification.isRead,
    })),
    membership: freeAccess(requestUserId(req)),
  };
  res.json(GetAppBootstrapResponse.parse(response));
});

router.get("/search", async (req, res): Promise<void> => {
  await ensureSampleData();
  const parsed = SearchAppQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Arama metni geçersiz." });
    return;
  }
  const query = `%${parsed.data.query.trim()}%`;
  const viewerId = idForViewer(requestUserId(req));
  const [books, profiles, postRows] = await Promise.all([
    db
      .select()
      .from(favoriBooksTable)
      .where(
        and(
          eq(favoriBooksTable.status, "published"),
          or(
            ilike(favoriBooksTable.title, query),
            ilike(favoriBooksTable.author, query),
            ilike(favoriBooksTable.category, query),
          ),
        ),
      )
      .limit(20),
    db
      .select()
      .from(favoriProfilesTable)
      .where(
        or(
          ilike(favoriProfilesTable.name, query),
          ilike(favoriProfilesTable.handle, query),
        ),
      )
      .limit(20),
    db
      .select()
      .from(favoriPostsTable)
      .where(
        or(
          ilike(favoriPostsTable.title, query),
          ilike(favoriPostsTable.body, query),
        ),
      )
      .orderBy(desc(favoriPostsTable.createdAt))
      .limit(20),
  ]);
  const bookDtos = await Promise.all(books.map((book) => getBookDto(book, viewerId)));
  const profileDtos = await Promise.all(
    profiles.map((profile) => getProfileDto(profile.id, viewerId)),
  );
  const postDtos = await Promise.all(postRows.map((post) => getPostDto(post, viewerId)));
  res.json(SearchAppResponse.parse({
    books: bookDtos,
    profiles: profileDtos.filter(Boolean),
    posts: postDtos,
  }));
});

router.get("/books", async (req, res): Promise<void> => {
  await ensureSampleData();
  const rows = await db
    .select()
    .from(favoriBooksTable)
    .where(eq(favoriBooksTable.status, "published"))
    .orderBy(desc(favoriBooksTable.createdAt));
  const viewerId = idForViewer(requestUserId(req));
  const books = await Promise.all(rows.map((book) => getBookDto(book, viewerId)));
  res.json(ListBooksResponse.parse(books));
});

router.post("/books", requireAuth, contentMutation(async (req, res): Promise<void> => {
  const parsed = CreateBookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Kitap bilgilerini kontrol edip yeniden deneyin." });
    return;
  }
  const userId = requestUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Kitap yazmak için giriş yapın." });
    return;
  }
  const profile = await ensureUserProfile(userId);
  try { await validateContentImage(parsed.data.coverUrl, userId); }
  catch (error) {
    if (error instanceof ContentError) { res.status(error.status).json({ error: error.message }); return; }
    throw error;
  }
  const [book] = await db
    .insert(favoriBooksTable)
    .values({
      id: newId("book"),
      title: parsed.data.title,
      author: profile.name,
      authorId: userId,
      category: parsed.data.category,
      description: parsed.data.description,
      content: parsed.data.content,
      coverUrl: parsed.data.coverUrl ?? null,
      coverTone: "#8D6A45",
      status: parsed.data.status,
    })
    .returning();
  const dto = await getBookDto(book, userId);
  res.status(201).json(CreateBookResponse.parse(dto));
}));

router.get("/books/mine", requireAuth, async (req, res): Promise<void> => {
  const userId = requestUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Kitaplarını görmek için giriş yapın." });
    return;
  }
  await ensureUserProfile(userId);
  const rows = await db
    .select()
    .from(favoriBooksTable)
    .where(eq(favoriBooksTable.authorId, userId))
    .orderBy(desc(favoriBooksTable.createdAt));
  const books = await Promise.all(rows.map((book) => getBookDto(book, userId)));
  res.json(ListMyBooksResponse.parse(books));
});

router.patch("/books/:bookId", requireAuth, contentMutation(async (req, res): Promise<void> => {
  const body = UpdateBookBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Kitap bilgilerini kontrol edip yeniden deneyin." });
    return;
  }
  const userId = requestUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Kitabı düzenlemek için giriş yapın." });
    return;
  }
  const bookId = routeParam(req.params.bookId);
  try { await validateContentImage(body.data.coverUrl, userId); }
  catch (error) {
    if (error instanceof ContentError) { res.status(error.status).json({ error: error.message }); return; }
    throw error;
  }
  const [book] = await db
    .update(favoriBooksTable)
    .set({
      title: body.data.title,
      category: body.data.category,
      description: body.data.description,
      content: body.data.content,
      coverUrl: body.data.coverUrl,
      status: body.data.status,
    })
    .where(
      and(
        eq(favoriBooksTable.id, bookId),
        eq(favoriBooksTable.authorId, userId),
      ),
    )
    .returning();
  if (!book) {
    res.status(404).json({ error: "Bu kitap hesabınızda bulunamadı." });
    return;
  }
  res.json(GetBookResponse.parse(await getBookDto(book, userId)));
}));

router.get("/books/:bookId", async (req, res): Promise<void> => {
  await ensureSampleData();
  const parsed = GetBookParams.safeParse({ bookId: routeParam(req.params.bookId) });
  if (!parsed.success) {
    res.status(400).json({ error: "Kitap kimliği geçersiz." });
    return;
  }
  const [book] = await db
    .select()
    .from(favoriBooksTable)
    .where(eq(favoriBooksTable.id, parsed.data.bookId))
    .limit(1);
  if (!book || book.status !== "published") {
    res.status(404).json({ error: "Kitap bulunamadı." });
    return;
  }
  const dto = await getBookDto(book, idForViewer(requestUserId(req)));
  res.json(GetBookResponse.parse(dto));
});

router.post("/books/:bookId/like", requireAuth, async (req, res): Promise<void> => {
  const parsed = ToggleBookLikeParams.safeParse({
    bookId: routeParam(req.params.bookId),
  });
  if (!parsed.success) {
    res.status(400).json({ error: "Kitap kimliği geçersiz." });
    return;
  }
  const userId = requestUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Beğenmek için giriş yapın." });
    return;
  }
  const result = await toggleLike(userId, "book", parsed.data.bookId);
  res.json(ToggleBookLikeResponse.parse(result));
});

router.post("/books/:bookId/save", requireAuth, async (req, res): Promise<void> => {
  const parsed = ToggleBookSaveParams.safeParse({
    bookId: routeParam(req.params.bookId),
  });
  if (!parsed.success) {
    res.status(400).json({ error: "Kitap kimliği geçersiz." });
    return;
  }
  const userId = requestUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Kaydetmek için giriş yapın." });
    return;
  }
  const [existing] = await db
    .select()
    .from(favoriReactionsTable)
    .where(
      and(
        eq(favoriReactionsTable.userId, userId),
        eq(favoriReactionsTable.targetType, "book"),
        eq(favoriReactionsTable.targetId, parsed.data.bookId),
        eq(favoriReactionsTable.kind, "save"),
      ),
    )
    .limit(1);
  if (existing) {
    await db
      .delete(favoriReactionsTable)
      .where(
        and(
          eq(favoriReactionsTable.userId, userId),
          eq(favoriReactionsTable.targetType, "book"),
          eq(favoriReactionsTable.targetId, parsed.data.bookId),
          eq(favoriReactionsTable.kind, "save"),
        ),
      );
  } else {
    await db
      .insert(favoriReactionsTable)
      .values({
        userId,
        targetType: "book",
        targetId: parsed.data.bookId,
        kind: "save",
      })
      .onConflictDoNothing();
    const [book] = await db
      .select()
      .from(favoriBooksTable)
      .where(eq(favoriBooksTable.id, parsed.data.bookId))
      .limit(1);
    if (book?.authorId && book.authorId !== userId) {
      await db.insert(favoriNotificationsTable).values({
        id: newId("notice"),
        userId: book.authorId,
        actorName: (await ensureUserProfile(userId)).name,
        action: "save",
        text: "Kitabınızı kaydetti.",
        timeLabel: "şimdi",
        relatedBookId: book.id,
      });
    }
  }
  const active = !existing;
  res.json(ToggleBookSaveResponse.parse({
    active,
    count: active ? 1 : 0,
    value: active ? 1 : 0,
  }));
});

router.patch("/books/:bookId/progress", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateBookProgressParams.safeParse({
    bookId: routeParam(req.params.bookId),
  });
  const body = UpdateBookProgressBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Okuma ilerlemesi geçersiz." });
    return;
  }
  const userId = requestUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Okuma ilerlemesini kaydetmek için giriş yapın." });
    return;
  }
  await db
    .insert(favoriReadingProgressTable)
    .values({
      userId,
      bookId: params.data.bookId,
      progress: body.data.progress,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        favoriReadingProgressTable.userId,
        favoriReadingProgressTable.bookId,
      ],
      set: { progress: body.data.progress, updatedAt: new Date() },
    });
  res.json(
    UpdateBookProgressResponse.parse({
      active: true,
      count: body.data.progress,
      value: body.data.progress,
    }),
  );
});

router.get("/books/:bookId/comments", async (req, res): Promise<void> => {
  const bookId = routeParam(req.params.bookId);
  const comments = await getCommentDtos("book", bookId);
  res.json(comments);
});

router.post("/books/:bookId/comments", requireAuth, async (req, res): Promise<void> => {
  const body = AddBookCommentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Yorum boş olamaz ve 2.000 karakteri geçemez." });
    return;
  }
  await createComment(req, res, "book", routeParam(req.params.bookId), body.data.body);
});

router.get("/posts", async (req, res): Promise<void> => {
  await ensureSampleData();
  const parsed = ListPostsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Gönderi filtresi geçersiz." });
    return;
  }
  const conditions = and(
    parsed.data.type ? eq(favoriPostsTable.type, parsed.data.type) : undefined,
    parsed.data.authorId ? eq(favoriPostsTable.authorId, parsed.data.authorId) : undefined,
  );
  const rows = await db
    .select()
    .from(favoriPostsTable)
    .where(conditions)
    .orderBy(desc(favoriPostsTable.createdAt))
    .limit(60);
  const viewerId = idForViewer(requestUserId(req));
  const posts = await Promise.all(rows.map((post) => getPostDto(post, viewerId)));
  res.json(ListPostsResponse.parse(posts));
});

router.post("/posts", requireAuth, contentMutation(async (req, res): Promise<void> => {
  const body = CreatePostBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Gönderi bilgilerini kontrol edip yeniden deneyin." });
    return;
  }
  const userId = requestUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Paylaşım yapmak için giriş yapın." });
    return;
  }
  try { await validatePost(body.data, userId); }
  catch (error) {
    if (error instanceof ContentError) { res.status(error.status).json({ error: error.message }); return; }
    throw error;
  }
  await ensureUserProfile(userId);
  const [post] = await db
    .insert(favoriPostsTable)
    .values({
      id: newId("post"),
      authorId: userId,
      type: body.data.type,
      title: body.data.title.trim(),
      body: body.data.body.trim(),
      imageUrl: body.data.imageUrl ?? null,
      bookId: body.data.bookId ?? null,
      allowLikes: body.data.allowLikes,
      allowComments: body.data.allowComments,
    })
    .returning();
  await linkPostMedia(post.imageUrl);
  res.status(201).json(
    CreatePostResponse.parse(await getPostDto(post, userId)),
  );
}));

router.post("/posts/:postId/like", requireAuth, async (req, res): Promise<void> => {
  const params = TogglePostLikeParams.safeParse({
    postId: routeParam(req.params.postId),
  });
  if (!params.success) {
    res.status(400).json({ error: "Gönderi kimliği geçersiz." });
    return;
  }
  const userId = requestUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Beğenmek için giriş yapın." });
    return;
  }
  const [post] = await db
    .select()
    .from(favoriPostsTable)
    .where(eq(favoriPostsTable.id, params.data.postId))
    .limit(1);
  if (!post) {
    res.status(404).json({ error: "Gönderi bulunamadı." });
    return;
  }
  if (!post.allowLikes) {
    res.status(403).json({ error: "Bu gönderide beğeniler kapalı." });
    return;
  }
  res.json(TogglePostLikeResponse.parse(
    await toggleLike(userId, "post", params.data.postId),
  ));
});

router.get("/posts/:postId/comments", async (req, res): Promise<void> => {
  const parsed = GetPostCommentsParams.safeParse({
    postId: routeParam(req.params.postId),
  });
  if (!parsed.success) {
    res.status(400).json({ error: "Gönderi kimliği geçersiz." });
    return;
  }
  const comments = await getCommentDtos("post", parsed.data.postId);
  res.json(GetPostCommentsResponse.parse(comments));
});

router.post("/posts/:postId/comments", requireAuth, async (req, res): Promise<void> => {
  const body = AddPostCommentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Yorum boş olamaz ve 2.000 karakteri geçemez." });
    return;
  }
  await createComment(req, res, "post", routeParam(req.params.postId), body.data.body);
});

router.get("/notifications", async (req, res): Promise<void> => {
  await ensureSampleData();
  const viewerId = idForViewer(requestUserId(req));
  const rows = await db
    .select()
    .from(favoriNotificationsTable)
    .where(eq(favoriNotificationsTable.userId, viewerId))
    .orderBy(desc(favoriNotificationsTable.createdAt))
    .limit(60);
  res.json(
    ListNotificationsResponse.parse(
      rows.map((notification) => ({
        id: notification.id,
        actorName: notification.actorName,
        actorAvatarUrl: notification.actorAvatarUrl,
        action: notification.action,
        text: notification.text,
        timeLabel: notification.timeLabel,
        relatedBookId: notification.relatedBookId,
        relatedProfileId: notification.relatedProfileId,
        isRead: notification.isRead,
      })),
    ),
  );
});

router.post(
  "/notifications/:notificationId/read",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = MarkNotificationReadParams.safeParse({
      notificationId: routeParam(req.params.notificationId),
    });
    if (!params.success) {
      res.status(400).json({ error: "Bildirim kimliği geçersiz." });
      return;
    }
    const userId = requestUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Bildirimleri güncellemek için giriş yapın." });
      return;
    }
    const [notification] = await db
      .update(favoriNotificationsTable)
      .set({ isRead: true })
      .where(
        and(
          eq(favoriNotificationsTable.id, params.data.notificationId),
          eq(favoriNotificationsTable.userId, userId),
        ),
      )
      .returning();
    res.json(
      MarkNotificationReadResponse.parse({
        active: Boolean(notification?.isRead),
        count: 1,
        value: notification?.isRead ? 1 : 0,
      }),
    );
  },
);

router.get("/profiles/:profileId", async (req, res): Promise<void> => {
  await ensureSampleData();
  const params = GetProfileParams.safeParse({
    profileId: routeParam(req.params.profileId),
  });
  if (!params.success) {
    res.status(400).json({ error: "Profil kimliği geçersiz." });
    return;
  }
  const dto = await getProfileDto(
    params.data.profileId,
    idForViewer(requestUserId(req)),
  );
  if (!dto) {
    res.status(404).json({ error: "Profil bulunamadı." });
    return;
  }
  res.json(GetProfileResponse.parse(dto));
});

router.patch("/profiles/me", requireAuth, contentMutation(async (req, res): Promise<void> => {
  const body = UpdateMyProfileBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Profil bilgilerini kontrol edip yeniden deneyin." });
    return;
  }
  const userId = requestUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Profilinizi düzenlemek için giriş yapın." });
    return;
  }
  await ensureUserProfile(userId);
  try {
    await validateContentImage(body.data.avatarUrl, userId);
    await validateContentImage(body.data.coverUrl, userId);
  } catch (error) {
    if (error instanceof ContentError) { res.status(error.status).json({ error: error.message }); return; }
    throw error;
  }
  const [profile] = await db
    .update(favoriProfilesTable)
    .set({
      name: body.data.name.trim(),
      bio: body.data.bio.trim(),
      avatarUrl: body.data.avatarUrl ?? null,
      coverUrl: body.data.coverUrl ?? null,
    })
    .where(eq(favoriProfilesTable.id, userId))
    .returning();
  const dto = await getProfileDto(profile.id, userId);
  res.json(UpdateMyProfileResponse.parse(dto));
}));

router.post("/profiles/:profileId/follow", requireAuth, async (req, res): Promise<void> => {
  const params = ToggleFollowParams.safeParse({
    profileId: routeParam(req.params.profileId),
  });
  if (!params.success) {
    res.status(400).json({ error: "Profil kimliği geçersiz." });
    return;
  }
  const userId = requestUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Takip etmek için giriş yapın." });
    return;
  }
  if (params.data.profileId === userId) {
    res.status(400).json({ error: "Kendi profilinizi takip edemezsiniz." });
    return;
  }
  const [target] = await db
    .select()
    .from(favoriProfilesTable)
    .where(eq(favoriProfilesTable.id, params.data.profileId))
    .limit(1);
  if (!target) {
    res.status(404).json({ error: "Profil bulunamadı." });
    return;
  }
  const [existing] = await db
    .select()
    .from(favoriFollowsTable)
    .where(
      and(
        eq(favoriFollowsTable.followerId, userId),
        eq(favoriFollowsTable.followingId, target.id),
      ),
    )
    .limit(1);
  if (existing) {
    await db
      .delete(favoriFollowsTable)
      .where(
        and(
          eq(favoriFollowsTable.followerId, userId),
          eq(favoriFollowsTable.followingId, target.id),
        ),
      );
  } else {
    await db
      .insert(favoriFollowsTable)
      .values({ followerId: userId, followingId: target.id })
      .onConflictDoNothing();
    await db.insert(favoriNotificationsTable).values({
      id: newId("notice"),
      userId: target.id,
      actorName: (await ensureUserProfile(userId)).name,
      action: "follow",
      text: "Sizi takip etmeye başladı.",
      timeLabel: "şimdi",
      relatedProfileId: userId,
    });
  }
  const [followers] = await db
    .select({ value: count() })
    .from(favoriFollowsTable)
    .where(eq(favoriFollowsTable.followingId, target.id));
  const active = !existing;
  res.json(
    ToggleFollowResponse.parse({
      active,
      count: followers?.value ?? 0,
      value: active ? 1 : 0,
    }),
  );
});

router.get(
  "/profiles/:profileId/connections/:type",
  async (req, res): Promise<void> => {
    const params = GetProfileConnectionsParams.safeParse({
      profileId: routeParam(req.params.profileId),
      type: routeParam(req.params.type),
    });
    if (!params.success) {
      res.status(400).json({ error: "Takip listesi seçimi geçersiz." });
      return;
    }
    const { profileId, type } = params.data;
    const edges =
      type === "followers"
        ? await db
            .select({ profileId: favoriFollowsTable.followerId })
            .from(favoriFollowsTable)
            .where(eq(favoriFollowsTable.followingId, profileId))
            .limit(100)
        : await db
            .select({ profileId: favoriFollowsTable.followingId })
            .from(favoriFollowsTable)
            .where(eq(favoriFollowsTable.followerId, profileId))
            .limit(100);
    const viewerId = idForViewer(requestUserId(req));
    const profiles = await Promise.all(
      edges.map((edge) => getProfileDto(edge.profileId, viewerId)),
    );
    res.json(GetProfileConnectionsResponse.parse(profiles.filter(Boolean)));
  },
);

router.get("/store/products", async (req, res): Promise<void> => {
  try {
    const result = await shopifyStorefrontRequest<{
      shop: { paymentSettings: { currencyCode: string }; primaryDomain: { url: string } };
      products: {
        nodes: Array<{
          id: string;
          title: string;
          description: string;
          productType: string;
          featuredImage: { url: string; altText: string | null } | null;
          priceRange: {
            minVariantPrice: { amount: string; currencyCode: string };
          };
          variants: {
            nodes: Array<{
              id: string;
              availableForSale: boolean;
            }>;
          };
        }>;
      };
    }>(
      `query FavoriProducts {
        shop { paymentSettings { currencyCode } primaryDomain { url } }
        products(first: 20, sortKey: UPDATED_AT, reverse: true) {
          nodes {
            id
            title
            description
            productType
            featuredImage { url altText }
            priceRange { minVariantPrice { amount currencyCode } }
            variants(first: 10) { nodes { id availableForSale } }
          }
        }
      }`,
    );
    const imageRows = await db.select().from(favoriShopImagesTable);
    const imageMap = new Map(
      imageRows.map((item) => [
        item.shopifyProductId,
        { imageData: item.imageData, category: item.category },
      ]),
    );
    res.json(
      ListStoreProductsResponse.parse({
        configured: true,
        canManage: canManageStore(requestUserId(req)),
        currency: result.shop.paymentSettings.currencyCode,
        accountUrl: `${result.shop.primaryDomain.url.replace(/\/$/, "")}/account`,
        products: result.products.nodes.map((product) => ({
          id: product.id,
          title: product.title,
          description: product.description,
          imageUrl:
            imageMap.get(product.id)?.imageData ??
            product.featuredImage?.url ??
            null,
          price: Number(product.priceRange.minVariantPrice.amount),
          currency: product.priceRange.minVariantPrice.currencyCode,
          variantId: product.variants.nodes[0]?.id ?? null,
          availableForSale:
            product.variants.nodes.some((variant) => variant.availableForSale),
          category:
            imageMap.get(product.id)?.category ??
            product.productType ??
            "Kitap",
        })),
        message:
          result.products.nodes.length > 0
            ? ""
            : "Mağazada henüz yayınlanmış ürün yok.",
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Shopify mağaza bilgileri alınamadı.";
    res.status(502).json({ error: message });
  }
});

router.post("/store/products", requireAuth, async (req, res): Promise<void> => {
  const userId = requestUserId(req);
  if (!canManageStore(userId)) {
    res.status(403).json({
      error:
        "Shopify ürünlerini yalnızca mağaza sahibi ekleyebilir. Mağaza sahibi hesabı henüz tanımlanmamış olabilir.",
    });
    return;
  }
  const parsed = CreateStoreProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ürün bilgilerini kontrol edip yeniden deneyin." });
    return;
  }
  try {
    res.status(201).json(await createStoreProduct(userId!, parsed.data));
  } catch (error) {
    req.log.error({ err: error }, "Shopify product creation failed");
    if (error instanceof StoreProductCreationError) {
      res.status(error.status).json(error.body);
      return;
    }
    res.status(502).json({ error: "Ürün ekleme sonucu alınamadı; Shopify yönetiminden kontrol edin." });
  }
});

router.post("/store/checkout", async (req, res): Promise<void> => {
  const parsed = CreateStoreCheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ödeme bilgileri geçersiz." });
    return;
  }
  try {
    const checkoutUrl = await createCheckoutUrl(
      parsed.data.variantId,
      parsed.data.quantity,
      { useDevStorePreview: process.env.NODE_ENV !== "production" },
    );
    res.json(CreateStoreCheckoutResponse.parse({ checkoutUrl }));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Ödeme sayfası açılamadı.";
    res.status(502).json({ error: message });
  }
});

router.get("/memberships", (req, res): void => {
  res.json(GetMembershipsResponse.parse(freeAccess(requestUserId(req))));
});

router.get("/messages", requireAuth, async (req, res): Promise<void> => {
  const userId = requestUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Mesajları görmek için giriş yapın." });
    return;
  }
  const rows = await db
    .select()
    .from(favoriMessagesTable)
    .where(
      or(
        eq(favoriMessagesTable.senderId, userId),
        eq(favoriMessagesTable.recipientId, userId),
      ),
    )
    .orderBy(desc(favoriMessagesTable.createdAt))
    .limit(100);
  res.json(
    ListMessagesResponse.parse(
      await Promise.all(
        rows.map(async (message) => {
          const otherId =
            message.senderId === userId ? message.recipientId : message.senderId;
          const [otherProfile] = await db
            .select()
            .from(favoriProfilesTable)
            .where(eq(favoriProfilesTable.id, otherId))
            .limit(1);
          return {
            id: message.id,
            senderId: message.senderId,
            recipientId: message.recipientId,
            otherId,
            avatarUrl: otherProfile?.avatarUrl ?? null,
            isRead: message.isRead,
            sender:
              message.senderId === userId
                ? (await ensureUserProfile(userId)).name
                : message.senderName,
            recipient: otherProfile?.name ?? "Afilli Okuru",
            body: message.body,
            createdAt: message.createdAt.toISOString(),
          };
        }),
      ),
    ),
  );
});

router.post("/messages", requireAuth, async (req, res): Promise<void> => {
  const body = SendMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Mesaj 2.000 karakteri geçemez." });
    return;
  }
  const userId = requestUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Mesaj göndermek için giriş yapın." });
    return;
  }
  const [recipient] = await db
    .select()
    .from(favoriProfilesTable)
    .where(or(eq(favoriProfilesTable.id, body.data.recipient), eq(favoriProfilesTable.handle, body.data.recipient.replace(/^@/, ""))))
    .limit(1);
  if (!recipient) {
    res.status(404).json({ error: "Alıcı bulunamadı." });
    return;
  }
  if (!body.data.body.trim() || recipient.id === userId) {
    res.status(400).json({ error: "Geçerli bir mesaj ve başka bir okur seçin." });
    return;
  }
  const [blocked] = await db.select().from(afilliUserBlocksTable).where(or(
    and(eq(afilliUserBlocksTable.blockerId, userId), eq(afilliUserBlocksTable.blockedId, recipient.id)),
    and(eq(afilliUserBlocksTable.blockerId, recipient.id), eq(afilliUserBlocksTable.blockedId, userId)),
  )).limit(1);
  if (blocked || recipient.isBlocked) {
    res.status(403).json({ error: "Bu okurla mesajlaşma kullanılamıyor." });
    return;
  }
  const sender = await ensureUserProfile(userId);
  const [message] = await db
    .insert(favoriMessagesTable)
    .values({
      id: newId("message"),
      senderId: userId,
      recipientId: recipient.id,
      senderName: sender.name,
      body: body.data.body.trim(),
    })
    .returning();
  res.status(201).json(
    SendMessageResponse.parse({
      id: message.id,
      senderId: userId,
      recipientId: recipient.id,
      otherId: recipient.id,
      avatarUrl: recipient.avatarUrl,
      isRead: false,
      sender: sender.name,
      recipient: recipient.name,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
    }),
  );
});

router.use(createChatRouter({ requireAuth, requestUserId, ensureUserProfile }));

const CHAT_ROOMS = new Set(["afilli", "magazin", "serbest"]);

router.get(
  "/chat/rooms/:roomId/messages",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = requestUserId(req);
    const roomId = Array.isArray(req.params.roomId)
      ? req.params.roomId[0]
      : req.params.roomId;
    if (!userId) {
      res.status(401).json({ error: "Sohbet için giriş yapın." });
      return;
    }
    if (!CHAT_ROOMS.has(roomId)) {
      res.status(404).json({ error: "Sohbet odası bulunamadı." });
      return;
    }
    const rows = await db
      .select()
      .from(favoriRoomMessagesTable)
      .where(eq(favoriRoomMessagesTable.roomId, roomId))
      .orderBy(desc(favoriRoomMessagesTable.createdAt))
      .limit(100);
    res.json(
      ListRoomMessagesResponse.parse(
        rows.reverse().map((message) => ({
          id: message.id,
          roomId: message.roomId,
          senderId: message.senderId,
          sender: message.senderName,
          body: message.body,
          createdAt: message.createdAt.toISOString(),
        })),
      ),
    );
  },
);

router.post(
  "/chat/rooms/:roomId/messages",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = requestUserId(req);
    const roomId = Array.isArray(req.params.roomId)
      ? req.params.roomId[0]
      : req.params.roomId;
    const body = SendRoomMessageBody.safeParse(req.body);
    if (!userId) {
      res.status(401).json({ error: "Sohbete mesaj göndermek için giriş yapın." });
      return;
    }
    if (!CHAT_ROOMS.has(roomId)) {
      res.status(404).json({ error: "Sohbet odası bulunamadı." });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: "Mesaj boş olamaz ve 2.000 karakteri geçemez." });
      return;
    }
    const profile = await ensureUserProfile(userId);
    const [message] = await db
      .insert(favoriRoomMessagesTable)
      .values({
        id: newId("room_message"),
        roomId,
        senderId: userId,
        senderName: profile.name,
        body: body.data.body.trim(),
      })
      .returning();
    res.status(201).json(
      SendRoomMessageResponse.parse({
        id: message.id,
        roomId: message.roomId,
        senderId: message.senderId,
        sender: message.senderName,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
      }),
    );
  },
);

router.post("/book-ads", requireAuth, async (req, res): Promise<void> => {
  const body = CreateBookAdBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Kitap ve tanıtım bütçesi geçersiz." });
    return;
  }
  const userId = requestUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Tanıtım talebi oluşturmak için giriş yapın." });
    return;
  }
  const [book] = await db
    .select()
    .from(favoriBooksTable)
    .where(
      and(
        eq(favoriBooksTable.id, body.data.bookId),
        eq(favoriBooksTable.authorId, userId),
      ),
    )
    .limit(1);
  if (!book || book.status !== "published") {
    res.status(404).json({ error: "Tanıtım için profilindeki yayımlanmış bir kitabı seç." });
    return;
  }
  const [ad] = await db
    .insert(favoriBookAdsTable)
    .values({
      id: newId("book-ad"),
      userId,
      bookId: book.id,
      budget: Math.round(body.data.budget),
      status: "pending",
    })
    .returning();
  res.status(201).json(
    CreateBookAdResponse.parse({
      id: ad.id,
      bookId: ad.bookId,
      budget: ad.budget,
      status: ad.status,
    }),
  );
});

export default router;
