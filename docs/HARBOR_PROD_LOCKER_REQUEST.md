# Request to Harbor — add my devlocker to the production network

> Draft message to send to your Harbor contact. Nothing is sent automatically — copy/paste and send when ready.

---

**Subject:** Add my test locker (4130 Wycliff Ave, Dallas) to the production network — `lockerdrop` client

Hi [Harbor contact],

Thanks for the production credentials — the `lockerdrop` service-provider client is authenticating against `api.harborlockers.com` and returning the production location list correctly.

One gap: the physical test locker I use for development isn't in the production network yet. It's currently only in **sandbox**. Could you register it in **production** under the `lockerdrop` client so it appears at checkout on our live app?

**Locker details:**
- **Name:** Lockerdrop
- **Address:** 4130 Wycliff Ave, Dallas, TX 75219
- **Sandbox tower id:** `0100000000000175` (to help you match the physical unit)

**A couple of confirmations so I can finish the production switch:**
1. Once it's added, please send me its **production location id** and **production tower id** (I need the tower id for our `HARBOR_TOWER_ID` config — I want to confirm whether it changes between sandbox and production).
2. Confirm the locker is fully operable in production (drop-off / pickup) so I can run one real end-to-end order and record our Shopify App Store demo video on it.

Thanks!
Anne

---

## Internal notes (not part of the message)

- Until this locker is in production, the app is intentionally left on **sandbox** so the devlocker keeps working for testing/filming. Production config is saved on the server as `.env.production.*` for a one-command re-flip at launch.
- After the locker is added to production, remember: each test store's **"My Lockers"** selections were made against *sandbox* location ids and must be re-picked from the **production** list (sandbox and production ids differ).
- Production switch checklist when ready: on the droplet, `cp .env.production.<ts> .env && pm2 restart lockerdrop`, then re-select locker locations per store, then verify one real order.
