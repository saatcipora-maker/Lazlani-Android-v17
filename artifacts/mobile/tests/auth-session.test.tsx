import React, { useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  userId: null as string | null,
  isLoaded: true,
  getToken: vi.fn<() => Promise<string | null>>(),
  tokenGetter: null as null | (() => Promise<string | null>),
}));
vi.mock("@clerk/expo", () => ({ useAuth: () => auth }));
vi.mock("@workspace/api-client-react", () => ({
  setAuthTokenGetter: (getter: typeof auth.tokenGetter) => { auth.tokenGetter = getter; },
}));
import { AuthSessionBoundary } from "../components/AuthSessionBoundary";

let renderer: ReactTestRenderer;
let client: QueryClient;
let draft: string;
let setDraft: (value: string) => void;
function ChatProbe() {
  client = useQueryClient();
  [draft, setDraft] = useState("");
  return null;
}
const view = () => <AuthSessionBoundary><ChatProbe /></AuthSessionBoundary>;
async function switchTo(userId: string | null, loaded = true) {
  auth.userId = userId;
  auth.isLoaded = loaded;
  auth.getToken.mockResolvedValue(userId ? `test-token-${userId}` : null);
  await act(async () => { renderer.update(view()); });
}
beforeEach(async () => {
  // Required by React's test renderer; no native/Expo runtime is mocked into the boundary.
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  auth.userId = null;
  auth.isLoaded = true;
  auth.getToken.mockResolvedValue(null);
  await act(async () => { renderer = create(view()); });
});
afterEach(async () => {
  await act(async () => { renderer.unmount(); });
});

describe("account-scoped cache and chat state", () => {
  it.each([
    [null, "alice"], ["alice", "bob"], ["alice", null],
  ])("drops guest/previous data, mutations and drafts on %s → %s", async (from, to) => {
    await switchTo(from);
    const previous = client;
    previous.setQueryData(["/api/bootstrap"], { profile: from ?? "guest" });
    previous.setQueryData(["/api/chat/rooms/general/messages"], [{ body: "private old message" }]);
    previous.setQueryData(["/api/messages"], [{ body: "private inbox" }]);
    previous.getMutationCache().build(previous, {
      mutationKey: ["send-message"], mutationFn: async () => "old result",
    });
    await act(async () => { setDraft("Unsent old-account text"); });
    await switchTo(to);
    expect(client).not.toBe(previous);
    expect(client.getQueryCache().getAll()).toEqual([]);
    expect(client.getMutationCache().getAll()).toEqual([]);
    expect(previous.getQueryCache().getAll()).toEqual([]);
    expect(previous.getMutationCache().getAll()).toEqual([]);
    expect(draft).toBe("");
    expect(await auth.tokenGetter!()).toBe(to ? `test-token-${to}` : null);
  });

  it("cancels pending requests and cannot repopulate the next account with a late response", async () => {
    await switchTo("alice");
    const previous = client;
    let resolve!: (value: string) => void;
    let signal!: AbortSignal;
    const pending = previous.fetchQuery({
      queryKey: ["late-inbox"],
      queryFn: ({ signal: requestSignal }) => {
        signal = requestSignal;
        return new Promise<string>((done) => { resolve = done; });
      },
    }).catch(() => undefined);
    await switchTo("bob");
    expect(signal.aborted).toBe(true);
    resolve("Alice's private inbox");
    await pending;
    expect(client.getQueryData(["late-inbox"])).toBeUndefined();
    expect(previous.getQueryData(["late-inbox"])).toBeUndefined();
  });

  it("does not resurrect guest or account data when returning to the same identity", async () => {
    client.setQueryData(["bootstrap"], "guest");
    await switchTo("alice");
    client.setQueryData(["bootstrap"], "alice");
    await switchTo("bob");
    await switchTo("alice");
    expect(client.getQueryData(["bootstrap"])).toBeUndefined();
    await switchTo(null);
    expect(client.getQueryData(["bootstrap"])).toBeUndefined();
  });

  it("preserves the scope during token renewal without an identity change", async () => {
    await switchTo("alice");
    const previous = client;
    client.setQueryData(["inbox"], "Alice");
    await act(async () => { setDraft("My current draft"); });
    auth.getToken = vi.fn(async () => "renewed-test-token-alice");
    await act(async () => { renderer.update(view()); });
    expect(client).toBe(previous);
    expect(client.getQueryData(["inbox"])).toBe("Alice");
    expect(draft).toBe("My current draft");
    expect(await auth.tokenGetter!()).toBe("renewed-test-token-alice");
  });

  it("discards an old account token that resolves after the account has changed", async () => {
    await switchTo("alice");
    let resolve!: (value: string) => void;
    auth.getToken.mockImplementationOnce(() => new Promise<string>((done) => { resolve = done; }));
    const pendingToken = auth.tokenGetter!();
    await switchTo("bob");
    resolve("late-test-token-alice");
    expect(await pendingToken).toBeNull();
    expect(await auth.tokenGetter!()).toBe("test-token-bob");
  });

  it("does not mount data consumers until identity loading and the token bridge are ready", async () => {
    await switchTo(null, false);
    let tokenAtFetch: string | null | undefined;
    function Consumer() {
      useQuery({
        queryKey: ["identity-on-mount"],
        queryFn: async () => {
          tokenAtFetch = await auth.tokenGetter!();
          return true;
        },
      });
      return null;
    }
    await act(async () => { renderer.update(<AuthSessionBoundary><Consumer /></AuthSessionBoundary>); });
    expect(tokenAtFetch).toBeUndefined();
    auth.userId = "bob";
    auth.isLoaded = true;
    auth.getToken.mockResolvedValue("test-token-bob");
    await act(async () => { renderer.update(<AuthSessionBoundary><Consumer /></AuthSessionBoundary>); });
    expect(tokenAtFetch).toBe("test-token-bob");
  });
});
