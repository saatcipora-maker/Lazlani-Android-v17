import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cloud = vi.hoisted(() => ({
  getFiles: vi.fn(), file: vi.fn(), delete: vi.fn(),
  bucket: vi.fn(),
}));
vi.mock("@google-cloud/storage", () => ({
  Storage: class {
    bucket = cloud.bucket;
  },
}));
import { contentAssetId, listContentObjects, deleteContentObject } from "../src/lib/contentStorage";

beforeEach(() => {
  vi.stubEnv("PRIVATE_OBJECT_DIR", "/bucket/private");
  vi.clearAllMocks();
  cloud.bucket.mockReturnValue({ getFiles: cloud.getFiles, file: cloud.file });
  cloud.file.mockReturnValue({ delete: cloud.delete });
  cloud.delete.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
describe("content cleanup storage boundary", () => {
  it("supports bounded small pages without changing the default listing size", async () => {
    cloud.getFiles.mockResolvedValueOnce([[], null]);
    expect(await listContentObjects({ pageSize: 2 })).toEqual([]);
    expect(cloud.getFiles).toHaveBeenCalledExactlyOnceWith({
      prefix: "private/afilli-content/", autoPaginate: false, maxResults: 2, pageToken: undefined,
    });
  });
  it.each([0, -1, 501, 1.5, NaN, Infinity])("rejects invalid page size %s before contacting storage", async (pageSize) => {
    await expect(listContentObjects({ pageSize })).rejects.toThrow(RangeError);
    expect(cloud.bucket).not.toHaveBeenCalled();
  });
  it("lists only the exact content namespace and follows pagination", async () => {
    const metadata = { generation: "123456789012345678", updated: "2026-01-01T00:00:00.000Z", size: "64" };
    cloud.getFiles.mockResolvedValueOnce([[
      { name: "private/afilli-content/media_one", metadata },
      { name: "private/afilli-content/media_one/ready", metadata },
      { name: "private/chat/photos/chat_one", metadata },
      { name: "private/afilli-content/media_one/unknown", metadata },
    ], { pageToken: "next" }]).mockResolvedValueOnce([[
      { name: "private/afilli-content/media_two/ready", metadata },
    ], null]);
    const files = await listContentObjects();
    expect(files).toHaveLength(3);
    expect(files[0].generation).toBe("123456789012345678");
    expect(cloud.getFiles).toHaveBeenNthCalledWith(1, { prefix: "private/afilli-content/", autoPaginate: false, maxResults: 500, pageToken: undefined });
    expect(cloud.getFiles).toHaveBeenNthCalledWith(2, expect.objectContaining({ pageToken: "next" }));
  });
  it("uses generation preconditions and refuses paths outside the namespace", async () => {
    const file = { path: "/bucket/private/afilli-content/media_one/ready", generation: "123456789012345678", updatedAt: new Date(), size: 64 };
    await deleteContentObject(file);
    expect(cloud.file).toHaveBeenCalledWith("private/afilli-content/media_one/ready", { generation: file.generation });
    expect(cloud.delete).toHaveBeenCalledWith({ ignoreNotFound: true, ifGenerationMatch: file.generation });
    for (const path of ["/bucket/private/chat/photos/a", "/other/private/afilli-content/a", "/bucket/private/afilli-content/a/b", "/bucket/private/afilli-content/../a"]) {
      expect(contentAssetId(path)).toBeNull();
      await expect(deleteContentObject({ ...file, path })).rejects.toThrow("outside afilli-content");
    }
    expect(cloud.delete).toHaveBeenCalledTimes(1);
  });
  it("fails closed on incomplete listings or missing generation metadata", async () => {
    cloud.getFiles.mockRejectedValueOnce(new Error("listing unavailable"));
    await expect(listContentObjects()).rejects.toThrow("listing unavailable");
    cloud.getFiles.mockResolvedValueOnce([[{ name: "private/afilli-content/a", metadata: { updated: "2026-01-01" } }], null]);
    await expect(listContentObjects()).rejects.toThrow("metadata is incomplete");
    expect(cloud.delete).not.toHaveBeenCalled();
  });
});
