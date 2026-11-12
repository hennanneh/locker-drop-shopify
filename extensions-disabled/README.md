# Disabled UI extensions

These admin (`lockerdrop-order-block`) and checkout (`lockerdrop-thankyou`) UI
extensions are parked here, outside `extensions/`, so the Shopify CLI does not
include them in the app version submitted for review.

Why: they build and deploy but never render (Shopify-side extension-runtime
issue, LAUNCH_CHECKLIST P4-8, evidence in docs/SHOPIFY_SUPPORT_TICKET.md), and
App Store rules 2.2.5 / 5.6.1 require shipped extensions to be feature-complete.
`lockerdrop-thankyou/src/ThankYou.jsx` is still the minimal mount-test build.

To restore: `git mv extensions-disabled/<name> extensions/`, replace the
ThankYou test banner with the real pickup-info UI, confirm it renders on a dev
store, then `shopify app deploy`.
