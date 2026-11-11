# Chat and account-isolation regressions

Run from the workspace root:

```sh
pnpm test
pnpm run typecheck
```

`pnpm test` runs the permanent API and mobile session-boundary tests. A missing
database fails the suite instead of silently skipping the integration checks.

## Database safety

API tests use `TEST_DATABASE_URL` when configured, otherwise the development
`DATABASE_URL`. Use only a development/test PostgreSQL database with permission
to create schemas. Production-mode execution is rejected.

Each run creates a randomly named `chat_regression_*` schema and a connection
pool whose search path contains **only that schema**, without a `public`
fallback. Tables and defaults come from the application's Drizzle definitions;
application seeds and migrations are not run. Fixtures are truncated only in
that schema, which is dropped and disconnected after the suite. An interrupted
process can leave a disposable `chat_regression_*` schema behind.

The quota test makes twelve simultaneous HTTP requests against the real
Express router, transactions and PostgreSQL row locks. A test-schema-only insert
delay makes a missing-lock regression reproducible rather than relying on
request timing. The assertions cover all four rooms, five accepted images,
seven rate-limit responses, the persisted count, independent users, and the
Turkey-midnight boundary.

## Test boundaries

The API suite replaces only Clerk's identity lookup with synthetic identities.
It exercises the real authentication/blocked-profile middleware and every chat
admin route. It does not validate Clerk's JWT verification or provider sign-in.
Shopify entry points throw if called: these tests never create a real checkout
or payment.

## Store product recovery

`artifacts/api-server/tests/store-product-creation.test.ts` exercises the actual
owner-only product route and an isolated PostgreSQL operation journal. Only the
Shopify transport is replaced; mutation error checking, claims and mappings run
unchanged. Transport errors (including ambiguous timeouts), mutation user errors,
every journal checkpoint, mapping failure, concurrency and successful-response
replay are covered without contacting the real store.

Product creation uses **explicit manual recovery**, not automatic rollback.
Identical validated product details from the same owner identify one permanent
operation. Completed operations replay their result; incomplete operations return
409 with the saved stage and product ID (or a deterministic `afilli-…` handle
when the creation response was lost). They must be inspected and completed in
Shopify rather than resubmitted with changed details. Never delete or expire the
journal to “unlock” a retry: a timed-out Shopify write may have committed.
The same exact details also cannot intentionally create a second product through
this endpoint. A separate explicit operation-identity/reconciliation workflow
would be needed to support that safely.

Products stay DRAFT through price, stock and local mapping. Activation and
publication happen last. Missing Replit publication leaves a draft and a recovery
error, never a silent fallback to Online Store. A publication/completion timeout
reports unknown visibility, since the product might already be visible. No error
handler deletes or unpublishes a Shopify product.

The journal schema is applied by the existing `scripts/post-merge.sh` database
push. If it is missing/unavailable, creation fails before any Shopify call.

The mobile suite renders the actual `AuthSessionBoundary` with real React Query
clients, mocking only Clerk identity/token delivery and the token-getter setter.
It covers guest → account, account → account, sign-out, returning accounts,
late requests, mutations, local drafts, auth loading, and token renewal. It does
not require Expo, a browser, or real accounts. The boundary wraps the navigation
tree in the root layout so switching identity remounts chat-local state too.
