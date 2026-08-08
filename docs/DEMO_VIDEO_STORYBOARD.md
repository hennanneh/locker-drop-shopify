# LockerDrop — Demo Video Storyboard (record narration + screen separately)

**Target:** 2–4 min · English · screen recording with voiceover + phone footage of the real locker.
**Primary audience:** Shopify App Store review team (also reusable on the listing).

> **Updated 2026-08-08** for the real-locker flow. The old "Sim drop-off / Sim pickup"
> buttons and seeded demo orders were removed in the customer-ready cleanup — this version
> films the **real devlocker** (Lockerdrop, 4130 Wycliff Ave, Dallas) instead, which is a
> stronger, more authentic demo.

## Environment for filming
- Film against a store that has your **devlocker selected** in "My Lockers" and ships to a
  **Dallas address near 4130 Wycliff Ave, 75219** (so the devlocker appears at checkout).
  `locker-plus` is already set up this way from testing.
- The app is currently on **sandbox Harbor**, where the devlocker works — fine to film now;
  the locker opens for real, so the footage is genuine. (Once Harbor adds the devlocker to
  **production** — see `HARBOR_PROD_LOCKER_REQUEST.md` — you can re-shoot on production if
  you prefer, but it's the same physical locker either way.)
- Use **Bogus Gateway** for the test payment (card number `1` = approved).

## How to use this (two-track workflow)
1. **Record the narration first**, straight through — read Track A top to bottom, pausing ~1s
   between beats. Re-read any line as many times as you want.
2. **Record the screen + phone footage separately** — follow Track B. Take your time.
3. **Combine in an editor** (iMovie / CapCut / Descript) — drop the narration on top and line
   each **beat number** up with its footage. Trim clips to fit the audio.

---

## TRACK A — Narration (read this straight through)

**[1]** LockerDrop lets your customers pick up their online orders from secure, self-service
lockers — no staff, no waiting in line. Let's see how it works. Installing takes one click
from the app listing. LockerDrop asks only for the order and product access it needs, then
drops you right into the dashboard.

**[2]** Setup is three quick steps, and the built-in guide tracks your progress. First,
choose your lockers — search or browse the map and pick the locations you want to offer.
Next, set your product sizes, so LockerDrop knows which locker each order needs. Finally,
add LockerDrop as a shipping rate and set your pickup pricing and schedule. That's it — the
guide shows you're all set.

**[3]** Now the customer side. A shopper adds an item and heads to checkout. When they enter
their address, LockerDrop appears right alongside the regular shipping options — showing
nearby lockers with distance, pickup date, and around-the-clock availability. They choose
the most convenient locker and check out as usual.

**[4]** The order flows straight into your LockerDrop dashboard — marked pending drop-off,
with a locker already assigned and a drop-off link ready to go.

**[5]** To fulfill it, you bring the package to the locker and open it with the secure
drop-off link, right from your phone. The locker door pops open, you place the package
inside, and close it. The order moves to ready for pickup, and the customer is automatically
notified by email and text.

**[6]** When the customer arrives, they open their pickup link, the locker opens, and they
grab their order. LockerDrop marks it complete and automatically fulfills the order in
Shopify — no manual steps for you.

**[7]** That's LockerDrop — secure locker pickup that runs itself, from checkout to
fulfillment. Give your customers a faster, more flexible way to get their orders.

---

## TRACK B — Screen + phone actions (record following these)

| Beat | ~Time | What to capture |
|------|-------|-----------------|
| **1** | 0:00–0:20 | App listing → click **Install** → the data-access approval screen → land on the LockerDrop **dashboard** (Orders view with the metric cards). |
| **2** | 0:20–1:00 | Show the **Setup guide** widget. Then **My Lockers** (map + your devlocker selected) → **Product Sizes** (set one product's size) → **Settings** (pricing + pickup schedule). End on the setup guide at **3 of 3 · "You're all set."** |
| **3** | 1:00–1:40 | Storefront → add a product → **checkout** → enter a **Dallas address near the devlocker** → the **LockerDrop option appears** ("LockerDrop @ Lockerdrop", distance, pickup date, "Available 24/7") → select it → place order (Bogus Gateway, card `1`). |
| **4** | 1:40–2:00 | Back to the **dashboard** → the new order appears as **Pending drop-off** with a locker assigned and a drop-off link. |
| **5** | 2:00–2:40 | **📱 Real locker footage:** open the **drop-off link** on your phone at the devlocker → the **locker door opens** → place the package → close it → the **drop-off success page**. Cut back to the dashboard showing status flip to **Ready for pickup** + the customer notification. |
| **6** | 2:40–3:15 | **📱 Real locker footage:** open the **pickup link** on your phone at the devlocker → the **locker opens** → take the package → the **branded pickup success page** (logo, thank-you, upsell) — the best customer-facing shot. Cut to the Shopify order flipping to **Fulfilled**. |
| **7** | 3:15–3:30 | Land on the populated **dashboard** overview (or your logo) as a closing shot. |

> **📱 The phone footage (beats 5 & 6) is now the centerpiece, not an optional insert.**
> Run one real checkout first (beat 3) so the app generates valid Harbor drop-off/pickup
> links, then film opening those links at the real devlocker. Shoot the phone screen and the
> locker door in the same take if you can (one hand holding the phone, locker opening behind).

---

## Recording tips
- **Narration:** quiet room; Voice Memos / QuickTime work fine, or Descript / ElevenLabs for
  a cleaner AI-assisted voice. Read a touch slower than feels natural.
- **Screen:** record at 1920×1080; QuickTime (Mac) "New Screen Recording" or Loom. Keep
  cursor movements slow and deliberate.
- **Phone:** landscape, steady (prop it or use a small tripod). Get the locker number/label
  and the "open" moment clearly in frame.
- **Captions:** add short on-screen labels per beat ("Choose your lockers", "Locker options
  at checkout", "Automatic Shopify fulfillment").
- **Length:** aim ~3:00–3:30; trim to stay under 4:00. English audio required (Shopify 4.5.3).
