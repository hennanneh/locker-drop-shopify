# LockerDrop — Shopify App Store Reviewer Instructions

> Paste the **"Testing instructions"** section below into the app submission form in the
> Partner Dashboard (App Store listing → App submission → Detailed testing instructions).
> Shopify req 4.5.4. Pair it with the demo video (req 4.5.3) — see `DEMO_VIDEO_STORYBOARD.md`.

---

## What LockerDrop does (1 line)
LockerDrop adds smart-locker pickup as a shipping option at checkout: the customer picks a
nearby Harbor locker, the merchant drops the package in, the customer picks it up with a
secure link, and the Shopify order auto-fulfills on pickup.

## Before you start (store requirements)
- **Carrier-calculated shipping (CCS) must be enabled** on the test store — LockerDrop
  surfaces its pickup option as a real-time carrier rate. Development stores and Plus/Advanced
  stores have this; on the Grow plan it requires the CCS add-on or annual billing.
- No separate login is needed — LockerDrop is embedded and uses your Shopify admin session.
- Billing is **usage-based** (a small per-order fee, billed through Shopify). On a development
  store these are test charges — approve the subscription to reach all features.

## Step-by-step test

1. **Install** the app from the listing → approve the requested data access → you land on the
   LockerDrop dashboard.
2. **Setup guide (3 steps):**
   a. **My Lockers** — search/select at least one locker location to offer.
   b. **Product Sizes** — set a size for one product (so the app picks the right locker).
   c. **Settings** — enable the LockerDrop shipping rate; set pickup pricing + schedule.
3. **Place a test order:** on the storefront, add the sized product → checkout → enter an
   address **near your selected locker** → **"LockerDrop @ [locker]"** appears as a shipping
   option (with distance + pickup date) → select it → pay with **Bogus Gateway** (card `1`).
4. **Dashboard:** the order appears as **Pending drop-off**, with a locker assigned and a
   **drop-off link**.
5. **Drop-off → pickup → fulfillment (physical locker step):** opening the drop-off link at
   the physical Harbor locker opens the door; after the package is placed, the order becomes
   **Ready for pickup** and the customer is notified. Opening the pickup link at the locker
   completes the order, which **auto-fulfills in Shopify**.
   - ⚠️ **This step requires a physical Harbor locker, which reviewers can't visit.** The full
     physical cycle (drop-off → locker opens → pickup → auto-fulfillment) is shown end-to-end
     in our **demo video**. If you need to exercise the state transitions yourself without a
     locker, contact us and we will enable a **reviewer-only simulate control** (guarded to
     `partner_development` stores) so you can advance drop-off/pickup from the dashboard.
6. **Uninstall** to confirm clean removal (sessions revoked, webhooks removed).

## Notes for the reviewer
- Emails/SMS to the customer use the address/phone on the test order.
- Scopes are minimized and justified in `shopify.app.toml` (req 3.2).
- Privacy policy lists all third-party processors (Harbor, Twilio, Resend, DigitalOcean).

## Contact
[Your name / support email] — happy to enable the simulate control, provide a fresh test
order, or hop on a call if anything blocks the review.

---

## Internal checklist before submitting (not part of the pasted text)
- [ ] Demo video recorded (real devlocker) and uploaded — `DEMO_VIDEO_STORYBOARD.md`
- [ ] Decide: leave the reviewer simulate control available on request, OR re-add it guarded
      to `partner_development` (see LAUNCH_CHECKLIST S3-2 / the removed control) before submit
- [ ] Protected Customer Data request approved in the Dashboard (uses `read_orders` + customer data)
- [ ] Listing content + screenshots finalized (`APP_STORE_SUBMISSION.md`)
- [ ] Confirm a supported plan / CCS is active on the store you tell reviewers to use
- [ ] Fill in the **Contact** line above with a real name + support email
