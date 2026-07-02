# LockerDrop — App Store Submission Packet (DRAFTS)

Drafts to review/edit before submitting the **public** LockerDrop app for Shopify
App Store review. Nothing here is submitted automatically — the video must be
recorded, and the listing + Protected Customer Data request are entered in the
Partner/Dev Dashboard by the app owner.

> **Do NOT submit until the launch blockers are done** — reviewers run the full
> install → checkout → drop-off → pickup → fulfillment → uninstall flow. See
> "Runway" below.

---

## 0. Runway to submission (do these first, in order)

| # | Item | Owner | Status |
|---|------|-------|--------|
| 1 | Harbor → **production** credentials + URLs; re-verify a real locker end-to-end | you (Harbor) + me (verify) | 🔴 blocked on Harbor |
| 2 | Rotate `SESSION_SECRET` + live secrets (DB, Shopify API secret, Twilio/Resend) | me (SESSION_SECRET) / you (others) | 🔴 not started |
| 3 | Finalize per-order fee + monthly cap (`USAGE_BILLING`), approve one live sub, verify usage charge | you (pricing) + me (verify) | 🟠 pending Harbor pricing |
| 4 | Protected Customer Data request approved (§3) | you (dashboard) | 🟠 not started |
| 5 | One full cycle on a **real** store (supported plan + prod Harbor) | me | 🟡 pending #1 |
| 6 | Checkout renders on iOS Safari + Android Chrome | you/me | 🟡 needs check |
| — | Fixed already this session: checkout-500, fulfillment scopes, CCS requirement, transactional uninstall, reconnect UX, null-name/address bugs | done | ✅ |

Only after 1–6 → submit with the materials below.

---

## 1. Listing content (draft) — Shopify req 4.4 / S3-3

**App name:** LockerDrop

**Tagline (≤62 chars):** Smart-locker pickup at checkout — powered by Harbor

**Short description:**
Give customers a self-service smart-locker pickup option at checkout. LockerDrop
shows nearby Harbor locker locations with live availability, reserves a locker for
each order, and sends secure open-links for drop-off and pickup — then fulfills the
order automatically when the customer collects it.

**Long description (draft):**
LockerDrop adds contactless, 24/7 **smart-locker pickup** to your store.

- **At checkout**, customers see nearby Harbor locker locations as shipping
  options, each availability-checked in real time, sorted by distance.
- **When an order comes in**, LockerDrop reserves the right-sized locker (based on
  your product dimensions) and gives you a secure drop-off link.
- **After you drop the package in the locker**, the customer gets a pickup link and
  reminders by email/SMS.
- **When they pick up**, the order is **automatically fulfilled** in Shopify and the
  locker is released.

Everything is managed from a simple dashboard: choose your locker locations, set
product sizes and pickup schedule, and track every order's status.

**Requirements:** Carrier-calculated shipping must be enabled — available on the
**Grow plan (with the carrier-calculated shipping add-on or annual billing),
Advanced, or Plus**. Basic is not supported.

**Category:** Fulfillment / Local pickup & delivery

**Key benefits (bullets for listing):**
- 24/7 contactless pickup, no staffed counter needed
- Real-time locker availability shown at checkout
- Automatic right-size locker selection from product dimensions
- Auto-fulfillment on pickup — no manual status updates
- Usage-based pricing billed through your Shopify invoice

**Pricing (fill in after Harbor discussion):** usage-based — $X per completed
locker order, capped at $Y/month. Billed via Shopify.

**Screenshots to capture (no pricing text, no unsubstantiated stats):**
1. Checkout showing LockerDrop locker options — ✅ CAPTURED 2026-07-02 (advanced-ennanne
   checkout: two locker options with location, distance "10.9 mi away", pickup date,
   "Available 24/7"). Best differentiator shot for the listing.
2. Dashboard order list with statuses — ✅ CAPTURED 2026-07-02 (in-admin Orders view with
   the 4 status cards). Empty-state; recapture with a live order for a fuller look.
3. "My Lockers" map + selectable locker network (S/M/L/XL chips) — ✅ CAPTURED 2026-07-02
   (self-captured). Map is a strong visual — crop to map + a few list rows.
4. Product Sizes — per-product L/W/H + locker-size dropdown, CSV import/export —
   ✅ CAPTURED 2026-07-02 (self-captured). Crop to header + 3–4 rows (full list is dense).
5. Settings — "Carrier service active" banner + per-size Pricing + Fulfillment & Timing
   (Pickup Date Preview) + Pickup Page Branding — ✅ CAPTURED 2026-07-02 (self-captured).
   Best "proof of depth" shot; crop into 1–2 images.

> ⚠️ Real-locker recapture (decided 2026-07-02): current screenshots show Harbor SANDBOX
> lockers. Recapture with REAL lockers AFTER the Jul 7 Harbor call, once production API
> access is provisioned (flip HARBOR_API_URL/ACCOUNTS_URL + prod client id/secret, restart,
> re-shoot map + checkout). Verified 2026-07-02 the current sandbox client returns HTTP 401
> unauthorized_client on production, so prod requires NEW credentials from Harbor — the
> "same creds" assumption did not hold. Sandbox shots are placeholders until then.
>
> All 5 listing screenshots captured (2026-07-02). Suggested listing order:
> checkout → My Lockers map → Settings (carrier active + pricing) → dashboard → product sizes.
> Automation note: the app runs in a cross-origin iframe, so the config screens (My
> Lockers / Product Sizes / Settings) were self-captured manually; checkout + Orders
> dashboard were tool-captured. These are full-page grabs — crop each to its key section.
> Shopify listing spec: 1600×900 (min 1280×720), PNG/JPG, ≤ 20 MB, up to 6 images.

---

## 2. Reviewer test instructions (draft) — Shopify req 4.5.4 / S3-2

**Prerequisites the reviewer needs from you:**
- A test store on a **supported plan with carrier-calculated shipping enabled**
  (or dev store — dev stores mirror plan CCS eligibility). Advanced/Plus/Grow+CCS.
- Bogus Gateway (test payments) enabled.
- At least one locker location enabled and one product configured in the app.

**Steps for the reviewer:**
1. Install LockerDrop from the provided link; approve the data-access screen
   (includes "Merchant managed fulfillment").
2. In the app: **My Lockers** → enable 1–2 locations; **Product Sizes** → confirm a
   test product is configured.
3. On the storefront, add that product to cart and go to checkout.
4. Choose the **LockerDrop** locker option at checkout, complete payment with the
   Bogus Gateway test card (card number `1`, any future expiry, any CVC).
5. In the app dashboard, confirm the order appears as **Pending drop-off** with an
   assigned locker.
6. **Drop-off / pickup:** these open a physical Harbor locker and require a phone at
   the locker. Because a reviewer can't visit a locker, see the **demo video** for
   the physical steps, OR use the reviewer **demo/sandbox mode** (see note below).
7. After pickup, confirm the Shopify order shows **Fulfilled** and the dashboard
   shows **Completed**.

> ⚠️ **Review-testability gap to solve before submitting:** drop-off/pickup require
> a physical locker + phone, which a remote reviewer cannot do. Provide EITHER a
> reviewer-only "simulate drop-off / simulate pickup" control (guarded, test stores
> only) OR a clear demo video covering those steps. Recommend building the simulate
> control — reviewers routinely reject flows they can't complete themselves.

---

## 3. Protected Customer Data request (draft justifications)

The app accesses Level-1 protected customer data. Justifications for the Partner/
Dev Dashboard "Protected customer data" request:

| Data | Why the app needs it | Safeguards |
|------|----------------------|-----------|
| Customer **name** | Label the order in the merchant dashboard and personalize drop-off/pickup notifications | Stored only for active orders; deleted on uninstall / customer redact |
| Customer **email** | Send the customer their secure pickup-locker open link + reminders | Not shared with third parties beyond Harbor for locker access; deleted on redact |
| Customer **phone** | Optional SMS pickup notifications/reminders | Same as email |
| **Shipping address** | Geolocate the nearest available locker and sort options by distance at checkout | Used transiently for distance calc; not sold; deleted on redact |
| **Order** (line items) | Compute required locker size and route to a LockerDrop reservation | Minimal fields retained |

**Data protection attestations to confirm in the form:**
- Encryption in transit (HTTPS) and at rest (access tokens encrypted; see `db.js`).
- GDPR mandatory webhooks implemented: `customers/redact`, `customers/data_request`,
  `shop/redact` (see `shopify.app.toml` + `processAppUninstall`).
- Data retention: shop + order data deleted on uninstall (transactional cleanup);
  customer data deleted on redact request.
- Access limited to the minimum scopes needed; staff access to prod is restricted.
- Privacy policy URL: **https://app.lockerdrop.it/privacy** — ✅ published & live
  (verified HTTP 200, 2026-07-02). Lists subprocessors (Harbor, Twilio, Resend,
  DigitalOcean) and confirms Harbor receives no customer PII (name/email/phone/address).
- **Action item (remaining):** confirm a data-processing agreement with Harbor
  (subprocessor) before final attestation.

---

## 4. Demo video script (draft) — Shopify req 4.5.3 / S3-1

Target 2–4 min, English, screen recording with brief captions/voiceover.

1. **Install (0:00–0:25):** From the app link, install on a test store; show the
   data-access approval screen; land on the LockerDrop dashboard.
2. **Setup (0:25–1:00):** My Lockers → enable 2 locations. Product Sizes → configure
   a product. Settings → show pickup schedule.
3. **Checkout (1:00–1:45):** Storefront → add product → checkout → show the
   **LockerDrop locker options with distances/availability** → select one → pay
   (Bogus Gateway).
4. **Order sync (1:45–2:10):** Dashboard shows the new order as Pending drop-off with
   an assigned locker.
5. **Drop-off (2:10–2:45):** *(film at a physical Harbor locker, or use sandbox)* open
   the drop-off link on a phone → locker opens → place item → status → Ready for
   pickup; customer notification shown.
6. **Pickup (2:45–3:20):** Customer opens pickup link → locker opens → collect →
   Shopify order flips to **Fulfilled**, dashboard **Completed**.
7. **Uninstall (3:20–3:40):** Uninstall the app; note that shop data is cleaned up.

---

## 5. Notes
- Distribution is already **public** (correct type for the App Store) — no change
  needed; distribution can't be changed after selection anyway.
- The AI Toolkit (`shopify-ai-toolkit`) is dev tooling, not a submission item.
