# Code Review — 2026-07-28 (second, complementary pass)

Reviewer pass over `main` @ 966ef2a plus staged edits and the already-applied manual-order High fix.
This pass deliberately hunts for what the prior `lockerdrop-review` (see `docs/SECURITY_FIX_PLAN.md`) did **not** dig into:
session/cookie flags, CSRF, rate-limiting, OAuth edge cases, the email-match "auth", info leakage, SSRF, token lifecycle.

## Bottom line
The OAuth HMAC/state, Shopify session-token (JWT) verification, webhook HMAC, and the manual-order High fix are all
solid — I verified them directly. The still-open **Critical order-token IDOR** (already documented) remains the headline.
Beyond it, this pass surfaces a cluster of **customer-facing "email-only" endpoints** that are unauthenticated,
cross-tenant, and info-leaking (pickup-details, verify-order-email, update-pickup-date), plus a **latent OAuth
token-lifecycle bug** (online/per-user tokens used as long-lived). **HOLD** until the Critical + the email-auth cluster
are addressed; the rest are Low/robustness.

## Findings (sorted by severity)

### [High] `update-pickup-date` — `:shop` path param is ignored; email is the only "auth" — `server.js:3868-3894`
- **What:** The route is `/api/update-pickup-date/:shop/:orderNumber`, but the SQL (line 3879) looks up
  `WHERE (order_number = $1 OR shopify_order_id::text = $1) AND LOWER(customer_email) = LOWER($2)` — the `:shop`
  param is **never used**. So the only gate on this state-changing endpoint is a customer email match, and the lookup
  is cross-tenant (order numbers repeat across shops).
- **Why it matters:** Anyone who knows an order number + the customer's email (email is not a secret; it's on receipts,
  and can be brute-forced via the oracle below) can rewrite `preferred_pickup_date` on **any** shop's order and trigger
  a "Pickup Date Updated" email to that customer (line 3904) — a phishing/spam vector under the merchant's brand. The
  `:shop` in the URL gives a false impression of scoping.
- **Fix:** Require the signed order token (same `requireOrderToken` the Critical fix introduces) instead of/in addition
  to email; scope the lookup by `shop` (and prefer the internal numeric `orders.id`). Validate `newDate` as an ISO date
  before the UPDATE.
- **Overlap note:** the prior pass listed this endpoint as "pre-existing unscoped"; the *new* detail is that the shop
  param is decorative and it both mutates state and emits customer email.

### [Medium] `order-pickup-details` leaks locker + pickup date + shop with **no token** — `server.js:3780-3832`
- **What:** The `token` query param only gates the `email` field (lines 3815-3831). `lockerName`,
  `currentDate` (pickup date), `orderNumber`, and `shop` are returned for **any** order number with no token at all,
  and the lookup is `WHERE o.order_number = $1 OR o.shopify_order_id::text = $1` (cross-tenant).
- **Why it matters:** Enumerating sequential order numbers (throttled only at 30/min) discloses, per order, the physical
  locker location, the pickup date/time window, and which merchant — operational/PII data for every tenant.
- **Fix:** Gate the whole response behind the signed order token and scope by shop; don't return locker/date without it.

### [Medium] `verify-order-email` is an unauthenticated email-confirmation oracle — `server.js:3841-3865`
- **What:** POST order number + a guessed email → `{verified:true|false}`, no token, cross-tenant, throttled only by the
  30/min public limiter.
- **Why it matters:** Confirms whether a specific email placed a specific order (identity/PII confirmation) and lets an
  attacker brute-force the email that then unlocks `update-pickup-date` above.
- **Fix:** Require the signed order token; don't expose a boolean match oracle on an unauthenticated route. Consider
  removing this endpoint and folding the check into a token-gated flow.

### [Medium] OAuth requests **online/per-user** tokens but uses them as the shop's long-lived token — `server.js:716`
- **What:** The install URL appends `grant_options[]=per-user`, so Shopify returns an **online** access token
  (user-scoped, ~24h expiry). Only `access_token` is stored (line 749); `expires_in`/`associated_user` are dropped, and
  every background/API path (`accessTokens.get(shop)` → DB) reuses that one token.
- **Why it matters:** After the installing user's token expires (~24h), server-initiated Shopify calls — webhook order
  processing, the new "mark Delivered on pickup" fulfillment update, plan/carrier calls, the admin-block Shopify
  fallback in `order-locker-data` — start returning 401. For a live app this looks exactly like the intermittent
  "empty admin block / not syncing" symptoms in `PROJECT_STATUS.md`.
- **Fix:** Drop `grant_options[]=per-user` to obtain an **offline** token for background work (and re-auth flows for
  online user actions if needed). Verify what's actually stored in prod before assuming; if offline is already in use,
  this is moot — but the code path requests online.

### [Low] `requireAuth` grants a session from an attacker-suppliable `host` alone — `server.js:1553-1568`
- **What:** If `?host=<anything>` is present and the shop has a token in `stores`, `requireAuth` creates an
  authenticated session with **no HMAC and no JWT** check. `host` is not validated.
- **Why it matters:** Any request `GET /admin/dashboard?shop=<installed-store>.myshopify.com&host=x` yields an
  authenticated session cookie for that shop. Impact is currently limited: the *only* consumer of `req.session` is
  `requireAuth` guarding `/admin/dashboard`, which just serves the HTML shell (data APIs use `requireApiAuth` JWT,
  verified). But it's a latent bypass — the moment any route trusts `req.session`, it becomes real.
- **Fix:** Don't mint a session from `host` presence; require the Shopify HMAC (already handled a few lines up) or the
  App Bridge JWT. At minimum validate `host` (base64 of `<shop>/admin`).

### [Low] Non-constant-time token compare on pickup-details token — `server.js:3822`
- **What:** `tokenValid = (token === expectedToken)` — plain string compare of an HMAC/SHA-derived secret.
- **Why:** Timing side-channel (minor here: 16-char derived token). Use `crypto.timingSafeEqual` with a length guard,
  as the codebase already does elsewhere.

### [Low] App-uninstalled session cleanup over-matches — `server.js:6827`
- **What:** `DELETE FROM user_sessions WHERE sess::text LIKE $1` with `%${shop}%`. Parameterized (no SQLi), but a
  substring LIKE on the whole session JSON can delete sessions belonging to *other* shops whose name contains this shop
  as a substring (e.g. `acme` vs `acme-eu`).
- **Fix:** Match the shop field precisely, e.g. `sess->>'shop' = $1`.

### [Low] Partial live access token written to logs — `server.js:4296`
- **What:** `logger.info(\`   Found token: ${accessToken.substring(0, 15)}...\`)` logs the first 15 chars of a decrypted
  Shopify token on every DB token load.
- **Fix:** Drop it or log only a boolean/`token.length`.

### [Low] `lockerId` from request body interpolated raw into Harbor URL path — `server.js:5650`
- **What:** `/api/v1/locations/${lockerId}/availability` uses `lockerId` straight from `req.body` (the dropoff call at
  5707 does `parseInt(lockerId)`, but the availability GET does not). Route is `requireApiAuth`-gated (admin only), so
  this is authed and Harbor-scoped — path-traversal within the Harbor API at worst.
- **Fix:** `parseInt`/validate `lockerId` once at the top of the handler for consistency.

## Reviewed & looked solid
- **OAuth callback** (`server.js:722-739`): validates canonical shop domain, verifies Shopify HMAC via
  `verifyOAuthHmac` (sorted params, timing-safe compare, secret required), and enforces a per-shop `state` nonce with a
  10-min TTL that's deleted on use. Solid CSRF protection on the install round-trip.
- **Shopify session-token (JWT) auth** (`verifyShopifySessionToken` 1616-1642, `requireApiAuth` 1646-1676): HS256 only
  (no `alg:none`/RS downgrade), timing-safe signature check, `exp`/`nbf` skew, `aud` == API key, and token-shop must
  equal the `:shop` param. This is the real gate for the 42 admin `/api/.../:shop` routes and it's done right.
- **Webhook HMAC** (`verifyShopifyWebhook` 6500-6527): re-hashes the exact raw bytes (captured via the `express.json`
  `verify` hook at 531-533), base64, length-checked timing-safe compare, rejects when secret/header/body missing.
- **Manual-order High fix** (`server.js:5719-5758` diff): correct. The INSERT is wrapped; on failure it releases the
  just-reserved Harbor locker using the same Harbor `accessToken` (client-credentials token in scope, verified), maps
  `23505` → 409, and rethrows other errors to the outer 500. No orphaned locker. Good.
- **SQL injection:** spot-checked the token/pickup/manual-order/uninstall paths — all use parameterized `$1..$n`; the
  `%${shop}%` and `LIKE` cases pass the interpolation as a *bound param*, not concatenated SQL.
- **Token-at-rest encryption** (`db.js` 82-128): AES-256-GCM with transparent decrypt in the `query` wrapper; write and
  read sides are consistent, so tokens aren't accidentally used as ciphertext. (Plaintext only if `TOKEN_ENCRYPTION_KEY`
  is unset, which it warns about.)
- **Session cookie flags** (`server.js:544-557`): `secure`, `httpOnly`, `sameSite:'none'` (required for the Shopify
  iframe), 24h `maxAge`, PG-backed store, `trust proxy` set. The session `secret` fallback is a random 32 bytes (not a
  guessable literal) — good; contrast with `signOrderToken`'s `'lockerdrop-fallback'` (see prior pass).
- **CORS** (560-618): public endpoints get `*` without credentials; admin `/api/*` echoes only Shopify-controlled
  origins (`*.myshopify.com`/`admin.shopify.com`) with credentials. No credentialed wildcard.
- **Rate limiting:** a baseline `apiLimiter` covers all `/api/*` plus stricter public/checkout/webhook limiters. Auth
  routes are behind the baseline limiter.
- **Secrets in source:** `.env` is gitignored; `.env.example` is empty placeholders; `ca-certificate.crt` is a public DB
  CA cert (not a private key). No hardcoded secrets found in `server.js`.

## Overlaps with the prior pass (verified, not re-litigated)
- 🔴 **Critical order-token IDOR** — confirmed: `signOrderToken(orderNumber)` (1579) binds order# only; public lookups
  key on `order_number` alone. Fix design in `SECURITY_FIX_PLAN.md` is sound. My Medium/High email-endpoint findings are
  the same IDOR *family* and should be fixed in the same pass (they need the shop-bound token too).
- 🟡 **UNIQUE INDEX** `orders_shop_order_number_uidx` is present in the staged `setup-database.js` (audit found 0 dupes).
  New note: it's built non-`CONCURRENTLY` (ACCESS EXCLUSIVE lock) — fine on today's tiny table, use `CONCURRENTLY` if
  this ever runs against a large `orders`. And as the prior pass said, `setup-database.js` isn't wired into deploy — run
  it explicitly and check the exit code.
- 🟢 **Low unescaped `orderNumber` href** and the **cosmetic blank line** in `public/admin-dashboard.html` — both still
  present in the staged diff (the blank line was *added*, line ~3923; the `order=${order.orderNumber}` is still
  unescaped).
- **Notes:** `.DS_Store` still tracked; `signOrderToken` still has `|| 'lockerdrop-fallback'`; pickup-details token
  (3819) shares that fallback pattern.
- **Webhook replay:** no timestamp/nonce check, but `orders/create` is now idempotent via the `(shop, order_number)`
  unique index + 23505 handling, so replay is low-risk. Acceptable to leave.
