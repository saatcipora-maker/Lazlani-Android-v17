import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { OAuth2Client } from "google-auth-library";
import app from "../app.ts";
import {
  authSessionsTable,
  authUsersTable,
  db,
  passwordCredentialsTable,
  passwordResetTokensTable,
} from "@workspace/db";
import {
  createPasswordHash,
  hashResetCode,
  PASSWORD_RESET_MAX_ATTEMPTS,
} from "../lib/password-reset.ts";

const marker = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `auth-test-${marker}@example.com`;
const username = `auth_test_${marker.replace(/[^a-zA-Z0-9_]/g, "_").slice(-16)}`;
const originalPassword = "OriginalPass!16";
const replacementPassword = "ReplacementPass!16";
const legacyEmail = `legacy-${marker}@example.com`;
const attemptLimitEmail = `attempt-limit-${marker}@example.com`;
const expiredEmail = `expired-${marker}@example.com`;
const supersededResetEmail = `superseded-reset-${marker}@example.com`;
const resetSessionEmail = `reset-session-${marker}@example.com`;
const resetSessionUsername = `reset_session_${marker.replace(/[^a-zA-Z0-9_]/g, "_").slice(-16)}`;
const googleEmail = `google-${marker}@example.com`;
const unmatchedGoogleEmail = `google-unmatched-${marker}@example.com`;
const sessionsEmail = `sessions-${marker}@example.com`;
const sessionsUsername = `sessions_${marker.replace(/[^a-zA-Z0-9_]/g, "_").slice(-16)}`;
const otherSessionsEmail = `other-sessions-${marker}@example.com`;
const otherSessionsUsername = `other_sessions_${marker.replace(/[^a-zA-Z0-9_]/g, "_").slice(-14)}`;
const roleAdminEmail = `role-admin-${marker}@example.com`;
const roleTargetEmail = `role-target-${marker}@example.com`;
const roleRegularEmail = `role-regular-${marker}@example.com`;
const resetTestEmails = [legacyEmail, attemptLimitEmail, expiredEmail, supersededResetEmail, resetSessionEmail, googleEmail, unmatchedGoogleEmail, sessionsEmail, otherSessionsEmail, roleAdminEmail, roleTargetEmail, roleRegularEmail];
const originalGoogleVerifier = OAuth2Client.prototype.verifyIdToken;
let baseUrl = "";
let server;

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
}

before(async () => {
  server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}/api`;
});

after(async () => {
  OAuth2Client.prototype.verifyIdToken = originalGoogleVerifier;
  const [user] = await db.select({ id: authUsersTable.id }).from(authUsersTable)
    .where(eq(authUsersTable.email, email)).limit(1);
  if (user) await db.delete(authSessionsTable).where(eq(authSessionsTable.userId, user.id));
  await db.delete(passwordCredentialsTable).where(eq(passwordCredentialsTable.email, email));
  await db.delete(authUsersTable).where(eq(authUsersTable.email, email));
  for (const resetEmail of resetTestEmails) {
    await db.delete(passwordResetTokensTable).where(eq(passwordResetTokensTable.email, resetEmail));
    const [resetUser] = await db.select({ id: authUsersTable.id }).from(authUsersTable)
      .where(eq(authUsersTable.email, resetEmail)).limit(1);
    if (resetUser) await db.delete(authSessionsTable).where(eq(authSessionsTable.userId, resetUser.id));
    await db.delete(passwordCredentialsTable).where(eq(passwordCredentialsTable.email, resetEmail));
    await db.delete(authUsersTable).where(eq(authUsersTable.email, resetEmail));
  }
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});

test("registration, profile, password, and session lifecycle stays server-authoritative", async () => {
  const registration = await request("/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, displayName: "Auth Test", email, password: originalPassword }),
  });
  assert.equal(registration.response.status, 201);
  const firstToken = registration.body.token;
  assert.ok(firstToken);

  const restored = await request("/auth/session", {
    headers: { authorization: `Bearer ${firstToken}` },
  });
  assert.equal(restored.response.status, 200);
  assert.equal(restored.body.user.email, email);

  const updated = await request("/auth/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: `Bearer ${firstToken}` },
    body: JSON.stringify({ displayName: "Updated Auth Test", bio: "Server profile" }),
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.user.displayName, "Updated Auth Test");

  const changed = await request("/auth/password", {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: `Bearer ${firstToken}` },
    body: JSON.stringify({ currentPassword: originalPassword, newPassword: replacementPassword }),
  });
  assert.equal(changed.response.status, 200);
  const replacementToken = changed.body.token;
  assert.ok(replacementToken);

  const revoked = await request("/auth/session", {
    headers: { authorization: `Bearer ${firstToken}` },
  });
  assert.equal(revoked.response.status, 401);

  const oldPassword = await request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: originalPassword }),
  });
  assert.equal(oldPassword.response.status, 401);

  const newPassword = await request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: replacementPassword }),
  });
  assert.equal(newPassword.response.status, 200);

  const logout = await request("/auth/session", {
    method: "DELETE",
    headers: { authorization: `Bearer ${replacementToken}` },
  });
  assert.equal(logout.response.status, 204);
  const loggedOut = await request("/auth/session", {
    headers: { authorization: `Bearer ${replacementToken}` },
  });
  assert.equal(loggedOut.response.status, 401);
});

test("session management lists active sessions, isolates ownership, and revokes safely", async () => {
  const password = "SessionsPass!16";
  const registration = await request("/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "TestBrowser/Register" },
    body: JSON.stringify({
      username: sessionsUsername,
      displayName: "Session Test",
      email: sessionsEmail,
      password,
    }),
  });
  assert.equal(registration.response.status, 201);
  const firstToken = registration.body.token;

  const secondLogin = await request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "TestBrowser/Login" },
    body: JSON.stringify({ email: sessionsEmail, password }),
  });
  assert.equal(secondLogin.response.status, 200);
  const secondToken = secondLogin.body.token;

  const initial = await request("/auth/sessions", {
    headers: { authorization: `Bearer ${firstToken}` },
  });
  assert.equal(initial.response.status, 200);
  assert.equal(initial.body.sessions.length, 2);
  assert.equal(initial.body.sessions.filter(session => session.isCurrent).length, 1);
  const current = initial.body.sessions.find(session => session.isCurrent);
  const other = initial.body.sessions.find(session => !session.isCurrent);
  assert.equal(current.userAgent, "TestBrowser/Register");
  assert.equal(other.userAgent, "TestBrowser/Login");
  assert.notEqual(current.id, other.id);
  assert.equal(JSON.stringify(initial.body).includes("tokenHash"), false);

  const otherUser = await request("/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: otherSessionsUsername,
      displayName: "Other Session Test",
      email: otherSessionsEmail,
      password,
    }),
  });
  assert.equal(otherUser.response.status, 201);
  const crossUserRevoke = await request(`/auth/sessions/${other.id}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${otherUser.body.token}` },
  });
  assert.equal(crossUserRevoke.response.status, 404);

  const selected = await request(`/auth/sessions/${other.id}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${firstToken}` },
  });
  assert.equal(selected.response.status, 200);
  assert.equal(selected.body.currentRevoked, false);
  const secondRevoked = await request("/auth/session", {
    headers: { authorization: `Bearer ${secondToken}` },
  });
  assert.equal(secondRevoked.response.status, 401);

  const thirdLogin = await request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "TestBrowser/Third" },
    body: JSON.stringify({ email: sessionsEmail, password }),
  });
  assert.equal(thirdLogin.response.status, 200);
  const beforeOthers = await request("/auth/sessions", {
    headers: { authorization: `Bearer ${firstToken}` },
  });
  assert.equal(beforeOthers.body.sessions.length, 2);
  const revokeOthers = await request("/auth/sessions/others", {
    method: "DELETE",
    headers: { authorization: `Bearer ${firstToken}` },
  });
  assert.equal(revokeOthers.response.status, 200);
  assert.equal(revokeOthers.body.revokedCount, 1);
  const thirdRevoked = await request("/auth/session", {
    headers: { authorization: `Bearer ${thirdLogin.body.token}` },
  });
  assert.equal(thirdRevoked.response.status, 401);
  const preserved = await request("/auth/sessions", {
    headers: { authorization: `Bearer ${firstToken}` },
  });
  assert.equal(preserved.response.status, 200);
  assert.equal(preserved.body.sessions.length, 1);
  assert.equal(preserved.body.sessions[0].isCurrent, true);

  const [owner] = await db.select({
    id: authUsersTable.id,
  }).from(authUsersTable).where(eq(authUsersTable.email, sessionsEmail)).limit(1);
  const [credential] = await db.select({
    updatedAt: passwordCredentialsTable.updatedAt,
  }).from(passwordCredentialsTable).where(eq(passwordCredentialsTable.email, sessionsEmail)).limit(1);
  await db.insert(authSessionsTable).values([
    {
      id: randomUUID(),
      tokenHash: `expired-${marker}`,
      userId: owner.id,
      credentialUpdatedAt: credential.updatedAt,
      expiresAt: new Date(Date.now() - 1_000),
      userAgent: "Expired",
    },
    {
      id: randomUUID(),
      tokenHash: `credential-invalid-${marker}`,
      userId: owner.id,
      credentialUpdatedAt: new Date(credential.updatedAt.getTime() - 1_000),
      expiresAt: new Date(Date.now() + 60_000),
      userAgent: "Invalid",
    },
  ]);
  const filtered = await request("/auth/sessions", {
    headers: { authorization: `Bearer ${firstToken}` },
  });
  assert.equal(filtered.response.status, 200);
  assert.equal(filtered.body.sessions.length, 1);

  const currentId = filtered.body.sessions[0].id;
  const revokeCurrent = await request(`/auth/sessions/${currentId}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${firstToken}` },
  });
  assert.equal(revokeCurrent.response.status, 200);
  assert.equal(revokeCurrent.body.currentRevoked, true);
  const currentRevoked = await request("/auth/session", {
    headers: { authorization: `Bearer ${firstToken}` },
  });
  assert.equal(currentRevoked.response.status, 401);
});

test("concurrent confirmations consume a reset code exactly once and keep the winning password", async () => {
  const code = "246810";
  const originalPassword = "ForgottenLegacyPass!16";
  const candidatePasswords = ["ConcurrentResetA!16", "ConcurrentResetB!16"];
  await db.insert(passwordCredentialsTable).values({
    email: legacyEmail,
    passwordHash: await createPasswordHash(originalPassword),
  });
  await db.insert(passwordResetTokensTable).values({
    email: legacyEmail,
    codeHash: hashResetCode(legacyEmail, code),
    expiresAt: new Date(Date.now() + 60_000),
  });

  const confirmations = await Promise.all(candidatePasswords.map(newPassword =>
    request("/auth/password-reset/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: legacyEmail, code, newPassword }),
    })
  ));
  assert.deepEqual(
    confirmations.map(result => result.response.status).sort(),
    [200, 401],
  );
  const winnerIndex = confirmations.findIndex(result => result.response.status === 200);
  const winningPassword = candidatePasswords[winnerIndex];
  const losingPassword = candidatePasswords[1 - winnerIndex];
  assert.match(confirmations[1 - winnerIndex].body.error, /kullanılmış/);

  const [winnerLogin, loserLogin, originalLogin] = await Promise.all(
    [winningPassword, losingPassword, originalPassword].map(password =>
      request("/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: legacyEmail, password }),
      })
    ),
  );
  assert.equal(winnerLogin.response.status, 200);
  assert.equal(winnerLogin.body.user.email, legacyEmail);
  assert.equal(loserLogin.response.status, 401);
  assert.equal(originalLogin.response.status, 401);
});

test("equal-timestamp reset codes deterministically prefer the later database record", async () => {
  const originalPassword = "SupersededOriginal!16";
  const rejectedPassword = "SupersededRejected!16";
  const replacementPassword = "SupersededNewest!16";
  const olderCode = "314159";
  const newerCode = "271828";
  const now = Date.now();

  await db.insert(passwordCredentialsTable).values({
    email: supersededResetEmail,
    passwordHash: await createPasswordHash(originalPassword),
  });
  await db.insert(passwordResetTokensTable).values([
    {
      email: supersededResetEmail,
      codeHash: hashResetCode(supersededResetEmail, olderCode),
      expiresAt: new Date(now + 60_000),
      createdAt: new Date(now),
    },
    {
      email: supersededResetEmail,
      codeHash: hashResetCode(supersededResetEmail, newerCode),
      expiresAt: new Date(now + 60_000),
      createdAt: new Date(now),
    },
  ]);

  const superseded = await request("/auth/password-reset/confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: supersededResetEmail,
      code: olderCode,
      newPassword: rejectedPassword,
    }),
  });
  assert.equal(superseded.response.status, 401);

  const [originalLogin, rejectedLogin] = await Promise.all(
    [originalPassword, rejectedPassword].map(password =>
      request("/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: supersededResetEmail, password }),
      })
    ),
  );
  assert.equal(originalLogin.response.status, 200);
  assert.equal(rejectedLogin.response.status, 401);

  const newest = await request("/auth/password-reset/confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: supersededResetEmail,
      code: newerCode,
      newPassword: replacementPassword,
    }),
  });
  assert.equal(newest.response.status, 200);

  const replacementLogin = await request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: supersededResetEmail, password: replacementPassword }),
  });
  assert.equal(replacementLogin.response.status, 200);

  const supersededAfterNewestWasUsed = await request("/auth/password-reset/confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: supersededResetEmail,
      code: olderCode,
      newPassword: rejectedPassword,
    }),
  });
  assert.equal(supersededAfterNewestWasUsed.response.status, 401);

  const [preservedReplacementLogin, stillRejectedLogin] = await Promise.all(
    [replacementPassword, rejectedPassword].map(password =>
      request("/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: supersededResetEmail, password }),
      })
    ),
  );
  assert.equal(preservedReplacementLogin.response.status, 200);
  assert.equal(stillRejectedLogin.response.status, 401);
});

test("password reset invalidates an existing session and permits a new session with the new password", async () => {
  const code = "975310";
  const resetPassword = "ResetSessionPass!26";
  const registration = await request("/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: resetSessionUsername,
      displayName: "Reset Session Test",
      email: resetSessionEmail,
      password: "BeforeResetPass!26",
    }),
  });
  assert.equal(registration.response.status, 201);
  const oldToken = registration.body.token;
  assert.ok(oldToken);

  await db.insert(passwordResetTokensTable).values({
    email: resetSessionEmail,
    codeHash: hashResetCode(resetSessionEmail, code),
    expiresAt: new Date(Date.now() + 60_000),
  });

  const reset = await request("/auth/password-reset/confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: resetSessionEmail,
      code,
      newPassword: resetPassword,
    }),
  });
  assert.equal(reset.response.status, 200);

  const oldSession = await request("/auth/session", {
    headers: { authorization: `Bearer ${oldToken}` },
  });
  assert.equal(oldSession.response.status, 401);

  const login = await request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: resetSessionEmail, password: resetPassword }),
  });
  assert.equal(login.response.status, 200);
  assert.ok(login.body.token);

  const newSession = await request("/auth/session", {
    headers: { authorization: `Bearer ${login.body.token}` },
  });
  assert.equal(newSession.response.status, 200);
  assert.equal(newSession.body.user.email, resetSessionEmail);
});

test("parallel wrong reset codes atomically stop at the maximum attempt count", async () => {
  const code = "135790";
  await db.insert(passwordResetTokensTable).values({
    email: attemptLimitEmail,
    codeHash: hashResetCode(attemptLimitEmail, code),
    expiresAt: new Date(Date.now() + 60_000),
  });

  const parallelAttemptCount = PASSWORD_RESET_MAX_ATTEMPTS * 4;
  const attempts = await Promise.all(
    Array.from({ length: parallelAttemptCount }, () => request("/auth/password-reset/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: attemptLimitEmail,
        code: "000000",
        newPassword: "AttemptLimitPass!16",
      }),
    })),
  );
  const statuses = attempts.map(({ response }) => response.status);
  assert.equal(
    statuses.filter(status => status === 401).length,
    PASSWORD_RESET_MAX_ATTEMPTS,
  );
  assert.equal(
    statuses.filter(status => status === 429).length,
    parallelAttemptCount - PASSWORD_RESET_MAX_ATTEMPTS,
  );
  assert.ok(statuses.every(status => status === 401 || status === 429));

  const [storedToken] = await db
    .select({ failedAttempts: passwordResetTokensTable.failedAttempts })
    .from(passwordResetTokensTable)
    .where(eq(passwordResetTokensTable.email, attemptLimitEmail))
    .limit(1);
  assert.equal(storedToken.failedAttempts, PASSWORD_RESET_MAX_ATTEMPTS);

  const blockedCorrectCode = await request("/auth/password-reset/confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: attemptLimitEmail,
      code,
      newPassword: "AttemptLimitPass!16",
    }),
  });
  assert.equal(blockedCorrectCode.response.status, 429);
});

test("an expired reset code is rejected", async () => {
  const code = "112233";
  await db.insert(passwordResetTokensTable).values({
    email: expiredEmail,
    codeHash: hashResetCode(expiredEmail, code),
    expiresAt: new Date(Date.now() - 1_000),
  });

  const expired = await request("/auth/password-reset/confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: expiredEmail,
      code,
      newPassword: "ExpiredResetPass!16",
    }),
  });
  assert.equal(expired.response.status, 401);
});

test("Google login rejects unsafe tokens and never creates an unmatched account", async () => {
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = "expected-web-client.apps.googleusercontent.com";
  OAuth2Client.prototype.verifyIdToken = async ({ idToken, audience }) => {
    assert.ok(audience.includes("expected-web-client.apps.googleusercontent.com"));
    if (idToken.startsWith("wrong-audience")
      || idToken.startsWith("broken-token")
      || idToken.startsWith("network-error")) {
      throw new Error(idToken);
    }
    return {
      getPayload: () => ({
        sub: "google-sub-unmatched",
        email: unmatchedGoogleEmail,
        email_verified: true,
      }),
    };
  };

  for (const idToken of [
    "wrong-audience-token-with-realistic-length",
    "broken-token-with-realistic-length",
    "network-error-token-with-realistic-length",
  ]) {
    const rejected = await request("/auth/google", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    assert.equal(rejected.response.status, 401);
  }

  const unmatched = await request("/auth/google", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken: "valid-unmatched-token-with-realistic-length" }),
  });
  assert.equal(unmatched.response.status, 404);
  assert.match(unmatched.body.error, /eşleşen mevcut bir LAZLANI hesabı yok/);

  const [unexpectedUser] = await db.select({ id: authUsersTable.id }).from(authUsersTable)
    .where(eq(authUsersTable.email, unmatchedGoogleEmail)).limit(1);
  assert.equal(unexpectedUser, undefined);
});

test("Google login returns the existing LAZLANI profile instead of creating a second user", async () => {
  const registration = await request("/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: `google_${marker.replace(/[^a-zA-Z0-9_]/g, "_").slice(-16)}`,
      displayName: "Google Existing User",
      email: googleEmail,
      password: "GoogleExistingPass!19",
    }),
  });
  assert.equal(registration.response.status, 201);

  OAuth2Client.prototype.verifyIdToken = async () => ({
    getPayload: () => ({
      sub: "google-sub-existing",
      email: googleEmail,
      email_verified: true,
    }),
  });
  const googleLogin = await request("/auth/google", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken: "valid-existing-token-with-realistic-length" }),
  });

  assert.equal(googleLogin.response.status, 200);
  assert.equal(googleLogin.body.user.id, registration.body.user.id);
  assert.equal(googleLogin.body.user.email, googleEmail);
  assert.ok(googleLogin.body.token);
});

test("superadmin role changes are server-authoritative for existing sessions", async () => {
  const password = "RoleTestPass!26";
  const register = async (email, username, displayName) => {
    const userId = randomUUID();
    const now = new Date();
    await db.transaction(async tx => {
      await tx.insert(authUsersTable).values({
        id: userId,
        email,
        username: username.slice(0, 30),
        displayName,
        joinedAt: now.toISOString().slice(0, 10),
      });
      await tx.insert(passwordCredentialsTable).values({
        email,
        passwordHash: await createPasswordHash(password),
        updatedAt: now,
      });
    });
    const result = await request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(result.response.status, 200);
    return result.body;
  };
  const actor = await register(roleAdminEmail, `role_admin_${marker}`, "Role Admin");
  const target = await register(roleTargetEmail, `role_target_${marker}`, "Role Target");
  const regular = await register(roleRegularEmail, `role_regular_${marker}`, "Role Regular");
  for (const account of [actor, target, regular]) {
    const session = await request("/auth/session", {
      headers: { authorization: `Bearer ${account.token}` },
    });
    assert.equal(session.response.status, 200, `role test login did not create a valid session: ${JSON.stringify(session.body)}`);
  }

  await db.update(authUsersTable)
    .set({ isAdmin: true, isSuperAdmin: true })
    .where(eq(authUsersTable.email, roleAdminEmail));

  const beforePromotion = await request("/admin/premium-requests", {
    headers: { authorization: `Bearer ${target.token}` },
  });
  assert.equal(beforePromotion.response.status, 403, `target pre-promotion status: ${JSON.stringify(beforePromotion.body)}`);

  const listed = await request("/admin/users", {
    headers: { authorization: `Bearer ${actor.token}` },
  });
  assert.equal(listed.response.status, 200);
  assert.ok(listed.body.users.some(user => user.email === roleTargetEmail));

  const promoted = await request(`/admin/users/${target.user.id}/role`, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: `Bearer ${actor.token}` },
    body: JSON.stringify({ role: "admin" }),
  });
  assert.equal(promoted.response.status, 200);
  const existingSessionPromoted = await request("/admin/premium-requests", {
    headers: { authorization: `Bearer ${target.token}` },
  });
  assert.equal(existingSessionPromoted.response.status, 200);

  const nonSuperadmin = await request(`/admin/users/${target.user.id}/role`, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: `Bearer ${regular.token}` },
    body: JSON.stringify({ role: "admin" }),
  });
  assert.equal(nonSuperadmin.response.status, 403, `regular role mutation status: ${JSON.stringify(nonSuperadmin.body)}`);

  const escalation = await request(`/admin/users/${regular.user.id}/role`, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: `Bearer ${actor.token}` },
    body: JSON.stringify({ role: "superadmin" }),
  });
  assert.equal(escalation.response.status, 400);

  const demoted = await request(`/admin/users/${target.user.id}/role`, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: `Bearer ${actor.token}` },
    body: JSON.stringify({ role: "user" }),
  });
  assert.equal(demoted.response.status, 200);
  const existingSessionDemoted = await request("/admin/premium-requests", {
    headers: { authorization: `Bearer ${target.token}` },
  });
  assert.equal(existingSessionDemoted.response.status, 403, `target post-demotion status: ${JSON.stringify(existingSessionDemoted.body)}`);
});