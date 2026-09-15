---
name: LAZLANI App Architecture
description: Türkçe edebi sosyal mobil uygulamada yerel demo verisi ile sunucu güvenlik ve senkronizasyon sınırları.
---

## Stack
- Expo Router, React Native, TypeScript
- AsyncStorage (local persistence for demo content and a cache of the server session token)
- `ThemeContext` + `useColors()` hook (8 themes)
- `DataContext` (all app data: books, posts, ozel, dergi, admin, etc.)
- `AuthContext` (login, register, profile, theme sync)

## Account recovery boundary
Password recovery must be enforced by the server even while the product keeps demo content and sessions local.

**Why:** A local password change cannot prove mailbox ownership and makes reset-code expiry or single use unenforceable across devices.

**How to apply:** Keep demo-only content local, but require server verification before accepting any password-recovery result. Reset requests must return the same public response for known and unknown addresses; delivery failures are logged internally to avoid account enumeration.

## Server authentication boundary
All password registration, login, session restore, and logout decisions are server-authoritative. AsyncStorage may cache the opaque token and returned profile, but never authenticate from a local password or local user list.

**Why:** Device-local credentials diverge across devices and remain usable after a server-side password reset. Session records are tied to the password credential update time so every old or racing session becomes invalid after reset.

**How to apply:** New account entry points must return or validate a server session. Fixed demo credentials may only be provisioned under the development environment guard; production must never seed them.

## Google account strategy
Keep the existing LAZLANI server-auth model and link Google identities to existing accounts; do not migrate authentication to Clerk.

**Why:** The user explicitly chose to preserve existing accounts and server auth rather than replace the identity system.

**How to apply:** Verify Google ID tokens and their audience on the server. Trust only Google-verified email/subject claims, never client-supplied profile fields. Do not create or merge accounts implicitly when identity ownership is ambiguous.

## Cross-device realtime boundary
Cross-device messages, reactions, votes, users, and books must have server-owned identity and persistence; AsyncStorage may only provide local demo/offline behavior.

**Why:** Device-local state cannot keep two users consistent, enforce one reaction per account, or deliver updates to another device.

**How to apply:** Do not describe local optimistic updates as realtime. Add authenticated server mutations and a shared event stream only after the server can authoritatively identify the acting user.

## Demo accounts
Demo identities and their roles are development fixtures only. Demo passwords are intentionally not recorded in project memory.

## App identifiers
- Android package: `com.lazlani.app`
- EAS project: `yd6367000/lazlani`
- Version: **1.2.2**, versionCode: **4**

## Theme system
- 8 themes in `constants/colors.ts` (ThemePalette with `isDark: boolean`)
- `useColors()` returns palette + `onColor(bgHex)` helper
- Theme persisted to `lazlani_theme` in AsyncStorage AND to `user.theme` for cross-device sync
- On login, `AuthContext` reads `user.theme` and calls `setTheme()` automatically
- On theme change in `app/theme.tsx`, calls both `setTheme()` and `updateProfile({theme})`
- **Always use `colors.primaryForeground`** for text on `colors.primary` backgrounds (never hardcode `#fff` — some themes have light primary colors)

## Özel Bölümü (video subscription feature)
- `OzelPost` — video-only, 15-day auto-expiry
- `OzelComment` + `OzelCommentReply` — nested comment system
- Subscription: `PurchaseType = 'ozel_abonelik'`, 100 TL/ay, admin approval required
- Subscription status derived at runtime from `purchaseRequests` (no backend sync needed)
- Daily limit: 4 videos/user/day tracked in `ozelDailyVideos` (in-memory, reset each day)
- Admin panel: dedicated **Özel** tab for subscription approvals + video deletion
- Download: subscribers only; non-subscribers redirected to subscribe modal

## Key DataContext functions (Özel)
- `addOzelComment`, `addOzelCommentReply`, `toggleOzelCommentLike`
- `deleteOzelPost` (admin)
- `getOzelVideoCountToday(userId)`, `incrementOzelVideoCount(userId)`
- `requestPurchase('ozel_abonelik', ...)` — sends subscription request to admin
- `approvePurchase(reqId)` — if type is `ozel_abonelik`, also sets `canPostVideo: true` on user

## Provider nesting order (IMPORTANT)
`ThemeProvider > DataProvider > AuthProvider > children` (in `_layout.tsx`)
- DataProvider wraps AuthProvider — so AuthContext CAN safely call `useData()`
- AuthContext calls both `useTheme()` and `useData()`
- Do NOT swap DataProvider and AuthProvider — AuthContext depends on both being above it

## User registration & discoverability
Server registration returns the authoritative user profile and session. AuthContext then adds that profile to DataContext so it is immediately discoverable on the current device.

## AsyncStorage persistence keys
Interaction: `lazlani_likes`, `lazlani_saves`, `lazlani_follows`, `lazlani_post_likes`, `lazlani_post_saves`, `lazlani_post_comment_likes`, `lazlani_lists`, `lazlani_ratings`, `lazlani_progress`, `lazlani_bookmarks`, `lazlani_favorites`
Content (survives restart): `lazlani_books_data`, `lazlani_stories_data`, `lazlani_poems_data`, `lazlani_posts_data`
Users: `lazlani_extra_users` (local discoverability cache; never an authentication source)
Auth session cache: `lazlani_current_user` plus the opaque server token

## Admin panel tabs
`istatistik | kullanici | yetkilendirme | icerik | destek | talepler | ozel | log | filtre`
- **talepler**: premium/VIP/yazarlık purchase requests only
- **ozel**: Özel abonelik requests + all ozel video management

