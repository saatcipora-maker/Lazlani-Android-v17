/// <reference types="node" />
import { createRequire } from "node:module";
import { X509Certificate } from "node:crypto";
import { rootCertificates } from "node:tls";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { uploadAliasFromListing } = require("../scripts/android-signing-alias.cjs");
// Public CA certificates only; no private keys or real signing credentials.
const first = new X509Certificate(rootCertificates[0]);
const second = new X509Certificate(rootCertificates[1]);
function entry(alias: string, certificate = first, type = "PrivateKeyEntry", chain = "") {
  return `Alias name: ${alias}
Creation date: Nov 11, 2026
Entry type: ${type}
Certificate chain length: 1
Certificate[1]:
${certificate.toString()}
${chain}
`;
}

describe("upload alias discovery bound to the Play upload certificate", () => {
  it("selects the certificate match, not the first private key", () => {
    expect(uploadAliasFromListing(entry("other", second) + entry("upload"), first.fingerprint256)).toBe("upload");
  });
  it("supports CRLF and a non-ASCII alias without logging or normalizing it", () => {
    expect(uploadAliasFromListing(entry("yükleme").replace(/\n/g, "\r\n"), first.fingerprint256)).toBe("yükleme");
  });
  it("does not select an imported public certificate", () => {
    expect(() => uploadAliasFromListing(entry("public-only", first, "trustedCertEntry"), first.fingerprint256)).toThrow();
  });
  it("matches the leaf certificate, never a matching CA later in a chain", () => {
    const chain = entry("wrong-leaf", second, "PrivateKeyEntry", `Certificate[2]:\n${first.toString()}`);
    expect(() => uploadAliasFromListing(chain, first.fingerprint256)).toThrow();
  });
  it.each(["", "AB".repeat(20), "not-a-fingerprint"])("rejects an invalid expected fingerprint %s", (fingerprint) => {
    expect(() => uploadAliasFromListing(entry("upload"), fingerprint)).toThrow();
  });
  it("fails closed when no certificate matches", () => {
    expect(() => uploadAliasFromListing(entry("other", second), first.fingerprint256)).toThrow();
  });
  it("fails closed when several private entries have the expected certificate", () => {
    expect(() => uploadAliasFromListing(entry("one") + entry("two"), first.fingerprint256)).toThrow();
  });
  it.each(["", "-option", " padded ", "bad\u0000name"])("refuses unsafe alias %s", (alias) => {
    expect(() => uploadAliasFromListing(entry(alias), first.fingerprint256)).toThrow();
  });
  it("rejects missing or malformed private-entry certificates without echoing input", () => {
    for (const listing of [entry("sensitive-alias").replace(first.toString(), ""), entry("sensitive-alias").replace(first.toString(), "-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----")]) {
      expect(() => uploadAliasFromListing(listing, first.fingerprint256)).toThrow(/sertifika/i);
      try {
        uploadAliasFromListing(listing, first.fingerprint256);
      } catch (error) {
        expect(String(error)).not.toContain("sensitive-alias");
        expect(String(error)).not.toContain("BEGIN CERTIFICATE");
      }
    }
  });
});
