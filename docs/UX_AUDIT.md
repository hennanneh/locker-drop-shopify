# LockerDrop UX Audit — Nielsen 10 Heuristics

**Last updated:** 2026-05-04
**Scope:** `public/admin-dashboard.html` (6,303 lines) plus the dropoff/pickup success pages.
**Method:** code walkthrough, severity 0–4. Previously-shipped fixes (HMAC, JWT, scope trim, Leaflet, modal scrollability, App Bridge toasts, locker name backfill, dropdown sort, Polaris confirm modal, loading skeletons) are not re-flagged.

## Done since 2026-05-02

Of the 20 items in the prior fix queue, **14 fully shipped, 4 partial, 2 still open.**

| # | Item | Status | Commit | Evidence in current code |
| --- | --- | --- | --- | --- |
| 1 | `loadSettings` failure → silent overwrite | ✅ Done | `9838be8`, `4bc63c7`, `646fe4e`, `976a8a6` | `settingsLoaded` gate (4692, 4554); 3-attempt retry with backoff (4694-4750); "auto-save disabled until they load" notice (4748). |
| 2 | Manual Order: duplicate # + zero-availability submission | 🔧 Partial | `9838be8` | Zero-availability proceed-anyway confirm (5272-5279). Duplicate-# check exists at 5283 but compares `o.order_number` while orders are normalized to `o.orderNumber` — see new finding 5-1. |
| 3 | "Failed: Unknown error" toasts | ✅ Done | `803dc65` | `friendlyError()` (1423-1454) maps duplicate / 404 / 401 / locker availability / Harbor 5xx / rate-limit / shipping. 22 call sites use it. |
| 4 | Orders 30 s auto-refresh: indicator + modal pause | 🔧 Partial | `803dc65` | Modal-open pause shipped (5069-5080) and confirm-modal-overlay is included. Indicator NOT user-visible: `#last-refresh` still `display: none` (2420). |
| 5 | `confirm()` → Polaris | ✅ Done | `5e1e3c0` | `confirmAsync()` (1458-1498) with role=dialog, aria-modal, Esc, Enter, backdrop click. All 11 prior `confirm()` callers now use it. Undo for non-destructive ops (Resend, Sync) NOT shipped — see new finding 3-1. |
| 6 | Esc + focus trap on Order modal | 🔧 Partial | `803dc65` | Esc closes orderModal/manualOrderModal (5104-5114). Focus trap NOT added — orderModal has no aria-modal, no Tab cycle. confirmAsync overlay does have aria-modal (1469). |
| 7 | Settings autosave in-flight + failure surfacing | ✅ Done | `803dc65` | `setSettingsSaveStatus('saving' / 'saved' / 'error')` (4566-4596) renders "⏳ Saving…", green "✓ Settings saved" with auto-hide, persistent red error banner. `saveSettingsQuiet` (4599-4644) drives all three states. |
| 8 | Status vocabulary divergence | ✅ Done | `3f3b476` | `formatStatus()` (3628-3643) is now the single source. Filter buttons (1666-1672) use "Pending Drop-off / Future Drop-off / Ready for Pickup / Completed" matching the badge labels. Stat-card label "Pending Drop-offs" (1618) and badge "⏳ Pending drop-off" (3635) are now consistent in concept and capitalization. |
| 9 | `notify()` callers passing multi-paragraph strings | ✅ Done | `803dc65` | `notify()` still flattens `\n+` to space (1405), but former multi-paragraph callers now route through `friendlyError()` which returns one sentence. No remaining `notify(\`…\\n…\`)` matches in the file. |
| 10 | Drop fabricated "$ saved" stat-card subtext | ✅ Done | `9838be8` | Replaced with `📦 ${count} package(s) picked up this week` (3393-3399). No `$8` / `Saved` math anywhere. |
| 11 | Add Orders search box | ✅ Done | `3f3b476` | `#orders-search` input (1673), `searchOrders()` handler (3451-3455), `currentSearch` filter applied across order_number / customer_name / customer_email (3533-3542). |
| 12 | Manual Order modal `.form-input` | ✅ Done | `3c38950` | All 5 inputs/selects (2567, 2573, 2579, 2585-2592, 2598-2602, 2608-2610) use `class="form-input"`. |
| 13 | Bulk actions on Orders | ⬜ Still open | — | No multi-select checkboxes in orders table (1675-1695). No `bulk`, `select-all`, or `selectedOrders` symbols anywhere. |
| 14 | CSV import results → inline banner | ✅ Done | `3f3b476` | `#csv-import-banner` (1805) populated by importer (5713-5732) with collapsible `<details>View N skipped rows</details>` and a Dismiss link. No more 5-second toast for results. |
| 15 | Onboarding skip → server settings | ⬜ Still open | — | Still `localStorage.setItem('lockerdrop_onboarding_skipped_${shop}', 'true')` (2941); read at 2844. Cross-device drift remains. |
| 16 | Always-rendered (disabled) Regenerate Dropoff with tooltip | ⬜ Still open | — | Size-pinned Regenerate buttons still only appear under `dropoffPending && order.locationId && !dropoffLink` (3710-3723). Other branches render different markup; no consistent always-on button with tooltip. |
| 17 | Cancel Locker: bespoke "customer already accessed" copy | ⬜ Still open | — | `cancelLockerRequest` (4052-4079) still calls generic `friendlyError(result, 'Cancel locker')` (4073). `friendlyError` has no "customer already accessed" branch — that string would fall through to the raw-message path. |
| 18 | Vacation overlap message tells count | ✅ Done | `3f3b476` | `addVacationDays` (4815-4837) tracks `addedCount` / `skippedCount` and notifies "Added N days (M already on your schedule were skipped)." Also handles all-overlapping case (4830). |
| 19 | Learn tab anchor nav | ✅ Done | `f33e926` | Jump-to nav with 7 anchors (1862-1880); every info-box has an `id` and `scroll-margin-top: 80px` so anchored scroll lands cleanly under the embedded header. |
| 20 | Esc + `/` keyboard shortcuts | ✅ Done | `3f3b476` | Esc handler (5104-5114); `/` focuses `#orders-search` and switches to Orders tab (5115-5122); typing-context guard (5101-5102) prevents capture inside inputs. |

## Summary table

| Heuristic | # open findings | Top severity |
| --- | --- | --- |
| 1. Visibility of system status | 2 | 2 |
| 2. Match with real world | 1 | 1 |
| 3. User control & freedom | 3 | 2 |
| 4. Consistency & standards | 2 | 2 |
| 5. Error prevention | 2 | 3 |
| 6. Recognition vs. recall | 1 | 2 |
| 7. Flexibility & efficiency | 1 | 2 |
| 8. Aesthetic & minimalist | 1 | 2 |
| 9. Error recovery | 3 | 3 |
| 10. Help & documentation | 2 | 2 |

Totals: **18 open findings** — 0 sev-4, 3 sev-3, 11 sev-2, 4 sev-1.

## 1. Visibility of system status

- **[Sev 2] Auto-refresh indicator is invisible.** `setInterval(updateRefreshTime, 30s)` writes a timestamp into `#last-refresh` (4970-4976), but the span is hardcoded `display: none` (2420). Pause-on-modal logic (5069-5080) works, but the merchant has no way to tell what "now" means in the table. Surface a small "Updated at hh:mm:ss" pip near the Orders filter row.
- **[Sev 1] Manual Order availability indicator races the submit click.** `updateLockerAvailabilityDisplay` (5176-5249) is async (network call to `/api/location-availability/:id`) and runs onchange. If the merchant immediately tabs to Create, the submit-time check at 5272 (`availabilityHtml.includes('⚠')`) reads the "Checking availability…" placeholder (5193) — neither warning nor green check — so submission proceeds with unknown availability. Race window is ~200-500ms but reproducible. Disable submit while a `…Checking…` state is on screen.

## 2. Match between system and the real world

- **[Sev 1] "Active" filter is still a private term.** Default filter `currentFilter = 'active'` (3446) excludes completed + cancelled (3518). The label "Active" is fine for Shopify-native merchants but doesn't appear in stat cards or formatStatus. Lower priority now that the rest of the vocabulary unified; consider "Open" or remove on the next polish pass.

## 3. User control and freedom

- **[Sev 2] Order Detail modal still has no focus trap.** Esc closes it (5104-5114), but Tab walks behind the dim into sidebar nav items and the orders table. `#orderModal` has no `aria-modal`, no `role="dialog"`, no Tab-cycle. confirmAsync got these (1467-1469); the same treatment should land on orderModal + manualOrderModal + onboardingModal.
- **[Sev 2] Onboarding-skip state is per-device.** `localStorage.setItem('lockerdrop_onboarding_skipped_${shop}', 'true')` (2941); read at 2844. A merchant who skips on desktop sees the wizard again on phone. Move to the server-side `merchant_settings` row.
- **[Sev 1] No Undo for non-destructive ops.** Resend Notification (3850), Sync Orders (3982), Regenerate Pickup Link (3883) all fire-and-confirm with no deferred cancel. They're idempotent (or near-so) so the cost is low, but a 5-second "Undo" toast on the success notify would catch the common "wrong order" misclick.

## 4. Consistency and standards

- **[Sev 2] Two different "selected" visual languages persist.** Filter chip `.filter-btn.active` is solid `#FE5535` (534-538); sidebar nav `.sidebar-nav-item.active` is `rgba(254,85,53,0.2)` on the navy panel (152-155). Same concept; both should look related — either both solid or both translucent.
- **[Sev 2] Manual Order modal headers don't follow the rest of the dashboard.** All other forms use `<label class="form-label">` with consistent spacing; the manual modal uses inline-styled `<label style="display: block; font-weight: 500; margin-bottom: 8px;">` (2566, 2572, 2578, 2584, 2597, 2607). Inputs were normalized in `3c38950`; labels were not. Apply `.form-label` for visual consistency with the Settings tab.

## 5. Error prevention

- **[Sev 3] Duplicate-order client check uses the wrong field name.** `submitManualOrder` checks `allOrders.some(o => String(o.order_number) === orderNumber)` (5283), but the orders list normalizes to `orderNumber` (camel) — see `o.orderNumber` references at 3611, 3620, 3670, etc. The audit search at 3536 hedges with both forms, but this duplicate guard reads only the snake form. Net effect: the check **never trips on synced Shopify orders**; only matches dehydrated/raw rows. Fix to `String(o.order_number ?? o.orderNumber) === orderNumber`.
- **[Sev 2] Manual Order zero-availability + submit-during-check race.** Same root as 1-2. If `/api/location-availability` fails or hasn't resolved, the `availabilityHtml.includes('⚠')` test (5272) returns false (no ⚠ in "Could not check availability"), and we submit anyway. Disable Create until availability has a definite result, or treat absence-of-⚠-AND-absence-of-✓ as "unknown" and confirm with a third path.

## 6. Recognition rather than recall

- **[Sev 2] Order Detail regen-with-size buttons only appear under one branch.** Lines 3710-3723 render Auto/Medium/Large/X-Large buttons only when `dropoffPending && order.locationId` (i.e. previous locker was cleared). A merchant who used it last week to fix a size mismatch won't remember the trigger. Render the size picker as a collapsed "Override size" disclosure inside the Drop-off section whenever the order is pre-pickup.

## 7. Flexibility and efficiency of use

- **[Sev 2] Still no bulk actions on Orders.** Confirmed: zero matches for `bulk`, `select-all`, `selectedOrders` in the file. Multi-select would compound search + the priority banner's existing same-locker grouping (3408-3441). Cheapest scope: a "Select page → Mark Dropped Off" or "Select page → Resend Email" pair.

## 8. Aesthetic and minimalist design

- **[Sev 2] Duplicate "Exclude" column header in Product Sizes.** Lines 1830 + 1831 both render an `<div style="text-align:center;">Exclude</div>` inside a grid declared as `1fr repeat(3, 70px) 120px 70px` (6 columns). Likely a merge artifact — the second copy overflows or wraps depending on browser. Remove line 1831.

## 9. Help users recognize, diagnose, and recover from errors

- **[Sev 3] Branding settings have no `brandingLoaded` guard.** Mirrors the data-loss path that #1 closed for general settings. `loadBrandingSettings` (5859-5934) swallows fetch failures (`catch { console.error }`), and `autoSaveBranding` (6189-6194) has no analog to `settingsLoaded`. If `/api/branding/:shop` returns a 5xx during a session, the next color change posts the hardcoded HTML defaults (`#5c6ac4` primary, "You might also like" upsell heading, `branding-rebuy-enabled` unchecked, `showUpsells=true`) over the merchant's saved Enterprise branding. Add a `brandingLoaded` flag and gate `saveBrandingSettings` on it.
- **[Sev 2] Several catch blocks bypass `friendlyError`.** The standardization done in `803dc65` covered the .then() failure branches but left these `try/catch` fallbacks with hardcoded copy: 3079 (carrier service), 3768 (load order), 3843 (change location), 3908 / 3941 / 3976 (regen variants), 3997 (sync), 4048 (resend email), 4077 (cancel locker), 4531 / 4537 (save lockers), 4685 (save settings), 5319 (manual order), 5531 (save products), 5847 / 5851 (top-level generic), 5981 (logo upload), 6013 (logo remove). Route each through `friendlyError({ error: error.message }, '<verb>')` for a single voice.
- **[Sev 2] Cancel Locker has no bespoke "customer already accessed" path.** Same as the 2026-05-02 finding — `friendlyError` (1423-1454) doesn't have a case for "already accessed" or "locker open" backend errors, so the cancel-after-pickup-started workflow still surfaces the raw backend message. Add a branch to `friendlyError`: `text.includes('already accessed') || text.includes('locker already opened')` → "Customer already accessed this locker — mark order completed instead."

## 10. Help and documentation

- **[Sev 2] `/docs/training` and `/docs/faq` open `_blank` to server routes from inside Shopify Admin.** Three places: footer (6291-6292), Getting Started card header (1853-1854), and the embedded-admin frame. The links open the URL in a new top-level tab so the embedded session token isn't attached — fine *today* because those routes are public, but if `/docs/*` is ever auth-gated, merchants hit a login wall. Either confirm in `app.js` that `/docs/*` will stay unauthenticated forever, or use App Bridge `Redirect.toRemote` so the merchant exits Admin cleanly.
- **[Sev 2] Order Detail and Manual Order modals have zero inline help.** Page-level Learn tab is now well-organized (anchor nav landed in `f33e926`), but the two highest-friction modals still don't link into it. Add a small "?" affordance next to "Required Locker Size" (2584) and "Preferred Pickup Date" (2607) that scrolls to `#learn-locker-sizes` / `#learn-lifecycle`. Cheap and reuses the existing anchors.

## Fix queue (prioritized)

1. **Sev 3 — Duplicate-order check uses `o.order_number` (snake) on a camel-cased list.** One-line fix; restores the guard that was claimed in #9838be8. (#5-1)
2. **Sev 3 — Branding has no `brandingLoaded` data-loss guard.** Same hazard the main settings fix closed; mirror it for `autoSaveBranding`. (#9-1)
3. **Sev 3 — Catch-block error copy still bypasses `friendlyError`.** 17 sites listed in 9-2. One voice across the dashboard. (#9-2)
4. **Sev 2 — Cancel Locker: bespoke "customer already accessed" branch in `friendlyError`.** (#9-3)
5. **Sev 2 — Order Detail modal needs focus trap + role/aria-modal.** Esc shipped; Tab still escapes. (#3-1)
6. **Sev 2 — Auto-refresh indicator must become visible.** `#last-refresh` is still `display:none`; move it next to the filter chips. (#1-1)
7. **Sev 2 — Manual Order: block submit while availability is "Checking…" or "Could not check".** Closes a real race. (#1-2 / #5-2)
8. **Sev 2 — Onboarding skip → server settings.** Cross-device drift; mirror the pattern used by other settings keys. (#3-2)
9. **Sev 2 — Bulk actions on Orders.** Multi-select + Mark Dropped Off / Resend Email. (#7-1)
10. **Sev 2 — Duplicate "Exclude" header in Product Sizes (line 1831).** One-line removal. (#8-1)
11. **Sev 2 — Two "selected" visual languages.** Pick translucent or solid; apply both to filter chips and sidebar nav active state. (#4-1)
12. **Sev 2 — Manual Order labels → `.form-label`.** Inputs were normalized; labels weren't. (#4-2)
13. **Sev 2 — Always-on Regenerate Dropoff size picker with tooltip.** (#6-1)
14. **Sev 2 — `/docs/*` link policy.** Either commit to public or wrap in App Bridge `Redirect.toRemote`. (#10-1)
15. **Sev 2 — Inline `?` help in Order Detail / Manual Order pointing at Learn anchors.** (#10-2)
16. **Sev 1 — 5s Undo on Resend / Sync / Regen Pickup.** Defer the network call; bind to a toast button. (#3-3)
17. **Sev 1 — Drop or rename "Active" filter.** (#2-1)
