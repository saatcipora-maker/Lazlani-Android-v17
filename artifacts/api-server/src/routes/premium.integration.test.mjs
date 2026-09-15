import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import app from "../app.ts";
import {
  authSessionsTable,
  authUsersTable,
  db,
  passwordCredentialsTable,
  premiumRequestsTable,
} from "@workspace/db";

const marker = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const accounts = [
  {
    email: `premium-user-${marker}@example.com`,
    username: `premium_user_${marker.replace(/[^a-zA-Z0-9_]/g, "_").slice(-14)}`,
    password: "PremiumUserPass!16",
  },
  {
    email: `premium-other-${marker}@example.com`,
    username: `premium_other_${marker.replace(/[^a-zA-Z0-9_]/g, "_").slice(-14)}`,
    password: "PremiumOtherPass!16",
  },
  {
    email: `premium-admin-${marker}@example.com`,
    username: `premium_admin_${marker.replace(/[^a-zA-Z0-9_]/g, "_").slice(-14)}`,
    password: "PremiumAdminPass!16",
  },
  {
    email: `premium-rejection-${marker}@example.com`,
    username: `premium_rejection_${marker.replace(/[^a-zA-Z0-9_]/g, "_").slice(-12)}`,
    password: "PremiumRejectPass!16",
  },
];
let baseUrl = "";
let server;
const tokens = [];

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
}

async function register(account) {
  const result = await request("/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: account.username,
      displayName: account.username,
      email: account.email,
      password: account.password,
    }),
  });
  assert.equal(result.response.status, 201);
  tokens.push(result.body.token);
  return result;
}

function auth(token) {
  return { authorization: `Bearer ${token}` };
}

before(async () => {
  server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  const users = await db
    .select({ id: authUsersTable.id })
    .from(authUsersTable)
    .where(inArray(authUsersTable.email, accounts.map(account => account.email)));
  const ids = users.map(user => user.id);
  if (ids.length) {
    await db.delete(premiumRequestsTable).where(inArray(premiumRequestsTable.userId, ids));
    await db.delete(authSessionsTable).where(inArray(authSessionsTable.userId, ids));
    await db.delete(passwordCredentialsTable).where(inArray(passwordCredentialsTable.email, accounts.map(account => account.email)));
    await db.delete(authUsersTable).where(inArray(authUsersTable.id, ids));
  }
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});

test("premium requests are authenticated, fixed-price, unique, and visible across sessions", async () => {
  const user = await register(accounts[0]);
  const anonymous = await request("/premium-requests");
  assert.equal(anonymous.response.status, 401);

  const concurrent = await Promise.all(
    Array.from({ length: 8 }, () => request("/premium-requests", {
      method: "POST",
      headers: { ...auth(user.body.token), "content-type": "application/json" },
      body: JSON.stringify({ price: 1 }),
    })),
  );
  assert.equal(concurrent.filter(result => result.response.status === 201).length, 1);
  assert.equal(concurrent.filter(result => result.response.status === 409).length, 7);
  const created = concurrent.find(result => result.response.status === 201);
  assert.equal(created.body.request.price, 100);
  assert.equal(created.body.request.currency, "TRY");

  const secondDevice = await request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: accounts[0].email, password: accounts[0].password }),
  });
  assert.equal(secondDevice.response.status, 200);
  tokens.push(secondDevice.body.token);
  const visible = await request("/premium-requests", { headers: auth(secondDevice.body.token) });
  assert.equal(visible.response.status, 200);
  assert.equal(visible.body.requests.length, 1);
  assert.equal(visible.body.requests[0].id, created.body.request.id);
  const byId = await request(`/premium-requests/${created.body.request.id}`, {
    headers: auth(secondDevice.body.token),
  });
  assert.equal(byId.response.status, 200);
});

test("only durable admins can decide requests and approval grants entitlement atomically", async () => {
  const user = await register(accounts[1]);
  const created = await request("/premium-requests", {
    method: "POST",
    headers: { ...auth(user.body.token), "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(created.response.status, 201);

  const nonAdmin = await request("/admin/premium-requests", { headers: auth(user.body.token) });
  assert.equal(nonAdmin.response.status, 403);
  // The authorization check reads this durable database flag, not a request field.
  const admin = await register(accounts[2]);
  const [adminUser] = await db
    .select({ id: authUsersTable.id })
    .from(authUsersTable)
    .where(eq(authUsersTable.email, accounts[2].email))
    .limit(1);
  await db.update(authUsersTable).set({ isAdmin: true }).where(eq(authUsersTable.id, adminUser.id));
  const adminList = await request("/admin/premium-requests", { headers: auth(admin.body.token) });
  assert.equal(adminList.response.status, 200);
  assert.ok(adminList.body.requests.some(request => request.id === created.body.request.id));

  const [approved, racingCreate] = await Promise.all([
    request(`/admin/premium-requests/${created.body.request.id}/approve`, {
      method: "POST",
      headers: auth(admin.body.token),
    }),
    request("/premium-requests", {
      method: "POST",
      headers: { ...auth(user.body.token), "content-type": "application/json" },
      body: "{}",
    }),
  ]);
  assert.equal(approved.response.status, 200);
  assert.equal(racingCreate.response.status, 409);
  assert.equal(approved.body.request.status, "approved");
  const session = await request("/auth/session", { headers: auth(user.body.token) });
  assert.equal(session.body.user.isPremium, true);
  const duplicateEntitlementRequest = await request("/premium-requests", {
    method: "POST",
    headers: { ...auth(user.body.token), "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(duplicateEntitlementRequest.response.status, 409);
  const afterRace = await request("/premium-requests", { headers: auth(user.body.token) });
  assert.equal(afterRace.body.requests.filter(request => request.status === "pending").length, 0);
  const repeated = await request(`/admin/premium-requests/${created.body.request.id}/approve`, {
    method: "POST",
    headers: auth(admin.body.token),
  });
  assert.equal(repeated.response.status, 409);
});

test("rejection leaves entitlement disabled and decisions are race-safe", async () => {
  const user = await register(accounts[3]);
  const created = await request("/premium-requests", {
    method: "POST",
    headers: { ...auth(user.body.token), "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(created.response.status, 201);
  const admin = await request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: accounts[2].email, password: accounts[2].password }),
  });
  assert.equal(admin.response.status, 200);
  tokens.push(admin.body.token);

  const decisions = await Promise.all([
    request(`/admin/premium-requests/${created.body.request.id}/reject`, {
      method: "POST",
      headers: auth(admin.body.token),
    }),
    request(`/admin/premium-requests/${created.body.request.id}/reject`, {
      method: "POST",
      headers: auth(admin.body.token),
    }),
  ]);
  assert.equal(decisions.filter(result => result.response.status === 200).length, 1);
  assert.equal(decisions.filter(result => result.response.status === 409).length, 1);
  const session = await request("/auth/session", { headers: auth(user.body.token) });
  assert.equal(session.body.user.isPremium, false);
});