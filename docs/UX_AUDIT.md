# LockerDrop UX Audit — Nielsen 10 Heuristics

Scope: `public/admin-dashboard.html` (~5,967 lines) plus the dropoff/pickup success pages. Method: code walkthrough, severity 0–4. Already-shipped fixes (HMAC, JWT, scope trim, Leaflet, modal scrollability, App Bridge toasts, locker name backfill, dropdown sort) and queued work (`confirm()` → Polaris, Order modal IA, skeletons, mobile pass) are not re-flagged but are endorsed where relevant.

## Summary table

| Heuristic | # findings | Top severity |
| --- | --- | --- |
| 1. Visibility of system status | 4 | 3 |
| 2. Match with real world | 3 | 2 |
| 3. User control & freedom | 3 | 3 |
| 4. Consistency & standards | 4 | 3 |
| 5. Error prevention | 3 | 3 |
| 6. Recognition vs. recall | 2 | 2 |
| 7. Flexibility & efficiency | 3 | 2 |
| 8. Aesthetic & minimalist | 2 | 2 |
| 9. Error recovery | 3 | 3 |
| 10. Help & documentation | 2 | 2 |

## 1. Visibility of system status

- **[Sev 3] Orders auto-refresh silently every 30 s.** `setInterval(loadOrders, 30000)` (`4794-4799`) rewrites the table mid-read; `#last-refresh` is `display:none` (`2244`). Show a "Last updated" pip and pause polling while a modal is open.
- **[Sev 3] Settings autosave has no in-flight state.** `autoSaveSettings` (`4342-4350`) only renders the green "Saved" banner on success (`4385-4394`); `saveSettingsQuiet` swallows errors (`4396-4398`). On a flaky connection a checkbox toggle gives no feedback at all. Add "Saving…" and surface failures.
- **[Sev 2] My Lockers Save button mid-save is dead but still labelled "No Changes" / "Save Changes."** After save, button is disabled with text `'No Changes'` (`4313-4318`); clicks during the 2.5 s success animation are no-ops. Either hold the success state or replace it with a toast and keep the button live.
- **[Sev 2] Stat cards render hardcoded `0`s before `/api/stats` resolves** (`1466,1472,1478,1484` → populated by `loadStats` `3176`). Briefly shows "Pending Drop-offs: 0 — All caught up!" when the truth is 12. Render `—` or skeleton until first response.

## 2. Match between system and the real world

- **[Sev 2] Three vocabularies for the same status.** `formatStatus` says "⏳ Waiting for drop-off" (`3434-3438`); filter buttons say "Pending Drop-off" (`1514`); stat cards say "Pending Drop-offs" (`1465`). Pick one label per state; reuse it across filter, stat, badge.
- **[Sev 2] "Active" is an invented bucket.** Default filter `currentFilter='active'` (`3267`) = "not completed and not cancelled" (`3331`). Overlaps with Pending+Ready and appears nowhere else in the UX. Rename to "Open" (Shopify's term) or remove.
- **[Sev 1] Future Drop-off vs. Pending Drop-off overlap is invisible.** Both contain `pending_dropoff` rows (`3332-3340`); only a date check separates them. Merchants clicking "Pending Drop-off" silently miss future-dated ones. Add an empty-state hint or merge.

## 3. User control and freedom

- **[Sev 3] Native `confirm()` for destructive ops, with no Undo.** Cancel Locker (`3853`), Resend (`3650`), Regen Pickup (`3682`), Regen Dropoff (`3712,3746`), Move Order (`3614`), Sync (`3780`), Save with no lockers (`4284`), Save with unconfigured products (`5162`), Remove Logo (`5651`). Endorse the queued Polaris swap; while in there, add Undo to non-destructive ones (Resend, Sync) by deferring the network call 5 s.
- **[Sev 3] Order Detail modal has no Esc and no focus trap.** Only `window.onclick` (`4802-4812`); Tab walks behind the dim into the page. Add Escape and focus trap.
- **[Sev 2] Onboarding skip lives in `localStorage` (`2764-2768`)**, so a merchant who skipped on desktop sees the wizard again on phone. Move to server settings.

## 4. Consistency and standards

- **[Sev 3] `notify()` flattens newlines but callers send multi-paragraph strings.** Wrapper does `text.replace(/\n+/g, ' ')` (`1333`); examples that lose structure: `3698, 3702, 3728`. Audit every multiline `notify()` and shorten to one sentence; move long copy into the affected modal/banner.
- **[Sev 2] Manual Order modal uses raw inline-styled inputs** (`2391-2418`) while every other form uses `.form-input` (`342-361`). Different focus ring, hover border, sizing. Replace with `.form-input`.
- **[Sev 2] Two different "selected" visual languages.** Filter chip `active` = solid `#FE5535` (`534-538`); sidebar nav `active` = `rgba(254,85,53,0.2)` on `#1a1a2e` (`152-155`). They convey the same concept and should look related.
- **[Sev 2] Brand orange does double duty.** `.status-pending_dropoff` is orange (`497-500`) and so is the Add Manual Order CTA — pending badges blend into action buttons. `.status-completed` is grey (`507-510`) but the stat-card subtext for completed is green (`3217`). Reserve orange for actions; use a neutral hue for pending.

## 5. Error prevention

- **[Sev 3] Manual Order has no duplicate-order-number check.** Free-text input (`2391-2392`) → POST without uniqueness validation (`4940`). A merchant typing `1031` while a Shopify order `#1031` exists collides silently. Validate on blur.
- **[Sev 3] Manual Order availability is informational only.** `updateLockerAvailabilityDisplay` (`4865-4938`) renders "⚠ No Medium or larger available" but `submitManualOrder` (`4940`) doesn't block on it. Disable Create when availability is zero.
- **[Sev 2] Vacation range overlap is silent.** `addVacationDays` (`4506`) dedupes per single date but doesn't tell the merchant that part of a new range overlapped a saved one. Surface "(2 dates already on your schedule were skipped)".

## 6. Recognition rather than recall

- **[Sev 2] Order Detail regen-with-size buttons only appear under one specific status combination** (`dropoffPending && order.locationId && !dropoffLink`, `3508-3520`). A merchant who used it once won't remember the trigger. Always render the control, disabled when not applicable, with a tooltip.
- **[Sev 2] CSV import results dumped into a 5-second toast** (`5379-5390`, `1337`). Skipped row IDs vanish before the merchant can act. Render results inline above the products table with an expandable "View skipped rows."

## 7. Flexibility and efficiency of use

- **[Sev 2] No bulk actions on Orders.** Drop off 6 orders at the same locker → 6 modal open/close cycles. Add multi-select; the priority banner already groups by `nextDropoffLocation` (`3245`) so the data is there.
- **[Sev 2] Orders search is missing.** `UX_REVIEW.md:28` claims a search input; `1500-1543` has none. With 200+ orders this hurts. Add a text search bound to `customerName`/`orderNumber`.
- **[Sev 1] Zero keyboard shortcuts.** Esc to close, `/` to focus search, j/k row nav — cheap and compounding for power merchants.

## 8. Aesthetic and minimalist design

- **[Sev 2] The "💰 Saved ~$8 vs traditional delivery" subtext on the Completed stat card (`3217`) is a fabricated number** (count × $8 hardcoded). Risk: merchant repeats it as fact. Remove it. While there, drop subtext from non-actionable cards so the actionable one stands out.
- **[Sev 1] Learn tab is seven similar info-boxes inside one card** (`1707-1830`) with no anchor nav. Endorse queued IA pass; group into Setup / Daily Use / Troubleshooting.

## 9. Help users recognize, diagnose, and recover from errors

- **[Sev 3] "Failed: Unknown error" everywhere.** `notify('Failed: ' + (result.error || 'Unknown error'))` at `3635, 3672, 3702, 3733, 3768, 3791, 3819, 3842, 3871, 4982, 5193`. Map common backend errors (locker full, token expired, Harbor 502) to actionable copy.
- **[Sev 3] `loadSettings` silently fails (data-loss hazard).** Catch is `console.error` only (`4482-4484`). If the GET fails, the form shows hardcoded HTML defaults (processing-days=1, hold-time=5, Mon–Fri); the merchant toggles a checkbox and `autoSaveSettings` POSTs the *defaults* over their real settings. Block autosave until first successful load and show a "Couldn't load — autosave paused" banner.
- **[Sev 2] Cancel Locker has no bespoke diagnostic for the common refusal case** ("customer already accessed locker"). Today: `result.error || 'Unknown error'` (`3871`). Map this case to "Customer already accessed this locker — mark order completed instead?".

## 10. Help and documentation

- **[Sev 2] Help is page-level, not contextual.** The Learn tab is thorough (`1685-1976`) but Order Detail and Manual Order modals have zero inline help. Add "?" affordances next to "Required Locker Size", "Preferred Pickup Date", etc.
- **[Sev 1] FAQ/Training links open `_blank` to `/docs/training` from inside Shopify Admin** (`1697-1698`). Server-route, not Shopify-Admin URL — embedded session token isn't attached. If `/docs/*` ever requires auth, merchants hit a login wall. Make `/docs/*` truly public or use App Bridge `Redirect`.

## Fix queue (prioritized)

1. **Sev 3 — `loadSettings` failure → silent overwrite of saved settings.** Data hazard; gate autosave on first successful load. (#9-2)
2. **Sev 3 — Manual Order: duplicate # + zero-availability submission accepted.** (#5-1, #5-2)
3. **Sev 3 — "Failed: Unknown error" toasts.** Map top 5 backend codes to actionable copy. High frequency. (#9-1)
4. **Sev 3 — Orders 30 s auto-refresh with no indicator and no modal pause.** (#1-1)
5. **Sev 3 — `confirm()` → Polaris (already queued).** Bundle Undo for Resend/Sync. (#3-1)
6. **Sev 3 — Esc + focus trap on Order modal.** Tiny, every-session impact. (#3-2)
7. **Sev 3 — Settings autosave needs in-flight + failure surfacing.** (#1-2)
8. **Sev 3 — Status vocabulary divergence (filter vs. badge vs. stat).** (#2-1, #4-4)
9. **Sev 3 — `notify()` callers passing multi-paragraph strings that get flattened.** (#4-1)
10. **Sev 2 — Drop fabricated "$ saved" stat-card subtext.** Risk of merchant treating it as real. (#8-1)
11. **Sev 2 — Add Orders search box (currently missing).** (#7-2)
12. **Sev 2 — Manual Order modal inline styles → `.form-input`.** (#4-2)
13. **Sev 2 — Bulk actions on Orders.** Real workflow speedup. (#7-1)
14. **Sev 2 — CSV import results → inline banner, not toast.** (#6-2)
15. **Sev 2 — Onboarding skip state to server, not localStorage.** (#3-3)
16. **Sev 2 — Always-rendered (disabled) Regenerate Dropoff control with tooltip.** (#6-1)
17. **Sev 2 — Cancel Locker: bespoke "customer already accessed" copy.** (#9-3)
18. **Sev 2 — Vacation overlap message tells how many were deduped.** (#5-3)
19. **Sev 1/2 — Trim Learn tab walls of info-boxes; add anchor nav.** (#8-2)
20. **Sev 1 — Esc + `/` keyboard shortcuts.** (#7-3)
