import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cloud = vi.hoisted(() => ({
  files: [] as { name: string; metadata: { timeCreated: string; generation: string } }[],
  createResumableUpload: vi.fn(async () => ["https://storage.invalid/bounded-session"]),
  deleteFile: vi.fn(async (_name: string, _options?: { generation: string }) => {}),
  getFilesStream: vi.fn(),
  file: vi.fn(),
}));

vi.mock("../src/lib/objectStorage", () => {
  const bucket = {
    getFilesStream: cloud.getFilesStream,
    file: cloud.file,
  };
  return {
    ObjectStorageService: class { getPrivateObjectDir() { return "/test-bucket/private"; } },
    objectStorageClient: { bucket: vi.fn(() => bucket) },
  };
});

import { chatPhotoStorage } from "../src/lib/chatPhotoStorage";

beforeEach(() => {
  cloud.files = [];
  cloud.getFilesStream.mockImplementation(() => Readable.from(cloud.files));
  cloud.file.mockImplementation((name: string, options?: { generation: string }) => ({
    name,
    bucket: { file: cloud.file, getFilesStream: cloud.getFilesStream },
    createResumableUpload: cloud.createResumableUpload,
    delete: async () => { await cloud.deleteFile(name, options); },
  }));
});

describe("storage-enforced photo limits and independent staging sweep", () => {
  it("creates a resumable session with an exact, server-validated byte limit", async () => {
    await chatPhotoStorage.requestUpload("example", 12345, "image/png", "https://mobile.example");
    expect(cloud.file).toHaveBeenCalledWith("private/chat/uploads/example");
    expect(cloud.createResumableUpload).toHaveBeenCalledWith({
      origin: "https://mobile.example",
      metadata: { contentType: "image/png", contentLength: 12345 },
    });
  });

  it("deletes late-completing staging objects without relying on a ledger row", async () => {
    const before = new Date("2026-11-10T10:00:00Z");
    // These are storage objects, not database fixtures. The first may have
    // completed long after the database cleanup ledger was already removed.
    cloud.files = [
      { name: "private/chat/uploads/late-orphan", metadata: { timeCreated: "2026-11-10T09:59:00Z", generation: "17" } },
      { name: "private/chat/uploads/in-flight-grace", metadata: { timeCreated: "2026-11-10T10:01:00Z", generation: "18" } },
    ];
    await chatPhotoStorage.sweepStaleUploads(before);
    expect(cloud.getFilesStream).toHaveBeenCalledWith({ prefix: "private/chat/uploads/" });
    expect(cloud.deleteFile).toHaveBeenCalledExactlyOnceWith("private/chat/uploads/late-orphan", { generation: "17" });
  });

  it("propagates sweep failures so the scheduled worker retries", async () => {
    cloud.files = [{ name: "private/chat/uploads/retry", metadata: { timeCreated: "2026-11-09T00:00:00Z", generation: "1" } }];
    cloud.deleteFile.mockRejectedValueOnce(new Error("Cloud unavailable"));
    await expect(chatPhotoStorage.sweepStaleUploads(new Date("2026-11-10T00:00:00Z"))).rejects.toThrow("Cloud unavailable");
    await chatPhotoStorage.sweepStaleUploads(new Date("2026-11-10T00:00:00Z"));
    expect(cloud.deleteFile).toHaveBeenCalledTimes(2);
  });
});
