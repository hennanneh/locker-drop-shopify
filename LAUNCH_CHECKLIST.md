# LockerDrop Launch Checklist

> **Last Updated:** 2026-02-05 (Harbor response received, items 9-12 updated)
> **Sources:** Project Review | Harbor Checklist | Shopify App Store Requirements
> **Estimated Total:** 100-160 hours across all phases

---

## Summary

| Priority | Count | Done | Description |
|----------|-------|------|-------------|
| 🔴 CRITICAL | 10 | 9 ✅ | Must fix before any real merchant or app store submission |
| 🟡 HIGH | 13 | 5 ✅ | Should fix before launch |
| 🟢 MEDIUM | 12 | 1 ✅ | Needed for app store review or best practices |
| 🔵 LOW | 5 | 0 | Post-launch improvements |

---

## Phase 1: Launch Blockers (Week 1-2)

> These must be completed before submitting to Shopify App Store or onboarding a real merchant.
> Estimated: 20-35 hours

| # | Task | Source | Priority | Status | Time Est. | Notes |
|---|------|--------|----------|--------|-----------|-------|
| 1 | Add `app/uninstalled` webhook handler | Shopify 2.3 | 🔴 CRITICAL | ✅ Done | 2-3 hrs | Webhook registered on install. Handler deletes orders, preferences, settings, branding, sessions, releases active lockers in Harbor, and removes store record. |
| 2 | Switch Harbor API from sandbox to production | Harbor | 🔴 CRITICAL | ⬜ Not Started | 1-2 hrs | **UNBLOCKED.** Harbor confirmed: just change URL + client_id + client_secret to production values. Request production keys from Harbor contact. ~50 hardcoded sandbox URLs in server.js need to use `HARBOR_API_URL` env var + accounts URL needs `HARBOR_ACCOUNTS_URL` env var. |
| 3 | Remove hardcoded locker ID 329 default | Review | 🔴 CRITICAL | ✅ Done | 1-2 hrs | Removed all 4 instances. Sync orders now extract location from shipping lines/attributes. Regenerate endpoints return errors if no location assigned. Fallback uses seller's first enabled locker preference. |
| 4 | Replace in-memory sessions with `connect-pg-simple` | Shopify | 🔴 CRITICAL | ✅ Done | 2-3 hrs | Installed `connect-pg-simple`. Sessions now stored in `user_sessions` table (auto-created). Survives server restarts. Uninstall handler also cleans up sessions. |
| 5 | Migrate REST Admin API calls to GraphQL | Shopify 2.2.4 | 🔴 CRITICAL | ✅ Done | 4-8 hrs | All REST Admin API calls migrated: shop.json → GraphQL `shop` query, orders.json → GraphQL `orders` query, webhooks.json → `webhookSubscriptionCreate`, carrier_services.json → `carrierServiceCreate`, fulfillments.json → `fulfillmentCreateV2`. OAuth endpoints (access_token, access_scopes, authorize) remain REST as required. shopify.service.js also fully migrated. |
| 6 | Add Shopify App Bridge latest version | Shopify 2.2.3 | 🔴 CRITICAL | ✅ Done | 2-4 hrs | Added `cdn.shopify.com/shopifycloud/app-bridge.js` script tag. App Bridge auto-initializes when loaded via Shopify Admin. Added `isEmbedded` detection and `openExternalUrl` helper. |
| 7 | Ensure embedded app experience | Shopify 2.2.2 | 🔴 CRITICAL | ✅ Done | 3-5 hrs | Set `embedded = true` in shopify.app.toml. Dashboard route redirects to Shopify Admin embedded URL when accessed directly (no `host` param). OAuth callback redirects to embedded app. Re-auth flow handles iframe breakout. |
| 8 | Fix SSL `rejectUnauthorized: false` on DB connection | Review | 🔴 CRITICAL | ✅ Done | 1 hr | Updated `db.js` and `setup-database.js`. Now loads CA cert from `DB_CA_CERT` file path or `DB_CA_CERT_BASE64` env var. Falls back to unverified with warning if neither is set. Download CA cert from DigitalOcean dashboard and set the env var to complete. |
| 9 | Clarify Harbor error handling responsibilities | Harbor | 🔴 CRITICAL | ✅ Done | N/A | **Harbor responded 2026-02-05.** Key answers: (1) No duplicate lockers — reservation exclusive for 5 min. (2) 5-min reservation timeout, then locker returns to available. (3) Locker open handled by Harbor app/app clip, not us. (4) Can't track connection failures, only successes — 99% device issues. (5) Retry same link works, usually 2nd try succeeds. (6) Built-in "doesn't fit" flow for dropoff — user selects it, locker reopens, reservation cancelled, user picks new size. (7) Production keys available on request, just change URL + credentials. |

---

## Phase 2: Hardening & Edge Cases (Week 2-3)

> Handle failure scenarios, improve reliability, finalize billing.
> Estimated: 25-35 hours

| # | Task | Source | Priority | Status | Time Est. | Notes |
|---|------|--------|----------|--------|-----------|-------|
| 10 | Build stuck order detection for failed Harbor callbacks | Harbor | 🟡 HIGH | ⬜ Not Started | 3-4 hrs | If dropoff/pickup callback never fires, orders get stuck. Harbor's 5-min reservation timeout means unclaimed dropoffs auto-release. Need: (a) cron to detect orders stuck in `pending_dropoff` past X hours with no callback, (b) alert seller, (c) option to regenerate dropoff link. |
| 11 | Add locker size change flow for sellers | Harbor | 🟡 HIGH | ⬜ Not Started | 2-3 hrs | **Simpler than expected.** Harbor has built-in "doesn't fit" flow for dropoff — user selects "Doesn't fit", locker reopens, reservation cancelled. We just need to: (a) handle the cancellation callback, (b) let seller generate a new dropoff link for a different size, (c) update the order record. |
| 12 | Add retry/troubleshooting on success pages | Harbor | 🟡 HIGH | ⬜ Not Started | 1-2 hrs | **Simpler than expected.** Harbor says retry same link works (usually 2nd try succeeds). Connection failures are 99% device issues, not trackable. Just need: (a) "Try again" button that re-opens same link, (b) brief troubleshooting tips (move closer, check Bluetooth), (c) support contact link. |
| 13 | Add `express-rate-limit` to public API endpoints | Review | 🟡 HIGH | ✅ Done | 1-2 hrs | Three rate limiters: `publicApiLimiter` (30/min), `checkoutLimiter` (60/min), `webhookLimiter` (120/min). Applied to all public, checkout, and webhook routes. |
| 14 | Add `node-cron` job for locker expiry | Review | 🟡 HIGH | ✅ Done | 3-4 hrs | Cron runs every 6 hours. Finds orders past `hold_time_days`, releases lockers via Harbor API, marks orders as `expired`, emails customer + seller. Also sends 1-day warning emails for orders approaching expiry. |
| 15 | Add `orders/updated` webhook handler | Review | 🟡 HIGH | ✅ Done | 2-3 hrs | `ORDERS_UPDATED` webhook registered on install. Handler syncs customer name/email/phone from Shopify. Detects external fulfillment and marks orders as completed. Skips completed/cancelled/expired orders. |
| 16 | Add structured logging (pino) | Harbor | 🟡 HIGH | ✅ Done | 3-4 hrs | Replaced all 417 `console.log`/`console.error` calls with `pino` structured logger. JSON output in production, pretty-printed in development. Log level configurable via `LOG_LEVEL` env var. |
| 17 | Add frontend error tracking to dashboard + extensions | Harbor | 🟡 HIGH | ✅ Done | 2-3 hrs | Added `POST /api/errors` endpoint. Dashboard has `window.onerror` + `unhandledrejection` handlers. Checkout extension and order block extension report errors with `reportError()` helper. All errors logged via pino with source, stack trace, and context. |
| 18 | Decide and clean up billing model | Review | 🟡 HIGH | 🔧 Needs Work | 2-4 hrs | **Decision made:** Per-order fee (Strategy 1) for launch. Use Shopify Billing API `usageRecordCreate` after each order. Remove or disable subscription code. See `lockerdrop-pricing-strategies.jsx` for all 5 strategies. |
| 19 | Ensure billing plan changes work without reinstall | Shopify 1.2.3 | 🟡 HIGH | 🔧 Needs Work | 2-3 hrs | Merchants must upgrade/downgrade without contacting support. |

---

## Phase 3: App Store Submission Prep (Week 3-4)

> Everything needed for Shopify App Store review.
> Estimated: 15-20 hours

| # | Task | Source | Priority | Status | Time Est. | Notes |
|---|------|--------|----------|--------|-----------|-------|
| 20 | Create demo screencast video | Shopify 4.5.3 | 🟡 HIGH | ⬜ Not Started | 4-6 hrs | Required for submission. Show onboarding + core features in English. |
| 21 | Prepare test credentials for Shopify review | Shopify 4.5.4 | 🟡 HIGH | ⬜ Not Started | 1-2 hrs | Functional credentials granting full access to all features. |
| 22 | Create App Store listing content | Shopify 4.4 | 🟡 HIGH | ⬜ Not Started | 3-4 hrs | Name, subtitle, description, screenshots. No pricing in images, no stats/claims. |
| 23 | Add geographic requirement to listing | Shopify 4.3.8 | 🟢 MEDIUM | ⬜ Not Started | 30 min | Harbor Lockers are US-only. Indicate in listing. |
| 24 | Upload app icon to Dev Dashboard | Shopify 4.1.2 | 🟢 MEDIUM | ⬜ Not Started | 30 min | Must match between Dev Dashboard and App Store listing. |
| 25 | Add emergency developer contact | Shopify 4.5.6 | 🟢 MEDIUM | ✅ Done | 15 min | Added to Partner Dashboard settings. |
| 26 | Add theme extension setup deep links + instructions | Shopify 5.1.3 | 🟢 MEDIUM | 🔧 Needs Work | 2-3 hrs | Detailed instructions + deep links for installing theme blocks. |
| 27 | Verify checkout extension displays properly | Shopify 5.6.1 | 🟢 MEDIUM | 🔧 Needs Work | 2-3 hrs | Test locker selection in checkout on desktop and mobile. |
| 28 | Review scopes — remove any unnecessary ones | Shopify 3.2 | 🟢 MEDIUM | 🔧 Needs Work | 1-2 hrs | Must justify all requested scopes. Consider optional scopes. |
| 38 | Add GDPR compliance webhooks | Shopify | 🔴 CRITICAL | ✅ Done | 2-3 hrs | Implemented `customers/data_request` (logs + queries customer data for export), `customers/redact` (anonymizes PII in orders table), `shop/redact` (reuses `processAppUninstall` cleanup). URLs declared in `shopify.app.toml` under `[webhooks.privacy_compliance]`. All handlers return 200 to Shopify. |
| 39 | Complete protected customer data access request | Shopify | 🟡 HIGH | ⬜ Not Started | 1 hr | In Partner Dashboard, explain why we access customer email, name, phone, and address (needed for pickup notifications, locker assignment, and order fulfillment). |
| 40 | Select app capabilities in Partner Dashboard | Shopify | 🟢 MEDIUM | ⬜ Not Started | 15 min | Select shipping/fulfillment category in Partner Dashboard. |

---

## Phase 4: Post-Launch Improvements (Month 2+)

> Technical debt, testing, and future features.
> Estimated: 50-75 hours

| # | Task | Source | Priority | Status | Time Est. | Notes |
|---|------|--------|----------|--------|-----------|-------|
| 29 | Refactor server.js into modular route files | Review | 🟢 MEDIUM | ⬜ Not Started | 8-12 hrs | 3,500 lines in one file. Not a blocker but improves maintainability. |
| 30 | Encrypt Shopify access tokens in database | Review | 🟢 MEDIUM | ⬜ Not Started | 2-3 hrs | Currently stored as plaintext TEXT. Encrypt at rest. |
| 31 | Add CSRF protection to POST endpoints | Review | 🟢 MEDIUM | ⬜ Not Started | 2-3 hrs | Currently relies on session + HMAC but no CSRF tokens. |
| 32 | Set up Harbor sandbox + production env toggle | Harbor | 🟢 MEDIUM | ⬜ Not Started | 2-3 hrs | **Should be done with item #2.** Replace ~50 hardcoded `api.sandbox.harborlockers.com` URLs with `process.env.HARBOR_API_URL`. Replace ~22 hardcoded `accounts.sandbox.harborlockers.com` URLs with `process.env.HARBOR_ACCOUNTS_URL`. Then switching is just changing `.env` values. |
| 33 | Add automated tests | Review | 🔵 LOW | ⬜ Not Started | 8-16 hrs | No test framework. Start with critical paths: OAuth, webhooks, callbacks. |
| 34 | Set up CI/CD pipeline | Review | 🔵 LOW | ⬜ Not Started | 4-6 hrs | No GitHub Actions. Automate deploy to DigitalOcean. |
| 35 | Add returns via locker support | Review | 🔵 LOW | ⬜ Not Started | 16-24 hrs | Customer FAQ says "not available yet." Future feature. |
| 36 | Add multi-package order support | Review | 🔵 LOW | ⬜ Not Started | 8-12 hrs | Split orders across multiple lockers. Future feature. |
| 37 | Evolve pricing to tiered subscription model | Review | 🔵 LOW | ⬜ Not Started | 8-12 hrs | Strategy 2 or 3 from `lockerdrop-pricing-strategies.jsx`. Add Shopify Managed Pricing or hybrid subscription+usage. Gate premium features (branding, analytics, multi-locker) behind paid tiers. Implement after 10+ merchants prove product-market fit. |

---

## Pricing Strategy

> **Launch Model (Strategy 1):** Pure Per-Order Fee — $1-$2 per locker transaction via Shopify usage-based billing.
> **Future Options:** See `lockerdrop-pricing-strategies.jsx` for 5 strategies with full analysis:
> 1. Pure Per-Order Fee (launch) — $1-$2/order, zero friction
> 2. Tiered Subscription — Free / $19 / $49 plans
> 3. Subscription + Usage Hybrid — $9/mo base + $0.75/order
> 4. Commission on Shipping Fee — % of customer-facing charge
> 5. Marketplace Revenue Share — 15-25% of Harbor transaction

---

## Key Dependencies & Blockers

- ~~**Harbor Production Credentials:** Items 2, 10-12, 32 are blocked or dependent on Harbor production API access.~~ **RESOLVED.** Harbor responded 2026-02-05. Production keys available on request. Items 10-12 scoped based on Harbor's answers (simpler than expected). Item 2+32 should be done together (replace hardcoded URLs with env vars, then swap credentials).
- ~~**GraphQL Migration:** Item 5 — RESOLVED. All REST Admin API calls migrated to GraphQL.~~
- ~~**App Bridge + Embedded Experience:** Items 6-7 — RESOLVED. App Bridge added, embedded = true, dashboard redirects to Shopify Admin.~~
- **Billing Decision:** Item 18 blocks item 19. Decision made: per-order fee for launch. Needs implementation via Shopify `usageRecordCreate`. Remove or disable subscription code.
- ~~**SSL CA Certificate:** Item 8 — RESOLVED. CA cert loaded from `DB_CA_CERT=./ca-certificate.crt` in `.env`.~~

---

## Recommended Execution Order

1. ~~**TODAY:** Send the Harbor email (item 9).~~ **DONE** — Email sent 2026-02-05.
2. ~~**This week:** Items 1, 3, 4, 8 (quick critical fixes).~~ **DONE** — All 4 completed by Claude Code.
3. ~~**Next up:** Items 5-7 (GraphQL migration + App Bridge + embedded experience).~~ **DONE** — All 3 completed by Claude Code.
4. ~~**Then:** Items 13-17 (rate limiting, cron jobs, logging, error tracking).~~ **DONE** — All 5 completed by Claude Code.
5. **Next:** Item 2+32 together (replace hardcoded Harbor URLs with env vars — prerequisite for production switch). Items 10-12 (Harbor edge cases — scoped simpler after Harbor's response). Billing cleanup (18-19).
6. **Then:** Request production keys from Harbor, swap `.env` values, test end-to-end.
7. **Week 3-4:** Begin submission prep (20-28). Submit to Shopify App Store. Start Phase 4 while waiting for review.

---

## Status Legend

| Icon | Meaning |
|------|---------|
| ⬜ Not Started | Work has not begun |
| 🔧 Needs Work | Partially implemented or needs changes |
| 🚫 Blocked | Waiting on external dependency |
| ⏳ Waiting | Action taken, awaiting response |
| ✅ Done | Completed and verified |

---

*This checklist is maintained by Claude Code. To update, change the status field and add completion dates.*
