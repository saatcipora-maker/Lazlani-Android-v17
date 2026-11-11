/// <reference types="node" />
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  ANDROID_PACKAGE, nextVersionCode, productionHost, certificateFingerprint,
  prepareReleaseConfig, unsignedGradle, validateManifest,
} = require("../scripts/android-release-config.cjs");

const config = {
  expo: {
    name: "Afilli", version: "1.0.0", scheme: "mobile",
    android: { package: "com.lazlani.app", softwareKeyboardLayoutMode: "resize" },
    ios: { supportsTablet: false }, plugins: ["expo-router", "expo-secure-store"],
  },
};
const env = {
  AFILLI_HIGHEST_PLAY_VERSION_CODE: "27", AFILLI_RELEASE_VERSION: "2.0.0",
  EXPO_PUBLIC_DOMAIN: "afilli.example.com",
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_fixture_not_a_real_key",
  AFILLI_EXPECTED_UPLOAD_SHA256: "AB".repeat(32),
};

describe("existing Google Play identity and Android release safeguards", () => {
  it("keeps the confirmed package in the actual Afilli app without guessing a release code", () => {
    const actual = JSON.parse(readFileSync(new URL("../app.json", import.meta.url), "utf8"));
    expect(actual.expo.name).toBe("Afilli");
    expect(actual.expo.android.package).toBe(ANDROID_PACKAGE);
    expect(actual.expo.android.versionCode).toBeUndefined();
    expect(actual.expo.extra?.eas).toBeUndefined();
  });

  it.each([undefined, "", "1.5", "1e3", "-1", "0", "2100000000", "9999999999999999999"])(
    "refuses unknown, invalid or exhausted Play version %s",
    (highest) => expect(() => nextVersionCode(highest)).toThrow(),
  );
  it("uses the supplied Play maximum, not the old source version", () => {
    expect(nextVersionCode(" 27 ")).toBe(28);
    expect(nextVersionCode("2099999999")).toBe(2100000000);
  });

  it.each(["", "localhost", "127.0.0.1", "10.0.0.1", "afilli.replit.dev", "afilli.repl.co", "https://afilli.example.com", "afilli.example.com/api", "user@afilli.example.com", "afilli.example.com:8080", "afilli.internal", " afilli.example.com "])(
    "rejects non-production API host %s", (host) => expect(() => productionHost(host)).toThrow(),
  );
  it("accepts a bare HTTPS production hostname", () => {
    expect(productionHost("Afilli.Example.com")).toBe("afilli.example.com");
  });

  it("prepares a higher Android version without changing app runtime, iOS or input data", () => {
    const before = structuredClone(config);
    const release = prepareReleaseConfig(config, env);
    expect(config).toEqual(before);
    expect(release.config.expo).toMatchObject({
      name: "Afilli", version: "2.0.0", scheme: "mobile",
      android: { package: "com.lazlani.app", versionCode: 28, softwareKeyboardLayoutMode: "resize" },
      ios: before.expo.ios, plugins: before.expo.plugins,
    });
    expect(release.metadata).toEqual({ package: "com.lazlani.app", version: "2.0.0", versionCode: 28, apiOrigin: "https://afilli.example.com" });
    expect(JSON.stringify(release)).not.toContain(env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY);
    expect(release.config.expo.extra).toBeUndefined();
  });

  it.each(["", "pk_test_fixture", "sk_live_private_fixture"])("refuses missing, development or private Clerk key %s", (key) => {
    expect(() => prepareReleaseConfig(config, { ...env, EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: key })).toThrow();
  });
  it("refuses a different Android identity or an unsafe visible version", () => {
    expect(() => prepareReleaseConfig({ expo: { ...config.expo, android: { package: "com.other.app" } } }, env)).toThrow();
    expect(() => prepareReleaseConfig(config, { ...env, AFILLI_RELEASE_VERSION: "2.0.0\ninjected=true" })).toThrow();
  });
  it("allows the production Clerk proxy but refuses a different host or insecure URL", () => {
    expect(() => prepareReleaseConfig(config, { ...env, EXPO_PUBLIC_CLERK_PROXY_URL: "https://afilli.example.com/__clerk" })).not.toThrow();
    for (const proxy of ["http://afilli.example.com/__clerk", "https://other.example.com/__clerk", "https://user:password@afilli.example.com/__clerk"]) {
      expect(() => prepareReleaseConfig(config, { ...env, EXPO_PUBLIC_CLERK_PROXY_URL: proxy })).toThrow();
    }
  });

  it("requires a full upload-certificate fingerprint", () => {
    expect(certificateFingerprint("ab:".repeat(31) + "ab")).toBe("AB".repeat(32));
    for (const fingerprint of ["", "AB".repeat(20), "GH".repeat(32)]) {
      expect(() => certificateFingerprint(fingerprint)).toThrow();
    }
    expect(() => prepareReleaseConfig(config, { ...env, AFILLI_EXPECTED_UPLOAD_SHA256: "" })).toThrow();
  });

  it("disables template signing without embedding private signing settings into Gradle", () => {
    const source = 'apply plugin: "com.android.application"\nandroid { buildTypes { release { signingConfig signingConfigs.debug } } }\n';
    const result = unsignedGradle(source);
    expect(result).toContain("signingConfig = null");
    expect(result).not.toMatch(/storePassword|keyPassword|AFILLI_UPLOAD_STORE_PASSWORD/);
    expect(unsignedGradle(result)).toBe(result);
    expect(() => unsignedGradle("not the Android app")).toThrow();
  });

  it("rejects a built bundle whose package or versions differ from the prepared release", () => {
    const { metadata } = prepareReleaseConfig(config, env);
    const valid = { package: "com.lazlani.app", versionCode: "28", version: "2.0.0" };
    expect(() => validateManifest(metadata, valid)).not.toThrow();
    for (const actual of [{ ...valid, package: "com.other.app" }, { ...valid, versionCode: "18" }, { ...valid, version: "1.5.1" }]) {
      expect(() => validateManifest(metadata, actual)).toThrow();
    }
  });

  it("only enables explicit manual builds and never submits to Google Play", () => {
    const workflow = readFileSync(new URL("../../../.github/workflows/afilli-android-aab.yml", import.meta.url), "utf8");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toMatch(/^\s+(push|pull_request|schedule):/m);
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("if-no-files-found: error");
    const signingGate = workflow.split("\n").find((line: string) => line.includes("AFILLI_SIGNING_AVAILABLE:"));
    expect(signingGate).toContain("AFILLI_UPLOAD_KEYSTORE_BASE64");
    expect(signingGate).toContain("AFILLI_UPLOAD_STORE_PASSWORD");
    expect(signingGate).toContain("AFILLI_UPLOAD_KEY_PASSWORD");
    expect(signingGate).not.toContain("AFILLI_UPLOAD_KEY_ALIAS");
    expect(workflow).not.toMatch(/google-play|fastlane|eas (?:build|submit)/i);
  });
});
