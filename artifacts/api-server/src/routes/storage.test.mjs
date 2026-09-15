import assert from "node:assert/strict";
import test from "node:test";
import { validateBookCoverMetadata } from "./storage";
import {
  canonicalBookCoverObjectPath,
  isSupportedBookCoverMagic,
} from "../lib/object-storage";

test("accepts supported book cover images within the size limit", () => {
  assert.equal(validateBookCoverMetadata({ size: 1, contentType: "image/jpeg" }), null);
  assert.equal(validateBookCoverMetadata({ size: 10 * 1024 * 1024, contentType: "image/webp" }), null);
});

test("rejects unsupported or oversized book cover uploads", () => {
  assert.match(
    validateBookCoverMetadata({ size: 1024, contentType: "image/svg+xml" }) ?? "",
    /JPEG/,
  );
  assert.match(
    validateBookCoverMetadata({ size: 10 * 1024 * 1024 + 1, contentType: "image/png" }) ?? "",
    /10 MB/,
  );
});

test("requires the expected image magic bytes for each supported type", () => {
  assert.equal(
    isSupportedBookCoverMagic("image/jpeg", Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])),
    true,
  );
  assert.equal(
    isSupportedBookCoverMagic("image/png", Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    true,
  );
  assert.equal(
    isSupportedBookCoverMagic("image/webp", Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
    ])),
    true,
  );
  assert.equal(isSupportedBookCoverMagic("image/png", Uint8Array.from([0xff, 0xd8, 0xff])), false);
});

test("canonicalizes only finalized HTTPS cover references for the authenticated owner", () => {
  const origin = "https://api.example.test";
  assert.equal(
    canonicalBookCoverObjectPath(
      `${origin}/api/storage/objects/book-covers/user-1/cover_1`,
      "user-1",
      origin,
    ),
    "/objects/book-covers/user-1/cover_1",
  );
  assert.equal(canonicalBookCoverObjectPath(undefined, "user-1", origin), undefined);

  for (const reference of [
    "http://api.example.test/api/storage/objects/book-covers/user-1/cover_1",
    `${origin}/api/storage/objects/uploads/book-covers/user-1/cover_1`,
    `${origin}/api/storage/objects/book-covers/user-2/cover_1`,
    "https://cdn.example.test/api/storage/objects/book-covers/user-1/cover_1",
    `${origin}/api/storage/objects/book-covers/user-1/cover_1?download=1`,
  ]) {
    assert.throws(
      () => canonicalBookCoverObjectPath(reference, "user-1", origin),
      /cover reference/i,
    );
  }
});