# Shopify Support Ticket — Checkout UI extension deployed & placed but never renders

**Subject:** `purchase.thank-you.block.render` extension deploys and is placed in the checkout editor but never mounts (no DOM output) on the live Thank You page

## Summary
A checkout UI extension (Thank You page block) builds and deploys successfully, the block is added **and saved** to the Thank you page in the checkout editor, but it **never renders on the live thank-you page** — its output is completely absent from the page DOM. There is **no error in the storefront console**. As the final isolation test we reduced the entire extension to a **single bare static `<s-banner>` — no hooks, no data, no `shopify` global, no network** — deployed and released it, placed an order, and it *still* produces zero DOM on the immediate thank-you page. A static banner cannot fail to render for any code reason, so this points conclusively to an extension-runtime/delivery issue on Shopify's side rather than our code.

---

## 2026-08-08 UPDATE — retested on current toolchain; delivery + registration now PROVEN, and a static (no-placement) target also fails

Re-verified the whole chain on the current toolchain and captured hard evidence that the bundle is delivered, fetched, and registered — yet still renders nothing. This narrows the failure to Shopify's extension runtime for this app.

**Toolchain refreshed (ruled out as the cause):**
- Rebuilt/redeployed with **Shopify CLI 4.6.1** (previously deployed via 3.87.1). Clean builds, versions `lockerdrop-112` → `115`.
- Upgraded the extension from api_version **2025-10 → 2026-07** and SDK `@shopify/ui-extensions` **2025.10.15 → 2026.7.1**. Still blank.
- Dependencies verified installed and peer-compatible (`preact` 10.29.7, `@preact/signals` 2.9.3; SDK peerDeps on both are `*`).

**HARD PROOF the extension is delivered and fetched (not a delivery failure):**
- On the live thank-you page, `performance.getEntriesByType('resource')` shows the browser **did fetch** the extension bundle:
  `https://extensions.shopifycdn.com/partners-extensions-scripts-bucket/ui_extension/handle/lockerdrop-thankyou/version/lockerdrop-113/019b99df-62d4-78e9-9b65-b55373b8a87a/….js` (HTTP 200, ~28 KB).
- The page's serialized checkout config **registers the extension**: `appId gid://shopify/App/297504309249`, `appName "LockerDrop"`, `extensionPoints ["Checkout::ThankYou::Dynamic::Render"]`, `registrationUuid 019b99df-62d4-78e9-9b65-b55373b8a87a`, matching `scriptUrl`, `version lockerdrop-113`.
- The **deployed CDN bundle content is correct** — its tail is literally:
  `shopify.extend("purchase.thank-you.block.render", (...e)=>qe(...e))` where `qe(){ render(<s-banner tone="success" heading="LockerDrop test">…</s-banner>, document.body) }`.
- The checkout **extension host is present** on the page (iframe `extensions.shopifycdn.com/shopifycloud/checkout-web/assets/c1/assets/load.*.html`).

**Placement ruled out — a STATIC (auto-render, no-placement) target ALSO fails:**
- Added a second target `purchase.thank-you.customer-information.render-after` (a static render-after target that requires **no** merchant placement) as a bare `<s-banner>`, deployed as `lockerdrop-114`.
- On a fresh live order, the page registers **both** points — `extensionPoints ["Checkout::ThankYou::Dynamic::Render","Checkout::ThankYou::CustomerInformation…"]` — the v114 bundle is fetched, and **neither target renders any DOM**. No console error.
- This eliminates block/placement mechanics: even the auto-rendering static target is blank.

**Also fails in Shopify's own editor:** In the checkout **editor preview**, the placed "LockerDrop Pickup Info" block is present in the layout tree and set to visible (no error in its config panel), but renders nothing in the preview. Native blocks (Confirmation, Order details) render fine; no app-extension content renders.

**Net:** code, config, CLI, api_version, SDK, dependencies, delivery (fetched), registration, and placement are all verified correct/current — yet every one of this app's UI-extension targets (block + static, thank-you + order-status + admin) produces zero DOM. The app's non-extension surfaces (CarrierService rates, OAuth, webhooks, Admin GraphQL) all work.

**Refined ask:** Please check the **extension-load / sandbox-execution logs** for app `297504309249` on `locker-plus.myshopify.com` for versions `lockerdrop-112`–`115`. The bundle is fetched and calls `shopify.extend(...)`, but no target ever mounts. Is the extension sandbox failing to execute this app's bundle, is `shopify.extend` registration being dropped for this app, or is there an app-level flag gating extension rendering?

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
