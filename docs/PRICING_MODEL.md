# LockerDrop — Pricing Model

> **Status (2026-08-08): LOCKED.** Harbor confirmed billing is **per transaction, no time limit**
> ("You pay to use a locker, then you have until your customer picks it up"). So LockerDrop is
> **per order** — no per-day metering. The app's existing per-order model is structurally correct;
> the one real fix is making the **usage-billing amount size-aware** (see Implementation).

## Money flow
1. The **merchant (seller)** is billed through their **Shopify invoice** (Shopify usage-based app billing).
2. **Shopify** collects from the merchant and remits to **LockerDrop**, minus Shopify's revenue share.
3. **LockerDrop pays Harbor** for the locker usage.
4. LockerDrop keeps the markup as margin.

> **Shopify revenue share:** 0% on the first $1M/year of app revenue, then 15% — applied to the
> **full** amount billed through Shopify (Harbor cost + markup), not just the markup. Clean $1 early on;
> factor the 15% at scale.

## Harbor's cost — PER TRANSACTION, by size (no time limit)
| Size | Harbor charges LockerDrop / transaction |
|------|------------------------------------------|
| Extra Small | $0.50 |
| Small | $1.00 |
| Medium | $2.00 |
| Large | $4.00 |
| Extra Large | $5.00 |

One charge per locker use; the package can stay until pickup with no daily accrual.

## LockerDrop's markup
- **+$1 per order**, bundled into the rate billed to the seller — the seller never sees the $1 split.

## Seller's cost (Harbor + $1, per order)
| Size | Seller's cost / order |
|------|-----------------------|
| Extra Small | $1.50 |
| Small | $2.00 |
| Medium | $3.00 |
| Large | $5.00 |
| Extra Large | $6.00 |

## Seller options — what the merchant charges the BUYER at checkout
1. **Free pickup** — seller absorbs the cost (still billed Harbor + $1 by LockerDrop).
2. **Pass-through** — buyer pays exactly Harbor + $1.
3. **Pass-through + fee** — buyer pays Harbor + $1 plus the seller's own processing fee.

Maps to today's Settings: the **"Offer Free Locker Pickup"** toggle + the **per-size price fields**.

## Future — subscription tier (Phase 2, not now)
- Merchant pays **~$50/month** → **discounted per-order markup** (e.g., LockerDrop takes **$0.50/order**
  instead of $1).
- Bundle **added perks** with the subscription — e.g., **SMS/text notifications** and other premium features.
- A volume/loyalty tier for higher-usage merchants. Revisit after launch + proven PMF.

## Implementation (unblocked — per transaction)
- [ ] **Usage billing → size-aware:** bill the merchant **Harbor cost + $1 by locker size** per order
      (currently a flat fee). This is the critical fix — a flat charge **loses money on Medium+**
      (Harbor $2/$4/$5 vs a $1 flat).
- [ ] Confirm how LockerDrop is **invoiced by Harbor** (per transaction at pickup vs monthly) to align
      the billing trigger.
- [ ] Keep the three seller options (free / pass-through / pass-through + fee); optionally default the
      customer checkout price to pass-through (Harbor + $1) per size.
- [ ] **No** "per day" copy anywhere — per-transaction framing is correct.
- [ ] (Future) subscription tier + discounted markup + perks (SMS, etc.).
