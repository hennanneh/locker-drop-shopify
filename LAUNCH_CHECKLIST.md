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

## Sprint 1 — Security & Auth (LAUNCH BLOCKERS)

> Shopify's automated review will reject the app on first submission until S1-1 lands. The other Sprint 1 items are real-world breach risks, not theoretical.

| ID | Task | Severity | Status | Verification | Notes / Refs |
|----|------|----------|--------|--------------|--------------|
| S1-1 | Webhook HMAC verification on **all** `/webhooks/*` handlers (was #1, #38) | 🔴 CRITICAL | ✅ Done | Verified 2026-05-02: forged POST → 401, signed POST → 200 against `/webhooks/app/uninstalled`. Same middleware applied to all 8 webhook routes. | `verifyShopifyWebhook` middleware at `server.js:5904-5930`. Raw body captured via `express.json({verify})` callback. Constant-time compare via `crypto.timingSafeEqual`. |
| S1-2 | Replace `requireApiAuth` with strict Shopify session-token (JWT) validation on every `/api/*` route (NEW) | 🔴 CRITICAL | ✅ Done | Verified 2026-05-02: `/api/branding/:shop` returns 401 for missing/bad-signature/wrong-shop tokens, 400 for malformed shop, 200/handler-runs for valid token. | `verifyShopifySessionToken` + new `requireApiAuth` at `server.js:1234-1297`. No new deps — HS256 verified via `crypto.createHmac`. Dashboard frontend reordered to capture App-Bridge-patched `fetch` so existing `__nativeFetch` sites auto-send tokens. Dashboard route injects `SHOPIFY_API_KEY` into meta tag at serve time. Note: existing routes still need `requireApiAuth` *applied* — that's S1-4's job. |
| S1-3 | Per-order signed token on customer-facing public endpoints (NEW) | 🔴 CRITICAL | ⬜ Not Started | `GET /api/retry-link/:orderNumber` and `POST /api/dropoff-{complete,change-size,doesnt-fit}` and `POST /api/pickup-complete` reject without a valid HMAC-signed `?t=` token. Existing token pattern at `server.js:2447, 2759, 3328` is the model. | Order numbers are guessable/scrapable; today an attacker with an order number can pick up someone's package. |
| S1-4 | Lock down `GET /api/orders/:shop` (NEW) | 🔴 CRITICAL | ✅ Done | Verified 2026-05-02: `/api/orders/test.myshopify.com` returns 401 with no bearer, 401 with bogus bearer. Same protection added to 25 other admin endpoints (validate-token, check-scopes, store-location, sync-orders, lockers, order/*/status, order/*/cancel-locker, subscription, settings GET, subscribe, billing/retry, shop-plan, products, product-sizes, stats, locker-preferences GET+POST, locker-availability, manual-order, generate-dropoff-link, generate-pickup-link, branding/logo DELETE, etc). | `requireApiAuth` chained before existing `auditCustomerDataAccess` on `/api/orders/:shop`. 35 total routes now protected. Public routes intentionally left open: `/api/branding/:shop` GET (read-only brand assets used by customer pages), `/api/upsell-products/:shop` GET (checkout extension), `/api/available-pickup-dates/:shop`, `/api/update-pickup-date/:shop/:orderNumber` (latter two will be gated by S1-3 signed tokens). |
| S1-5 | Restrict CORS to Shopify domains for `/api/*` (NEW) | 🟡 HIGH | ✅ Done | Verified 2026-05-02: `OPTIONS /api/orders/:shop` from `https://evil.com` returns no `Access-Control-Allow-Origin`; from `https://test.myshopify.com` returns the same origin. | Updated CORS middleware splits public-API allowlist (kept `*`) from admin-API (only `*.myshopify.com` + `admin.shopify.com`). Public-API list at `server.js:380-396`. |
| S1-6 | Rotate `SESSION_SECRET` and other live secrets (NEW) | 🔴 CRITICAL | ⬜ Not Started | New `.env` has `SESSION_SECRET` ≥ 32 random bytes (`openssl rand -hex 32`). Twilio, Resend, DB password, Shopify API secret all rotated. Old sessions invalidated. | Current value `lockerdrop-super-secret-key-2024` is trivially guessable and used to sign customer order-link tokens. Treat as already compromised. |
| S1-7 | Apply rate limiting to remaining sensitive endpoints (was #13) | 🟡 HIGH | ✅ Done | Verified 2026-05-02: 70 parallel hits on `/api/orders/:shop` → 60 × 401 + 10 × 429. Same baseline now covers all `/api/*` paths. | New `apiLimiter` (60/min) applied at `app.use('/api/', apiLimiter)`. Stricter public/checkout limiters still stack on top for those paths. |
| S1-8 | Strict shop-domain validation everywhere `req.params.shop` is used (NEW) | 🟡 HIGH | ✅ Done | Verified 2026-05-02: `requireApiAuth` returns 400 for shops not matching `^[a-z0-9][a-z0-9-]*\.myshopify\.com$`. | `isValidShopDomain()` helper added at `server.js:1234`. Used inside `requireApiAuth`. Other routes that take `:shop` param will inherit when S1-4 wires `requireApiAuth` to them. |

---

## Sprint 2 — Code Hygiene & Harbor Production Switch

> Real bugs to fix before going live, plus the Harbor sandbox→prod swap. Most of this is mechanical; do it after Sprint 1.

| ID | Task | Severity | Status | Verification | Notes / Refs |
|----|------|----------|--------|--------------|--------------|
| S2-1 | Delete dev junk from public surface (NEW) | 🟡 HIGH | ⬜ Not Started | `https://app.lockerdrop.it/hoa_financial_dashboard.html` returns 404. `test-dashboard.html` returns 404. `disabled-extensions/` removed from repo. `services/harbor.services.js` either wired up or deleted. | Files: `public/hoa_*.html`, `public/test-dashboard.html` (has `alert()` on load), repo-root `hoa_*`, `lockerdrop-pricing-strategies.jsx`. Embarrassing if a Shopify reviewer hits these. |
| S2-2 | Strip frontend `console.log`s from `public/admin-dashboard.html` (was #16) | 🟡 HIGH | 🔧 Needs Work | `grep -c 'console\.log' public/admin-dashboard.html` returns 0 (or only inside a build-stripped dev guard). | Server-side migration to pino is real; frontend wasn't covered. ~30 calls leak shop/order data to browser console. |
| S2-3 | Remove Google Tag Manager from embedded admin (NEW) | 🟡 HIGH | ⬜ Not Started | `admin-dashboard.html:5` no longer loads `googletagmanager.com`. CSP for embedded apps clean. | Loading GTM inside the Shopify Admin iframe is a CSP and reviewer red flag. |
| S2-4 | Replace hardcoded `sandbox.harborlockers.com` URLs with `HARBOR_API_URL` / `HARBOR_ACCOUNTS_URL` env vars (was #2 + #32) | 🔴 CRITICAL | ⬜ Not Started | `grep -c 'sandbox.harborlockers.com' server.js routes/ services/` returns 0. App boots and works against sandbox URL set via env var. | ~53 occurrences in `server.js`. Prerequisite for the credential swap. Can be done before prod keys arrive. |
| S2-5 | Switch to Harbor production credentials (was #2) | 🔴 CRITICAL | 🚫 Blocked | E2E: real test order in a Shopify dev store flows through to a real Harbor production locker reservation. | Blocked on requesting prod keys from Harbor. Owner is "not ready for #2" — defer this row until ready. |
| S2-6 | Fix `EXTRACT(HOURS FROM ...)` bug in stuck-order alert (was #10) | 🟡 HIGH | 🔧 Needs Work | Manually create a stuck order >24h old; alert email shows correct total hours (e.g. `25h`), not `1h`. | `server.js:6968`. Use `EXTRACT(EPOCH FROM ...) / 3600`. |
| S2-7 | Migrate `/api/check-scopes/:shop` to GraphQL (was #5) | 🟢 MEDIUM | 🔧 Needs Work | Endpoint returns same shape but uses GraphQL `currentAppInstallation.accessScopes` instead of REST `access_scopes.json`. | `server.js:637`. Last REST holdout outside the OAuth flow. |
| S2-8 | Wrap `processNewOrder` in a DB transaction (NEW) | 🟡 HIGH | ⬜ Not Started | Killing the server between locker-mark-used and order-insert leaves DB in consistent state (no orphaned reservations). | `server.js:6388-6437`. Use `pool.connect()` + `BEGIN`/`COMMIT`/`ROLLBACK`. |
| S2-9 | Sanitize logo uploads, disallow SVG (NEW) | 🟡 HIGH | ⬜ Not Started | Uploading a malicious SVG via the branding form is rejected at upload time. Magic-byte check, not just `mimetype`. | `server.js:37-48, 7162`. SVGs can carry XSS payloads served from your domain. |
| S2-10 | Encrypt Shopify access tokens at rest (was #30) | 🟡 HIGH | ⬜ Not Started | `stores.access_token` column stores ciphertext (e.g. AES-GCM with key from env), and a SQL dump leak doesn't yield usable Shopify tokens. | Promoted from Medium — combined with the SSL-fallback in `db.js:33`, plaintext tokens are too much exposure. |

---

## Sprint 3 — App Store Submission Package

> Do these once Sprint 1 + 2 are clean. The submission package itself doesn't depend on the code fixes, but submitting before Sprint 1 lands wastes a review cycle.

| ID | Task | Severity | Status | Verification | Notes / Refs |
|----|------|----------|--------|--------------|--------------|
| S3-1 | Demo screencast video (was #20) | 🟡 HIGH | ⬜ Not Started | Video uploaded to Partner Dashboard, shows install → checkout → dropoff → pickup → uninstall in English. | Shopify req 4.5.3. |
| S3-2 | Test credentials for Shopify reviewer (was #21) | 🟡 HIGH | ⬜ Not Started | Reviewer can install on a fresh dev store and reach all paid features without contacting you. | Shopify req 4.5.4. |
| S3-3 | App Store listing content (was #22) | 🟡 HIGH | ⬜ Not Started | Name, subtitle, description, screenshots uploaded; no pricing in screenshots; no unsubstantiated stats. | Shopify req 4.4. |
| S3-4 | Theme extension deep links + setup instructions (was #26) | 🟢 MEDIUM | 🔧 Needs Work | A merchant clicking the deep link from your dashboard lands on the theme editor with the LockerDrop block ready to add. | Shopify req 5.1.3. |
| S3-5 | Verify checkout extension on mobile + desktop (was #27) | 🟢 MEDIUM | 🔧 Needs Work | Locker selector renders correctly on iOS Safari, Android Chrome, and desktop. Selection persists into the order. | Shopify req 5.6.1. |
| S3-6 | Scope review — trim unjustified scopes (was #28) | 🟢 MEDIUM | 🔧 Needs Work | Each scope in `shopify.app.toml` has a written one-line justification. `read_checkouts`/`write_checkouts` justified or removed. | Shopify req 3.2. Note: `.env` `SHOPIFY_SCOPES` and `shopify.app.toml` scopes don't match — pick one source of truth. |
| S3-7 | Privacy policy lists third-party processors (NEW) | 🟡 HIGH | ⬜ Not Started | `public/privacy-policy.html` names Harbor Lockers, Twilio, Resend, DigitalOcean, Shopify and what data each receives. | Shopify reviewers check this. |

---

## Phase 4 — Post-Launch

| ID | Task | Severity | Notes |
|----|------|----------|-------|
| P4-1 | Refactor `server.js` into modular route files (was #29) | 🟢 MEDIUM | 8500 lines. Maintainability, not launch-blocking. |
| P4-2 | Adopt a real DB migration system (NEW) | 🟢 MEDIUM | Replace the scattered `ensureXColumn()` patterns in `server.js:8520-8543`. Pick `node-pg-migrate` or similar. First post-launch schema change will be scary without this. |
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
