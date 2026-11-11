import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  contentFile, contentObjectPath, deleteContentObject, listContentObjects,
  type ContentObject,
} from "../src/lib/contentStorage";

// Explicit opt-in only:
// CONTENT_STORAGE_INTEGRATION=1 pnpm exec vitest run artifacts/api-server/tests/content-cleanup-storage.integration.test.ts
// No database, Clerk, Shopify or cleanup-job imports. Every test redirects storage
// to its own random directory OUTSIDE the application's afilli-content namespace.
// Cleanup lists only that directory, including old versions, and deletes only
// fixture paths registered by this test. Never run a bucket-wide cleanup here.
describe.skipIf(process.env.CONTENT_STORAGE_INTEGRATION !== "1")("real App Storage content cleanup safeguards", () => {
  let testRoot: string | undefined;
  const fixturePaths = new Set<string>();

  beforeEach(() => {
    if (process.env.NODE_ENV === "production") throw new Error("Storage integration tests cannot run in production.");
    const privateRoot = process.env.PRIVATE_OBJECT_DIR?.replace(/\/+$/, "");
    if (!privateRoot) throw new Error("App Storage must be configured before opting into integration tests.");
    testRoot = `${privateRoot}/content-cleanup-integration/${randomUUID()}`;
    vi.stubEnv("PRIVATE_OBJECT_DIR", testRoot);
  });

  async function writeFixture(name: string, contents: string, previousGeneration: string | number = 0): Promise<ContentObject> {
    if (!testRoot || !/^[A-Za-z0-9_-]+(?:\/(?:ready|unknown))?$/.test(name)) {
      throw new Error("Invalid integration fixture path.");
    }
    const path = contentObjectPath(name);
    if (!path.startsWith(`${testRoot}/afilli-content/`)) throw new Error("Fixture escaped the isolated storage directory.");
    // Register before saving so cleanup also covers a successful write whose
    // subsequent metadata request fails. Initial writes cannot replace objects.
    fixturePaths.add(path);
    const file = contentFile(path);
    const bytes = Buffer.from(contents);
    await file.save(bytes, {
      resumable: false, contentType: "application/octet-stream",
      preconditionOpts: { ifGenerationMatch: previousGeneration },
    });
    const [metadata] = await file.getMetadata();
    if (!metadata.generation || !metadata.updated) throw new Error("Fixture metadata is incomplete.");
    expect(Number(metadata.size)).toBe(bytes.length);
    return { path, generation: String(metadata.generation), updatedAt: new Date(metadata.updated), size: Number(metadata.size) };
  }

  afterEach(async () => {
    try {
      if (!testRoot || fixturePaths.size === 0) return;
      if (contentObjectPath("") !== `${testRoot}/afilli-content/`) {
        throw new Error("Refusing cleanup outside the isolated storage directory.");
      }
      const prefix = contentFile(contentObjectPath(""));
      // Include noncurrent generations on versioned buckets as well as the
      // current object. No recursive/bucket-wide delete or user-file listing.
      const [files] = await prefix.bucket.getFiles({ prefix: prefix.name, versions: true });
      const outcomes = await Promise.allSettled(files.map(async (file) => {
        const path = `/${file.bucket.name}/${file.name}`;
        if (!fixturePaths.has(path)) return;
        if (!file.metadata.generation) throw new Error("Cannot safely clean a fixture without its generation.");
        const generation = String(file.metadata.generation);
        await contentFile(path, generation).delete({ ignoreNotFound: true, ifGenerationMatch: generation });
      }));
      const failures = outcomes.filter((outcome) => outcome.status === "rejected");
      if (failures.length) throw new AggregateError(failures.map((outcome) => outcome.reason), "Integration fixture cleanup failed.");
      const [remaining] = await prefix.bucket.getFiles({ prefix: prefix.name, versions: true });
      expect(remaining.filter((file) => fixturePaths.has(`/${file.bucket.name}/${file.name}`))).toHaveLength(0);
    } finally {
      vi.unstubAllEnvs();
      fixturePaths.clear();
      testRoot = undefined;
    }
  }, 60_000);

  it("never deletes a replacement when retrying deletion of the listed old generation", async () => {
    const initial = await writeFixture("replaced/ready", "old fixture bytes");
    const listed = await listContentObjects();
    expect(listed).toEqual([initial]);
    const replacement = await writeFixture("replaced/ready", "replacement fixture bytes", initial.generation);
    expect(replacement.generation).not.toBe(initial.generation);

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await deleteContentObject(listed[0]);
      } catch (error) {
        // A precondition conflict is safe; other transport/auth errors must fail.
        expect(error).toMatchObject({ code: 412 });
      }
      const [metadata] = await contentFile(replacement.path).getMetadata();
      expect(String(metadata.generation)).toBe(replacement.generation);
      const [bytes] = await contentFile(replacement.path).download();
      expect(bytes.toString()).toBe("replacement fixture bytes");
    }
  }, 60_000);

  it("follows real page tokens without skipping files or including unknown nested objects", async () => {
    const expected: ContentObject[] = [];
    for (const name of ["asset_a", "asset_a/ready", "asset_b", "asset_b/ready", "asset_c", "asset_c/ready", "asset_z/ready"]) {
      expected.push(await writeFixture(name, `fixture:${name}`));
    }
    await writeFixture("asset_a/unknown", "not a managed content object");
    // Four real pages with only eight tiny objects, not 501 cloud writes.
    const prefix = contentFile(contentObjectPath(""));
    const [firstPage, next] = await prefix.bucket.getFiles({ prefix: prefix.name, autoPaginate: false, maxResults: 2 });
    expect(firstPage).toHaveLength(2);
    expect(next?.pageToken).toEqual(expect.any(String));
    const listed = await listContentObjects({ pageSize: 2 });
    expect(listed).toHaveLength(expected.length);
    expect(listed).toEqual(expect.arrayContaining(expected));
    expect(new Set(listed.map((object) => object.path)).size).toBe(expected.length);
    for (const object of expected) {
      const [metadata] = await contentFile(object.path).getMetadata();
      expect(String(metadata.generation)).toBe(object.generation);
    }
  }, 60_000);

  it("can delete an already-missing object repeatedly without recreating it", async () => {
    const original = await writeFixture("deleted", "disposable fixture bytes");
    const [listed] = await listContentObjects();
    expect(listed).toEqual(original);
    await expect(deleteContentObject(listed)).resolves.toBeUndefined();
    expect((await contentFile(original.path).exists())[0]).toBe(false);
    await expect(deleteContentObject(listed)).resolves.toBeUndefined();
    await expect(deleteContentObject(listed)).resolves.toBeUndefined();
    expect((await contentFile(original.path).exists())[0]).toBe(false);
    expect(await listContentObjects()).toEqual([]);
  }, 60_000);
});
