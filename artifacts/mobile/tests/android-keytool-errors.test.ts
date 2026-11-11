/// <reference types="node" />
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const { safeKeytoolError } = createRequire(import.meta.url)("../scripts/android-keytool-errors.cjs");
const sentinel = "synthetic-sensitive-data-not-a-real-credential";

describe("safe keytool diagnostics", () => {
  it.each([
    ["password was incorrect", "AFILLI_UPLOAD_STORE_PASSWORD"],
    ["Keystore was tampered with, or password was incorrect", "AFILLI_UPLOAD_STORE_PASSWORD"],
    ["Integrity check failed", "AFILLI_UPLOAD_STORE_PASSWORD"],
    ["Unrecognized keystore format", "AFILLI_UPLOAD_KEYSTORE_BASE64"],
    ["Invalid keystore format", "AFILLI_UPLOAD_KEYSTORE_BASE64"],
    ["java.io.EOFException", "AFILLI_UPLOAD_KEYSTORE_BASE64"],
    ["java.security.NoSuchAlgorithmException", "Java uyumluluğunu"],
    [`Alias <${sentinel}> does not exist`, "AFILLI_UPLOAD_KEY_ALIAS"],
  ])("classifies %s without returning raw output", (failure, expected) => {
    for (const channel of ["stdout", "stderr"]) {
      for (const buffer of [false, true]) {
        const raw = `${sentinel}\n${failure}\n${sentinel}`;
        const error = { [channel]: buffer ? Buffer.from(raw) : raw, message: sentinel };
        const safe = safeKeytoolError(error);
        expect(safe).toContain(expected);
        expect(safe).not.toContain(sentinel);
        expect(safe).not.toContain("Alias <");
      }
    }
  });

  it("handles missing Java without revealing command arguments", () => {
    expect(safeKeytoolError({ code: "ENOENT", message: sentinel })).toContain("Java kurulumunu");
    expect(safeKeytoolError({ code: "ENOENT", message: sentinel })).not.toContain(sentinel);
  });

  it("does not misdiagnose unsupported encryption as a definite wrong password", () => {
    const safe = safeKeytoolError({ stdout: "password was incorrect\nCaused by NoSuchAlgorithmException" });
    expect(safe).toContain("Java uyumluluğunu");
    expect(safe).not.toContain("AFILLI_UPLOAD_STORE_PASSWORD");
  });

  it.each([null, undefined, sentinel, { message: sentinel }, { stdout: { toString() { throw Error(sentinel); } } }])(
    "fails safely on unknown subprocess errors",
    (error) => {
      expect(safeKeytoolError(error)).toBe("keytool işlemi başarısız; araç kurulumu ve derleme ayarlarını kontrol et.");
    },
  );

  it("bounds diagnostic inspection while still never returning raw text", () => {
    const safe = safeKeytoolError({ stderr: `${sentinel}${".".repeat(65536)}password was incorrect` });
    expect(safe).not.toContain("AFILLI_UPLOAD_STORE_PASSWORD");
    expect(safe).not.toContain(sentinel);
  });
});
