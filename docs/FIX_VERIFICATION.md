# Fix Verification — 2026-07-28

Branch: `security/order-token-and-endpoints` · Diff base: `966ef2a...HEAD` (4 commits)
Scope: adversarially confirm the security fixes are correct, complete, and regression-free. Read-only; app not run, nothing deployed.

## Bottom line
The core IDOR fix is **correct, complete, and regression-free for the security property** — the branch is **ready for the two-dev-store IDOR test + happy path**, with two deploy-time prerequisites and one Medium functional regression to clear.

- **Blocker to boot (verify before deploy):** the new `SESSION_SECRET` assertion (server.js:27) will halt startup if the prod `.env` doesn't already have `SESSION_SECRET`. Previously the code silently fell back, so prod may never have set it. Confirm it's set before deploying, or the app won't start.
- **Migration safety (verify before deploy):** the new `UNIQUE INDEX (shop, order_number)` (setup-database.js:116) will FAIL if prod has any duplicate `(shop, order_number)` rows. Run a dup-check first (couldn't check prod DB — read-only).
- **Medium regression:** the "retry pickup link" button (pickup-success.html:580) no longer sends `shop`, so it will 401. Fails closed (no security hole), has a workaround, does not block the IDOR test.

---

## Per-fix verdict

### 1. Token binding complete — PASS
- All 13 `signOrderToken(` call sites pass `shop` as the first arg (grep, server.js). No 1-arg survivor.
- Every generated link carries `&shop=`: pickup-success/dropoff-success returnUrls (2356, 2927, 5710, 5803, 5838, 5998, 7332), change-pickup links (2958, 3242), dashboard order token (4550).
- All 7 `generateDropoffLink(` call sites pass a 5th `shop` arg (2804, 3058, 3166, 5089, 6152, 6332, 7202); the helper signature now takes `shop` (7310) and signs with it (7332).
- `shop` is in scope at every bare-`shop` site: 2356 (`const {shop}=req.params`), 5089 (`req.body`), 7202 (`processNewOrder` local), 4550 (`req.params`).

### 2. Every lookup scoped — PASS (for the guarded routes)
- Every `requireOrderToken` route now scopes its lookups to `req.verifiedShop` (2460, 2476, 2674, 2708, 2769, 2864, 3010, 3806, 3877). Two internal writes in `dropoff-complete` were switched to `WHERE id = $` (3025-ish, 2942→`order.id`) — correct, keyed on the already-verified row.
- No un-scoped `order_number = $N` remains on any token/customer-authenticated path that was in scope.

**Residual (pre-existing, NOT introduced by this branch — out of the 4-commit scope, flagged for awareness):**
- **[Medium] `/api/customer/order-status/:orderId` — server.js:5340.** The no-session-token fallback branch runs `... WHERE o.shopify_order_id=$1 OR o.order_number=$1 OR o.id::text=$1` with **no shop scope**, returning `o.*` (incl. customer email/phone). Worse, the shop is derived from a **session JWT whose signature is never verified** (5311, base64 decode only), so `shopDomain` is attacker-controllable. This is a cross-tenant customer-data read that this branch did not touch. Recommend a follow-up ticket.
- **[Low] Webhook handlers `processOrderCancellation`/`processOrderUpdate` — server.js:6866, 6934.** Match on `shopify_order_id=$1 OR order_number=$2` without shop; a cross-shop `order_number` collision could mutate the wrong tenant's row. HMAC-verified webhook source + globally-unique `shopify_order_id` make this low-risk. Pre-existing.

### 3. requireOrderToken sources `shop` correctly for each guarded route — PASS
- The token is HMAC over `order:{shop}:{orderNumber}` (1590), so `shop` is part of the signed material. `verifyOrderToken` recomputes with the supplied shop and constant-time-compares (1596-1607). An attacker-controlled `shop` cannot match a token minted for a different shop, and they cannot forge `HMAC(otherShop, otherOrder)` without the secret. The "attacker names their own shop against another order" bypass is closed.
- `isValidShopDomain(shop)` is enforced before verify (1617), and `req.verifiedShop` (set only from the verified tuple) is what every handler queries with — not a raw request value.
- orderNumber consistency confirmed: body-based routes (pickup-complete, dropoff-complete, dropoff-change-size, dropoff-doesnt-fit) read `req.body.orderNumber`, which is exactly the value `requireOrderToken` verified first (1611); param routes (retry-link, order-pickup-details, update-pickup-date) read `req.params.orderNumber`. No verify/act mismatch.
- Shop source per route: `:shop` param for update-pickup-date; query `?shop=` for GET order-pickup-details/order-dropoff-info/retry-link; body `shop` for the POST dropoff/pickup routes. All client callers supply it (see item 6).

### 4. verify-order-email removal clean — PASS
- No server route, no auth-bypass entry, no rate-limiter registration remain (all three removed at server.js:586, 667, plus the route body). Grep for `verify-order-email` across server.js + public/ returns nothing.
- Client `change-pickup-date.html` no longer calls it — it goes straight from the signed-token lookup to date selection (418-419). No dangling fetch.

### 5. OAuth offline change correct — PASS
- `grant_options[]=per-user` removed from the install URL (713-720); only comments reference it now.
- No downstream code reads `associated_user`, `online_access_info`, or `expires_in` (grep: zero hits). The callback stores the token via `INSERT INTO stores ... ON CONFLICT (shop) DO UPDATE` (758) — same code path for an offline token. Nothing assumes an online/per-user session.

### 6. No new bugs — one Medium regression + two deploy prerequisites
- **[Medium — regression] pickup-success.html:580** — `retryLink()` fetches `/api/retry-link/...?type=pickup&t=...` **without `&shop=`**. `retry-link` was already `requireOrderToken`-guarded, and that middleware now requires a valid shop, so this call will return 401 and the pickup retry button is broken. `shop` is already defined at pickup-success.html:429 — fix is a one-line addition of `&shop=` (the analogous dropoff-success:675 call was updated; this one was missed). Fails closed, workaround = original email link. Does not block the IDOR test.
- **[Concern — deploy/boot] server.js:27** — `if (!process.env.SESSION_SECRET) process.exit(1)`. Correct hardening, but the old code used `SESSION_SECRET || 'lockerdrop-fallback'` and express-session (552) still has a random fallback, so prod may have been running without it set. If so, this branch will refuse to boot until `SESSION_SECRET` is added to the prod `.env`. Confirm it's set pre-deploy. (Side effect: setting it for the first time invalidates existing merchant sessions → merchants re-login. Acceptable.)
- **[Concern — migration] setup-database.js:116** — `CREATE UNIQUE INDEX IF NOT EXISTS orders_shop_order_number_uidx ON orders(shop, order_number)`. `IF NOT EXISTS` guards on index name only, not on data; if prod has any duplicate `(shop, order_number)` rows this will throw and abort setup. Run `SELECT shop, order_number, COUNT(*) FROM orders GROUP BY 1,2 HAVING COUNT(*)>1` on prod before applying. Could not verify (no prod DB access).
- **[OK] newDate validator** (server.js:3866-3872) — regex `^\d{4}-\d{2}-\d{2}$` + `new Date(newDate+'T00:00:00Z')` round-tripped through `toISOString().slice(0,10) === newDate`. Correctly rejects impossible dates (e.g. 2026-02-30 rolls to Mar-02 → mismatch → 400) and accepts valid ones. No false rejects.

---

## Reviewed & looked solid
- HMAC token: constant-time compare via length check + `crypto.timingSafeEqual`-equivalent path (1600-1606); `SESSION_SECRET` no longer has a guessable literal fallback in `signOrderToken` (1590).
- manual-order dup handling (5620-5745): pre-check + INSERT-time 23505 catch + Harbor locker release on failed insert — no orphan reservation, race-safe.
- dropoff-complete internal writes re-keyed to `WHERE id = $` after the verified lookup (safe; avoids re-matching on order_number).
- Uninstall session cleanup tightened from `LIKE '%shop%'` to `sess->>'shop' = $1` (6827) — no longer nukes look-alike shops' sessions.
- Token-byte logging removed (4290 now logs length only).
- Dashboard token/link shop consistency: `/api/orders/${shop}` (admin-dashboard.html:3700, 3886) signs with the same `shop` used to build the `dropoff-confirm` link, so verification matches.
- `.env` not tracked; `.gitignore` adds `.DS_Store` and the tracked `.DS_Store` was removed.

## Recommendation
Proceed to the **two-dev-store IDOR test + happy path**. Before that test can even start the server, ensure `SESSION_SECRET` is set in the test/prod env. Fix the pickup-success retry-link `shop` (Medium) and run the duplicate-`(shop, order_number)` check before any prod deploy. The pre-existing `/api/customer/order-status` IDOR (5340) is a separate finding worth its own ticket but is outside this branch's scope.
