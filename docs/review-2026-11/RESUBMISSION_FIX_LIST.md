# LockerDrop resubmission fix list (2026-11-12)

Combined from three reviews of commit `ab366d1` (what's live on app.lockerdrop.it):
- `review-static.md`: code + security review
- `review-appstore.md`: current App Store requirements check (with shopify.dev citations)
- `review-qa.md`: anonymous live checks against prod

Context: review 96154 has been **paused since Aug 20** (rule 2.1.1: missing Sim buttons, no order email, regenerate drop-off link errored). The Sep 28 fixes (`e39eaf4`) are deployed but **were never resubmitted**.

## Verified facts
- Prod runs `ab366d1`; migration `20260928000000_add_order_test_and_confirmation` applied 2026-09-29.
- Prod `HARBOR_API_URL` is **production** Harbor (the App Store review's "still on sandbox" item is wrong), so the test-order regenerate guard is active.
- All unauthenticated `/api/*` endpoints return 401; all webhooks without valid HMAC return 401; public/storefront endpoints return 200.
- No REST Admin API calls: everything is GraphQL (req 2.2.4 met).
- Personally re-verified: H2 (no shop filter), H4 (unescaped innerHTML), order-block on 2025-10, debug banner in ThankYou.jsx.
- **Not tested yet:** the reviewer's path clicked in a real browser (Orders tab Sim buttons, regenerate, email arrival).

## Tier 1: fix before resubmitting

| # | Item | Where | Source |
|---|---|---|---|
| 1 | Order-block extension pinned to unsupported `2025-10`; CLI won't deploy it. Bump to `2026-10`. | `extensions/lockerdrop-order-block/shopify.extension.toml` | App Store B1 |
| 2 | Thank-you extension is a debug build ("If you can see this, the Thank You extension is mounting"). Replace or remove. | `extensions/lockerdrop-thankyou/src/ThankYou.jsx:9` | App Store B2 |
| 3 | Admin/checkout UI extensions don't render (LAUNCH_CHECKLIST P4-8). Fix, or leave them out of the submitted version. | extensions | App Store B3 |
| 4 | Sim drop-off fetches a Harbor token before checking "simulated", so a Harbor auth hiccup 500s the reviewer's Sim button. Check simulated first. | `server.js:~2784` `/api/dropoff-complete` | Static H1 |
| 5 | Cross-tenant: order update/cancel webhooks look up `shopify_order_id OR order_number` with **no shop filter**. Every shop starts at #1001, so one shop's webhook can cancel another's order and release its locker. | `server.js:~6828, ~6896` | Static H2 |
| 6 | Stored XSS: Orders table interpolates `customerName`, `lockerName`, `pickupLink` into innerHTML unescaped. | `public/admin-dashboard.html:3833-3836` | Static H4 |
| 7 | `/api/billing/confirm` unauthenticated: anyone can flip a shop's subscription status; unvalidated `shop` is an open redirect. | `server.js` billing confirm | Static M5 |
| 8 | Billing: `test: true` only for `enna-test`, so the reviewer's dev store gets a real (blocked) charge. Billed flat $1.50 vs. size-aware $1.50-$6.00 in PRICING_MODEL.md; listing must match what ships. | billing code | App Store S5, S6 |
| 9 | GDPR `customers/redact` / `shop/redact` skip `locker_reservations` (email, phone) and `audit_log`, log the customer email, and return 200 on failure. | GDPR handlers | Static M6, App Store S7 |
| 10 | Privacy policy says Harbor gets no customer name, but `customer_name` is sent (`server.js:2262, 5658, 5786`); zippopotam.us and OpenStreetMap aren't disclosed. | privacy page | App Store S8 |
| 11 | Protected customer data docs disagree (Level 1 vs 2). Must be Level 2 with name/email/phone/address; 3 attestations open. | `docs/PROTECTED_CUSTOMER_DATA.md` | App Store S9 |
| 12 | Submission docs: `[your support email]` placeholder, listing pricing "$X / $Y", and two docs still say the Sim buttons were removed. | `REVIEWER_INSTRUCTIONS.md:67`, `APP_STORE_SUBMISSION.md`, `LAUNCH_CHECKLIST.md` | App Store B5, QA |
| 13 | Click through the reviewer path on a dev store (test order, Sim drop-off/pickup, regenerate, email) after the fixes deploy. | browser | QA |

## Tier 2: before Jan 1, 2027 (token deadline; delisting + blocked installs)

| # | Item | Source |
|---|---|---|
| 14 | 6 legacy non-expiring tokens are never migrated. Send shops with `token_expires_at IS NULL` through `/auth/reconnect` (already requests expiring tokens), or do a token exchange. | Static M3, App Store B4 |
| 15 | Refresh robustness: `getValidAccessToken` has no callers (~35 sites read tokens directly); no 401 retry in `shopifyGraphQL`; sweep margin near zero (15-min threshold on 15-min cadence); dead refresh token only logged. Needs single-flight per shop since refresh tokens rotate. OAuth callback swallows a failed token save (`server.js:905`). | Static H3, App Store S4 |
| 16 | Bump webhooks + hardcoded Admin version from `2025-10` to `2026-10` (Shopify silently serves 2026-01, which expires 2027-01-16). | `shopify.app.toml:33`, `server.js:448`, `services/shopify.service.js:7` |
| 17 | Deprecated fields: `fulfillmentCreateV2` to `fulfillmentCreate` (`server.js:8773`); `ShopPlan.displayName` to `publicDisplayName` (`server.js:7952`, used by carrier eligibility). | App Store S2 |

## Tier 3: correctness/hygiene (not reviewer-blocking)

- Duplicate orders/create webhook reserves a second Harbor locker (no existing-order check). (M4)
- `/api/dropoff-complete` replay on a completed order flips it back to ready_for_pickup. (M8)
- `MANUAL-<n>` ids collide across shops, so a 409 "already exists". (M7)
- Manual/synced orders never get `is_test`; regenerate has no status guard (can reserve a second locker). (M2)
- Confirmation email failures are never retried (runs after the 200 ack). (M1)
- Install flow: no ID-token exchange; `window.top.location` OAuth redirect from iframe likely blocked; stale-token reinstall shows a banner instead of auto-OAuth. (App Store S3)
- Delete dead code: `routes/auth.js` (requests non-expiring token), stale carrier URL in `services/shopify.service.js`. (App Store S10)
- Remove stray `* 2.json` Finder duplicates.
- Optional: unique index `orders_shop_order_number_uidx` in prod.
