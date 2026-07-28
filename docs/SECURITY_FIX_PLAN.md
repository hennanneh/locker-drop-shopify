# Security fix plan — order-token cross-tenant IDOR (Critical) + related

_Written 2026-07-27 after a code review of the reconciled `main` (HEAD 966ef2a). The **High** fix (manual-order 23505-catch + Harbor release) is already applied in `server.js`. This doc covers the **Critical** IDOR and the leftover Low/Medium items. Implement the Critical as ONE tested unit on a branch — do not deploy piecemeal._

## The Critical (recap)
`signOrderToken(orderNumber)` HMACs only the order number, not the shop, and every public order endpoint looks orders up by `order_number` alone. Because order numbers repeat across shops, two shops' tokens for the same number are identical → one customer's link can act on another shop's order (view info, release the locker via `/api/dropoff-complete` / `/api/pickup-complete`, change size). **Audit 2026-07-27: 0 cross-shop collisions in prod today (3 orders / 2 shops) — latent, not yet exploitable, but inevitable as data grows.**

## Design of the fix
Bind the token to **both** shop and order number, carry `shop` in every link, and scope every lookup by shop.

### 1. Primitives (`server.js` ~1579)
```js
function signOrderToken(shop, orderNumber) {
    return crypto.createHmac('sha256', process.env.SESSION_SECRET || 'lockerdrop-fallback')
        .update(`order:${String(shop)}:${String(orderNumber)}`)   // <-- shop now bound in
        .digest('base64url')
        .substring(0, 24);
}

function verifyOrderToken(shop, orderNumber, token) {
    if (!shop || !orderNumber || !token) return false;
    const expected = signOrderToken(shop, orderNumber);
    const a = Buffer.from(String(token)), b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

// requireOrderToken: read shop from body/params/query, validate its shape, pass it through.
function requireOrderToken(req, res, next) {
    const orderNumber = req.body?.orderNumber || req.params?.orderNumber || req.query?.orderNumber || req.query?.order;
    const shop = req.body?.shop || req.params?.shop || req.query?.shop;
    const token = req.body?.t || req.query?.t;
    if (!isValidShopDomain(String(shop || '')) || !verifyOrderToken(String(shop||''), String(orderNumber||''), String(token||''))) {
        logger.warn({ orderNumber, shop, hasToken: !!token, path: req.path }, 'Order token invalid or missing');
        return res.status(401).json({ error: 'Invalid or missing order token' });
    }
    req.verifiedShop = String(shop);
    next();
}
```

### 2. Every link-generation call site — add `&shop=` and pass shop to `signOrderToken`
Find them all: `grep -n "signOrderToken(" server.js`. Known sites (verify against current line numbers): ~2341, ~2911, **4553** (orders API `t:` attach — use `signOrderToken(shop, o.orderNumber)`), ~5712, ~5778, ~5813, ~5973, ~7301. Each returnUrl becomes `...?order=${orderNumber}&shop=${shop}&t=${signOrderToken(shop, orderNumber)}` (`shop` is in scope on all these per-shop routes).

### 3. Every protected lookup — scope by shop
Find them: `grep -n "WHERE order_number" server.js`. For each endpoint guarded by `requireOrderToken` (`/api/pickup-complete`, `/api/retry-link/:orderNumber`, `/api/order-dropoff-info/:orderNumber`, `/api/dropoff-change-size`, `/api/dropoff-complete`, `/api/dropoff-doesnt-fit`), change `WHERE order_number = $1` → `WHERE order_number = $1 AND shop = $2` using `req.verifiedShop`. (Best long-term: look up by the internal numeric `orders.id` instead of the ambiguous order number.)

### 4. Client pages must carry `shop`
- `public/admin-dashboard.html` — the two drop-off links: `...?order=${encodeURIComponent(order.orderNumber)}&shop=${encodeURIComponent(shop)}&t=${encodeURIComponent(order.t || '')}` (also fixes the **Low** unescaped `orderNumber`). Note the API already knows `shop`; expose it to the page or reuse the existing `shop` var.
- `public/dropoff-confirm.html` (~302-331, 391) — read `shop` from the URL and include it in every `fetch` to the protected endpoints.

### 5. ⚠️ Migration decision (do NOT skip)
Changing the signing scheme **invalidates every drop-off/pickup link already issued** (emails/SMS) — they'll start returning 401. Options:
- **(a) Regenerate & resend** outstanding `pending_dropoff` / `ready_for_pickup` links after deploy (cleanest; only 3 live orders now, so trivial today).
- **(b) Dual-accept for a grace window:** `verifyOrderToken` also accepts the legacy order-only token for N days. ⚠️ This *reopens the IDOR* for that window — only acceptable because collision surface is currently 0; still, prefer (a).
- Given the tiny live dataset, **(a) is recommended.**

### 6. Test checklist (before deploy)
1. Two dev stores with the **same** order number; confirm store A's link/token returns 401 against store B's endpoints.
2. Normal happy path per shop still works (drop off, change size, complete, pickup).
3. Dashboard drop-off buttons still open working links.
4. Old (pre-deploy) link 401s (confirms scheme changed) — then regenerate per step 5a.

## Also in scope
- **Medium — index migration:** audit shows **0** duplicate `(shop, order_number)` rows, so `CREATE UNIQUE INDEX orders_shop_order_number_uidx` is safe to create now. BUT `setup-database.js` isn't run by any deploy script and only `console.error`s on failure — **run it explicitly against prod and check the output/exit code**, don't fire-and-forget.
- **Low — cosmetic:** remove the stray blank line in the `admin-dashboard.html` drop-off `<a>` before commit.
- **Note — SESSION_SECRET:** confirmed **set** in prod `.env` (tokens use the real secret, not the fallback). Still add a boot assertion that it's set, and drop the `|| 'lockerdrop-fallback'` default so a missing secret fails loudly instead of silently producing guessable tokens. Same for the legacy pickup-details token (~server.js:3819).
- **Follow-up (pre-existing, same IDOR family, outside this diff):** `/api/order-locker-data/:shopifyOrderId` (no auth middleware), `/api/order-pickup-details`, `/api/update-pickup-date` — none shop-scope their lookups. Fold into this pass or a fast-follow.

## Recommended path
Implement 1–4 + the migration on a branch, run the test checklist locally, then deploy + regenerate outstanding links. This is an auth-path change to a live locker system — it must be exercised before it ships.
