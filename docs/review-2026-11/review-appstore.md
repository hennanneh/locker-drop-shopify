# LockerDrop: App Store readiness review (as of 2026-11-12)

Scope: static, read-only review of `~/Desktop/Personal/locker-drop-shopify` against Shopify's current App Store requirements, API versioning policy, and platform deprecations. Nothing was run, edited, or deployed; `.env` was not read.

Primary sources:
- App Store requirements: https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements
- Pass app review checklist: https://shopify.dev/docs/apps/launch/app-store-review/pass-app-review
- API versioning: https://shopify.dev/docs/api/usage/versioning
- Expiring tokens migration: https://shopify.dev/docs/apps/build/authentication-authorization/migrate-to-expiring-offline-access-tokens
- October 2026 security changelog: https://shopify.dev/changelog/app-security-updates-october-2026
- Client credentials grant: https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant
- App installation / token exchange: https://shopify.dev/docs/apps/build/authentication-authorization/app-installation
- Protected customer data: https://shopify.dev/docs/apps/launch/protected-customer-data
- Built for Shopify: https://shopify.dev/docs/apps/launch/built-for-shopify/requirements
- Privacy compliance webhooks: https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance

Supported Admin API versions today (versioning page): 2026-01 (accessible until 2027-01-16), 2026-04, 2026-07, 2026-10 (latest stable). **2025-10 is no longer supported**; requests "fall forward" to the oldest supported version (currently 2026-01). Shopify CLI "prevents deploys targeting versions older than 12 months."

---

## Summary

| # | Severity | Item |
|---|----------|------|
| B1 | Blocker | Admin order-block extension pinned to unsupported `2025-10`; CLI will refuse to deploy it |
| B2 | Blocker | Thank-you extension ships a debug "LockerDrop test" banner |
| B3 | Blocker | Admin and checkout UI extensions do not render (P4-8); 2.2.5 / 5.6.1 feature-complete rules |
| B4 | Blocker | Existing installs on non-expiring tokens are never migrated (deadline 2027-01-01) |
| B5 | Blocker | Submission text has placeholders and contradicts the code (support email, pricing, Sim buttons) |
| B6 | Blocker | Harbor still on sandbox (already tracked) |
| S1 | Should-fix | Webhooks + hardcoded Admin API version `2025-10` (unsupported, falling forward) |
| S2 | Should-fix | Deprecated `fulfillmentCreateV2` and `ShopPlan.displayName` |
| S3 | Should-fix | Install flow: no token exchange; relies on a cross-origin `window.top` redirect |
| S4 | Should-fix | No recovery path when a refresh token dies (client-credentials option unused) |
| S5 | Should-fix | Billing `test` flag only for one hardcoded store; reviewers may hit real-charge flow |
| S6 | Should-fix | Billed fee ($1.50 flat) does not match locked size-aware pricing in PRICING_MODEL.md |
| S7 | Should-fix | `customers/redact` misses `locker_reservations`, logs the email, and swallows errors |
| S8 | Should-fix | Privacy policy says Harbor gets no customer name; code sends `customer_name` to Harbor |
| S9 | Should-fix | Protected customer data: docs disagree on Level 1 vs 2; confirm all 4 Level-2 fields approved |
| S10 | Should-fix | Dead `routes/` + `services/` code requests non-expiring tokens and a dead carrier URL |
| N1-N9 | Nice-to-have | API version bumps on other extensions, `s-app-nav`, `[network_access]`, carrier latency, etc. |

REST check result: **no REST Admin API calls remain.** Every Admin call goes through `/admin/api/<ver>/graphql.json` (`server.js:452`, `services/shopify.service.js:13`). The only other Shopify endpoints hit are OAuth (`/admin/oauth/authorize`, `/admin/oauth/access_token`), which are not REST Admin API. Requirement 2.2.4 is satisfied.

---

## Blockers

### B1. Admin order-block extension targets an unsupported API version
- **Requirement:** Versioning policy: each version supported for at least 12 months; "Shopify CLI prevents deploys targeting versions older than 12 months." 2025-10 is not on the supported list. https://shopify.dev/docs/api/usage/versioning
- **Repo:** `extensions/lockerdrop-order-block/shopify.extension.toml:1` has `api_version = "2025-10"`; `extensions/lockerdrop-order-block/package.json` pins `@shopify/ui-extensions` `2025.10.15`.
- **Impact:** `shopify app deploy` (which bundles all extensions into one app version) should fail while this extension is in the app, so you cannot cut the release you submit.
- **Change:** Bump to `api_version = "2026-10"` and `@shopify/ui-extensions` `2026.10.x`, rebuild, re-test. Or remove the extension from the app until it renders (see B3).

### B2. Thank-you extension is a debug test build
- **Requirement:** 5.6.1 "Checkout extensions must be feature-complete"; 2.1.2 "Build apps without even minor errors." https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements
- **Repo:** `extensions/lockerdrop-thankyou/src/ThankYou.jsx:4-14` renders `<s-banner heading="LockerDrop test">If you can see this, the Thank You extension is mounting.</s-banner>`. The toml comment (`extensions/lockerdrop-thankyou/shopify.extension.toml:9-13`) says it is an isolation test with real targets removed.
- **Change:** Before deploying the submission version, either restore the real Thank You / Order Status blocks (with `network_access = true` if they fetch `app.lockerdrop.it`, which `OrderStatus.jsx` and `OrderIndex.jsx` do) or remove the extension from the app. Never ship the test banner to merchants.

### B3. UI extensions that do not render
- **Requirement:** 2.2.5 "Admin extensions must be feature-complete"; 5.6.1 for checkout extensions; pass-app-review: "The app must be complete and stable." https://shopify.dev/docs/apps/launch/app-store-review/pass-app-review
- **Repo:** `LAUNCH_CHECKLIST.md` P4-8: checkout, customer-account, and admin UI-extension blocks render blank (open Shopify support ticket, `docs/SHOPIFY_SUPPORT_TICKET.md`). Both the admin order block and the thank-you block are still configured.
- **Change:** If not resolved before submission, remove both UI extensions from the submitted app version (the core flow works without them per the checklist). A reviewer who places the block and sees nothing will flag it. Worth checking while debugging: the thank-you `uid = "lockerdrop-thankyou-block"` is a hand-written string, not a CLI-generated UID like the other two extensions.

### B4. Legacy non-expiring tokens are never migrated
- **Requirement:** 3.1.2 "Public apps must use expiring offline access tokens." Timeline: 2027-01-01 non-compliant apps are delisted and blocked from new installs; 2027-01-15 merchant warning; 2027-04-01 non-expiring tokens get HTTP 403. "January 1 is the migration deadline." https://shopify.dev/changelog/app-security-updates-october-2026
- **Repo:** New installs are compliant: `getAccessToken` sends `expiring: 1` (`server.js:8518-8526`), refresh tokens are stored and rotated (`server.js:8536-8590`), and a 15-minute refresh sweep runs (`server.js:9392-9393`). But `getValidAccessToken` passes legacy tokens through forever (`server.js:8600`, "legacy permanent token"), and there is no token-exchange migration anywhere (no `subject_token` / `token-exchange` in the codebase). Any store authorized before the `expiring: 1` change (migration 20260808) still holds a permanent token.
- **Change:** Add a one-shot startup job: for each `stores` row with `token_expires_at IS NULL`, POST to `/admin/oauth/access_token` with `grant_type=urn:ietf:params:oauth:grant-type:token-exchange`, `subject_token=<old token>`, `subject_token_type=urn:shopify:params:oauth:token-type:offline-access-token`, `requested_token_type=urn:shopify:params:oauth:token-type:offline-access-token`, `expiring=1`, then `storeShopTokens()`. The old token is invalidated, so persist the response first; a lost response can be replayed with the same old token within 7 days. Do this before 2027-01-01.

### B5. Submission materials have placeholders and contradict the code
- **Requirement:** 4.5.4 test credentials/instructions kept current; 4.2.1 accurate and complete pricing; 4.5.6 emergency contact. https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements
- **Repo:**
  - `docs/REVIEWER_INSTRUCTIONS.md:67` still says `**Contact:** [your support email]` (the policy already uses `support@lockerdrop.it`, `public/privacy-policy.html:292`).
  - `docs/APP_STORE_SUBMISSION.md` pricing reads "$X per completed locker order, capped at $Y/month."
  - Sim buttons: `docs/APP_STORE_SUBMISSION.md:129` and `LAUNCH_CHECKLIST.md:38-41` say Sim drop-off/pickup was **removed 2026-07-02**, but the code has them (`server.js:1457-1490`, `public/admin-dashboard.html:3840-3866`) and `docs/REVIEWER_INSTRUCTIONS.md:45-60` tells reviewers to use them. The reviewer doc matches the code; the other two are stale.
- **Change:** Fill in the contact; put the real pricing in the listing (see S6); update APP_STORE_SUBMISSION.md and LAUNCH_CHECKLIST.md so the only story is "Sim buttons on test orders / dev stores". Confirm the YouTube screencast (`https://youtu.be/L2CHKbwiMyo`) is Unlisted or Public and shows the real physical locker flow (4.5.3).

### B6. Harbor production (already tracked)
- **Requirement:** 2.1.1 / 2.1.4 and "app must be complete and stable." The listing promises live locker availability.
- **Repo:** `server.js:36` defaults `HARBOR_API_URL` to `https://api.sandbox.harborlockers.com`; S2-5 is blocked in `LAUNCH_CHECKLIST.md`.
- **Change:** No new action; it stays on the runway list. Decide which Harbor environment reviewers hit and say so in the testing instructions.

---

## Should-fix

### S1. Webhook and Admin API version `2025-10` is unsupported
- **Requirement:** Versioning page (above). Unsupported requests fall forward to the oldest supported version, so they are silently answered by 2026-01 today, and that version itself stops on 2027-01-16. Webhook payloads are versioned the same way.
- **Repo:** `shopify.app.toml:33` `[webhooks] api_version = "2025-10"`; `server.js:448` `SHOPIFY_API_VERSION = '2025-10'`; `services/shopify.service.js:7` `apiVersion = '2025-10'`. Shop-specific webhooks created by `registerWebhooks` (`server.js:6354-6358`) use the request's version, so they are also on 2025-10.
- **Change:** Move all three to `2026-10`, redeploy the app config, and regression-test the GraphQL queries (products/variants/inventoryItem measurement, fulfillmentOrders, carrierServiceCreate, appSubscriptionCreate, appUsageRecordCreate, currentAppInstallation). Optionally log the `X-Shopify-API-Version` response header so the next fall-forward is visible.

### S2. Deprecated GraphQL fields in use
- **Requirement:** `fulfillmentCreateV2` is "Deprecated. Use fulfillmentCreate instead" in 2026-10 (https://shopify.dev/docs/api/admin-graphql/latest/mutations/fulfillmentCreateV2; changelog https://shopify.dev/changelog/removing-v2-suffix-from-fulfillmentcreatev2-and-fulfillmenttrackinginfoupdatev2). `ShopPlan.displayName` is deprecated in favor of `publicDisplayName` (https://shopify.dev/changelog/adding-publicdisplayname-field-on-shopplan).
- **Repo:** `server.js:8773-8811` uses `fulfillmentCreateV2` / `FulfillmentV2Input`. `server.js:7952` queries `plan { displayName ... }`, and `isCarrierEligible` (`server.js:7973-7981`) string-matches it.
- **Change:** Rename to `fulfillmentCreate` (same input shape and behavior). Query `publicDisplayName` and match on it (plan names were standardized; "Shopify" became "Grow").

### S3. Install flow: no token exchange; fragile top-level redirect
- **Requirement:** 2.3.2 "Authenticate immediately after install" (no UI before OAuth); 2.3.3 redirect to the app UI; 2.3.4 OAuth immediately after reinstall. Embedded apps on managed installation should get the offline token via token exchange of the ID token. https://shopify.dev/docs/apps/build/authentication-authorization/app-installation
- **Repo:** Scopes are declared in `shopify.app.toml:27` (managed installation), but the app only implements the authorization-code grant (`server.js:838-970`). On first open, `/` serves the dashboard unconditionally when `shop` is present (`server.js:1299-1307`); the page then calls `/api/validate-token`, and if no token exists it runs `window.top.location.href = '/auth/reconnect?...'` (`public/admin-dashboard.html:5318-5373`). So the merchant sees UI before auth, and navigating `window.top` from a cross-origin iframe without user activation is blocked by modern browsers. On reinstall with a stale token row, the code shows a "click to reconnect" banner instead of re-authing automatically.
- **Change:** On the embedded load, verify the `id_token` (or `shopify.idToken()` on first API call) server-side and exchange it at `/admin/oauth/access_token` with `grant_type=urn:ietf:params:oauth:grant-type:token-exchange`, `subject_token_type=urn:ietf:params:oauth:token-type:id_token`, `requested_token_type=urn:shopify:params:oauth:token-type:offline-access-token`, `expiring=1`. Then run the existing post-install steps (webhooks, carrier, billing). This removes the redirect bounce and covers reinstall. If you keep the redirect fallback, use `window.open(url, '_top')` so App Bridge handles the top-level navigation.

### S4. No recovery when a refresh token is rejected
- **Requirement:** Expired/invalid refresh returns 401 and needs re-auth; the October 2026 changelog adds client-credentials access ("If an app loses a refresh token, its backend can request a new access token signed with the app's private key" without the merchant reopening the app). https://shopify.dev/changelog/app-security-updates-october-2026, https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant
- **Repo:** `refreshAccessToken` throws on 401 (`server.js:8577-8580`) and `getValidAccessToken` then returns the dead token (`server.js:8606-8608`). About 20 call sites read `access_token` straight from the DB or the `accessTokens` cache (for example the carrier callback, `server.js:9000-9006`), so a dead token fails silently in background work (webhooks, auto-fulfillment, usage charges, checkout rates).
- **Change:** On refresh 401, mark the store `needs_reauth` and alert; optionally implement the client-assertion (private-key) client-credentials grant as the backend recovery path (tokens up to 1 hour, no refresh token). Route all token reads through `getValidAccessToken`.

### S5. Billing test flag only for one hardcoded store
- **Requirement:** 1.2 / 1.2.2 billing free of errors and correctly implemented; pass-app-review: "set the Billing API `test` field to `true` during testing" and test plan approval. https://shopify.dev/docs/apps/launch/app-store-review/pass-app-review
- **Repo:** `server.js:3248` `DEV_STORES = ['enna-test.myshopify.com']`; `server.js:3338-3344` `test: isTestStore`. Every other store, including a reviewer's development store, gets `test: false`, yet `docs/REVIEWER_INSTRUCTIONS.md` tells reviewers "On a development store these are test charges." The code itself notes review stores "don't reliably report partnerDevelopment" (`server.js:1465`).
- **Change:** Set `test: true` when `partner_development` is true, or via an env allowlist you can add the reviewer store to, and verify subscription approval plus one usage record on a fresh dev store. Make sure the reviewer instructions match.

### S6. Billed amount does not match the locked pricing model
- **Requirement:** 4.2.1 "Provide accurate and complete pricing information"; 1.2.2.
- **Repo:** `server.js:3251-3258` bills a flat `perOrderFee: 1.50`, cap $200, 7-day trial; usage record uses `sub.per_order_fee` (around `server.js:3474`). `docs/PRICING_MODEL.md` (LOCKED 2026-08-08) says Harbor cost + $1 by size ($1.50 to $6.00), and flags that a flat fee loses money on Medium and up.
- **Change:** Pick one model, implement it (size-aware `appUsageRecordCreate` amount), update the subscription `terms` string to describe it, and make the listing pricing match exactly.

### S7. `customers/redact` is incomplete
- **Requirement:** Mandatory compliance webhooks must erase the customer's data (https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance); PCD Level 1: process only needed data, honor deletion.
- **Repo:** `server.js:6629-6672` redacts `orders` only. `locker_reservations` also stores `customer_email` and `customer_phone` (`migrations/20260504000000_baseline_schema.js:45-46`, written at `server.js:5080-5083`) and is not touched. The handler logs `customerEmail` (`server.js:6637`), putting PII into logs during an erasure request, and returns 200 on exceptions (`server.js:6670-6671`), so Shopify never retries a failed redaction.
- **Change:** Also redact `locker_reservations` (and any other PII table) by email and order IDs; drop the email from the log line; return 5xx on failure so Shopify retries. Same pattern for the 90-day retention job (`server.js:7356-7370`), which only purges `completed` orders (cancelled/expired PII is kept forever).

### S8. Privacy policy vs. data actually sent to Harbor
- **Requirement:** PCD Level 1 #2 and #3: tell merchants what you process and use it only as stated. https://shopify.dev/docs/apps/launch/protected-customer-data
- **Repo:** `public/privacy-policy.html:230` says Harbor "Does not receive customer email, name, address, or phone." The Harbor request payloads include `customer_name` (`server.js:2262`, `server.js:5658`, `server.js:5786`). Storefront theme blocks also send shopper ZIP codes to `api.zippopotam.us` and load OpenStreetMap tiles (`extensions/lockerdrop-theme/blocks/locker-finder.liquid:225,298`, `how-it-works-page.liquid:513,586`); neither is in the policy's processor list.
- **Change:** Remove `customer_name` from Harbor payloads (it is not needed to open a locker), or correct the policy. Add zippopotam.us and OpenStreetMap to the processors list, or geocode server-side.

### S9. Protected customer data level and fields
- **Requirement:** Name, address (including ZIP/geolocation), email, and phone are Level 2 and must each be requested individually; unapproved fields come back redacted in API and webhook payloads. Level 2 adds: encrypted backups, separate test and production data, DLP strategy, limited staff access, strong passwords, access log, incident policy. https://shopify.dev/docs/apps/launch/protected-customer-data
- **Repo:** `docs/APP_STORE_SUBMISSION.md:139` says "Level-1"; `docs/PROTECTED_CUSTOMER_DATA.md` correctly says Level 2 but leaves least-privilege, retention, and security contact unchecked; `LAUNCH_CHECKLIST.md:140` claims "Approved." Retention (90 days, `server.js:7352-7394`) and an access log (`auditCustomerDataAccess`, `server.js:8006`) already exist, so the PCD doc is behind the code. Test and production data share one database (dev stores install against prod).
- **Change:** In the Partner Dashboard, confirm the approval covers all four Level-2 fields (name, email, phone, shipping address). Fix the Level-1 wording. Complete the three open attestations, and document how test-store data is kept separate (or tagged and purged) to meet Level 2 #2.

### S10. Dead code with non-compliant patterns
- **Requirement:** 3.1.2 expiring tokens; pass-app-review recommends the AI self-review, which scans the codebase.
- **Repo:** `routes/auth.js` and `routes/carrier.js` are never mounted (no `require('./routes...')` in `server.js`). `routes/auth.js:82-88` exchanges the code with no `expiring` flag (non-expiring token). `services/shopify.service.js:36` registers the carrier at `/carrier/rates`, a route that no longer exists (live is `/carrier-service/rates`, `server.js:8939`).
- **Change:** Delete `routes/` and `services/shopify.service.js` so neither a reviewer nor the self-review tool flags them.

---

## Nice-to-have

- **N1. Other extension versions.** `extensions/lockerdrop-thankyou/shopify.extension.toml:1` is `2026-07` (supported until 2027-07-16), fine. `extensions/lockerdrop-theme/shopify.extension.toml:1` is `2026-01`, which expires 2027-01-16; theme app extensions generally ignore it, but bump to `2026-10` for consistency. Remove the stray `manifest 2.json` Finder copies in both UI extension folders.
- **N2. Navigation (BFS 4.1.4).** The dashboard uses a custom in-page sidebar (`public/admin-dashboard.html`, `.sidebar-nav-item`); there is no `s-app-nav` / `ui-nav-menu`. Not an App Store rule, but required for Built for Shopify. Moving primary nav to `<s-app-nav>` also gives the admin-native left nav.
- **N3. Session cookie.** `/admin/dashboard` still accepts an express-session cookie (`requireAuth`, `sameSite: 'none'`, `server.js:687-693`). APIs use session tokens correctly (`requireApiAuth`, `server.js:1542`), which satisfies 1.1.1; dropping the third-party cookie dependency entirely is cleaner.
- **N4. `[network_access]` and security check.** The October 2026 changelog adds a `[network_access]` section in `shopify.app.toml` declaring outbound and linked hosts (app.lockerdrop.it, Harbor, zippopotam.us, OSM tiles, unpkg) and recommends running `shopify app security check` before every release. Also consider the new Admin API IP allowlist (droplet IP).
- **N5. Unused app proxy.** `shopify.app.toml:43-46` configures `/apps/lockerdrop`, but nothing uses it; the theme blocks call `https://app.lockerdrop.it` directly. Either route storefront calls through the proxy (Shopify signs the request) or remove the config so reviewers do not ask.
- **N6. Carrier rate latency (BFS 2.3.1 / 5.4.1: p95 under 500 ms).** The `/carrier-service/rates` handler fetches a new Harbor OAuth token and calls Shopify GraphQL for product dimensions on every rate request (`server.js:9018`, `9062-9075`). Cache the Harbor token until expiry and cache dimensions per variant.
- **N7. Storefront weight (BFS 2.2.1).** Leaflet (about 150 KB JS+CSS) loads in the locker-finder blocks; fine as a merchant-placed block, but keep it off product/cart blocks. OSM's tile policy discourages heavy commercial use without your own tile provider.
- **N8. Shipping default (App Store 1.1.10).** LockerDrop rates must not make the default shipping option more expensive. Shopify sorts by price, so this holds as long as you do not suppress or reorder other rates; mention it in testing notes if asked.
- **N9. Webhooks as app-specific config.** Topics are registered per shop via `webhookSubscriptionCreate` at OAuth time (`server.js:6354-6380`). Declaring them under `[webhooks]` in `shopify.app.toml` makes them version-managed with the app and present even if the OAuth callback step fails (relevant once S3 moves to token exchange).

## Items checked and fine
- No REST Admin API usage (2.2.4).
- App Bridge loaded from `https://cdn.shopify.com/shopifycloud/app-bridge.js` as the first `<script>` in `<head>` with the `shopify-api-key` meta (`public/admin-dashboard.html:1549-1550`), meeting 2.2.3.
- API routes require a verified session token (`requireApiAuth`, `server.js:1542-1572`; order-block endpoint `server.js:1598-1615`), meeting 1.1.1.
- All three compliance webhooks are declared (`shopify.app.toml` `[webhooks.privacy_compliance]`) and HMAC-verified (`server.js:6460-6485`, timing-safe).
- Theme integration only via theme app extension blocks; no `write_themes`/Asset API scope, so 5.1.1 is met. Total extension size about 216 KB.
- Billing uses the GraphQL Billing API (`appSubscriptionCreate` with `appUsagePricingDetails`, `appUsageRecordCreate`), meeting 1.2.1.
- Scopes are minimal and justified in `shopify.app.toml` (3.2); no `read_all_orders`.
- Privacy policy is live at `/privacy` (`server.js:4397`) with a privacy contact.
