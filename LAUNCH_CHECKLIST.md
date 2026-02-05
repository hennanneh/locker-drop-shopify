# LockerDrop Launch Checklist

> **Last Updated:** 2026-02-05
> **Sources:** Project Review | Harbor Checklist | Shopify App Store Requirements
> **Estimated Total:** 100-160 hours across all phases

---

## Summary

| Priority | Count | Description |
|----------|-------|-------------|
| 🔴 CRITICAL | 9 | Must fix before any real merchant or app store submission |
| 🟡 HIGH | 12 | Should fix before launch |
| 🟢 MEDIUM | 11 | Needed for app store review or best practices |
| 🔵 LOW | 4 | Post-launch improvements |

---

## Phase 1: Launch Blockers (Week 1-2)

> These must be completed before submitting to Shopify App Store or onboarding a real merchant.
> Estimated: 20-35 hours

| # | Task | Source | Priority | Status | Time Est. | Notes |
|---|------|--------|----------|--------|-----------|-------|
| 1 | Add `app/uninstalled` webhook handler | Shopify 2.3 | 🔴 CRITICAL | ⬜ Not Started | 2-3 hrs | Required for app review. Clean up store data on uninstall. |
| 2 | Switch Harbor API from sandbox to production | Harbor | 🔴 CRITICAL | 🚫 Blocked | 1-2 hrs | Blocked until Harbor provides production credentials. Send email first. |
| 3 | Remove hardcoded locker ID 329 default | Review | 🔴 CRITICAL | 🔧 Needs Work | 1-2 hrs | Orders missing locker data go to wrong locker. Add proper error handling. |
| 4 | Replace in-memory sessions with `connect-pg-simple` | Shopify | 🔴 CRITICAL | ⬜ Not Started | 2-3 hrs | Sessions lost on server restart. Use existing PostgreSQL. |
| 5 | Migrate REST Admin API calls to GraphQL | Shopify 2.2.4 | 🔴 CRITICAL | 🔧 Needs Work | 4-8 hrs | Required since April 2025. Audit all REST calls in server.js and shopify.service.js. |
| 6 | Add Shopify App Bridge latest version | Shopify 2.2.3 | 🔴 CRITICAL | 🔧 Needs Work | 2-4 hrs | Add app-bridge.js script tag before other scripts in dashboard. |
| 7 | Ensure embedded app experience | Shopify 2.2.2 | 🔴 CRITICAL | 🔧 Needs Work | 3-5 hrs | Dashboard must load embedded in Shopify Admin, not standalone. |
| 8 | Fix SSL `rejectUnauthorized: false` on DB connection | Review | 🔴 CRITICAL | 🔧 Needs Work | 1 hr | Get proper CA cert from DigitalOcean. Security requirement (3.1). |
| 9 | Clarify Harbor error handling responsibilities | Harbor | 🔴 CRITICAL | 🚫 Blocked | N/A | Send email to Harbor. Answers determine scope of items 10-14. |

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

- **Harbor Production Credentials:** Items 2, 10-12, 32 are blocked or dependent on Harbor production API access and answers to the email about error handling responsibilities.
- **GraphQL Migration:** Item 5 (REST → GraphQL) is a hard Shopify requirement since April 2025. Touches many files — audit server.js and shopify.service.js for all REST calls.
- **App Bridge + Embedded Experience:** Items 6-7 are related. The admin dashboard currently loads standalone. Shopify requires it embedded within Shopify Admin using App Bridge.
- **Billing Decision:** Item 18 blocks item 19. Decide whether to keep $1/order shipping fee or activate subscriptions. Either way, must go through Shopify Billing API (1.2).

---

## Recommended Execution Order

1. **TODAY:** Send the Harbor email (item 9). Their answers unblock 5+ items.
2. **This week:** Items 1, 3, 4, 8 (quick critical fixes, 6-9 hrs). Then start item 5 (GraphQL migration).
3. **Next week:** Items 5-7 (GraphQL + App Bridge + embedded). Then items 13-16 (rate limiting, cron, logging).
4. **Week 3:** Harbor-dependent items (10-12) once answers arrive. Billing cleanup (18-19). Begin submission prep (20-28).
5. **Week 4:** Submit to Shopify App Store. Begin Phase 4 while waiting for review.

---

## Status Legend

| Icon | Meaning |
|------|---------|
| ⬜ Not Started | Work has not begun |
| 🔧 Needs Work | Partially implemented or needs changes |
| 🚫 Blocked | Waiting on external dependency |
| ✅ Done | Completed and verified |

---

*This checklist is maintained by Claude Code. To update, change the status field and add completion dates.*
