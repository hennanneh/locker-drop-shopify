# LockerDrop static code review, HEAD ab366d1 (2026-11-12)

Read-only static pass. Nothing was run. No .env values were read. All line numbers refer to server.js unless noted.

## Bottom line
The three review-96154 issues are fixed in code for the main path (Shopify TEST order, orders/create webhook delivered, LockerDrop shipping line present). Several adjacent paths still reproduce them, and the expiring-token work has a real gap (a request-time refresh helper exists but is never called). Recommendation: HOLD resubmission until findings H1 to H4 and M1 to M3 are addressed. Most are small changes.

## Finding index
| # | Sev | Title |
|---|-----|-------|
| H1 | High | Sim drop-off fetches a Harbor token BEFORE the simulated shortcut, so it 500s if Harbor prod creds fail |
| H2 | High | orders/updated and orders/cancelled handlers are not shop-scoped (cross-tenant corruption) |
| H3 | High | getValidAccessToken() is dead code, no request-time refresh and no 401 retry; sweep margin is near zero in the worst case |
| H4 | High | Stored XSS in admin dashboard Orders table (customer name, locker name, pickupLink href) |
| M1 | Med | Confirmation email is fire-and-forget with no retry; the "release claim so webhook retry resends" comment is wrong |
| M2 | Med | Manual orders and sync-orders rows never get is_test or a confirmation email; dev store non-test orders still hit Harbor on regenerate |
| M3 | Med | Legacy non-expiring tokens: no migration path before 2027-01-01 |
| M4 | Med | No idempotency check in processNewOrder, webhook retry double-reserves Harbor lockers |
| M5 | Med | Unauthenticated /api/billing/confirm: any caller can flip any shop's subscription status, plus open redirect |
| M6 | Med | GDPR: shop/redact and customers/redact leave PII in locker_reservations and audit_log |
| M7 | Med | MANUAL-<orderNumber> shopify_order_id collides across shops (409 "already exists" for a different tenant) |
| M8 | Med | One order token for all purposes, and dropoff-complete has no status guard |
| L1 to L7 | Low | see below |

---

## High

### H1. Sim drop-off requires a live Harbor token even in simulated mode
`server.js:2784-2790` (token fetch), `2824-2827` (simulated decision).
In /api/dropoff-complete the Harbor client-credentials call is made unconditionally at the top, before `simulated` is evaluated. The test-order branch of processNewOrder (6990-7019) was built precisely so that no Harbor locker is needed on production Harbor, but the Sim drop-off then still needs Harbor auth to succeed. Your notes say real go-live is gated on Harbor production keys. If HARBOR_API_URL points at production and the prod client id/secret are absent, wrong, or the realm is down, `axios.post` throws and the handler returns `500 {"error":"Failed to process dropoff completion"}`. The Sim button then shows "Failed to process dropoff completion", which is the same class of failure the reviewer already cited.
Fix: compute `simulated` first (it needs only the DB), and fetch the Harbor token lazily only in the non-simulated branches (the `requestId` lookup and the pickup-locker-request call). Also, `resolveLockerLocation` (209-248) already swallows Harbor errors, so the email step is safe.

### H2. orders/updated and orders/cancelled look up orders without the shop
`server.js:6828` (cancellation, in processOrderCancellation at 6819), `6896` (update, in processOrderUpdate at 6889).
Both do `SELECT ... FROM orders WHERE shopify_order_id = $1 OR order_number = $2` with no `shop = $x`. Shopify order numbers start at 1001 in every store, so collisions across tenants are the normal case, not an edge case. `shopDomain` is passed in and ignored.
Scenario: the reviewer's dev store places test order #1001. Any later orders/updated for #1001 in the reviewer store (fired by setLockerOrderTag after every Sim step, and by any edit) can match another merchant's #1001 (or the reverse), overwriting that row's customer_name/email/phone and, if `fulfillment_status === 'fulfilled'`, setting it to completed. orders/cancelled on one shop's #1001 releases the other shop's Harbor locker and nulls its links. This is cross-tenant data corruption and a PII leak, and it is exactly the class the Aug 7 pass closed on other endpoints. Reachable only with a valid Shopify HMAC, but Shopify itself produces the colliding inputs.
Fix: add `AND shop = $3` (shopDomain from `x-shopify-shop-domain`) to both selects; drop the order_number fallback or keep it only when scoped by shop.

### H3. Expiring-token flow: no request-time refresh, and the sweep margin is thin
`server.js:8593-8609` (getValidAccessToken), `8612-8635` (sweep), `9392-9393` (interval).
(a) `getValidAccessToken` is defined but has zero callers (grep confirms the only occurrence is its definition). Every consumer reads `accessTokens.get(shop)` (in-memory Map) or `SELECT access_token FROM stores` directly (about 35 sites, for example 1660, 1735, 3437, 4132, 6187, 7130, 8723, 9002) and passes it to shopifyGraphQL, which has no 401 handling (450-468). So the only thing keeping tokens valid is the 15 minute setInterval sweep. If the sweep fails for a shop (Shopify 5xx for more than 45 min, DB blip, process stalled), the token silently expires after 60 minutes and every order webhook, fulfillment, billing usage charge, and product-size lookup for that shop fails with 401 until the merchant re-auths. processNewOrder catches the error and still returns 200 to Shopify (7338-7340 and 6496-6500), so there is no webhook retry either.
(b) Margin: sweep selects tokens expiring within 15 min (8617) on a 15 min cadence. A token that has 15.01 min left at one sweep is skipped and has about 0.01 min left at the next, so any sweep latency (sequential loop, 1/2/3 s backoffs per failing shop, interval drift) means requests in that gap use an expired token. The comment "wide margin" at 8610 is not true in the worst case.
(c) Race: because only the sweep writes, there is no sweep vs request-time race today. If you wire in getValidAccessToken (recommended), you must single-flight per shop (a Map<shop, Promise>) because Shopify rotates the refresh token and two concurrent refreshes can leave the loser holding a dead refresh token that then overwrites the good row via storeShopTokens' ON CONFLICT upsert (8543-8550). The same hazard exists if pm2 runs more than one instance (each has its own cache and its own sweep, both refreshing the same row). Confirm pm2 is fork mode with 1 instance.
(d) Refresh failure handling: a 401 is logged and rethrown (8579-8581), the sweep warns (8627) and retries every 15 min forever. Nothing flags the shop (no needs_reauth column) or surfaces it in the dashboard, and the 400 invalid_grant case is retried 3 times pointlessly (8583). A shop whose 90 day refresh token expired (merchant inactive) is unrecoverable until a manual /auth/reconnect, and the first sign is validate-token returning needsReconnect after something else fails.
(e) OAuth callback swallows storeShopTokens failure (905-910), continuing with only the in-memory token. With an expiring token that means the sweep has nothing to refresh and the shop dies in 60 minutes while the install looked successful.
Fix: replace the 35 raw token reads with `await getValidAccessToken(shop)` (single-flight), add one retry-after-refresh on 401 inside shopifyGraphQL, raise the sweep threshold to 30 min (or sweep every 5 min), add a `needs_reauth` flag set on refresh 401 and used by the dashboard to redirect to /auth/reconnect, and fail the callback (or retry) if storeShopTokens throws.

### H4. Stored XSS in the Orders table
`public/admin-dashboard.html:3834-3844`.
`${order.customerName}`, `${order.lockerName}` and `href="${order.pickupLink}"` are interpolated into innerHTML unescaped (the file's only escapeHtml is local to the confirm modal at line 1620). customerName comes from the shopper's Shopify first/last name (processNewOrder stores `order.customer.first_name`/`last_name` verbatim), so any shopper can put `<img src=x onerror=...>` in a name and run script inside the merchant's embedded admin, with access to App Bridge session tokens and every authenticated endpoint (including emergency-open and cancel-locker). This is the first thing an App Store security reviewer tries on a name field.
Fix: add a shared `esc()` and apply to every interpolated text field (customerName, lockerName, date, status) and validate/encode pickupLink (`https:` only, `encodeURI`). Audit viewOrder modal and other tables the same way. Also use `data-` attributes plus addEventListener instead of inline `onclick` with string interpolation.

---

## Medium

### M1. Confirmation email: no retry path, claim logic assumes one that does not exist
`server.js:6502` (call after ack), `396-444` (finalizeNewOrder), comment at `431-432`.
Flow is correct on the happy path (atomic claim on confirmation_sent_at, send, release on failure). But finalizeNewOrder runs after `res.status(200)`, so Shopify will never retry; "so a webhook retry can try again" never happens. A transient Resend failure, a missing/blank RESEND_API_KEY (sendEmail returns `{success:false}` at 157-160, same as a failure), or the process restarting between the ack and the send, all lose the email permanently with only a log line. A reviewer who placed an order and saw no email would see the same symptom as 96154. Also if the Shopify order has no email (phone-only checkout) the UPDATE matches nothing and nothing is logged.
Also: the email is sent only from the orders/create webhook; orders created via manual-order (5674) or sync-orders (1848) get none (see M2).
Fix: retry 2 to 3 times inside finalizeNewOrder with backoff, log a warn when the claim returns no row because of a missing email, add a "Resend confirmation" action to the order modal, and add a startup/cron backfill for rows with `confirmation_sent_at IS NULL AND is_test` created in the last day. Verify RESEND_API_KEY and the notifications@lockerdrop.it domain verification on the prod droplet (cannot be checked statically).

### M2. is_test and Sim gating are only set for the webhook creation path
`server.js:396-410` (is_test set only here), `1848` (sync-orders insert, no is_test), `5674` (manual order), `4505-4511` (simOnly/canSimulate), `6165` (regenerate gate).
- is_test is written by finalizeNewOrder only. A test order whose webhook was missed and was later pulled in by /api/sync-orders has is_test=false, so on a store that Shopify does not flag as partnerDevelopment there are no Sim buttons. (The GraphQL query at ~1760 could select `test`.)
- A dev-store order with test=false (draft order marked paid, manual "Create order") on production Harbor goes down the normal path: real Harbor allocation and a usage charge. `canSimulate` is true via devStore, but `simOnly` is false (isTest is false), so the modal shows regenerate controls and regenerate calls Harbor (6188 onward); any Harbor failure becomes `500 Failed to regenerate link`. This is the residual way to hit review issue (c).
- Manual orders (the Add Order dialog) reserve a real production locker, send no email, and show no Sim-only UI.
- Regenerate has no status guard (6143-6280): on a completed or ready_for_pickup order it reserves a second locker and overwrites locker_id/tower_id without releasing the first (orphan reservation).
Fix: set is_test (from GraphQL `test`) in sync-orders and manual-order, base simOnly on `isTest || (devStore && !order.locker_id)` or simply `canSimulate && !sandbox`, add `status === 'pending_dropoff'` guard to regenerate, release the old locker first.

### M3. Legacy non-expiring tokens have no migration before 2027-01-01
`server.js:8600` (`if (!row.token_expires_at) return row.access_token`), `8612-8635`.
Stores with NULL expiry are skipped by the sweep and used as-is. There is no code that converts them (grep for token-exchange: none). After the cutoff those tokens stop working with no prior signal. With about 7 weeks left, the 6 stores Shopify lists will fail all background work. The simplest in-app path already exists: /auth/reconnect (972) goes through getAccessToken with `expiring: 1` and Shopify auto-approves when scopes are unchanged.
Fix: either run Shopify's documented offline-token exchange for legacy tokens in a one-off script, or on dashboard load (/api/shop-plan or validate-token) return `needsReconnect: true` when `token_expires_at IS NULL` and have the client redirect to /auth/reconnect. Do it before Dec 2026 and confirm the DB shows non-NULL expiries for those 6 shops.

### M4. Duplicate orders/create deliveries double-allocate Harbor lockers
`server.js:6959-7340`, handler at `6488-6503`.
processNewOrder is awaited before the 200 and includes product lookups and up to four Harbor calls (several seconds); Shopify's 5 s timeout then retries the webhook. There is no `SELECT ... WHERE shopify_order_id` pre-check in the non-test, non-reservation path, so the retry calls generateDropoffLink again (reserving a second physical locker) and only afterwards the INSERT hits the shopify_order_id UNIQUE violation, which is swallowed (7338). The first locker stays attached to the row; the second is orphaned until it expires. The test-order branch is safe (`ON CONFLICT DO NOTHING`).
Fix: check for an existing row first (return early), or insert a placeholder row before calling Harbor; and ack the webhook (200) before doing the slow work.

### M5. Unauthenticated billing callbacks, open redirect
`server.js:3938-3972`, `3975-3978`.
/api/billing/confirm takes `shop` and `charge_id` from the query with no validation, no auth, and no check against Shopify. Anyone can `GET /api/billing/confirm?shop=victim.myshopify.com&charge_id=1` and set that shop's subscription to active (or without charge_id, declined), resetting orders_this_month and total_charged_this_month (billing counters). `shop` is also interpolated into `res.redirect('https://${shop}/admin/apps/...')` unvalidated, so `shop=evil.example/` yields an open redirect from the app's domain (3955, 3969). /api/subscription/confirm repeats it.
Fix: `isValidShopDomain(shop)` first, and verify the charge via GraphQL (`currentAppInstallation.activeSubscriptions` or node(id) on the charge) before marking active; do not trust the query string.

### M6. GDPR redaction is incomplete
`server.js:6629-6672` (customers/redact), `6714-6806` (processAppUninstall used by shop/redact), `6597-6626` (data_request).
- locker_reservations (customer_email, customer_phone, baseline migration lines 35-52) is neither redacted by customers/redact nor deleted by shop/redact or uninstall (the delete list at 6769-6776 omits it). audit_log (shop, ip_address, user_agent, details with order numbers) is also left behind. waitlist is not tenant data.
- customers/redact matches customer_email exactly (case-sensitive) and does not clear dropoff_link/pickup_link or location text; reservations are untouched.
- customers/data_request only logs; there is no export mechanism (acceptable if documented, but note the log line writes the customer email, GDPR logs at 6606 and 6635).
- shop/redact reuses processAppUninstall, which catches and swallows all errors (6806-6808) then returns 200, so a failed deletion is silently reported as done.
Fix: add `DELETE FROM locker_reservations WHERE shop = $1` and `DELETE FROM audit_log WHERE shop = $1` to the transaction, redact reservations by lower(email) in customers/redact, and rethrow so shop/redact does not return success on failure. Use lower() for the email match.

### M7. MANUAL- order id collides across shops
`server.js:5674-5676`.
`shopify_order_id = 'MANUAL-' || orderNumber` is globally UNIQUE (setup-database.js:67). If any other shop ever created manual order "1001", a reviewer creating manual order 1001 passes the per-shop dupe check (5566) and fails the insert with a 23505, which is reported as "Order #1001 already exists" (409) although the reviewer's shop has no such order, and a real Harbor locker was reserved then released. Fix: `MANUAL-${shop}-${orderNumber}`.

### M8. One order token for every purpose; dropoff-complete not idempotent
`server.js:1420-1425`, `2756-2928`, `2350-2459`.
signOrderToken(shop, orderNumber) is identical for the drop-off link, the pickup link, the change-date link and the Sim endpoints, and never expires. The customer's pickup URL (contains `t`) can therefore call /api/dropoff-complete, and the merchant's drop-off URL can call /api/pickup-complete (which completes the order and fulfills it in Shopify without a pickup). dropoff-complete has no status guard (2893-2896): replaying it on a completed order flips it back to ready_for_pickup and re-sends the pickup email and SMS. Fix: include a purpose string in the HMAC (`order:dropoff:`, `order:pickup:`, `order:change:`) and add `AND status = 'pending_dropoff'` to the dropoff-complete update.

---

## Low

- L1 `server.js:6475-6485` orders/create: processNewOrder swallows every exception (7338) so the handler always replies 200 and Shopify never retries a failed order creation. Rethrow after logging for transient failures.
- L2 `server.js:1186-1191` /auth/register-carrier/:shop is unauthenticated and reflects `shop` into HTML (1239); only reachable when `accessTokens` has that key, so not exploitable today, but delete it or add requireApiAuth and escape.
- L3 `server.js:1343-1396` requireAuth creates a session from just `?host=` for any installed shop. The dashboard HTML is static and APIs need a JWT so impact is low, but it is a pointless unauthenticated session grant. Remove the host branch or verify the id token.
- L4 `server.js:703-709` `shop` query param goes unvalidated into the CSP `frame-ancestors` header; a value with `;` injects directives and one with invalid header chars makes setHeader throw (500) before any route. Validate with isValidShopDomain or fall back to the wildcard.
- L5 Logging: processNewOrder logs the first 500 chars of the raw order JSON (6961, customer PII) and regenerate logs the full order row including dropoff_link (6162); logs of `Dropoff link: <token>` at 7312. No secrets (API key, Harbor secret, Shopify tokens) were found in logs or source; the Harbor client secret is placed in a URL-encoded body only, never logged. Trim PII and link tokens in logs.
- L6 `server.js:1611` (order-locker-data) `shopifyOrderId` is interpolated into a GraphQL string; scoped to the caller's own verified shop so self-injection only. Validate `/^\d+$/`.
- L7 migrations: the baseline migration (20260504000000) does not create `orders` or `stores`, but 20260928 does `ALTER TABLE orders`, and the server boots after swallowing a migration failure (9362-9367). On a fresh DB the order list query selecting `o.is_test` (4490) would 500 on the Orders tab. Prod is fine (columns exist), but a clean-checkout deploy depends on setup-database.js being run first.

---

## Answers to the focus questions

### 1. Do e39eaf4 / ad8b70c fix the three reviewer issues?
- Sim buttons missing: Fixed for webhook-created Shopify TEST orders. Render condition is `(order.canSimulate || shopPlanData?.partnerDevelopment) && status === 'pending_dropoff' | 'ready_for_pickup'` (admin-dashboard.html:3840-3841) and canSimulate comes from the API (4511), so it no longer depends on the async shop-plan fetch. Still missing when: the order row lacks is_test (sync-orders, manual order, webhook missed, or finalizeNewOrder's UPDATE failed, swallowed at 442) on a store not flagged partnerDevelopment. Also the order must have LockerDrop shipping title or the "LockerDrop Pickup" note attribute (6968-6976), else no row is created at all.
- The Sim click can still 5xx: see H1 (Harbor token required even for simulated). Also forward goes through `http://localhost:${PORT}` (1493) and shares the 60 req/min per-IP /api limiter bucket for 127.0.0.1 across all shops (low risk).
- No email: Fixed on the happy path (confirmation at order time, pickup email at Sim drop-off via sendEmail 2879-2893). Remaining gaps: M1 (no retry, silent failure), M2 (manual/sync orders), Resend config unverifiable here. The Sim drop-off pickup email is awaited inside the request, so a Resend outage there does not fail the response (sendEmail never throws), good.
- Regenerate error: Fixed for is_test orders on production Harbor (6165-6173 returns success with `simulated: true`, the UI handles it at admin-dashboard.html ~4200 and ~4240). Not fixed for non-test dev-store orders (M2), regenerate on non-pending orders (M2), or if a dev store test order is created while HARBOR_API_URL is sandbox (then the real sandbox flow runs, which is intended).

### 2. Expiring-token correctness
See H3 and M3. Summary: refresh works (token endpoint call with grant_type=refresh_token, rotation stored, transient retry on same refresh token, 401 treated as dead); encryption decrypt on read is wired through db.query (db.js:114-135) so the sweep reads plaintext refresh tokens correctly; legacy NULL-expiry rows are passed through unchanged but never migrated; getValidAccessToken is unused; no 401 retry; no needs_reauth state; margin thin; single-flight needed if wired in; verify pm2 instance count.

### 3. Remaining security
- Verified solid: webhook HMAC (6458-6483, raw body, timingSafeEqual, 401), OAuth HMAC and state nonce (815-835, 864-880), session-token JWT verify with aud/exp (1508-1535), requireApiAuth on every `/api/:shop` admin route (grep list), order-token routes use requireOrderToken with shop-bound HMAC, order-locker-data and customer/order-status derive shop from verified JWT, parameterized SQL throughout (dynamic SET in processOrderUpdate builds column names from constants only).
- Issues: H2, H4, M5, M6, M8, L2 to L4. The app_proxy is declared in shopify.app.toml:43-46 but no handler verifies the proxy `signature`; nothing under it appears to trust proxy-injected identity (no logged_in_customer_id usage found), so low risk, but confirm no extension actually calls /apps/lockerdrop or remove the block.

### 4. Other reviewer-visible errors
- Fresh install with no orders/settings: GET /api/orders returns `[]` and the UI shows empty-state copy (3784-3812); GET /api/settings inserts defaults (3562-3580). No 500 seen. /api/orders requires the `is_test` column (migration applied).
- Uninstall/reinstall: uninstall deletes stores row and cache atomically; reinstall goes through install then callback and storeShopTokens upsert; subscription recreated. After uninstall the `oauthNonces` map is process-local (lost on restart mid-install = "Invalid or expired state", low).
- webhooks are registered only at OAuth callback via GraphQL (not declared in shopify.app.toml), and failures are swallowed (889-900). If registration fails for the reviewer's store there will be no orders/create, so no order row, no Sim, no email. Consider declaring webhooks in the toml (`[[webhooks.subscriptions]]`) and verifying `webhookSubscriptions` on the review store.
- Unhandled promise rejections: finalizeNewOrder is called without await/catch (6502) but is internally try/catch; setLockerOrderTag uses `.catch(() => {})`. No process-level unhandledRejection handler was found; a stray rejection on Node 20+ would crash the pm2 process. Add `process.on('unhandledRejection', ...)` logging.

## Reviewed and looked solid
- Secrets: .gitignore covers .env and .env.*; no hardcoded keys found by pattern grep (sk_live, shpat_, Resend, Twilio SID); ca-certificate.crt is tracked (public CA cert, fine); `LockerDrop_Launch_TodoList.docx.pdf` is tracked and gitignored-pattern-less junk (check content). Untracked "manifest 2.json" and ".claude/launch 2.json" are stray duplicates, do not commit.
- SESSION_SECRET required at boot (24-30); HARBOR env mismatch guard (40-55).
- Order-token compare is timing-safe and shop-bound; session secret fallback removed.
- e39eaf4 email template escapes all interpolated values (escHtml) and branding logo URL; confirmation claim is atomic (UPDATE ... WHERE confirmation_sent_at IS NULL RETURNING).
- GDPR endpoints exist, verified by HMAC, and are declared in the toml.
- Refresh token and access token are encrypted at rest when a key is set, and decrypted transparently.
- CORS: admin /api restricted to Shopify origins; public ones intentionally `*`.
- Duplicate order number handling in manual-order: pre-check plus 23505 handling with locker release.

## Notes
- Sim button labels say "(development stores only)" in the confirm dialog (admin-dashboard.html:3852) but now also apply to any test order; update the copy so it does not confuse a reviewer on a non-dev store.
- /api/checkout/reserve-locker (5018) is unauthenticated and creates real 30 minute Harbor reservations; only rate-limited by IP, an inventory-exhaustion vector at launch.
- docs/REVIEWER_INSTRUCTIONS.md should state that the order must use the LockerDrop shipping rate and Bogus Gateway (test=true), and that checkout needs CCS (Advanced/Plus or add-on) or no LockerDrop rate appears.
- Pino calls like `logger.info('text', obj)` drop the second argument, so some of the diagnostics listed above are not actually emitted; not a security issue.
