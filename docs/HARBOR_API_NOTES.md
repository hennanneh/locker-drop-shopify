# Harbor Lockers API Notes

> **Source:** Harbor response to LockerDrop questions, received 2026-02-05.

---

## Key Behaviors

### 1. Locker Reservation (Exclusivity)
- **No duplicate lockers.** When a dropoff is created, the locker becomes reserved for 5 minutes.
- No one else can access it during that window.
- If the locker is not occupied within 5 minutes, it moves back to "available" on the next sync.

### 2. Reservation Timeout
- **5 minutes** from dropoff request creation.
- Not configurable by LockerDrop.
- After timeout, locker auto-releases back to available pool.

### 3. Locker Opening (App / App Clip)
- Harbor's app and app clip handle the actual locker opening.
- LockerDrop generates links (`locker-open-requests/dropoff-locker-request` and `pickup-locker-request`).
- The link opens the Harbor app/app clip which communicates with the locker hardware.
- **We do not need to handle Bluetooth, NFC, or hardware communication.**

### 4. Connection Failure Tracking
- Harbor **cannot** track when a connection fails — only when a connection succeeds.
- The tower only logs successful connections.
- 99% of connection failures are device-related (user's phone, Bluetooth, distance).
- If a hardware issue occurs, the locker stops working for everyone — Harbor will fix it.

### 5. Retry Behavior
- Users **can retry the same link** if the locker didn't open.
- This happens fairly often. Usually the second try works.
- No need to generate a new link — same one is reusable.

### 6. "Doesn't Fit" Flow (Dropoff Only)
- Harbor has a **built-in "doesn't fit" flow** for dropoff.
- After the user opens the locker for dropoff, they can select "Doesn't fit."
- Harbor asks for confirmation, then reopens the locker (so the user can retrieve their package).
- The reservation on that locker is cancelled.
- The user can then choose another (larger) size.
- **This flow only applies to dropoff, not pickup.**

### 7. Moving to Production
- Harbor will provide **production client_id and client_secret**.
- The only changes needed:
  1. Change the API URL (from `api.sandbox.harborlockers.com` to production URL)
  2. Change client_id and client_secret
- No code changes needed to the integration logic itself.

---

## Implications for LockerDrop

### Item 10: Stuck Order Detection
- The 5-min reservation timeout means unclaimed dropoffs auto-release on Harbor's side.
- Our DB may still show `pending_dropoff` if the callback never fires.
- Need a cron to detect stale `pending_dropoff` orders (e.g., >24 hours) and alert the seller.

### Item 11: Size Change Flow
- Simpler than expected — Harbor handles the "doesn't fit" UX.
- We need to handle the cancellation callback and let the seller generate a new dropoff link for a different size.

### Item 12: Retry/Troubleshooting
- Retry = same link, no regeneration needed.
- Just add a "Try again" button + troubleshooting tips (move closer, check Bluetooth/WiFi).
- No need for complex error tracking on our side.

### Item 2 + 32: Production Switch
- Replace ~50 hardcoded sandbox URLs in server.js with `process.env.HARBOR_API_URL`.
- Replace ~22 hardcoded accounts URLs with `process.env.HARBOR_ACCOUNTS_URL`.
- Then production switch is just changing `.env` values.
