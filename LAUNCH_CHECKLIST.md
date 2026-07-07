# LockerDrop Launch Checklist

> **Last Updated:** 2026-05-02 (Restructured into sprints with verification column after independent security audit)
> **Sources:** Project Review | Harbor Checklist | Shopify App Store Requirements | 2026-05-02 Audit
> **Estimated Total:** 60–90 hours to launch-ready, plus submission cycle

---

## Summary

Launch-readiness is gated by **Sprint 1 (security & auth)**. Several items previously marked ✅ Done were rolled back after the 2026-05-02 audit found gaps that would fail Shopify App Store review — see Verification column for what counts as "done."

| Sprint | Goal | Items | Est. |
|--------|------|-------|------|
| **Sprint 1** | Security & auth (App Store reject blockers) | 8 | 20–30 hrs |
| **Sprint 2** | Code hygiene & Harbor production switch | 10 | 20–30 hrs |
| **Sprint 3** | App Store submission package | 7 | 15–20 hrs |
| **Phase 4** | Post-launch | 7 | 50–75 hrs |

---

## 2026-07-01 — QA session update (current launch status)

Full end-to-end QA against the dev-store matrix (basic / grow / advanced-ennanne + locker-plus, all Harbor **sandbox**).

**Fixed & deployed this session:**
- 🔴 Checkout locker picker returned **500 on every store** (`calculatePickupDate` crashed on Postgres text day-fields) — fixed (`deaf228`).
- 🔴 **Auto-fulfillment failed on every store** ("Access denied for fulfillmentOrders field") — app lacked `read/write_merchant_managed_fulfillment_orders`. Added scopes → deployed new app version → re-authorized all 4 stores → verified an order reaches **Fulfilled** (`5d8456e`, `854d238`).
- Require carrier-calculated shipping (Grow+ with CCS); **attempt-based** eligibility so Grow-with-add-on works (`34c3996`, see `docs/CCS_REQUIREMENT.md`).
- `processAppUninstall` made transactional (`1e0f136`); reconnect self-heal UX + locker "undefined" address + "null" customer name fixed (`8d32d76`, `aad7f50`).
- Reviewer **simulate drop-off/pickup** control, dev-store only, so App Store review can complete the physical steps (`854d238`).

**Verified end-to-end (sandbox):** checkout → order sync → locker assignment → drop-off → pickup → locker release → notifications → **Shopify fulfillment**.

**Remaining launch blockers:**
1. **S2-5 Harbor → production** + finalize per-order pricing with Harbor → set `USAGE_BILLING` → verify one live usage charge. (All above validated on sandbox only.)
2. **S1-6 remainder:** `SESSION_SECRET` rotated 2026-07-01 ✅; still rotate DB password, Shopify API secret, Twilio/Resend keys.
3. **Sprint 3 App Store submission** — draft materials in `docs/APP_STORE_SUBMISSION.md`; needs Protected Customer Data approval + demo video + reviewer creds. **Reviewer-testability now relies on the demo video** — the simulate control was removed 2026-07-02 (see below). Fallback if reviewers reject an un-testable flow: re-add the guarded `partner_development`-only simulate control.
4. One full cycle on a **real** (non-dev) store once Harbor prod is live.
5. ✅ **Demo/test features removed 2026-07-02 (customer-ready):**
   - `admin-dashboard.html` — removed the `DEMO_US_LOCKERS` block + its `loadLockers()` injection (nationwide screenshot map).
   - Removed the **Sim drop-off / Sim pickup** feature: buttons + `simulateStep()` in `admin-dashboard.html`, and `simulateLockerStep()` + `/api/simulate/*` endpoints in `server.js`.
   - Deleted the seeded demo data from the DB (advanced-ennanne): 6 demo orders (`shopify_order_id LIKE '9900%'`, incl. the `demo1042` placeholder drop-off link that errored at the Harbor demo) + 2 demo locker prefs (location_id 501/502). Verified 0 orders with `demo` links remain.

Distribution: app is already **public** (correct for App Store; can't be changed) — submit after blockers clear.

---

## Sprint 1 — Security & Auth (LAUNCH BLOCKERS)

> Shopify's automated review will reject the app on first submission until S1-1 lands. The other Sprint 1 items are real-world breach risks, not theoretical.

| ID | Task | Severity | Status | Verification | Notes / Refs |
|----|------|----------|--------|--------------|--------------|
| S1-1 | Webhook HMAC verification on **all** `/webhooks/*` handlers (was #1, #38) | 🔴 CRITICAL | ✅ Done | Verified 2026-05-02: forged POST → 401, signed POST → 200 against `/webhooks/app/uninstalled`. Same middleware applied to all 8 webhook routes. | `verifyShopifyWebhook` middleware at `server.js:5904-5930`. Raw body captured via `express.json({verify})` callback. Constant-time compare via `crypto.timingSafeEqual`. |
| S1-2 | Replace `requireApiAuth` with strict Shopify session-token (JWT) validation on every `/api/*` route (NEW) | 🔴 CRITICAL | ✅ Done | Verified 2026-05-02: `/api/branding/:shop` returns 401 for missing/bad-signature/wrong-shop tokens, 400 for malformed shop, 200/handler-runs for valid token. | `verifyShopifySessionToken` + new `requireApiAuth` at `server.js:1234-1297`. No new deps — HS256 verified via `crypto.createHmac`. Dashboard frontend reordered to capture App-Bridge-patched `fetch` so existing `__nativeFetch` sites auto-send tokens. Dashboard route injects `SHOPIFY_API_KEY` into meta tag at serve time. Note: existing routes still need `requireApiAuth` *applied* — that's S1-4's job. |
| S1-3 | Per-order signed token on customer-facing public endpoints (NEW) | 🔴 CRITICAL | ✅ Done | Verified 2026-05-02: `/api/dropoff-complete`, `/api/pickup-complete`, `/api/retry-link/:orderNumber` all return 401 without `t=`. Tokens generated via `signOrderToken()` and verified by `requireOrderToken` middleware. | Helpers and middleware at `server.js:1306-1346`. All 8 `returnUrl: ...{dropoff,pickup}-success?...` sites in server.js append `&t=${signOrderToken(orderNumber)}`. `dropoff-success.html` + `pickup-success.html` read `t` from URL params and forward in API bodies / `/api/retry-link` query. |
| S1-4 | Lock down `GET /api/orders/:shop` (NEW) | 🔴 CRITICAL | ✅ Done | Verified 2026-05-02: `/api/orders/test.myshopify.com` returns 401 with no bearer, 401 with bogus bearer. Same protection added to 25 other admin endpoints (validate-token, check-scopes, store-location, sync-orders, lockers, order/*/status, order/*/cancel-locker, subscription, settings GET, subscribe, billing/retry, shop-plan, products, product-sizes, stats, locker-preferences GET+POST, locker-availability, manual-order, generate-dropoff-link, generate-pickup-link, branding/logo DELETE, etc). | `requireApiAuth` chained before existing `auditCustomerDataAccess` on `/api/orders/:shop`. 35 total routes now protected. Public routes intentionally left open: `/api/branding/:shop` GET (read-only brand assets used by customer pages), `/api/upsell-products/:shop` GET (checkout extension), `/api/available-pickup-dates/:shop`, `/api/update-pickup-date/:shop/:orderNumber` (latter two will be gated by S1-3 signed tokens). |
| S1-5 | Restrict CORS to Shopify domains for `/api/*` (NEW) | 🟡 HIGH | ✅ Done | Verified 2026-05-02: `OPTIONS /api/orders/:shop` from `https://evil.com` returns no `Access-Control-Allow-Origin`; from `https://test.myshopify.com` returns the same origin. | Updated CORS middleware splits public-API allowlist (kept `*`) from admin-API (only `*.myshopify.com` + `admin.shopify.com`). Public-API list at `server.js:380-396`. |
| S1-6 | Rotate `SESSION_SECRET` and other live secrets (NEW) | 🔴 CRITICAL | 🟠 Partial | ✅ `SESSION_SECRET` rotated to a 32-byte random value 2026-07-01 (old sessions/order-links invalidated). ⬜ Still rotate: Twilio, Resend, DB password, Shopify API secret. | Old value `lockerdrop-super-secret-key-2024` was guessable and signed customer order-link tokens — now replaced. |
| S1-7 | Apply rate limiting to remaining sensitive endpoints (was #13) | 🟡 HIGH | ✅ Done | Verified 2026-05-02: 70 parallel hits on `/api/orders/:shop` → 60 × 401 + 10 × 429. Same baseline now covers all `/api/*` paths. | New `apiLimiter` (60/min) applied at `app.use('/api/', apiLimiter)`. Stricter public/checkout limiters still stack on top for those paths. |
| S1-8 | Strict shop-domain validation everywhere `req.params.shop` is used (NEW) | 🟡 HIGH | ✅ Done | Verified 2026-05-02: `requireApiAuth` returns 400 for shops not matching `^[a-z0-9][a-z0-9-]*\.myshopify\.com$`. | `isValidShopDomain()` helper added at `server.js:1234`. Used inside `requireApiAuth`. Other routes that take `:shop` param will inherit when S1-4 wires `requireApiAuth` to them. |

---

## Sprint 2 — Code Hygiene & Harbor Production Switch

> Real bugs to fix before going live, plus the Harbor sandbox→prod swap. Most of this is mechanical; do it after Sprint 1.

| ID | Task | Severity | Status | Verification | Notes / Refs |
|----|------|----------|--------|--------------|--------------|
| S2-1 | Delete dev junk from public surface (NEW) | 🟡 HIGH | ✅ Done | Verified 2026-05-02: `/hoa_financial_dashboard.html` and `/test-dashboard.html` return 404 on prod. `disabled-extensions/` and `services/harbor.services.js` removed (latter confirmed unreferenced). | Removed: `public/hoa_*.html`, `public/test-dashboard.html`, repo-root `hoa_*`, `disabled-extensions/`, `services/harbor.services.js`, duplicate `ca-certificate (1).crt`. Kept `lockerdrop-pricing-strategies.jsx` since it's referenced from docs (and not publicly served). |
| S2-2 | Strip frontend `console.log`s from `public/admin-dashboard.html` (was #16) | 🟡 HIGH | ✅ Done | Verified 2026-05-02: `grep -c '^[[:space:]]*console\.log' public/admin-dashboard.html` returns 0. | All 6 remaining `console.log` calls commented out (CSV import, App Bridge load status, store-location fetch). `console.error` calls preserved for real failure signals. |
| S2-3 | Remove Google Tag Manager from embedded admin (NEW) | 🟡 HIGH | ✅ Done | Verified 2026-05-02: served HTML at `/?shop=…&host=…` no longer contains `googletagmanager.com` or `gtag(`. | Removed the `<script async src="https://www.googletagmanager.com/gtag/js?id=G-9V5MYQXT0E">` tag and the dataLayer/gtag init block from the head of `admin-dashboard.html`. |
| S2-4 | Replace hardcoded `sandbox.harborlockers.com` URLs with `HARBOR_API_URL` / `HARBOR_ACCOUNTS_URL` env vars (was #2 + #32) | 🔴 CRITICAL | ✅ Done | Verified 2026-05-02: 24 + 31 = 55 hardcoded URLs replaced with `${HARBOR_ACCOUNTS_URL}` / `${HARBOR_API_URL}` interpolations. Constants declared at `server.js:24-29` with sandbox URLs as fallback. Server boots clean on Droplet, no errors. Default behavior byte-identical until env vars are explicitly changed. | To switch to prod: set `HARBOR_API_URL=https://api.harborlockers.com` and `HARBOR_ACCOUNTS_URL=https://accounts.harborlockers.com` in `.env`, restart pm2. That's S2-5. |
| S2-5 | Switch to Harbor production credentials (was #2) | 🔴 CRITICAL | 🚫 Blocked | E2E: real test order in a Shopify dev store flows through to a real Harbor production locker reservation. | Blocked on requesting prod keys from Harbor. Owner is "not ready for #2" — defer this row until ready. |
| S2-6 | Fix `EXTRACT(HOURS FROM ...)` bug in stuck-order alert (was #10) | 🟡 HIGH | ✅ Done | Replaced both occurrences with `EXTRACT(EPOCH FROM …) / 3600`. A 25-hour stuck order will now report 25h instead of 1h. | `server.js:7051, 7063`. |
| S2-7 | Migrate `/api/check-scopes/:shop` to GraphQL (was #5) | 🟢 MEDIUM | ✅ Done | Endpoint now uses GraphQL `currentAppInstallation { accessScopes { handle } }` via existing `shopifyGraphQL` helper. Same response shape (`grantedScopes`, `missingScopes`). | `server.js:683-693`. |
| S2-8 | Wrap `processNewOrder` in a DB transaction (NEW) | 🟡 HIGH | ✅ Done | The reservation→order path uses `pool.connect()` + `BEGIN/COMMIT/ROLLBACK`. A crash between marking the reservation `used` and inserting the order now rolls back both, so reservations aren't burned without an order record. | `server.js:6557-6612`. Billing charge stays outside the transaction (idempotent by order id; failure there doesn't lose data). |
| S2-9 | Sanitize logo uploads, disallow SVG (NEW) | 🟡 HIGH | ✅ Done | SVG removed from allowed mimetypes/extensions. Added `verifyImageMagicBytes()` that reads first 12 bytes after upload and confirms a real JPEG/PNG/GIF/WebP signature; spoofed files are deleted before any URL is exposed. | `server.js:37-79, 7378-7385`. |
| S2-10 | Encrypt Shopify access tokens at rest (was #30) | 🟡 HIGH | ✅ Done | Verified 2026-05-02: DB rows show `enc:v1:...` ciphertext (95 chars vs ~38 plaintext). Read path via wrapped `db.query` auto-decrypts. Migration encrypted 2 legacy plaintext tokens at startup. | AES-256-GCM with `TOKEN_ENCRYPTION_KEY` (32-byte hex) env var. Format: `enc:v1:<base64(iv\|tag\|ct)>`. `db.js` exposes `encryptToken`, `decryptToken`, `migrateAccessTokensToEncrypted`. Single OAuth-callback INSERT site explicitly encrypts; all read sites work transparently via the query wrapper. **Operational note:** loss of `TOKEN_ENCRYPTION_KEY` = lockout for installed shops. |

---

## Sprint 3 — App Store Submission Package

> Do these once Sprint 1 + 2 are clean. The submission package itself doesn't depend on the code fixes, but submitting before Sprint 1 lands wastes a review cycle.

| ID | Task | Severity | Status | Verification | Notes / Refs |
|----|------|----------|--------|--------------|--------------|
| S3-1 | Demo screencast video (was #20) | 🟡 HIGH | ⬜ Not Started | Video uploaded to Partner Dashboard, shows install → checkout → dropoff → pickup → uninstall in English. | Shopify req 4.5.3. |
| S3-2 | Test credentials for Shopify reviewer (was #21) | 🟡 HIGH | ⬜ Not Started | Reviewer can install on a fresh dev store and reach all paid features without contacting you. | Shopify req 4.5.4. |
| S3-3 | App Store listing content (was #22) | 🟡 HIGH | ⬜ Not Started | Name, subtitle, description, screenshots uploaded; no pricing in screenshots; no unsubstantiated stats. | Shopify req 4.4. |
| S3-4 | Theme extension deep links + setup instructions (was #26) | 🟢 MEDIUM | ✅ Done | One-click installer panel added to Learn tab with a button per block (product-pickup-badge, cart-pickup-reminder, locker-finder, how-it-works, how-it-works-page, promo-banner). Each opens `https://{shop}/admin/themes/current/editor?context=apps&template={t}&activateAppId={uuid}/{handle}`. | `admin-dashboard.html` Learn tab + `renderThemeBlockInstaller()`. |
| S3-5 | Verify checkout extension on mobile + desktop (was #27) | 🟢 MEDIUM | 🔧 Needs Work | Locker selector renders correctly on iOS Safari, Android Chrome, and desktop. Selection persists into the order. | Shopify req 5.6.1. |
| S3-6 | Scope review — trim unjustified scopes (was #28) | 🟢 MEDIUM | ✅ Done | 10 → 6 scopes. Dropped: `write_products` (no product writes in code), `read_shipping` (covered by `write_shipping`), `read_checkouts` + `write_checkouts` (unused; checkout extensions don't need them). Per-scope justification comments added in `shopify.app.toml`. `SHOPIFY_SCOPES` env var is now the single source of truth — server.js falls back to the same value. | Shopify req 3.2. **Operational:** before submitting, update the scope list in Partner Dashboard to match. Existing installs need re-authorization to honor narrower scopes. |
| S3-7 | Privacy policy lists third-party processors (NEW) | 🟡 HIGH | ✅ Done | `public/privacy-policy.html` Section 3 now names Shopify, Harbor Lockers, Twilio, Resend, and DigitalOcean with what data each receives and a link to each provider's privacy policy. | |

---

## Phase 4 — Post-Launch

| ID | Task | Severity | Notes |
|----|------|----------|-------|
| P4-1 | Refactor `server.js` into modular route files (was #29) | 🟢 MEDIUM | 8500 lines. Maintainability, not launch-blocking. |
| P4-2 | Adopt a real DB migration system (NEW) | 🟢 MEDIUM | ✅ Done 2026-05-04. `node-pg-migrate` v8 wired in. Baseline migration `migrations/20260504000000_baseline_schema.js` captures all prior schema (idempotent — safe to apply against the populated prod DB). Server startup now calls `runMigrations()` from `migrations.js` instead of 11 separate `ensure*`/`init*` helpers (deleted). Future schema changes: `npm run migrate:create -- <name>`. |
| P4-3 | Add automated tests (was #33) | 🔵 LOW | Critical paths first: webhook HMAC, OAuth, order lifecycle. |
| P4-4 | CI/CD via GitHub Actions (was #34) | 🔵 LOW | Auto-deploy to Droplet on `main` push. |
| P4-5 | Returns via locker (was #35) | 🔵 LOW | Future feature. |
| P4-6 | Multi-package orders (was #36) | 🔵 LOW | Future feature. |
| P4-7 | Tiered subscription pricing (was #37) | 🔵 LOW | After 10+ merchants prove PMF. |

**Removed from list:** #31 (CSRF). Once S1-2 lands real JWT auth, the JWT itself is the proof-of-origin and a separate CSRF layer is redundant.

---

## Verified ✅ Done (no rework needed)

These items were spot-checked in the audit and hold up:

| # | Task | Verified |
|---|------|----------|
| 3 | Hardcoded locker ID 329 removed | Confirmed — sync extracts from shipping lines/attributes. |
| 4 | `connect-pg-simple` session store | Sessions in `user_sessions` table, survives restart. |
| 6 | App Bridge loaded | CDN script tag present, auto-init in admin. |
| 7 | Embedded experience | `embedded = true`, dashboard redirects when accessed directly. |
| 8 | DB CA cert loaded | `DB_CA_CERT=./ca-certificate.crt` working in `db.js`. |
| 9 | Harbor responsibility clarified | Harbor reply on file, scopes Sprint 2 work. |
| 11 | Locker size change flow | `dropoff-success.html` + dashboard order modal — note: depends on S1-3 token gating to be safe. |
| 12 | Retry/troubleshooting on success pages | UI present — same caveat as #11. |
| 14 | Locker expiry cron | Wired and runs; consider wrapping the release loop in a transaction. |
| 15 | `orders/updated` webhook | Handler logic correct — fix HMAC in S1-1. |
| 17 | Frontend error tracking | `/api/errors` works — add rate limit (S1-7). |
| 18 | Usage-based billing | Wired correctly; vulnerability is upstream HMAC gap (S1-1). |
| 19 | Billing approval without reinstall | `/api/billing/retry/:shop`, `/api/subscribe/:shop` work. |
| 23 | Geographic requirement | US-only declared. |
| 24 | App icon | 1200×1200 uploaded. |
| 25 | Emergency dev contact | In Partner Dashboard. |
| 39 | Protected customer data access | Approved in Partner Dashboard. |
| 40 | App capabilities (shipping/fulfillment) | Selected. |

---

## Pricing Strategy

> **Launch Model (Strategy 1):** Pure Per-Order Fee — $1.50/order via Shopify usage-based billing. $200/mo cap, 7-day trial.
> **Future Options:** See `lockerdrop-pricing-strategies.jsx` for full analysis of 5 strategies.

---

## Status Legend

| Icon | Meaning |
|------|---------|
| ⬜ Not Started | Work has not begun |
| 🔧 Needs Work | Partially implemented or rolled back from ✅ Done after audit |
| 🚫 Blocked | Waiting on external dependency |
| ⏳ Waiting | Action taken, awaiting response |
| ✅ Done | Completed AND verified per Verification column |

---

## Recommended Execution Order

1. **Now:** S1-1 (webhook HMAC). Single biggest unlock — fixes the App Store reject blocker and gives you the raw-body capture pattern for everything else.
2. **Next:** S1-2 (real JWT auth) and S1-4 (lock down `/api/orders`) together — same change set.
3. **Then:** S1-3 (per-order tokens), S1-5/7/8 (CORS, rate limits, shop validation), S1-6 (rotate secrets).
4. **Sprint 2:** S2-1 (delete junk) is fast — do it early. S2-4 (Harbor URLs to env vars) when ready. Other S2 items can interleave.
5. **Sprint 3:** Submission package once code is clean.
6. **Phase 4:** While Shopify reviews.

---

*Maintained by Claude Code. Update Status + Verification when items land. The Verification column is the contract — don't mark ✅ Done without meeting it.*
