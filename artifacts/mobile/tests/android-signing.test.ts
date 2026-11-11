/// <reference types="node" />
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { rootCertificates } from "node:tls";
import { describe, expect, it } from "vitest";

// Only synthetic bytes and a PUBLIC trust-root certificate are used. Mock JDK
// commands exercise cleanup/error handling; no real keystore, password or AAB.
describe("Android upload-key subprocess isolation", () => {
  it.each(["valid", "password-failure", "certificate-mismatch", "missing-alias", "signing-failure"])(
    "removes private temporary files and redacts command errors in %s",
    (scenario) => {
      const directory = mkdtempSync(join(tmpdir(), "afilli-signing-test-"));
      try {
        const bin = join(directory, "bin");
        const privateTemp = join(directory, "private-temp");
        mkdirSync(bin); mkdirSync(privateTemp);
        const certificate = new X509Certificate(rootCertificates[0]);
        const publicFile = join(directory, "public-certificate.der");
        writeFileSync(publicFile, certificate.raw);
        const fakeKeytool = `#!${process.execPath}
const fs = require('node:fs');
if (process.env.FIXTURE_SCENARIO === 'password-failure') {
  console.error(process.env.AFILLI_UPLOAD_STORE_PASSWORD);
  process.exit(1);
}
const args = process.argv.slice(2);
const key = args[args.indexOf('-keystore') + 1];
if ((fs.statSync(key).mode & 0o777) !== 0o600) process.exit(2);
const target = args[args.indexOf('-file') + 1];
fs.copyFileSync(process.env.FIXTURE_PUBLIC_CERTIFICATE, target);
`;
        writeFileSync(join(bin, "keytool"), fakeKeytool, { mode: 0o700 });
        writeFileSync(join(bin, "unzip"), `#!${process.execPath}
console.log('base/manifest/AndroidManifest.xml');
`, { mode: 0o700 });
        writeFileSync(join(bin, "jarsigner"), `#!${process.execPath}
console.error(process.env.AFILLI_UPLOAD_KEY_PASSWORD);
process.exit(1);
`, { mode: 0o700 });
        const syntheticBytes = "synthetic-file-not-a-private-key";
        const syntheticPassword = "synthetic-password-not-a-real-credential";
        const result = spawnSync(process.execPath, [
          new URL("../scripts/android-release.cjs", import.meta.url).pathname,
          scenario === "signing-failure" ? "sign" : "check-key",
        ], {
          encoding: "utf8",
          env: {
            NODE_ENV: "test",
            PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
            TMPDIR: privateTemp,
            AFILLI_HIGHEST_PLAY_VERSION_CODE: "27",
            AFILLI_RELEASE_VERSION: "2.0.0",
            EXPO_PUBLIC_DOMAIN: "afilli.example.com",
            EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_fixture_not_a_real_key",
            AFILLI_EXPECTED_UPLOAD_SHA256: scenario === "certificate-mismatch" ? "AB".repeat(32) : certificate.fingerprint256,
            AFILLI_UPLOAD_KEYSTORE_BASE64: Buffer.from(syntheticBytes).toString("base64"),
            AFILLI_UPLOAD_KEY_ALIAS: scenario === "missing-alias" ? "" : "fixture",
            AFILLI_UPLOAD_STORE_PASSWORD: syntheticPassword,
            AFILLI_UPLOAD_KEY_PASSWORD: syntheticPassword,
            FIXTURE_SCENARIO: scenario,
            FIXTURE_PUBLIC_CERTIFICATE: publicFile,
          },
        });
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(scenario === "valid" ? 0 : 1);
        expect(readdirSync(privateTemp)).toEqual([]);
        const logs = `${result.stdout}${result.stderr}`;
        expect(logs).not.toContain(syntheticBytes);
        expect(logs).not.toContain(syntheticPassword);
        expect(logs).not.toContain(Buffer.from(syntheticBytes).toString("base64"));
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );
});
