# Build Plan: USPS "Ship to Smart Locker" pickup option

_Chosen 2026-07-02. Sequenced AFTER the Harbor launch. Buyer experience = same as Harbor
(choose a locker, get a QR, pick up); fulfillment is USPS shipping to the locker rather than a
local drop-off._

## Context / decision
LockerDrop currently offers **Harbor** lockers via on-demand API unlock (merchant opens locker
to drop off; buyer opens locker to pick up). USPS does **not** offer on-demand unlock, but it
**does** support **ship-to-locker**, which is fully API-automatable and gives the buyer the
identical "pick up from a locker with a QR" experience. We're adding it as a second provider.

**Model:** at checkout the buyer picks a nearby USPS Smart Locker → merchant fulfills by
creating a USPS label addressed to that locker facility → USPS delivers the package into the
locker → buyer gets a Pickup QR and collects. Tradeoffs accepted: real postage + transit time
(not same-day local); checkout copy must set the "arrives in ~N days, then pick up" expectation.

## USPS APIs used
- **Get Locker Info / Locations 3.0** — discover Smart Lockers near an address, with compartment
  sizes + availability. Read-only. (https://www.usps.com/business/web-tools-apis/get-locker.pdf,
  https://developers.usps.com/locationsv3)
- **Domestic Labels 3.0** — create a shipping label addressed to a locker facility ID.
  (https://developers.usps.com/)
- **QR Codes 3.0** — retrieve the buyer Pickup QR for a locker-destined package.
  (https://developers.usps.com/qrcodesv3)
- **Tracking** — detect "delivered to locker" to trigger the pickup notification.

## PREREQUISITES (must clear before/at start of build)
1. **USPS onboarding** (external, lead-time risk): Mailer ID via Business Customer Gateway;
   request Smart Locker + Labels API access (USPSSmartLockerAPI@usps.gov); OAuth 2.0 client
   creds; sandbox access. Confirm the 3 open questions below in sandbox before wiring.
2. **Provider abstraction** (see Phase 1) — the app is 100% Harbor-hardcoded today.
3. **Harbor launch complete** — don't destabilize the launch path; build USPS behind the
   abstraction with Harbor unchanged.

### Open questions to confirm with USPS (sandbox-validate)
- Does Domestic Labels 3.0 support **locker-destined labels for a third-party app** acting on
  behalf of merchants (merchant is the shipper/payer)?
- Does QR Codes 3.0 return the **buyer pickup QR** for those shipments, and how is it triggered
  (on delivery)?
- **Postage billing**: paid from the merchant's USPS/Shopify shipping account? How does that
  coexist with LockerDrop's usage-based Shopify billing?

---

## PHASE 1 — Provider abstraction (prerequisite; refactor, no behavior change)
Goal: make "Harbor" one implementation of a provider interface so USPS can be a second, with
Harbor behavior byte-for-byte unchanged.

**Schema** (`setup-database.js`; idempotent ALTERs on the droplet):
- Add `provider VARCHAR(20) NOT NULL DEFAULT 'harbor'` to `orders`, `locker_preferences`,
  `locker_events`.
- Add nullable USPS-specific order columns: `usps_facility_id`, `usps_tracking`,
  `usps_label_url`, `pickup_qr_url` (reuse existing `pickup_link` if it fits).
- Backfill existing rows to `provider='harbor'`.

**Adapter interface** (new `providers/` module, e.g. `providers/index.js`):
```
Provider {
  key                      // 'harbor' | 'usps'
  listLocations(shop, {lat,lng,radius,sizes})   // discovery for checkout + My Lockers
  checkAvailability(locationId, sizeNeeded)
  createFulfillment(order)  // Harbor: dropoff open link; USPS: create label to facility
  getPickupCredential(order)// Harbor: pickup open link; USPS: pickup QR (post-delivery)
  getStatus(order)          // provider-specific lifecycle sync
  release(order)            // Harbor: release locker; USPS: void label if unshipped
}
```
- Implement `HarborProvider` by extracting the existing ~20 inline Harbor call sites in
  `server.js` (token, `/api/v1/locations`, availability, dropoff/pickup open-requests, release).
- Route both rate handlers (`/carrier/rates` ~line 1003, `/carrier-service/rates` ~line 8371)
  and the order lifecycle through `providers[order.provider]`.
- **Verify:** existing Harbor checkout → drop-off → pickup → Shopify fulfillment still passes on
  `advanced-ennanne` before writing any USPS code.

---

## PHASE 2 — USPS ship-to-locker adapter

### 2a. Discovery + checkout rate
- `UspsProvider.listLocations()` → Get Locker Info / Locations 3.0 (by customer lat/lng,
  radius, size). Cache facility list similar to `harbor-locations-production.json`.
- In the carrier-rate handlers, when the shop has USPS enabled, add rate option(s):
  **"Pick up at USPS Smart Locker — <name>, arrives in ~N days"**. Rate = USPS postage estimate
  (or merchant flat/free). Respect the existing per-size fit logic + the US-only + availability
  guards already used for Harbor.
- Merchant enables USPS + picks which locker locations (extend `locker_preferences` with
  `provider='usps'` rows; reuse the My Lockers UI, tagged by provider).

### 2b. Order capture
- On order sync, when the chosen rate is USPS, set `provider='usps'`, store the selected
  `usps_facility_id`, and use USPS lifecycle statuses:
  `label_pending → label_created → in_transit → delivered_to_locker → picked_up` (+ `cancelled`).

### 2c. Fulfillment (merchant action = ship, not drop off)
- `UspsProvider.createFulfillment(order)` → Domestic Labels 3.0 label addressed to the locker
  facility; store `usps_label_url` + `usps_tracking`.
- Dashboard task for USPS orders = **"Print USPS label & ship"** (download label), NOT "go to
  the locker." (Distinct from Harbor's "Sim/real drop-off".)
- Mark the Shopify order fulfilled with the USPS tracking number.

### 2d. Delivery → pickup
- Poll USPS **Tracking** (or webhook if available) to detect delivered-to-locker → set
  `delivered_to_locker`.
- On delivery, `getPickupCredential()` → QR Codes 3.0 buyer Pickup QR; send via the existing
  email/SMS notification path (reuse the Harbor notification flow, provider-agnostic).
- Buyer picks up with the QR (USPS handles the 5-day window). Sync `picked_up` from tracking;
  optionally reflect as the order's terminal state.

### 2e. Admin dashboard
- Show USPS orders in the same Orders table, badged by provider, with USPS-specific columns
  (tracking, label link, USPS status). Reuse the current table + filters
  (`public/admin-dashboard.html`).
- Settings: enable USPS, pricing mode (pass-through postage vs flat vs free), and the "arrives
  in ~N days" checkout copy.

---

## Config / env
```
USPS_API_BASE_URL, USPS_OAUTH_URL, USPS_CLIENT_ID, USPS_CLIENT_SECRET, USPS_MAILER_ID
```
Keep Harbor's env untouched.

## Files touched (representative)
- `server.js` — extract Harbor into `HarborProvider`; add `UspsProvider`; route rate handlers
  (`/carrier/rates`, `/carrier-service/rates`) + lifecycle through the abstraction (~1,500 lines).
- `providers/` — new: `index.js`, `harbor.js`, `usps.js`.
- `setup-database.js` — `provider` column + USPS columns + backfill.
- `public/admin-dashboard.html` — provider badges/columns, USPS Settings, provider-tagged My
  Lockers.
- notification + fulfillment code paths — make provider-agnostic.

## Verification
1. **Phase 1 regression:** full Harbor lifecycle unchanged on `advanced-ennanne`
   (checkout → drop-off → pickup → Shopify fulfilled). No USPS code paths active for Harbor shops.
2. **USPS sandbox:** validate each API in isolation first (Get Locker Info → Labels-to-locker →
   QR Codes → Tracking), then end-to-end on a test store: checkout USPS rate → order captured →
   label created → (simulate delivery) → pickup QR sent → picked_up.
3. Confirm postage billing behavior matches what USPS states in the inquiry.

## Sequencing
Harbor launch first. Then Phase 1 (abstraction + regression), then Phase 2 (USPS adapter).
Estimate: ~2-3 weeks of build once USPS API access is granted and the 3 open questions are
answered.

## Related
- Feasibility background: this file supersedes the Local XChange direction (that program's
  booking is manual/no-API; ship-to-locker is fully API-automatable).
- See `LAUNCH_CHECKLIST.md` for the Harbor launch blockers that gate the start of this work.
