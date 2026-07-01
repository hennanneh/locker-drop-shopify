# Decision: LockerDrop requires Carrier-Calculated Shipping (CCS)

**Date:** 2026-07-01
**Status:** Adopted

## Decision
LockerDrop requires the store to have **carrier-calculated shipping (CCS) enabled**.
Minimum plan is **Grow** (with CCS turned on). Basic is not supported.

| Plan | CCS available? | Supported? |
|------|----------------|------------|
| Basic | ❌ not offered at any price | ❌ no |
| Grow | ✅ via annual billing (free) or ~$20/mo add-on | ✅ once CCS enabled |
| Advanced | ✅ included | ✅ |
| Plus | ✅ included | ✅ |

## Why
- CCS lets LockerDrop return **one availability-checked shipping line per locker
  location** at checkout. This is the intended experience.
- Without CCS, the only path is a static manual rate + post-purchase selection,
  which **cannot verify locker availability before purchase** — a customer could
  buy LockerDrop with zero lockers free and nothing to assign.
- Requiring CCS collapses three code paths into one, removes the availability
  gap, and gives a consistent per-location experience on every supported store.

## Eligibility is detected by ATTEMPT, not plan name
Plan-name matching (`isCarrierEligible`) wrongly excludes a **Grow store that
paid for the CCS add-on** (its plan name isn't "Advanced"/"Plus"). Instead:

- **Always attempt `carrierServiceCreate`** (install, hourly re-check, and the
  manual "Register" button).
- Success → carrier mode (per-location rates).
- Failure with *"Carrier Calculated Shipping must be enabled"* → CCS not on →
  the dashboard prompts the merchant to enable it.

## Onboarding gate
When `carrier_service_registered = false`, the dashboard must present CCS as a
**requirement** (not "use a manual rate instead"):
> LockerDrop needs carrier-calculated shipping. **Grow:** enable it via annual
> billing (free) or a ~$20/mo add-on. **Advanced/Plus:** already included.

## Rollout notes
- Existing stores: the hourly `/api/shop-plan` re-check now attempts registration
  until it succeeds, so a store that enables CCS later is picked up automatically.
- **Dev stores DO mirror their tier's CCS eligibility** (verified 2026-07-01 via
  `carrierServiceCreate`): Basic and Grow-without-add-on dev stores are rejected
  with *"Carrier Calculated Shipping must be enabled"*; Advanced and Plus dev
  stores register successfully. So the "Basic/Grow blocked" gate CAN be tested on
  the `basic-ennanne` / `grow-ennanne` / `lockerdrop-dev` development stores — a
  real production store is not required. (Earlier assumption that dev stores have
  CCS regardless of tier was wrong.)
- Unrelated but launch-critical: the app is currently on **Harbor sandbox**; switch
  to Harbor production before real customers (see LAUNCH_CHECKLIST S2-5).

## Follow-ups (not in this change)
- Remove now-dead fallbacks (manual-rate messaging, `use_checkout_extension`
  toggle, post-purchase-only path) once the gate is proven.
- Decide whether the Plus-only checkout-page widget stays as an optional inline
  picker enhancement.
