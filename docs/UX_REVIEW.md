# UX Review — LockerDrop front-end — 2026-07-28

Scope: markup-level usability + accessibility review of the built front-end in
`public/` — `dropoff-confirm.html`, `dropoff-success.html`, `pickup-success.html`,
`change-pickup-date.html`, and `admin-dashboard.html`. The drop-off flow (a person
at a physical locker, on a phone, with one shot to open the door) is weighted heavily.
The live embedded admin app can't be run standalone here, so this is a source read,
not a rendered walkthrough; empty/unpopulated data is expected and not treated as a bug.

Note: there is no `login.html` (the admin uses Shopify session-token auth), so it
wasn't reviewed.

## Bottom line

The **admin dashboard is genuinely strong on accessibility and feedback** — modal focus
traps, Escape-to-close, plain-language error mapping (`friendlyError`), styled confirm
dialogs for destructive actions, skeleton loaders, friendly empty states, and native
toast feedback. That work is well above the bar for a solo build.

The **customer/at-the-locker pages are where the risk is.** They are the highest-stakes
screens and the weakest on accessibility. Three things stand out: (1) all three mobile
pages disable pinch-zoom; (2) the "Package Didn't Fit" recovery flow on the success page
is fully built but **unreachable** — a dead end for exactly the person it was meant to
rescue; and (3) the "change pickup date" picker can't be operated by keyboard or screen
reader at all.

**Top 3 fixes**
1. Remove `maximum-scale=1.0, user-scalable=no` from the three customer pages
   (`dropoff-confirm.html:5`, `dropoff-success.html:13`, `pickup-success.html:13`) —
   a low-vision person at a locker literally cannot enlarge the text or the "Open Locker"
   confirmation. WCAG 1.4.4.
2. Wire up (or restore) a visible "Package didn't fit?" trigger on the drop-off success
   screen — `showDoesntFitUI()` exists but is never called, stranding the one user who
   needs it most.
3. Make the pickup-date options real, keyboard-operable controls (buttons/radios) in
   `change-pickup-date.html` — today they're `<div onclick>` and unusable without a mouse.

---

## Findings (by severity)

### CRITICAL

**[Critical] Accessibility — Pickup-date options are not keyboard/AT operable**
- Where: `change-pickup-date.html`, date grid — `.date-option` built as
  `<div class="date-option" ... div.onclick = ...>` (CSS L138; created in `renderDates()`
  L499–516, click wired L514).
- What a user hits: a keyboard, switch, or screen-reader user cannot focus or select any
  date — the entire task (rescheduling a pickup) is impossible for them. Divs have no
  `tabindex`, no `role`, no key handler, and aren't announced as selectable.
- Heuristic/principle: WCAG 2.1.1 Keyboard, 4.1.2 Name/Role/Value; NN/g #3 User control.
- Fix: render each date as a `<button type="button">` (or radio inputs in a
  `<fieldset><legend>Select new pickup date</legend>`). If keeping divs, add
  `role="radio"`/`tabindex="0"`, `aria-checked`, and Enter/Space handlers. The visual
  `.selected` state already reads well; it just needs a real control under it.

### HIGH

**[High] Accessibility — Pinch-zoom disabled on all three mobile customer pages**
- Where: `dropoff-confirm.html:5`, `dropoff-success.html:13`, `pickup-success.html:13` —
  `<meta name="viewport" content="... maximum-scale=1.0, user-scalable=no">`.
- What a user hits: at the locker, a person with low vision can't zoom to read
  "Currently assigned: Medium", the size dimensions, or confirm they're opening the right
  locker. This is the exact context (phone, bright outdoor light, one shot) where zoom
  matters most.
- Heuristic/principle: WCAG 1.4.4 Resize Text (AA).
- Fix: reduce the viewport tag to `width=device-width, initial-scale=1.0` (as
  `change-pickup-date.html` and `admin-dashboard.html` already do). There's no keyboard/
  form-zoom problem here that would justify locking scale.

**[High] User control & error recovery — "Package Didn't Fit" flow is unreachable**
- Where: `dropoff-success.html`. `showDoesntFitUI()` is defined (L580) but **never
  called** — the routing block (L696–703) only calls `notifyDropoffComplete()` or
  `showTroubleUI()`. The success view (L384–412) contains no "Didn't fit?" link, and the
  `.didnt-fit-link` style (L366) is defined but absent from the markup.
- What a user hits: drop-off "succeeds", the door opens, but the package doesn't
  physically fit. There is no on-screen path to request a larger locker — the whole
  size-picker recovery UI (L444–493) is dead code from the user's point of view. Their
  only option is to abandon and contact support.
- Heuristic/principle: NN/g #3 User control & freedom, #9 Help users recover from errors.
- Fix: add a visible affordance on the success screen (e.g. the intended
  `<a class="didnt-fit-link" onclick="showDoesntFitUI()">Package didn't fit?</a>`) so the
  built recovery flow is actually reachable.

**[High] Broken control — "Return to Dashboard" button does nothing**
- Where: `dropoff-success.html:489` —
  `<a ... id="btn-dashboard" href="javascript:void(0)">Return to Dashboard</a>` with no
  `onclick` and no `href` target.
- What a user hits: on the "didn't fit" screen, tapping the only escape hatch does
  nothing — a dead end inside a recovery flow.
- Heuristic/principle: NN/g #3 User control & freedom.
- Fix: point it at the dashboard/app URL (or `history.back()` / `window.close()` with a
  fallback), and give it discernible behavior.

**[High] Accessibility — Failure messages at the locker aren't announced**
- Where: `dropoff-confirm.html` — `#status-msg` (L285) and the whole `#error-container`
  (L289–293); mirrored on `dropoff-success.html` `#df-error` (L480) and `#status-update`
  (L408), and `change-pickup-date.html` `#errorSection` (L329).
- What a user hits: a screen-reader user taps "Open Locker", the request fails ("No
  lockers available at this size", "Connection error"), and nothing is spoken — the text
  swaps in silently. In a one-shot, standing-at-the-locker context that's a silent
  failure. `showError()` also doesn't move focus to the error.
- Heuristic/principle: WCAG 4.1.3 Status Messages; NN/g #1 Visibility of system status.
- Fix: give the status/error containers `role="status"` (or `role="alert"` for errors)
  and `aria-live="assertive"`; on `showError()`, move focus to the error heading.

**[High] Accessibility — Low-contrast text on the critical drop-off screens**
- Where: `dropoff-confirm.html` "Currently assigned" label (`.current-size-label`,
  `opacity:0.8`, 14px, L107/260) and size dimensions (`.size-dims`, `opacity:0.7`, 10px,
  L149); similar opacity-dimmed white text in `dropoff-success.html`/`pickup-success.html`.
  White at 0.9 opacity on `#008060` computes to roughly 4.3:1 (subtitle) and drops further
  as opacity and size shrink — the 14px/10px labels fall below the 4.5:1 AA threshold.
- What a user hits: the assigned size and locker dimensions — the info you most need to
  verify before opening — are the hardest text to read, made worse by the disabled zoom.
- Heuristic/principle: WCAG 1.4.3 Contrast (Minimum).
- Fix: stop using `opacity` to de-emphasize load-bearing text; use full-opacity white (or
  a lighter tint) and bump the 10px dimensions to ≥12px. Reserve dimming for genuinely
  decorative text (footer).

### MEDIUM

**[Medium] Recognition & AT semantics — Size picker isn't a labeled group**
- Where: `dropoff-confirm.html` `#size-picker` (L261–278) and `dropoff-success.html`
  `#size-picker` (L457–474). Buttons toggle a `.selected` class but expose no
  `aria-pressed`/`role`, and the group has no accessible name.
- What a user hits: a screen-reader user hears four unrelated "Small / Medium…" buttons
  with no indication of which is selected or that they're one choice.
- Heuristic/principle: WCAG 4.1.2; NN/g #6 Recognition rather than recall.
- Fix: wrap in `<fieldset>`/`role="radiogroup"` with a label ("Locker size"), and set
  `aria-pressed`/`aria-checked` on the active button as `selectSize()` runs.

**[Medium] Accessibility — Search inputs are placeholder-only (no label)**
- Where: `admin-dashboard.html` orders search (L1831) and locker search (L1883) — labeled
  only by `placeholder`.
- What a user hits: screen-reader users get no persistent field name; once text is typed
  the placeholder disappears for everyone, removing the only cue to what the field does.
- Heuristic/principle: WCAG 1.3.1 / 3.3.2 Labels; NN/g #6.
- Fix: add a visually-hidden `<label for>` or `aria-label` ("Search orders",
  "Search lockers by city, state, or zip").

**[Medium] Accessibility — Sortable column headers aren't operable or announced**
- Where: `admin-dashboard.html` `<th class="sortable" onclick="sortOrders(...)">`
  (L1841–1848).
- What a user hits: keyboard users can't sort; screen-reader users aren't told a column is
  sortable or which direction it's sorted.
- Heuristic/principle: WCAG 2.1.1, 4.1.2; NN/g #7 Flexibility.
- Fix: put a `<button>` inside each sortable `<th>` and set `aria-sort` on the header to
  `ascending`/`descending`/`none` as state changes.

**[Medium] Accessibility — Clickable divs and icon-only button lack keyboard/name**
- Where: `admin-dashboard.html` collapsible card headers `<div ... onclick="toggleCollapse(this)">`
  (L2007, L2176) — not focusable/operable by keyboard; mobile hamburger
  `<button ... onclick="toggleSidebar()">&#9776;</button>` (L1735) has no accessible name.
- Heuristic/principle: WCAG 2.1.1, 4.1.2; NN/g #4 Consistency.
- Fix: make collapsible headers `<button>`s (with `aria-expanded`); add
  `aria-label="Open menu"` to the hamburger.

**[Medium] Error recovery — Native `alert()` for locker-retry failures**
- Where: `dropoff-success.html` `retryLink()` (L680, L685) and `pickup-success.html`
  `retryLink()` (L587, L592).
- What a user hits: on the branded, full-screen locker page a raw browser `alert()` pops
  up — visually jarring, not styled, and the error is only available modally. The rest of
  the app already uses inline status messaging and Polaris toasts.
- Heuristic/principle: NN/g #4 Consistency, #9 Recover from errors.
- Fix: reuse the page's inline status/error element (with `aria-live`) instead of
  `alert()`.

### LOW

**[Low] Visibility of status — Live-updating regions not announced**
- Where: `dropoff-success.html` `#status-update` (L408, "Customer has been notified") and
  `pickup-success.html` `#status-update` (L370, "Seller has been notified").
- Fix: add `aria-live="polite"` so the confirmation is spoken, not just shown.

**[Low] Focus visibility on inputs is faint**
- Where: `admin-dashboard.html` `.form-input:focus` (L374–377) removes the outline and
  replaces it with a 1px box-shadow.
- What a user hits: keyboard focus on text fields is subtle against light backgrounds.
- Fix: thicken to a 2px focus ring (or keep `outline` with an offset). Buttons/tabs are
  fine — they retain the default outline.

**[Low] Generic alt text / window.close reliability**
- Where: `pickup-success.html:350` brand logo `alt="Brand Logo"` (use the store name);
  `change-pickup-date.html:379` "Close This Page" calls `window.close()`, which is a no-op
  for tabs the script didn't open — offer a fallback link.

**[Low] Emoji/text icons not hidden from AT**
- Where: `dropoff-confirm.html` `📦` (L248) and `!` (L290) icons are decorative but read
  by screen readers alongside the heading.
- Fix: wrap decorative glyph containers in `aria-hidden="true"`.

---

## What works well (keep these)

- **Plain-language error handling (admin).** `friendlyError()` (admin-dashboard.html
  L1574+) maps raw backend/Harbor errors to actionable copy — duplicate records, expired
  sessions ("Reload the app from Shopify Admin"), no-locker-available, "customer already
  accessed this locker — mark Completed instead". This is textbook NN/g #9 and rare to see
  done this well.
- **Robust modal accessibility (admin).** Focus is moved into modals on open (L4002),
  trapped (L5570–5615), Escape closes (L5599), and dialogs carry `role="dialog"`,
  `aria-modal`, `aria-labelledby`.
- **Safe destructive actions.** `cancelLockerRequest()` and friends route through a styled
  `confirmAsync()` modal (L1612) instead of raw `confirm()`, with the confirm button
  focused — good error prevention (NN/g #5).
- **Good loading & empty states.** Skeleton rows while orders load (L1854–1856) and
  encouraging, context-specific empty states ("No orders waiting for drop-off. Great job
  staying on top of things!") rather than a blank table.
- **Consistent, native feedback.** `notify()` uses Shopify Polaris/App Bridge toasts with
  auto error-styling, and the orders list shows an auto-refresh "Updated just now" status
  (NN/g #1).
- **Strong primary-task focus on the drop-off screen.** Large, full-width "Open Locker"
  CTA; the button label changes to "Change Size & Open Locker" when the size is altered
  (clear consequence); the current size is pre-selected (recognition over recall); and
  failure screens offer concrete troubleshooting tips plus a support link.
- **Responsive table.** Order rows use `data-label` cells to stack cleanly on mobile
  rather than overflowing.
