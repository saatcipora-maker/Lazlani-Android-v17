import assert from "node:assert/strict";
import test from "node:test";
import { cleanupPersistedDemoData } from "./demoDataCleanup";

function createStorage(initial) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    async getItem(key) {
      return data.get(key) ?? null;
    },
    async setItem(key, value) {
      data.set(key, value);
    },
  };
}

test("dry-run reports demo records without changing mixed real user data", async () => {
  const storage = createStorage({
    lazlani_extra_users: JSON.stringify([
      { id: "u1", email: "ayse@example.com" },
      { id: "real-user", email: "reader@example.net" },
      { id: "superadmin", email: "protected@example.net" },
    ]),
    lazlani_books_data: JSON.stringify([
      { id: "b1", authorId: "u3" },
      { id: "real-book", authorId: "real-user" },
    ]),
  });

  const before = new Map(storage.data);
  const report = await cleanupPersistedDemoData(storage, false);

  assert.ok(report.totalRemoved >= 2);
  assert.deepEqual(storage.data, before);
});

test("apply removes only allowlisted demo relationships and reruns as a no-op", async () => {
  const storage = createStorage({
    lazlani_extra_users: JSON.stringify([
      { id: "u2" },
      { id: "real-user" },
      { id: "superadmin" },
    ]),
    lazlani_follows: JSON.stringify(["u2", "real-user", "superadmin"]),
    lazlani_lists: JSON.stringify([
      { id: "list-1", bookIds: ["b2", "real-book"] },
    ]),
    lazlani_messages: JSON.stringify({
      conv1: [{ id: "m1", senderId: "u1" }],
      "real-conv": [
        { id: "real-message", senderId: "real-user", likedBy: ["u3", "real-user"] },
      ],
    }),
  });

  const first = await cleanupPersistedDemoData(storage, true);
  assert.ok(first.totalRemoved > 0);
  assert.deepEqual(JSON.parse(storage.data.get("lazlani_extra_users")), [
    { id: "real-user" },
    { id: "superadmin" },
  ]);
  assert.deepEqual(JSON.parse(storage.data.get("lazlani_follows")), [
    "real-user",
    "superadmin",
  ]);
  assert.deepEqual(JSON.parse(storage.data.get("lazlani_lists"))[0].bookIds, ["real-book"]);
  assert.deepEqual(JSON.parse(storage.data.get("lazlani_messages")), {
    "real-conv": [
      { id: "real-message", senderId: "real-user", likedBy: ["real-user"] },
    ],
  });

  const second = await cleanupPersistedDemoData(storage, true);
  assert.equal(second.totalRemoved, 0);
  assert.deepEqual(second.removedByKey, {});
});

test("malformed storage is reported as ambiguous and preserved", async () => {
  const storage = createStorage({ lazlani_books_data: "{not-json" });
  const report = await cleanupPersistedDemoData(storage, true);

  assert.deepEqual(report.ambiguousKeys, ["lazlani_books_data"]);
  assert.equal(storage.data.get("lazlani_books_data"), "{not-json");
});