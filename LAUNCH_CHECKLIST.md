# LockerDrop Launch Checklist

> **Last Updated:** 2026-02-05 (updated by Claude Code)
> **Sources:** Project Review | Harbor Checklist | Shopify App Store Requirements
> **Estimated Total:** 100-160 hours across all phases

---

## Summary

| Priority | Count | Done | Description |
|----------|-------|------|-------------|
| 🔴 CRITICAL | 9 | 7 ✅ | Must fix before any real merchant or app store submission |
| 🟡 HIGH | 12 | 0 | Should fix before launch |
| 🟢 MEDIUM | 11 | 0 | Needed for app store review or best practices |
| 🔵 LOW | 4 | 0 | Post-launch improvements |

---

## Phase 1: Launch Blockers (Week 1-2)

> These must be completed before submitting to Shopify App Store or onboarding a real merchant.
> Estimated: 20-35 hours

| # | Task | Source | Priority | Status | Time Est. | Notes |
|---|------|--------|----------|--------|-----------|-------|
| 1 | Add `app/uninstalled` webhook handler | Shopify 2.3 | 🔴 CRITICAL | ✅ Done | 2-3 hrs | Webhook registered on install. Handler deletes orders, preferences, settings, branding, sessions, releases active lockers in Harbor, and removes store record. |
| 2 | Switch Harbor API from sandbox to production | Harbor | 🔴 CRITICAL | 🚫 Blocked | 1-2 hrs | Blocked until Harbor provides production credentials. Send email first. |
| 3 | Remove hardcoded locker ID 329 default | Review | 🔴 CRITICAL | ✅ Done | 1-2 hrs | Removed all 4 instances. Sync orders now extract location from shipping lines/attributes. Regenerate endpoints return errors if no location assigned. Fallback uses seller's first enabled locker preference. |
| 4 | Replace in-memory sessions with `connect-pg-simple` | Shopify | 🔴 CRITICAL | ✅ Done | 2-3 hrs | Installed `connect-pg-simple`. Sessions now stored in `user_sessions` table (auto-created). Survives server restarts. Uninstall handler also cleans up sessions. |
| 5 | Migrate REST Admin API calls to GraphQL | Shopify 2.2.4 | 🔴 CRITICAL | ✅ Done | 4-8 hrs | All REST Admin API calls migrated: shop.json → GraphQL `shop` query, orders.json → GraphQL `orders` query, webhooks.json → `webhookSubscriptionCreate`, carrier_services.json → `carrierServiceCreate`, fulfillments.json → `fulfillmentCreateV2`. OAuth endpoints (access_token, access_scopes, authorize) remain REST as required. shopify.service.js also fully migrated. |
| 6 | Add Shopify App Bridge latest version | Shopify 2.2.3 | 🔴 CRITICAL | ✅ Done | 2-4 hrs | Added `cdn.shopify.com/shopifycloud/app-bridge.js` script tag. App Bridge auto-initializes when loaded via Shopify Admin. Added `isEmbedded` detection and `openExternalUrl` helper. |
| 7 | Ensure embedded app experience | Shopify 2.2.2 | 🔴 CRITICAL | ✅ Done | 3-5 hrs | Set `embedded = true` in shopify.app.toml. Dashboard route redirects to Shopify Admin embedded URL when accessed directly (no `host` param). OAuth callback redirects to embedded app. Re-auth flow handles iframe breakout. |
| 8 | Fix SSL `rejectUnauthorized: false` on DB connection | Review | 🔴 CRITICAL | ✅ Done | 1 hr | Updated `db.js` and `setup-database.js`. Now loads CA cert from `DB_CA_CERT` file path or `DB_CA_CERT_BASE64` env var. Falls back to unverified with warning if neither is set. Download CA cert from DigitalOcean dashboard and set the env var to complete. |
| 9 | Clarify Harbor error handling responsibilities | Harbor | 🔴 CRITICAL | ⏳ Waiting | N/A | Email sent to Harbor on 2026-02-05. Awaiting response. Answers determine scope of items 10-14. |

---

## Phase 2: Hardening & Edge Cases (Week 2-3)

> Handle failure scenarios, improve reliability, finalize billing.
> Estimated: 25-35 hours

| # | Task | Source | Priority | Status | Time Est. | Notes |
|---|------|--------|----------|--------|-----------|-------|
| 10 | Build stuck order detection for failed Harbor callbacks | Harbor | 🟡 HIGH | ⬜ Not Started | 3-4 hrs | If dropoff/pickup callback never fires, orders get stuck indefinitely. |
| 11 | Add locker size change flow for sellers | Harbor | 🟡 HIGH | ⬜ Not Started | 3-4 hrs | Package won't fit: cancel request, release locker, generate new link for different size. |
| 12 | Add retry/troubleshooting on success pages | Harbor | 🟡 HIGH | ⬜ Not Started | 2-3 hrs | "Locker didn't open" flow: retry button + contact support link. |
| 13 | Add `express-rate-limit` to public API endpoints | Review | 🟡 HIGH | ⬜ Not Started | 1-2 hrs | Public endpoints like /api/public/lockers have no rate limiting. |
| 14 | Add `node-cron` job for locker expiry | Review | 🟡 HIGH | ⬜ Not Started | 3-4 hrs | Orders past hold_time_days sit forever. Need expiry warnings + auto-release. |
| 15 | Add `orders/updated` webhook handler | Review | 🟡 HIGH | ⬜ Not Started | 2-3 hrs | Changes in Shopify after order creation aren't synced. |
| 16 | Add structured logging (winston or pino) | Harbor | 🟡 HIGH | ⬜ Not Started | 3-4 hrs | Harbor checklist: error logging front and backend. logs/ exists but untracked. |
| 17 | Add frontend error tracking to dashboard + extensions | Harbor | 🟡 HIGH | ⬜ Not Started | 2-3 hrs | Harbor checklist: enable error logging in FRONT and BACKEND. |
| 18 | Decide and clean up billing model | Review | 🟡 HIGH | 🔧 Needs Work | 2-4 hrs | Subscription system built but bypassed. $1/order active. Pick one, remove other. |
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
| 25 | Add emergency developer contact | Shopify 4.5.6 | 🟢 MEDIUM | ⬜ Not Started | 15 min | Add to Partner Dashboard settings. |
| 26 | Add theme extension setup deep links + instructions | Shopify 5.1.3 | 🟢 MEDIUM | 🔧 Needs Work | 2-3 hrs | Detailed instructions + deep links for installing theme blocks. |
| 27 | Verify checkout extension displays properly | Shopify 5.6.1 | 🟢 MEDIUM | 🔧 Needs Work | 2-3 hrs | Test locker selection in checkout on desktop and mobile. |
| 28 | Review scopes — remove any unnecessary ones | Shopify 3.2 | 🟢 MEDIUM | 🔧 Needs Work | 1-2 hrs | Must justify all requested scopes. Consider optional scopes. |

---

## Phase 4: Post-Launch Improvements (Month 2+)

> Technical debt, testing, and future features.
> Estimated: 50-75 hours

| # | Task | Source | Priority | Status | Time Est. | Notes |
|---|------|--------|----------|--------|-----------|-------|
| 29 | Refactor server.js into modular route files | Review | 🟢 MEDIUM | ⬜ Not Started | 8-12 hrs | 3,500 lines in one file. Not a blocker but improves maintainability. |
| 30 | Encrypt Shopify access tokens in database | Review | 🟢 MEDIUM | ⬜ Not Started | 2-3 hrs | Currently stored as plaintext TEXT. Encrypt at rest. |
| 31 | Add CSRF protection to POST endpoints | Review | 🟢 MEDIUM | ⬜ Not Started | 2-3 hrs | Currently relies on session + HMAC but no CSRF tokens. |
| 32 | Set up Harbor sandbox + production env toggle | Harbor | 🟢 MEDIUM | ⬜ Not Started | 2-3 hrs | Harbor checklist: have sandbox for testing. Use env var to toggle. |
| 33 | Add automated tests | Review | 🔵 LOW | ⬜ Not Started | 8-16 hrs | No test framework. Start with critical paths: OAuth, webhooks, callbacks. |
| 34 | Set up CI/CD pipeline | Review | 🔵 LOW | ⬜ Not Started | 4-6 hrs | No GitHub Actions. Automate deploy to DigitalOcean. |
| 35 | Add returns via locker support | Review | 🔵 LOW | ⬜ Not Started | 16-24 hrs | Customer FAQ says "not available yet." Future feature. |
| 36 | Add multi-package order support | Review | 🔵 LOW | ⬜ Not Started | 8-12 hrs | Split orders across multiple lockers. Future feature. |

---

## Key Dependencies & Blockers

- **Harbor Production Credentials:** Items 2, 10-12, 32 are blocked or dependent on Harbor production API access and answers to the email about error handling responsibilities. Email sent 2026-02-05, awaiting response.
- ~~**GraphQL Migration:** Item 5 — RESOLVED. All REST Admin API calls migrated to GraphQL.~~
- ~~**App Bridge + Embedded Experience:** Items 6-7 — RESOLVED. App Bridge added, embedded = true, dashboard redirects to Shopify Admin.~~
- **Billing Decision:** Item 18 blocks item 19. Decide whether to keep $1/order shipping fee or activate subscriptions. Either way, must go through Shopify Billing API (1.2).
- **SSL CA Certificate:** Item 8 code is done, but you still need to download the CA cert from DigitalOcean and set the `DB_CA_CERT` or `DB_CA_CERT_BASE64` env var on the server.

---

## Recommended Execution Order

1. ~~**TODAY:** Send the Harbor email (item 9).~~ **DONE** — Email sent 2026-02-05.
2. ~~**This week:** Items 1, 3, 4, 8 (quick critical fixes).~~ **DONE** — All 4 completed by Claude Code.
3. ~~**Next up:** Items 5-7 (GraphQL migration + App Bridge + embedded experience).~~ **DONE** — All 3 completed by Claude Code.
4. **Then:** Items 13-16 (rate limiting, cron jobs, logging). Plus Harbor-dependent items (10-12) once answers arrive. Billing cleanup (18-19).
5. **Week 3-4:** Begin submission prep (20-28). Submit to Shopify App Store. Start Phase 4 while waiting for review.

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
