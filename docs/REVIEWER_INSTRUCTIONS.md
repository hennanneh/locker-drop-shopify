# LockerDrop — Shopify App Store Reviewer Instructions

> **How to use this file:** copy everything between the two `=== TESTING INSTRUCTIONS ===`
> markers into the Partner Dashboard → App Store listing → App submission →
> **Detailed testing instructions**. Pair it with the demo video (Screencast URL):
> https://youtu.be/L2CHKbwiMyo
> The section below the second marker is an internal checklist — do **not** paste it.

=== TESTING INSTRUCTIONS (paste this) ===============================================

**What LockerDrop does:** It adds smart-locker pickup as a shipping option at checkout.
The customer picks a nearby locker, the merchant drops the package in, the customer picks
it up with a secure link, and the Shopify order auto-fulfills on pickup.

**Before you start**
- **Carrier-calculated shipping (CCS) must be enabled** on the test store — LockerDrop
  surfaces its pickup option as a real-time carrier rate. Development, Advanced, and Plus
  stores have CCS.
- No separate login — the app is embedded and uses your Shopify admin session.
- Billing is **usage-based** (a small per-order fee through Shopify Billing). On a
  development store these are test charges; approve the subscription to reach all features.

**Step-by-step**

1. **Install** from the listing → approve the requested data access → you land on the
   LockerDrop dashboard.

2. **Run the 3-step setup guide:**
   a. **My Lockers** — search the map and select at least one locker location to offer.
   b. **Product Sizes** — set a size for one product (so the app reserves a right-sized locker).
   c. **Settings** — enable the LockerDrop shipping rate and set pickup pricing.

3. **Place a test order:** on the storefront, add the sized product → checkout → enter an
   address **near your selected locker** → the **"LockerDrop @ [locker]"** option appears
   alongside normal shipping (with distance + pickup date) → select it → pay with
   **Bogus Gateway** (card number `1`).

4. **Dashboard:** the order appears as **Pending drop-off**, with a locker assigned and a
   drop-off link.

5. **Complete the flow using the reviewer Sim buttons.**
   The real drop-off/pickup happens at a physical locker you can't visit, so on a
   **development store** each order shows **"Sim drop-off"** and then **"Sim pickup"**
   buttons in the **Actions** column. These stand in for the physical locker.

   > ⚠️ **Use the Sim buttons in the "Actions" column — NOT the "Drop Off" link in the
   > "Drop-off Link" column.** The "Drop Off" link opens the real Harbor locker page
   > (meant for the merchant's phone *at* the locker) and will not advance the order here.

   - Click **Sim drop-off** → confirm → the order becomes **Ready for pickup**, a customer
     **pickup link** is generated, and the customer is notified by email/SMS.
   - Click **Sim pickup** → confirm → the order becomes **Completed** and **auto-fulfills in
     Shopify**. Open the order in Shopify Admin to see it marked **Fulfilled**.

   (These Sim buttons are hard-gated to development stores and never appear for live merchants.
   They run the exact production completion path — real order token, real Shopify fulfillment —
   only the physical locker step is simulated. The full physical cycle is in the demo video.)

6. **Uninstall** to confirm clean removal (sessions revoked, webhooks removed).

**Notes**
- Customer emails/SMS use the address/phone on the test order.
- Access scopes are minimized and justified in the app configuration.
- The privacy policy lists all third-party processors (Harbor, Twilio, Resend, DigitalOcean).

**Contact:** [your support email] — happy to provide a fresh test order or hop on a call if
anything blocks the review.

=== END TESTING INSTRUCTIONS ========================================================

---

## Internal checklist before submitting (do NOT paste this)

- [x] Demo video uploaded → https://youtu.be/L2CHKbwiMyo
      **→ set it to "Unlisted" or "Public" in YouTube Studio (NOT Private), or reviewers can't watch it.**
- [x] Reviewer Sim drop-off / Sim pickup control present, guarded to development stores,
      and verified end-to-end (drop-off → pickup link → pickup → auto-fulfilled).
- [ ] Protected Customer Data request approved in the Partner Dashboard (`read_orders` + customer data) — see `PROTECTED_CUSTOMER_DATA.md`.
- [ ] Listing content + screenshots finalized.
- [ ] Confirm CCS is active on the store you point reviewers to.
- [ ] Replace **[your support email]** above with a real support address.
- [ ] Harbor environment: the app is currently pointed at **sandbox** Harbor. Confirm which
      environment you intend reviewers to test against, and the plan for real merchants after
      approval (see Phase 2 — production switch).
