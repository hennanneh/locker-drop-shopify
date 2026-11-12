# LockerDrop Review QA, 2026-11-12

Prod commit under test: ab366d1 (local HEAD matches origin/main; Droplet state NOT checked, SSH banned).

## Verdict: CONDITIONAL / NO-GO until the three paused-review items are verified in a browser

Everything testable anonymously passes. The three items Shopify actually flagged (Sim buttons, confirmation email, regenerate link) could not be exercised live because no browser tool was available in this session. Static code review says the fixes are present and plausible, but that is not evidence of behavior.

## Anonymous curl results (all as expected)
- GET / -> 200; shopify-api-key meta = d0123a17d1e004675deaca3a4a154239 (substituted, not placeholder)
- Webhooks without HMAC -> 401: app/uninstalled, customers/data_request, customers/redact, shop/redact, orders/create, orders/updated, orders/cancelled, app/subscriptions-update. Bad HMAC value on orders/create -> 401.
- Unauth /api/* -> 401: stats, settings (GET+POST), lockers, sync-orders, products, subscription, locker-availability, product-sizes, shop-plan, orders/:shop, simulate dropoff+pickup, regenerate-order-link, manual-order, pickup-complete, dropoff-complete, dropoff-doesnt-fit, dropoff-change-size, customer/order-status.
- /api/orders/not-a-real-shop -> 400
- Public/storefront -> 200: /api/plans, /api/pickup-points?zip=75201, /api/checkout/lockers?shop=...&zip=75201, /api/available-pickup-dates/:shop, /api/branding/:shop, /api/location-availability/1, landing, privacy-policy, change-pickup-date, dropoff-confirm, dropoff-success, pickup-success
- /api/public/lockers with no params -> 400 (expected param validation, not a failure)
- /hoa_financial_dashboard.html and unknown paths -> 404

## Static review of e39eaf4 (code reading only)
- Sim buttons: admin-dashboard.html lines 3840-3841 now show on order.canSimulate OR shopPlanData.partnerDevelopment; backend canSimulateOrder (server.js 1467-1475) = is_test OR partner_development. Gate is consistent front and back. Orders API returns isTest/canSimulate (server.js ~4491-4503).
- Confirmation email: finalizeNewOrder (server.js ~394-440) atomically claims confirmation_sent_at and releases on failure. Idempotent on webhook retries.
- Regenerate: server.js 6167 returns success + simulated:true for is_test orders ONLY IF HARBOR_API_URL does not match /sandbox/i. Reviewer text and commit assume production Harbor. If prod is still on sandbox Harbor (the reviewer doc checklist says it is), test orders take the real Harbor path and the original error could recur. Needs confirmation.
- Migration 20260928000000 (is_test, confirmation_sent_at) must have run in prod, otherwise orders API would 500. Could not verify (no DB, no SSH). Indirect signal: none available without auth.

## NOT tested (blockers)
- Browser: Chrome tools unavailable to this agent, so no dashboard render, no Orders tab Actions column, no Sim drop-off/pickup clicks, no regenerate click, no network capture, no console errors/4xx/5xx scan, no empty-state page check.
- Email: cannot see inbox; UI/network confirmation also not done.
- Droplet sync, pm2 logs, migration applied: banned (SSH/DB).
- Authenticated API behavior (needs session token; not minting any).
- Install/uninstall flow, billing approval, CCS checkout.

## Issues / risks
1. (High) Harbor env check in regenerate path, see above. Confirm which Harbor env prod uses and test regenerate on a test order.
2. (Med) Doc internal checklist still has unchecked: Protected Customer Data approval, listing content, support email placeholder "[your support email]", CCS confirmation. Replace placeholder before pasting.
3. (Low) Untracked stray files in repo: ".claude/launch 2.json", "extensions/.../manifest 2.json" (x2). Duplicates, likely accidental; make sure they are not shipped in the extension bundle.

## Next steps
- Anne (or a browser-enabled run): on locker-plus, open Orders tab with test order, confirm Sim drop-off then Sim pickup, click regenerate, record network responses and console.
- Verify migration ran and Harbor env on prod, then re-run.
