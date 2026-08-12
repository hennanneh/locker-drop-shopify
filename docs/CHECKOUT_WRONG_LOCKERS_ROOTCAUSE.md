# Root cause: "wrong lockers at checkout" — and why the Sim buttons were NOT to blame

**Settled 2026-08-12 with git evidence. Do not relitigate.**

## The symptom
Every time the demo was prepped, checkout showed far-away / wrong lockers (e.g. a
Dallas cart offered Atlanta lockers). It kept getting blamed on the reviewer
**Sim drop-off / Sim pickup** buttons, because those were the visible new feature.

## What actually happened (first occurrence: July 1–2, 2026)
A demo-prep batch landed three changes within ~24h:

1. **`854d238` (Jul 1) — "Add reviewer simulate drop-off/pickup"**. Verified diff:
   touches **only** `admin-dashboard.html` (the buttons) and the `/api/simulate/*`
   routes in `server.js`. **Zero** carrier / checkout / rate / locker-location code.
   It cannot change what shows at checkout.
2. **`cff525d` (Jul 2) — "Use per-location carrier rates on all plans"**. Switched
   checkout from a single pickup option to **one shipping line per selected locker**.
3. **`9b946c1` (Jul 2) — "nationwide locker network on demo store's My Lockers map"**.
   Expanded the demo store's selectable lockers to a nationwide set for screenshots.

The live carrier handler `app.post('/carrier-service/rates')` had **no distance
filter**. So with many far-flung lockers selected (#3) and one line per locker (#2),
checkout listed lockers nationwide. That is the "wrong lockers" bug. The Sim buttons
(#1) were a bystander added a day earlier in the same push.

## Proof the Sim buttons are innocent
- `git show 854d238 -- server.js` = only `simulateLockerStep` + two `/api/simulate`
  routes. No carrier/rate/checkout/location lines.
- `git log -S MAX_DISTANCE_MILES -- server.js` shows the live-handler distance filter
  first appeared in **`e654633` (Aug 12, 2026)** — it never existed from Jul 2 until
  that fix. That is the entire window in which checkout was broken.

## The fix (done)
- **`e654633` (Aug 12)** added the 100-mile distance filter to the live carrier
  handler (plus test-order guard + live-env My Lockers).
- **`21ec8df` (Aug 12)** deleted the dead duplicate `/carrier/rates` handler that
  *had* the correct filter — the mismatch is why a past fix edited the wrong copy —
  and fixed a second stale-file locker leak in `/api/public/lockers`.

## Verified behavior after the fix (locker-plus demo store, sandbox)
- Dallas address + configured product → **only the Dallas devlocker (329)**, ~4.8 mi.
- Atlanta address → **empty** (devlocker correctly filtered out as >100 mi).

## Takeaway
Re-adding the Sim buttons is safe for checkout. The wrong-lockers bug had a separate
root cause (missing distance filter + expanded locker selection) that is now fixed and
verified. If wrong lockers ever reappear, look at the carrier handler's distance filter
and the store's `locker_preferences` — not the Sim buttons.
