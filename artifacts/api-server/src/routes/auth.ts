import { randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, gt, gte, isNull, ne, or } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import {
  AuthGoogleBody,
  AuthGoogleResponse,
  AuthChangePasswordBody,
  AuthChangePasswordResponse,
  AuthLoginBody,
  AuthLoginResponse,
  ListAuthSessionsResponse,
  RevokeAuthSessionResponse,
  RevokeOtherAuthSessionsResponse,
  AuthLogoutResponse,
  AuthRegisterBody,
  AuthRegisterResponse,
  AuthSessionResponse,
  AuthUpdateProfileBody,
  AuthUpdateProfileResponse,
  ConfirmPasswordResetBody,
  ConfirmPasswordResetResponse,
  RequestPasswordResetBody,
  RequestPasswordResetResponse,
} from "@workspace/api-zod";
import { OAuth2Client } from "google-auth-library";
import {
  authSessionsTable,
  authUsersTable,
  db,
  passwordCredentialsTable,
  passwordResetTokensTable,
  type AuthUser,
} from "@workspace/db";
import {
  createPasswordHash,
  createResetCode,
  getResetExpiry,
  hashResetCode,
  hashesMatch,
  normalizeEmail,
  PASSWORD_RESET_CODE_TTL_SECONDS,
  PASSWORD_RESET_MAX_ATTEMPTS,
  verifyPasswordHash,
} from "../lib/password-reset";
import { EmailDeliveryError, sendPasswordResetEmail } from "../lib/email";
import { consumeRateLimit, pruneRateLimitEntries } from "../lib/rate-limit";
import { consumeFailedResetAttempt } from "../lib/password-reset-store";
import { authenticatedSession, bearerToken, hashSessionToken } from "../lib/auth";

const router: IRouter = Router();
const REQUEST_WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 3;
const IP_REQUEST_WINDOW_MS = 15 * 60 * 1000;
const MAX_IP_REQUESTS_PER_WINDOW = 10;
const MAX_IP_CONFIRMATIONS_PER_WINDOW = 30;
const MAX_GOOGLE_ATTEMPTS_PER_WINDOW = 20;
const MAX_LOGIN_IP_ATTEMPTS_PER_WINDOW = 30;
const MAX_LOGIN_ACCOUNT_ATTEMPTS_PER_WINDOW = 10;
const MAX_REGISTRATIONS_PER_WINDOW = 5;
const googleClient = new OAuth2Client();
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
let demoAccountsInitialization: Promise<void> | null = null;

const DEMO_ACCOUNTS = [
  { id: "u1", username: "ayse_kalem", displayName: "Ayşe Kalem", email: "ayse@example.com", bio: "Kelimelerle büyüyen, satırlarla nefes alan bir yazar...", avatarColor: "#9B59F5", coverColor: "#4C1D95", joinedAt: "2023-01-15", isPremium: true, isAdmin: false, isSuperAdmin: false },
  { id: "u2", username: "mehmet_derin", displayName: "Mehmet Derin", email: "mehmet@example.com", bio: "Felsefe ve edebiyatın kesiştiği yerde yaşıyorum.", avatarColor: "#EC4899", coverColor: "#831843", joinedAt: "2023-03-20", isPremium: false, isAdmin: false, isSuperAdmin: false },
  { id: "u3", username: "elif_yazan", displayName: "Elif Yazan", email: "elif@example.com", bio: "Anadolu kültürünü modern edebiyatla buluşturuyorum.", avatarColor: "#F59E0B", coverColor: "#78350F", joinedAt: "2022-09-05", isPremium: true, isAdmin: false, isSuperAdmin: false },
  { id: "u4", username: "burak_siir", displayName: "Burak Şair", email: "burak@example.com", bio: "Şiir benim için bir dua, kelimeler ise nefes.", avatarColor: "#22C55E", coverColor: "#14532D", joinedAt: "2023-06-10", isPremium: false, isAdmin: false, isSuperAdmin: false },
  { id: "u5", username: "zeynep_masalci", displayName: "Zeynep Masalcı", email: "zeynep@example.com", bio: "Masallar gerçekleşebilir — kalemim tanık.", avatarColor: "#3B82F6", coverColor: "#1E3A5F", joinedAt: "2022-12-01", isPremium: true, isAdmin: false, isSuperAdmin: false },
] as const;

function publicUser(user: AuthUser) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    bio: user.bio,
    avatarColor: user.avatarColor,
    coverColor: user.coverColor,
    avatarUrl: user.avatarUrl ?? undefined,
    coverUrl: user.coverUrl ?? undefined,
    theme: user.theme ?? undefined,
    followersCount: 0,
    followingCount: 0,
    likesReceivedCount: 0,
    booksCount: 0,
    storiesCount: 0,
    poemsCount: 0,
    isPremium: user.isPremium,
    isAdmin: user.isAdmin,
    isSuperAdmin: user.isSuperAdmin,
    joinedAt: user.joinedAt,
  };
}
function requestUserAgent(req: Request): string | undefined {
  const value = req.get("user-agent")?.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return value ? value.slice(0, 512) : undefined;
}

function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  if (/ipad/i.test(userAgent)) return "iPad";
  if (/iphone/i.test(userAgent)) return "iPhone";
  if (/android/i.test(userAgent)) return /mobile/i.test(userAgent) ? "Android phone" : "Android";
  if (/windows/i.test(userAgent)) return "Windows";
  if (/macintosh|mac os/i.test(userAgent)) return "Mac";
  if (/linux/i.test(userAgent)) return "Linux";
  return "Unknown device";
}

async function createSession(
  userId: string,
  credentialUpdatedAt: Date,
  userAgent?: string,
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.insert(authSessionsTable).values({
    tokenHash: hashSessionToken(token),
    id: randomUUID(),
    userId,
    credentialUpdatedAt,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    userAgent,
  });
  return token;
}
async function ensureDemoAccounts(): Promise<void> {
  if (process.env.NODE_ENV !== "development" || process.env.ENABLE_DEMO_ACCOUNTS !== "true") return;
  demoAccountsInitialization ??= (async () => {
    for (const demo of DEMO_ACCOUNTS) {
      await db.insert(authUsersTable).values({
        id: demo.id,
        username: demo.username,
        displayName: demo.displayName,
        email: demo.email,
        bio: demo.bio,
        avatarColor: demo.avatarColor,
        coverColor: demo.coverColor,
        joinedAt: demo.joinedAt,
        isPremium: demo.isPremium,
        isAdmin: demo.isAdmin,
        isSuperAdmin: demo.isSuperAdmin,
      }).onConflictDoUpdate({
        target: authUsersTable.id,
        set: {
          isPremium: demo.isPremium,
          isAdmin: demo.isAdmin,
          isSuperAdmin: demo.isSuperAdmin,
          updatedAt: new Date(),
        },
      });
      // Demo profiles are public fixtures, never password-backed accounts.
      // Remove any credentials/sessions left by older development seeds.
      await db.delete(authSessionsTable).where(eq(authSessionsTable.userId, demo.id));
      await db.delete(passwordCredentialsTable).where(eq(passwordCredentialsTable.email, demo.email));
    }
  })().catch(error => {
    demoAccountsInitialization = null;
    throw error;
  });
  await demoAccountsInitialization;
}

async function ensureUserForCredential(email: string): Promise<AuthUser> {
  const [existing] = await db.select().from(authUsersTable)
    .where(eq(authUsersTable.email, email)).limit(1);
  if (existing) return existing;

  const localPart = email.split("@")[0]?.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 20) || "user";
  const [created] = await db.insert(authUsersTable).values({
    id: randomUUID(),
    email,
    username: `${localPart}_${randomBytes(4).toString("hex")}`,
    displayName: localPart,
    joinedAt: new Date().toISOString().slice(0, 10),
  }).returning();
  return created;
}

function requestIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

router.post("/auth/password-reset/request", async (req, res): Promise<void> => {
  pruneRateLimitEntries();
  if (!consumeRateLimit(`reset-request:${requestIp(req)}`, MAX_IP_REQUESTS_PER_WINDOW, IP_REQUEST_WINDOW_MS)) {
    res.status(429).json({ error: "Çok fazla istek yapıldı. Lütfen biraz sonra tekrar deneyin." });
    return;
  }

  const parsed = RequestPasswordResetBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid password reset request");
    res.status(400).json({ error: "Geçerli bir e-posta adresi girin." });
    return;
  }

  const email = normalizeEmail(parsed.data.email);
  await ensureDemoAccounts();
  const [credential] = await db.select({ email: passwordCredentialsTable.email })
    .from(passwordCredentialsTable).where(eq(passwordCredentialsTable.email, email)).limit(1);
  if (!credential) {
    res.status(202).json(RequestPasswordResetResponse.parse({
      message: "Hesap mevcutsa şifre yenileme kodu e-posta adresinize gönderilecektir.",
      expiresInSeconds: PASSWORD_RESET_CODE_TTL_SECONDS,
    }));
    return;
  }
  const requestCutoff = new Date(Date.now() - REQUEST_WINDOW_MS);
  const recentRequests = await db
    .select({ id: passwordResetTokensTable.id })
    .from(passwordResetTokensTable)
    .where(and(eq(passwordResetTokensTable.email, email), gte(passwordResetTokensTable.createdAt, requestCutoff)));

  if (recentRequests.length >= MAX_REQUESTS_PER_WINDOW) {
    res.status(429).json({ error: "Çok fazla deneme yapıldı. Lütfen 15 dakika sonra tekrar deneyin." });
    return;
  }

  const code = createResetCode();
  const expiresAt = getResetExpiry();
  try {
    await sendPasswordResetEmail(email, code, PASSWORD_RESET_CODE_TTL_SECONDS / 60);
  } catch (error) {
    if (error instanceof EmailDeliveryError) {
      req.log.error({ reason: error.message }, "Password reset email was not delivered");
      res.status(202).json(RequestPasswordResetResponse.parse({
        message: "Hesap mevcutsa şifre yenileme kodu e-posta adresinize gönderilecektir.",
        expiresInSeconds: PASSWORD_RESET_CODE_TTL_SECONDS,
      }));
      return;
    }
    throw error;
  }

  await db.insert(passwordResetTokensTable).values({
    email,
    codeHash: hashResetCode(email, code),
    expiresAt,
  });

  res.status(202).json(
    RequestPasswordResetResponse.parse({
      message: "Hesap mevcutsa şifre yenileme kodu e-posta adresinize gönderilecektir.",
      expiresInSeconds: PASSWORD_RESET_CODE_TTL_SECONDS,
    }),
  );
});

router.post("/auth/password-reset/confirm", async (req, res): Promise<void> => {
  pruneRateLimitEntries();
  if (!consumeRateLimit(`reset-confirm:${requestIp(req)}`, MAX_IP_CONFIRMATIONS_PER_WINDOW, IP_REQUEST_WINDOW_MS)) {
    res.status(429).json({ error: "Çok fazla doğrulama denemesi yapıldı. Lütfen biraz sonra tekrar deneyin." });
    return;
  }

  const parsed = ConfirmPasswordResetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "E-posta, 6 haneli kod ve en az 8 karakterli yeni şifre gerekli." });
    return;
  }

  const email = normalizeEmail(parsed.data.email);
  const now = new Date();
  const [token] = await db
    .select()
    .from(passwordResetTokensTable)
    .where(eq(passwordResetTokensTable.email, email))
    .orderBy(
      desc(passwordResetTokensTable.createdAt),
      desc(passwordResetTokensTable.id),
    )
    .limit(1);

  if (!token || token.usedAt || token.expiresAt <= now) {
    res.status(401).json({ error: "Kod geçersiz, süresi dolmuş veya daha önce kullanılmış." });
    return;
  }

  if (token.failedAttempts >= PASSWORD_RESET_MAX_ATTEMPTS) {
    res.status(429).json({ error: "Çok fazla hatalı kod denemesi yapıldı. Yeni kod isteyin." });
    return;
  }

  const submittedHash = hashResetCode(email, parsed.data.code);
  if (!hashesMatch(submittedHash, token.codeHash)) {
    const failedAttempts = await consumeFailedResetAttempt(token.id);
    if (failedAttempts === null) {
      res.status(429).json({ error: "Çok fazla hatalı kod denemesi yapıldı. Yeni kod isteyin." });
      return;
    }
    res.status(401).json({ error: "Kod geçersiz. Lütfen e-postadaki 6 haneli kodu kontrol edin." });
    return;
  }

  const passwordHash = await createPasswordHash(parsed.data.newPassword);
  const resetCompleted = await db.transaction(async tx => {
    const [consumedToken] = await tx
      .update(passwordResetTokensTable)
      .set({ usedAt: now })
      .where(and(eq(passwordResetTokensTable.id, token.id), isNull(passwordResetTokensTable.usedAt)))
      .returning({ id: passwordResetTokensTable.id });
    if (!consumedToken) return false;

    await tx
      .insert(passwordCredentialsTable)
      .values({ email, passwordHash, updatedAt: now })
      .onConflictDoUpdate({
        target: passwordCredentialsTable.email,
        set: { passwordHash, updatedAt: now },
      });
    const [account] = await tx.select({ id: authUsersTable.id }).from(authUsersTable)
      .where(eq(authUsersTable.email, email)).limit(1);
    if (account) {
      await tx.delete(authSessionsTable).where(eq(authSessionsTable.userId, account.id));
    }
    return true;
  });

  if (!resetCompleted) {
    res.status(401).json({ error: "Kod geçersiz veya daha önce kullanılmış." });
    return;
  }

  res.json(
    ConfirmPasswordResetResponse.parse({
      message: "Şifreniz güvenli biçimde yenilendi. Yeni şifrenizle giriş yapabilirsiniz.",
    }),
  );
});

router.post("/auth/login", async (req, res): Promise<void> => {
  pruneRateLimitEntries();
  if (!consumeRateLimit(`login-ip:${requestIp(req)}`, MAX_LOGIN_IP_ATTEMPTS_PER_WINDOW, IP_REQUEST_WINDOW_MS)) {
    res.status(429).json({ error: "Çok fazla giriş denemesi yapıldı. Lütfen biraz sonra tekrar deneyin." });
    return;
  }
  const parsed = AuthLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "E-posta ve şifre gerekli." });
    return;
  }

  const email = normalizeEmail(parsed.data.email);
  if (!consumeRateLimit(`login-account:${hashSessionToken(email)}`, MAX_LOGIN_ACCOUNT_ATTEMPTS_PER_WINDOW, IP_REQUEST_WINDOW_MS)) {
    res.status(429).json({ error: "Çok fazla giriş denemesi yapıldı. Lütfen biraz sonra tekrar deneyin." });
    return;
  }
  await ensureDemoAccounts();
  const [credential] = await db
    .select()
    .from(passwordCredentialsTable)
    .where(eq(passwordCredentialsTable.email, email))
    .limit(1);

  if (!credential || !await verifyPasswordHash(parsed.data.password, credential.passwordHash)) {
    res.status(401).json({ error: "E-posta veya şifre hatalı." });
    return;
  }

  const user = await ensureUserForCredential(email);
  const token = await createSession(user.id, credential.updatedAt, requestUserAgent(req));
  res.json(AuthLoginResponse.parse({ token, user: publicUser(user) }));
});

router.post("/auth/register", async (req, res): Promise<void> => {
  pruneRateLimitEntries();
  if (!consumeRateLimit(`register:${requestIp(req)}`, MAX_REGISTRATIONS_PER_WINDOW, IP_REQUEST_WINDOW_MS)) {
    res.status(429).json({ error: "Çok fazla kayıt denemesi yapıldı. Lütfen biraz sonra tekrar deneyin." });
    return;
  }
  const parsed = AuthRegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçerli kullanıcı adı, ad, e-posta ve en az 8 karakterli şifre gerekli." });
    return;
  }

  await ensureDemoAccounts();
  const email = normalizeEmail(parsed.data.email);
  const username = parsed.data.username.trim().toLowerCase();
  const [existing] = await db.select({ id: authUsersTable.id }).from(authUsersTable)
    .where(or(eq(authUsersTable.email, email), eq(authUsersTable.username, username))).limit(1);
  const [existingCredential] = await db.select({ email: passwordCredentialsTable.email })
    .from(passwordCredentialsTable).where(eq(passwordCredentialsTable.email, email)).limit(1);
  if (existing || existingCredential) {
    res.status(409).json({ error: "Bu e-posta veya kullanıcı adı zaten kullanılıyor." });
    return;
  }

  const passwordHash = await createPasswordHash(parsed.data.password);
  const result = await db.transaction(async tx => {
    const now = new Date();
    const [user] = await tx.insert(authUsersTable).values({
      id: randomUUID(),
      email,
      username,
      displayName: parsed.data.displayName.trim(),
      joinedAt: now.toISOString().slice(0, 10),
    }).returning();
    await tx.insert(passwordCredentialsTable).values({
      email,
      passwordHash,
      updatedAt: now,
    });
    const token = randomBytes(32).toString("base64url");
    await tx.insert(authSessionsTable).values({
      tokenHash: hashSessionToken(token),
      id: randomUUID(),
      userId: user.id,
      credentialUpdatedAt: now,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      userAgent: requestUserAgent(req),
    });
    return { token, user };
  });
  res.status(201).json(AuthRegisterResponse.parse({
    token: result.token,
    user: publicUser(result.user),
  }));
});

router.get("/auth/session", async (req, res): Promise<void> => {
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Oturum gerekli." });
    return;
  }
  const [row] = await db.select({ user: authUsersTable })
    .from(authSessionsTable)
    .innerJoin(authUsersTable, eq(authSessionsTable.userId, authUsersTable.id))
    .innerJoin(passwordCredentialsTable, eq(authUsersTable.email, passwordCredentialsTable.email))
    .where(and(
      eq(authSessionsTable.tokenHash, hashSessionToken(token)),
      gt(authSessionsTable.expiresAt, new Date()),
      eq(authSessionsTable.credentialUpdatedAt, passwordCredentialsTable.updatedAt),
    ))
    .limit(1);
  if (!row) {
    res.status(401).json({ error: "Oturum geçersiz veya süresi dolmuş." });
    return;
  }
  res.json(AuthSessionResponse.parse({ user: publicUser(row.user) }));
});

router.get("/auth/sessions", async (req, res): Promise<void> => {
  const current = await authenticatedSession(req);
  if (!current) {
    res.status(401).json({ error: "Oturum geçersiz veya süresi dolmuş." });
    return;
  }

  const sessions = await db
    .select({
      id: authSessionsTable.id,
      createdAt: authSessionsTable.createdAt,
      expiresAt: authSessionsTable.expiresAt,
      userAgent: authSessionsTable.userAgent,
    })
    .from(authSessionsTable)
    .innerJoin(authUsersTable, eq(authSessionsTable.userId, authUsersTable.id))
    .innerJoin(passwordCredentialsTable, eq(authUsersTable.email, passwordCredentialsTable.email))
    .where(and(
      eq(authSessionsTable.userId, current.user.id),
      gt(authSessionsTable.expiresAt, new Date()),
      eq(authSessionsTable.credentialUpdatedAt, passwordCredentialsTable.updatedAt),
    ))
    .orderBy(desc(authSessionsTable.createdAt));

  res.json(ListAuthSessionsResponse.parse({
    sessions: sessions.map(session => ({
      id: session.id,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      userAgent: session.userAgent ?? undefined,
      deviceLabel: deviceLabel(session.userAgent),
      isCurrent: session.id === current.id,
    })),
  }));
});

router.delete("/auth/sessions/others", async (req, res): Promise<void> => {
  const current = await authenticatedSession(req);
  if (!current) {
    res.status(401).json({ error: "Oturum geçersiz veya süresi dolmuş." });
    return;
  }

  const revoked = await db.transaction(async tx => tx
    .delete(authSessionsTable)
    .where(and(
      eq(authSessionsTable.userId, current.user.id),
      ne(authSessionsTable.id, current.id),
    ))
    .returning({ id: authSessionsTable.id }));

  res.json(RevokeOtherAuthSessionsResponse.parse({
    revokedCount: revoked.length,
    currentRevoked: false,
  }));
});

router.delete("/auth/sessions/:sessionId", async (req, res): Promise<void> => {
  const current = await authenticatedSession(req);
  if (!current) {
    res.status(401).json({ error: "Oturum geçersiz veya süresi dolmuş." });
    return;
  }

  const revoked = await db.transaction(async tx => {
    const [session] = await tx
      .delete(authSessionsTable)
      .where(and(
        eq(authSessionsTable.id, req.params.sessionId),
        eq(authSessionsTable.userId, current.user.id),
      ))
      .returning({
        tokenHash: authSessionsTable.tokenHash,
      });
    return session;
  });
  if (!revoked) {
    res.status(404).json({ error: "Oturum bulunamadı." });
    return;
  }

  res.json(RevokeAuthSessionResponse.parse({
    revoked: true,
    currentRevoked: revoked.tokenHash === current.tokenHash,
  }));
});

router.delete("/auth/session", async (req, res): Promise<void> => {
  const token = bearerToken(req);
  if (token) {
    await db.delete(authSessionsTable).where(eq(authSessionsTable.tokenHash, hashSessionToken(token)));
  }
  res.status(204).send();
  AuthLogoutResponse.parse(undefined);
});

router.patch("/auth/profile", async (req, res): Promise<void> => {
  const token = bearerToken(req);
  const parsed = AuthUpdateProfileBody.safeParse(req.body);
  if (!token) {
    res.status(401).json({ error: "Oturum gerekli." });
    return;
  }
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "Geçerli profil alanları gerekli." });
    return;
  }
  const [session] = await db.select({ userId: authSessionsTable.userId })
    .from(authSessionsTable)
    .innerJoin(authUsersTable, eq(authSessionsTable.userId, authUsersTable.id))
    .innerJoin(passwordCredentialsTable, eq(authUsersTable.email, passwordCredentialsTable.email))
    .where(and(
      eq(authSessionsTable.tokenHash, hashSessionToken(token)),
      gt(authSessionsTable.expiresAt, new Date()),
      eq(authSessionsTable.credentialUpdatedAt, passwordCredentialsTable.updatedAt),
    )).limit(1);
  if (!session) {
    res.status(401).json({ error: "Oturum geçersiz veya süresi dolmuş." });
    return;
  }
  try {
    const [updated] = await db.update(authUsersTable).set({
      ...parsed.data,
      username: parsed.data.username?.trim().toLowerCase(),
      displayName: parsed.data.displayName?.trim(),
      bio: parsed.data.bio?.trim(),
      updatedAt: new Date(),
    }).where(eq(authUsersTable.id, session.userId)).returning();
    res.json(AuthUpdateProfileResponse.parse({ user: publicUser(updated) }));
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      res.status(409).json({ error: "Bu kullanıcı adı zaten kullanılıyor." });
      return;
    }
    throw error;
  }
});

router.put("/auth/password", async (req, res): Promise<void> => {
  const token = bearerToken(req);
  const parsed = AuthChangePasswordBody.safeParse(req.body);
  if (!token) {
    res.status(401).json({ error: "Oturum gerekli." });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: "Mevcut şifre ve en az 8 karakterli yeni şifre gerekli." });
    return;
  }
  const [account] = await db.select({
    user: authUsersTable,
    passwordHash: passwordCredentialsTable.passwordHash,
  }).from(authSessionsTable)
    .innerJoin(authUsersTable, eq(authSessionsTable.userId, authUsersTable.id))
    .innerJoin(passwordCredentialsTable, eq(authUsersTable.email, passwordCredentialsTable.email))
    .where(and(
      eq(authSessionsTable.tokenHash, hashSessionToken(token)),
      gt(authSessionsTable.expiresAt, new Date()),
      eq(authSessionsTable.credentialUpdatedAt, passwordCredentialsTable.updatedAt),
    )).limit(1);
  if (!account || !await verifyPasswordHash(parsed.data.currentPassword, account.passwordHash)) {
    res.status(401).json({ error: "Mevcut şifre hatalı." });
    return;
  }
  const passwordHash = await createPasswordHash(parsed.data.newPassword);
  const result = await db.transaction(async tx => {
    const now = new Date();
    await tx.update(passwordCredentialsTable).set({ passwordHash, updatedAt: now })
      .where(eq(passwordCredentialsTable.email, account.user.email));
    await tx.delete(authSessionsTable).where(eq(authSessionsTable.userId, account.user.id));
    const replacementToken = randomBytes(32).toString("base64url");
    await tx.insert(authSessionsTable).values({
      tokenHash: hashSessionToken(replacementToken),
      id: randomUUID(),
      userId: account.user.id,
      credentialUpdatedAt: now,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      userAgent: requestUserAgent(req),
    });
    return replacementToken;
  });
  res.json(AuthChangePasswordResponse.parse({ token: result, user: publicUser(account.user) }));
});

router.post("/auth/google", async (req, res): Promise<void> => {
  pruneRateLimitEntries();
  if (!consumeRateLimit(`google-auth:${requestIp(req)}`, MAX_GOOGLE_ATTEMPTS_PER_WINDOW, IP_REQUEST_WINDOW_MS)) {
    res.status(429).json({ error: "Çok fazla Google giriş denemesi yapıldı. Lütfen biraz sonra tekrar deneyin." });
    return;
  }

  const parsed = AuthGoogleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçerli bir Google kimlik doğrulama yanıtı gerekli." });
    return;
  }

  const audiences = [
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  ].filter((value): value is string => Boolean(value?.trim()));

  if (audiences.length === 0) {
    req.log.error("Google OAuth client IDs are not configured");
    res.status(503).json({ error: "Google ile giriş şu anda yapılandırılmamış." });
    return;
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: parsed.data.idToken,
      audience: audiences,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      res.status(401).json({ error: "Google hesabının e-posta adresi doğrulanamadı." });
      return;
    }

    const email = normalizeEmail(payload.email);
    await ensureDemoAccounts();
    const [account] = await db
      .select({ user: authUsersTable, credentialUpdatedAt: passwordCredentialsTable.updatedAt })
      .from(authUsersTable)
      .innerJoin(passwordCredentialsTable, eq(authUsersTable.email, passwordCredentialsTable.email))
      .where(eq(authUsersTable.email, email))
      .limit(1);

    if (!account) {
      res.status(404).json({
        error: "Bu Google e-postasıyla eşleşen mevcut bir LAZLANI hesabı yok. Önce aynı e-postayla kayıt olun.",
      });
      return;
    }

    const token = await createSession(account.user.id, account.credentialUpdatedAt, requestUserAgent(req));
    res.json(AuthGoogleResponse.parse({ token, user: publicUser(account.user) }));
  } catch (error) {
    req.log.warn({ reason: error instanceof Error ? error.message : "unknown" }, "Invalid Google ID token");
    res.status(401).json({ error: "Google oturumu doğrulanamadı. Lütfen tekrar deneyin." });
  }
});

export default router;
