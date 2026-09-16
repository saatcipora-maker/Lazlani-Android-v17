import assert from "node:assert/strict";
import test from "node:test";
import {
  isSupportedImageMagic,
  validateLoveMediaMetadata,
  validateLoveMediaReference,
} from "../lib/object-storage";

test("LOVE upload policy rejects arbitrary MIME, size, and non-image bytes", () => {
  assert.equal(validateLoveMediaMetadata({ size: 10, contentType: "image/jpeg" }), null);
  assert.equal(validateLoveMediaMetadata({ size: 10, contentType: "image/gif" }), null);
  assert.notEqual(validateLoveMediaMetadata({ size: 10, contentType: "application/octet-stream" }), null);
  assert.notEqual(validateLoveMediaMetadata({ size: 10 * 1024 * 1024 + 1, contentType: "image/png" }), null);
  assert.equal(isSupportedImageMagic("image/gif", Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61])), true);
  assert.equal(isSupportedImageMagic("image/gif", Uint8Array.from([0x89, 0x50, 0x4e, 0x47])), false);
});

test("LOVE attachment references cannot use staging paths or another owner", async () => {
  await assert.rejects(
    validateLoveMediaReference("/objects/uploads/love-media/user-1/file", "user-1"),
    /belongs to another user|not finalized/i,
  );
  await assert.rejects(
    validateLoveMediaReference("/objects/love-media/user-2/file", "user-1"),
    /belongs to another user|not finalized/i,
  );
});
