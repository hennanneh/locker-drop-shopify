# Shopify Support Ticket — Checkout UI extension deployed & placed but never renders

**Subject:** `purchase.thank-you.block.render` extension deploys and is placed in the checkout editor but never mounts (no DOM output) on the live Thank You page

## Summary
A checkout UI extension (Thank You page block) builds and deploys successfully, the block is added **and saved** to the Thank you page in the checkout editor, but it **never renders on the live thank-you page** — its output is completely absent from the page DOM. There is **no error in the storefront console**. As the final isolation test we reduced the entire extension to a **single bare static `<s-banner>` — no hooks, no data, no `shopify` global, no network** — deployed and released it, placed an order, and it *still* produces zero DOM on the immediate thank-you page. A static banner cannot fail to render for any code reason, so this points conclusively to an extension-runtime/delivery issue on Shopify's side rather than our code.

## Environment
- **Partner org:** Howrey (dashboard id `130091942`)
- **App:** LockerDrop — Partner app id `297504309249`; client_id `d0123a17d1e004675deaca3a4a154239`
- **Store:** `locker-plus.myshopify.com` (Shopify Plus development store)
- **Extension:** handle `lockerdrop-thankyou`, uid `lockerdrop-thankyou-block`
- **Target:** `purchase.thank-you.block.render`
- **api_version:** `2025-10`  ·  SDK `@shopify/ui-extensions@2025.10.15` (Preact entry: `import '@shopify/ui-extensions/preact'; render(<X/>, document.body)`)
- **Latest released app version:** `lockerdrop-110` (reproduced on every version 107–110, including a bare static-banner build)

## Expected vs. actual
- **Expected:** The "LockerDrop Pickup Info" block renders on the Thank you page where the merchant placed it.
- **Actual:** Nothing renders. A DOM search of the live thank-you page finds none of the block's text (e.g. "Locker pickup confirmed!", "What happens next"). Only the native shipping-line text is present.

## Steps to reproduce
1. Deploy the app (`shopify app deploy`) — build succeeds, "New version released to users."
2. In Checkout & accounts editor → **Thank you** page, the **LockerDrop Pickup Info** block is present in the layout tree and saved (no pending changes).
3. Place a test order on `locker-plus.myshopify.com`.
4. On the resulting thank-you page, the block does not appear. Its markup is absent from the DOM.

## What we have already verified / ruled out (please skip these)
- ✅ **Builds & deploys cleanly** — `lockerdrop-thankyou successfully built`, version released (107, 108, 109).
- ✅ **Correct, current API** — migrated from the removed imperative API to the 2025-10 Preact + Polaris web-components API; all components validated against the schema; bundles verified with esbuild.
- ✅ **Block is placed AND saved** on the Thank you page in the editor (confirmed in the layout tree; Save shows no pending changes).
- ✅ **Not a data/logic path (bare static test)** — the final build's entire module is `export default function extension() { render(<s-banner heading="LockerDrop test">…</s-banner>, document.body) }` — **no hooks, no order lookup, no `shopify` global, no branching, no network**. Deployed & released as v110, placed a fresh order, and the banner is still **absent from the immediate thank-you page DOM** (verified via accessibility-tree search).
- ✅ **Not capabilities** — removed the entire `[extensions.capabilities]` block (no `network_access`, no `api_access`). Still nothing renders.
- ✅ **Not a network/fetch issue** — the minimal build makes **no `fetch()` and no `sessionToken` call** at all.
- ✅ **Right surface** — tested the one-time Thank You page that loads immediately after "Pay now" (not the returning Order status page). Also tested the `customer-account.order-status.block.render` surface separately — both blank.
- ✅ **No storefront console error** — the browser console on the thank-you page shows only Shopify's own logs; no `ExtensionUsageError` or extension exception in the parent frame.
- ✅ **App is installed** (uninstalled/reinstalled once); carrier-service shipping rates from the same app work correctly (the "LockerDrop @ …" shipping option appears and is selectable at checkout).
- ✅ **All three of the app's Preact 2025-10 UI extensions render nothing** — `purchase.thank-you.block.render`, `customer-account.order-status.block.render`, AND `admin.order-details.block.render`. The admin block fetches its data from our backend on mount; after a fresh order-page load, **no request reaches our server** (added a log line to confirm) — i.e. it isn't mounting. Notably, the admin block **did render on the old imperative API** and went blank only after migrating to the required 2025-10 Preact API — same as the checkout/customer-account blocks. Non-UI-extension parts of the app (carrier service, OAuth, webhooks, Admin GraphQL from our server) all work.

## The question for support
Given a checkout UI extension whose entire module is a single static `<s-banner>` that **builds, deploys, is placed & saved on the active profile, uses a supported api_version, requests no capabilities, and has no data/network dependency** — yet produces **no DOM output** on the live Thank You page and logs no error — **why is the extension not being loaded/mounted for this store, and what do the extension-load logs on your side show for app `297504309249` on `locker-plus.myshopify.com` (version `lockerdrop-110`)?**

Is there an activation/approval step, a store-level flag, or an app-reinstall requirement we're missing for a newly-(re)built checkout UI extension to begin rendering?

## Notes
- We can reproduce on demand and provide a HAR, screen recording, or a fresh test order at your request.
- Minimal reproducing source (Thank You target) available on request.
