# PROJECT_STATUS.md — LockerDrop Shopify App

> Last Updated: 2026-02-05
> Branch: `main`

---

## Overview

LockerDrop is a Shopify app that enables merchants to offer smart locker pickup as a fulfillment option. Customers select a nearby Harbor Locker at checkout, the seller drops the package off, and the customer picks it up 24/7 using a secure link. The app integrates Shopify (orders, checkout, fulfillment), Harbor Lockers (physical locker network), and notification services (email via Resend, SMS via Twilio).

**Live URL:** https://app.lockerdrop.it
**Stack:** Node.js / Express / PostgreSQL / Shopify Extensions (React + Liquid)
**Logging:** pino (structured JSON in production, pretty-printed in dev)
**Revenue Model:** Per-order fee ($1-$2 per locker transaction via Shopify usage-based billing)

---

## File Structure

```
locker-drop-shopify/
├── server.js                          # Main Express server (~7500 lines, all routes)
├── db.js                              # PostgreSQL connection pool config
├── setup-database.js                  # Database schema creation script
├── package.json                       # Dependencies and scripts
├── shopify.app.toml                   # Shopify app config (client ID, scopes, proxy)
├── .env                               # Environment variables (secrets)
│
├── routes/
│   ├── auth.js                        # OAuth install/callback, webhook registration
│   └── carrier.js                     # Carrier service rates endpoint (v2)
│
├── ca-certificate.crt                 # DigitalOcean managed DB CA certificate
│
├── services/
│   ├── harbor.services.js             # Harbor Lockers API client (OAuth2, locker ops)
│   └── shopify.service.js             # Shopify Admin API client (GraphQL)
│
├── extensions/
│   ├── lockerdrop-checkout/           # Checkout UI extension — locker selection
│   │   ├── src/Checkout.jsx           # React component (locker cards, date picker)
│   │   └── shopify.extension.toml
│   ├── lockerdrop-order-block/        # Admin order details block
│   │   ├── src/OrderDetailsBlock.jsx  # React component (status, links)
│   │   └── shopify.extension.toml
│   ├── lockerdrop-thankyou/           # Thank you + order status pages
│   │   ├── src/ThankYou.js            # Post-purchase confirmation UI
│   │   ├── src/OrderStatus.js         # Customer account order status UI
│   │   └── shopify.extension.toml
│   └── lockerdrop-theme/             # Liquid theme blocks (6 blocks)
│       ├── blocks/
│       │   ├── cart-pickup-reminder.liquid
│       │   ├── how-it-works.liquid
│       │   ├── how-it-works-page.liquid  # Full page with locker finder map
│       │   ├── locker-finder.liquid       # Standalone map + search
│       │   ├── product-pickup-badge.liquid
│       │   └── promo-banner.liquid
│       ├── locales/en.default.json
│       └── shopify.extension.toml
│
├── disabled-extensions/               # Shopify Function (pickup points) — NOT DEPLOYED
│   ├── src/index.js
│   ├── src/fetch.js
│   ├── src/run.js
│   └── shopify.extension.toml
│
├── public/
│   ├── admin-dashboard.html           # Merchant dashboard (orders, lockers, settings, billing)
│   ├── landing.html                   # Marketing homepage / waitlist signup
│   ├── change-pickup-date.html        # Customer date change flow (3-step)
│   ├── dropoff-success.html           # Seller confirmation after drop-off
│   ├── pickup-success.html            # Customer confirmation after pickup (brandable)
│   ├── privacy-policy.html            # Privacy policy page
│   ├── test-dashboard.html            # Server health check page
│   ├── harbor-locations.json          # 350+ Harbor Locker locations (static cache)
│   ├── logo.png                       # LockerDrop logo
│   ├── uploads/logos/                 # Merchant-uploaded custom logos
│   └── docs/
│       ├── training.html              # Seller training guide
│       ├── faq.html                   # Seller FAQ
│       ├── customer-faq.html          # Customer FAQ
│       └── shopify-order-*.html       # Email template references
│
├── docs/
│   ├── SELLER_TRAINING_GUIDE.md
│   ├── CUSTOMER_FAQ.md
│   ├── FAQ.md
│   ├── EMAIL_SETUP_GUIDE.md               # How merchants install the email template
│   ├── email-template-order-confirmation.liquid  # Custom order confirmation email
│   └── INCIDENT_RESPONSE_POLICY.md
│
├── ARCHITECTURE.md
├── BUILD_SUMMARY.md
├── DEV_NOTES.md
├── QUICK_START.md
├── README.md
├── UX_REVIEW.md
├── ADMIN_SETUP_GUIDE.md
└── FILES_MANIFEST.txt
```

---

## Database Schema (PostgreSQL)

### `stores`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| shop | VARCHAR(255) UNIQUE | Shopify domain (e.g. `mystore.myshopify.com`) |
| access_token | TEXT | Shopify OAuth token |
| created_at | TIMESTAMP | |

### `orders`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| shop | VARCHAR(255) | |
| shopify_order_id | VARCHAR(255) UNIQUE | |
| order_number | VARCHAR(255) | Display order number |
| customer_email | VARCHAR(255) | |
| customer_name | VARCHAR(255) | |
| customer_phone | VARCHAR(255) | For SMS notifications |
| location_id | INTEGER | Harbor location ID |
| locker_id | INTEGER | Specific locker compartment |
| tower_id | VARCHAR(255) | Harbor tower reference |
| dropoff_link | TEXT | Harbor URL for seller drop-off |
| dropoff_request_id | INTEGER | Harbor request ID |
| pickup_link | TEXT | Harbor URL for customer pickup |
| pickup_request_id | INTEGER | Harbor request ID |
| status | VARCHAR(50) | See status flow below |
| preferred_pickup_date | DATE | |
| locker_name | VARCHAR(255) | Location display name |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Status flow:** `pending` → `pending_dropoff` → `dropped_off` → `ready_for_pickup` → `completed` (or `cancelled` at any point, or `expired` after hold_time_days)

### `locker_preferences`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| shop | VARCHAR(255) | |
| location_id | INTEGER | Harbor location ID |
| location_name | VARCHAR(255) | |
| is_enabled | BOOLEAN | Default true |
| created_at | TIMESTAMP | |
| UNIQUE(shop, location_id) | | |

### `locker_events`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| order_id | INTEGER FK → orders.id | |
| event_type | VARCHAR(100) | |
| locker_id | INTEGER | |
| tower_id | VARCHAR(255) | |
| timestamp | TIMESTAMP | |
| payload | JSONB | Full event data |
| created_at | TIMESTAMP | |

### `shop_settings`
| Column | Type | Notes |
|--------|------|-------|
| shop | VARCHAR(255) | |
| free_pickup | BOOLEAN | Whether pickup is free or $1 |
| hold_time_days | INTEGER | Days before locker expires (default 5) |
| processing_days | INTEGER | Days to prepare order |
| fulfillment_days | VARCHAR | Which days of week (e.g. Mon-Fri) |
| vacation_days | TEXT | JSON array of date ranges |
| use_checkout_extension | BOOLEAN | Use React extension vs carrier service |

### `product_locker_sizes`
| Column | Type | Notes |
|--------|------|-------|
| shop | VARCHAR(255) | |
| product_id | VARCHAR(255) | Shopify product ID |
| variant_id | VARCHAR(255) | Shopify variant ID |
| length_inches | DECIMAL | |
| width_inches | DECIMAL | |
| height_inches | DECIMAL | |
| locker_size | VARCHAR(50) | small / medium / large / xlarge |
| excluded | BOOLEAN | If true, product can't use lockers |

### `subscriptions`
| Column | Type | Notes |
|--------|------|-------|
| shop | VARCHAR(255) | |
| plan_name | VARCHAR(50) | trial / basic / pro / enterprise |
| status | VARCHAR(50) | |
| monthly_order_limit | INTEGER | |
| orders_this_month | INTEGER | |
| trial_ends_at | TIMESTAMP | |
| billing_cycle_start | TIMESTAMP | |
| shopify_charge_id | VARCHAR(255) | |

**Indexes:** `idx_orders_shop`, `idx_orders_status`, `idx_locker_prefs_shop`

---

## API Routes

### Authentication & Installation
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/auth/install` | Initiate Shopify OAuth flow |
| GET | `/auth/callback` | OAuth callback — saves token, registers webhooks & carrier |
| GET | `/auth/reconnect` | Force re-authentication |
| GET | `/auth/register-carrier/:shop` | Manual carrier service registration |
| GET | `/api/validate-token/:shop` | Check if Shopify token is valid |
| GET | `/api/check-scopes/:shop` | Verify required scopes |

### Carrier Service (Shipping Rates at Checkout)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/carrier/rates` | Returns locker options as shipping rates (size filtering + availability) |
| GET | `/api/checkout/lockers` | Get nearby lockers for checkout extension |
| POST | `/api/checkout/select-locker` | Save selected locker for an order |

### Order Management
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/webhooks/orders/create` | Shopify webhook — sync new orders |
| POST | `/webhooks/orders/updated` | Shopify webhook — sync customer info, detect external fulfillment |
| POST | `/webhooks/orders/cancelled` | Shopify webhook — handle cancellations |
| POST | `/webhooks/app/uninstalled` | Shopify webhook — clean up shop data, release lockers |
| GET | `/api/orders/:shop` | List all orders for a shop |
| GET | `/api/sync-orders/:shop` | Manually sync past orders from Shopify |
| GET | `/api/order-locker-data/:shopifyOrderId` | Get locker data for admin order block |
| GET | `/api/customer/order-status/:orderId` | Public — customer order status |
| POST | `/api/order/:shop/:orderId/status` | Update order status |
| POST | `/api/order/:shop/:orderId/cancel-locker` | Cancel locker, release from Harbor |

### Locker Operations
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/manual-order/:shop` | Create order manually (seller assigns locker) |
| POST | `/api/generate-dropoff-link/:shop` | Create Harbor dropoff request |
| POST | `/api/generate-pickup-link/:shop` | Create Harbor pickup request |
| POST | `/api/dropoff-complete` | Callback — seller dropped off, marks ready_for_pickup |
| POST | `/api/pickup-complete` | Callback — customer picked up, marks completed, releases locker |
| POST | `/api/fix-order-locker/:shop` | Admin tool — fix stuck locker_id |
| POST | `/api/emergency-open/:shop` | Admin — emergency locker access |
| POST | `/api/regenerate-links/:shop` | Bulk regenerate dropoff/pickup links |
| POST | `/api/regenerate-order-link/:shop/:orderNumber` | Regenerate single order link |
| POST | `/api/cancel-locker/:shop/:orderId` | Cancel and release locker |

### Customer Notifications
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/resend-notification/:orderNumber` | Resend pickup email/SMS |
| POST | `/api/update-pickup-date/:shop/:orderNumber` | Customer changes pickup date |
| GET | `/api/order-pickup-details/:orderNumber` | Get details for date change page |
| POST | `/api/verify-order-email/:orderNumber` | Verify email matches order |
| GET | `/api/available-pickup-dates/:shop` | Get next 7 available fulfillment days |

### Locker Search & Preferences
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/lockers/:shop` | Get all lockers with search, filters, pagination, availability |
| GET | `/api/locker-preferences/:shop` | Get seller's enabled locker locations |
| POST | `/api/locker-preferences/:shop` | Save seller's enabled locker locations |
| GET | `/api/locker-availability/:shop` | Real-time availability for enabled lockers |
| GET | `/api/location-availability/:locationId` | Availability for a single location |
| GET | `/api/pickup-points` | Public pickup point data |
| GET | `/api/public/lockers` | Public locker list (no auth required) |

### Shop Settings
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/settings/:shop` | Get shop settings |
| POST | `/api/settings/:shop` | Save shop settings |
| GET | `/api/store-location/:shop` | Get shop address for locker search |

### Products & Sizing
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/products/:shop` | Get products from Shopify with size mappings |
| GET | `/api/product-sizes/:shop` | Get saved product size mappings |
| POST | `/api/product-sizes/:shop` | Save product dimensions / locker size |

### Subscription & Billing
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/subscription/:shop` | Get current plan and usage |
| POST | `/api/subscribe/:shop` | Create Shopify billing charge |
| GET | `/api/subscription/confirm` | Callback after merchant approves billing |
| POST | `/api/subscription/cancel/:shop` | Cancel recurring charge |
| POST | `/api/subscription/dev-switch/:shop` | Dev mode — switch plans without billing |
| GET | `/api/plans` | List available billing plans |

### Branding & Customization
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/branding/:shop` | Get custom branding (colors, logo) |
| POST | `/api/branding/:shop` | Save branding settings |
| POST | `/api/branding/:shop/logo` | Upload custom logo (2MB limit) |
| DELETE | `/api/branding/:shop/logo` | Remove custom logo |
| GET | `/api/upsell-products/:shop` | Get upsell products for success page |

### Error Tracking
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/errors` | Frontend error reports from dashboard and extensions |

### Dashboard & Static Pages
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Landing page or redirect to dashboard |
| GET | `/admin/dashboard` | Serve admin dashboard (with auth check) |
| GET | `/api/stats/:shop` | Dashboard stats (pending, ready, completed, active) |
| GET | `/api/waitlist` | Waitlist signup |
| GET | `/pickup-success` | Customer pickup success page |
| GET | `/dropoff-success` | Seller dropoff success page |
| GET | `/change-pickup/:orderNumber` | Customer date change page |
| GET | `/docs/training` | Seller training guide |
| GET | `/docs/faq` | Seller FAQ |
| GET | `/docs/customer-faq` | Customer FAQ |
| GET | `/privacy` | Privacy policy |

---

## External Integrations

### Harbor Lockers API
- **Auth:** OAuth 2.0 client credentials (token cached 4 min)
- **Environment:** Sandbox (`api.sandbox.harborlockers.com`)
- **Operations:** Create dropoff/pickup requests, release lockers, check availability, list locations, manage deliveries
- **Locker sizes:** small (1), medium (2), large (3), xlarge (4)

### Shopify Admin API
- **Version:** 2025-10 (GraphQL Admin API)
- **Auth:** Access token from OAuth flow
- **Scopes:** `write_shipping, read_orders, write_orders, read_products, write_products, read_shipping, read_fulfillments, write_fulfillments`
- **Webhooks registered:** `orders/create`, `orders/updated`, `orders/cancelled`, `app/uninstalled`
- **All admin calls use GraphQL** (OAuth endpoints remain REST as required by Shopify)
- **Carrier service:** Registered at install to provide locker shipping rates
- **App proxy:** `/apps/lockerdrop` → routes through Shopify to app server

### Resend (Email)
- **From:** `LockerDrop <notifications@lockerdrop.it>`
- **Triggers:** Order ready for pickup, pickup date changed, manual resend

### Twilio (SMS)
- **Triggers:** Same as email (ready for pickup, date changed, manual resend)

### OpenStreetMap Nominatim
- **Use:** Geocoding zip codes to lat/lon for distance calculations
- **Caching:** 24-hour TTL in memory

### Zippopotam.us
- **Use:** Zip code geocoding in theme extension locker finders (client-side)

---

## Shopify Extensions

### 1. lockerdrop-checkout (Checkout UI Extension)
- **Where:** Checkout page, after shipping address
- **What:** Displays nearby locker options as cards with distance, availability, and date picker
- **Tech:** React (JSX), Shopify Checkout UI Extensions API

### 2. lockerdrop-order-block (Admin UI Extension)
- **Where:** Shopify Admin → Order Details page
- **What:** Shows locker status, dropoff/pickup links, and dashboard link for LockerDrop orders
- **Tech:** React (JSX), Shopify Admin UI Extensions API

### 3. lockerdrop-thankyou (Checkout + Customer Account)
- **Where:** Thank you page + customer account order status
- **What:** Shows pickup confirmation with locker location, expected date, and 3-step instructions; order status page shows live progress and pickup link
- **Tech:** JavaScript (imperative API)

### 4. lockerdrop-theme (Theme Extension — 6 Liquid blocks)
- **cart-pickup-reminder:** Cart page reminder about locker pickup option
- **how-it-works:** Compact 3-step explanation block
- **how-it-works-page:** Full page with steps, benefits, and interactive locker finder map
- **locker-finder:** Standalone map + zip code search
- **product-pickup-badge:** Product page badge showing locker eligibility
- **promo-banner:** Promotional banner for any page

### 5. disabled-extensions (Shopify Function — NOT DEPLOYED)
- **What:** Alternative approach using native Shopify pickup points (Function API)
- **Status:** Disabled, in `disabled-extensions/` directory

---

## Working Features

1. **Shopify OAuth install/uninstall flow** — stores access token, registers webhooks and carrier service
2. **Carrier service rates** — returns locker locations as shipping options at checkout (with size filtering and availability checks)
3. **Checkout UI extension** — interactive locker selection with map, distance, and date picker
4. **Order webhook sync** — auto-creates locker orders from Shopify webhook
5. **Manual order creation** — seller can create orders directly from dashboard
6. **Dropoff flow** — generates Harbor dropoff link, seller drops off, callback marks ready
7. **Pickup flow** — generates Harbor pickup link, customer picks up, callback marks completed and releases locker
8. **Email + SMS notifications** — sent when order is ready for pickup
9. **Customer date change** — 3-step verified flow to reschedule pickup
10. **Admin dashboard** — full order management, locker selection, product sizing, settings, branding, billing
11. **Locker search with map** — distance-based search, availability, size filtering, pagination
12. **Product size configuration** — dimensions or dropdown, product exclusions, CSV import/export
13. **Shop settings** — free pickup toggle, processing days, fulfillment day schedule, vacation days
14. **Branding customization** — logo upload, primary color, success message, upsell products
15. **Subscription/billing** — per-order fee ($1-$2) via Shopify usage-based billing (subscription tiers built but bypassed for launch)
16. **Thank you page** — confirmation with pickup instructions and retry logic
17. **Order status page** — live progress tracking in customer account
18. **Admin order block** — locker info visible in Shopify Admin order details
19. **Theme blocks** — 6 customizable Liquid blocks for storefront
20. **Landing page** — marketing page with locker finder and waitlist signup
21. **Privacy policy, FAQs, training docs** — full documentation suite
22. **Rate limiting** — 3 tiers: public API (30/min), checkout (60/min), webhooks (120/min)
23. **Locker expiry automation** — cron job every 6 hours: warns customers 1 day before expiry, auto-releases expired lockers, emails customer + seller
24. **Order update sync** — `orders/updated` webhook syncs customer info changes and detects external fulfillment
25. **Structured logging** — pino logger (JSON in production, pretty in dev), configurable via `LOG_LEVEL` env var
26. **Frontend error tracking** — `POST /api/errors` endpoint + `window.onerror` in dashboard + `reportError()` in checkout and order block extensions
27. **App uninstall cleanup** — releases active lockers via Harbor, deletes all shop data (orders, preferences, settings, branding, sessions)
28. **PostgreSQL session store** — `connect-pg-simple` sessions survive server restarts
29. **SSL certificate validation** — CA cert loaded from `DB_CA_CERT` file path or `DB_CA_CERT_BASE64` env var
30. **Embedded app experience** — dashboard redirects to Shopify Admin when accessed directly, App Bridge loaded from CDN
31. **Custom email template** — order confirmation reads from `note_attributes`, with shipping line fallback; `docs/email-template-order-confirmation.liquid`

---

## Known Issues & TODOs

### Architecture / Technical Debt
- **Monolithic server.js (~7500 lines)** — all routes, middleware, and business logic in one file; needs refactoring into modular route files
- **Sandbox Harbor API hardcoded** — `api.sandbox.harborlockers.com` is hardcoded; blocked pending production credentials from Harbor

### Billing / Revenue
- **Subscription system built but bypassed** — per-order fee ($1-$2) is the launch model; subscription tiers exist in code but are not enforced
- **Need to implement Shopify `usageRecordCreate`** — to properly charge per-order via Shopify Billing API

### Missing Functionality
- **No returns support** — customer FAQ states returns are "not available yet"
- **No multi-package orders** — cannot split an order across multiple lockers
- **No volume-based size calculation** — only uses basic weight/dimensions, not cubic volume

### Operational
- **Geocoding dependency** — relies on external OpenStreetMap Nominatim API (rate-limited, no API key)
- **No automated tests** — no test files or test framework configured
- **No CI/CD pipeline** — no GitHub Actions or deployment automation

### Security Considerations
- **Access token stored in plaintext** — Shopify tokens stored as plain TEXT in database
- **No CSRF protection** — POST endpoints rely on session + HMAC but no CSRF tokens

---

## Environment Variables Required

```
# Shopify
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SHOPIFY_APP_URL=https://app.lockerdrop.it

# Harbor Lockers
HARBOR_CLIENT_ID=
HARBOR_CLIENT_SECRET=

# Database (PostgreSQL)
DB_HOST=
DB_PORT=25060
DB_NAME=
DB_USER=
DB_PASSWORD=
DATABASE_URL=

# Email (Resend)
RESEND_API_KEY=

# SMS (Twilio)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Database SSL
DB_CA_CERT=./ca-certificate.crt    # Path to DigitalOcean CA cert file
# DB_CA_CERT_BASE64=               # Alternative: base64-encoded cert

# App
SESSION_SECRET=
NODE_ENV=production
PORT=3000
LOG_LEVEL=info                     # pino log level (trace/debug/info/warn/error/fatal)
```

---

## Revenue Model

**Launch model:** Per-order fee ($1-$2 per locker transaction) via Shopify usage-based billing (`appSubscriptionCreate` with usage line item + `usageRecordCreate` after each order). Zero cost to install — merchants only pay when customers use locker pickup.

**Future options** (see `lockerdrop-pricing-strategies.jsx`):
1. Pure per-order fee (current)
2. Tiered subscription (Free / $19 / $49)
3. Subscription + usage hybrid ($9/mo + $0.75/order)
4. Commission on shipping fee
5. Marketplace revenue share

---

## Key Business Logic

### Locker Size Mapping
| Size | ID | Max Dimensions (L x W x H) |
|------|----|-----------------------------|
| Small | 1 | 12" x 8" x 4" |
| Medium | 2 | 16" x 12" x 8" |
| Large | 3 | 20" x 16" x 12" |
| X-Large | 4 | 24" x 20" x 16" |

### Order Lifecycle
```
pending → pending_dropoff → dropped_off → ready_for_pickup → completed
                                                            → cancelled (at any point)
                                                            → expired (auto, after hold_time_days)
```

### Fulfillment Flow
1. Customer selects locker at checkout (carrier rates or checkout extension)
2. Order created in Shopify → webhook fires → order saved in DB
3. Seller sees order in dashboard → generates dropoff link → drops off package
4. Dropoff callback → status set to `ready_for_pickup` → email/SMS sent to customer
5. Customer clicks pickup link → locker opens → picks up package
6. Pickup callback → status set to `completed` → locker released → Shopify order fulfilled

### Distance Filtering
- Geocodes customer zip code via OpenStreetMap
- Haversine formula for distance calculation
- Filters to within 100 miles of customer
- Returns top 5 nearest locations with availability

---

## User Flows (Step-by-Step)

### Seller Flow

| # | Step | Status | Files |
|---|------|--------|-------|
| 1 | **App Install** — Merchant clicks install link, redirected to Shopify OAuth consent screen | Implemented | `routes/auth.js` → `GET /auth/install` constructs OAuth URL with scopes and redirects to Shopify |
| 2 | **OAuth Callback** — Shopify redirects back with auth code; app exchanges for access token, saves to DB, registers webhooks (`orders/create`, `orders/cancelled`) and carrier service | Implemented | `routes/auth.js` → `GET /auth/callback` → calls `services/shopify.service.js` (registerCarrierService, registerWebhooks) → saves token to `stores` table via `db.js` |
| 3 | **Dashboard Load** — Merchant visits `/admin/dashboard`; app verifies session/HMAC, serves dashboard HTML; dashboard JS fetches stats, orders, settings, locker preferences | Implemented | `server.js` → `GET /admin/dashboard` (auth check + serve HTML) → `public/admin-dashboard.html` (JS calls `/api/stats/:shop`, `/api/orders/:shop`, `/api/settings/:shop`, `/api/locker-preferences/:shop`, `/api/subscription/:shop`) |
| 4 | **Onboarding Wizard** — If no lockers configured, 3-step wizard appears: Welcome → Select Lockers → Done | Implemented | `public/admin-dashboard.html` (onboarding modal with map, locker search, and save) → `POST /api/locker-preferences/:shop` in `server.js` |
| 5 | **Configure Lockers** — Merchant searches lockers by city/zip on "My Lockers" tab, enables/disables locations, views real-time availability | Implemented | `public/admin-dashboard.html` (My Lockers tab) → `server.js` → `GET /api/lockers/:shop` (search + filter + paginate), `GET /api/locker-availability/:shop` → `services/harbor.services.js` (getLocationAvailability) |
| 6 | **Configure Products** — Merchant sets product dimensions or selects locker size per product; can exclude products from LockerDrop; CSV import/export | Implemented | `public/admin-dashboard.html` (Product Sizes tab) → `server.js` → `GET /api/products/:shop` (fetches from Shopify via GraphQL), `GET/POST /api/product-sizes/:shop` → `product_locker_sizes` table |
| 7 | **Configure Settings** — Free pickup toggle, processing days, fulfillment days (M-F), vacation days, hold time | Implemented | `public/admin-dashboard.html` (Settings tab) → `server.js` → `GET/POST /api/settings/:shop` → `shop_settings` table |
| 8 | **Configure Branding** (Enterprise) — Upload logo, set primary color, custom success message, upsell products | Implemented | `public/admin-dashboard.html` (Settings tab, branding section) → `server.js` → `GET/POST /api/branding/:shop`, `POST /api/branding/:shop/logo` (multer upload) |
| 9 | **Receive Order** — Customer places order with locker pickup → Shopify fires `orders/create` webhook → app saves order to DB with locker details from shipping address | Implemented | `server.js` → `POST /webhooks/orders/create` → parses locker info from `shipping_address.address2` or note attributes → inserts into `orders` table, status = `pending` |
| 10 | **View Order in Dashboard** — Order appears in Orders tab with status badge, locker location, customer info; seller can filter/sort | Implemented | `public/admin-dashboard.html` (Orders tab) → `server.js` → `GET /api/orders/:shop` |
| 11 | **Generate Drop-off Link** — Seller clicks "Drop off" button on order → app creates Harbor dropoff request → returns secure URL | Implemented | `public/admin-dashboard.html` (dropoff button) → `server.js` → `POST /api/generate-dropoff-link/:shop` → `services/harbor.services.js` (createDropoffRequest) → saves `dropoff_link` + `dropoff_request_id` to `orders` table, status → `pending_dropoff` |
| 12 | **Drop Off Item** — Seller opens dropoff link → Harbor locker opens → seller places package inside → locker closes | Implemented (Harbor handles physical interaction) | Seller's browser opens Harbor URL → Harbor API manages locker open/close → Harbor redirects to `GET /dropoff-success` |
| 13 | **Drop-off Callback** — App receives confirmation → marks order `ready_for_pickup` → generates pickup link → sends email + SMS to customer | Implemented | `server.js` → `POST /api/dropoff-complete` (receives locker_id, tower_id from callback URL params) → `services/harbor.services.js` (createPickupRequest) → Resend email + Twilio SMS → `public/dropoff-success.html` shown to seller |
| 14 | **Customer Picks Up** — Customer clicks pickup link → locker opens → takes package → locker closes | Implemented (Harbor handles physical interaction) | Customer's browser opens Harbor URL → Harbor redirects to `GET /pickup-success` |
| 15 | **Pickup Callback** — App receives confirmation → marks order `completed` → releases locker in Harbor → auto-fulfills order in Shopify | Implemented | `server.js` → `POST /api/pickup-complete` → `services/harbor.services.js` (releaseLocker) → `services/shopify.service.js` (fulfillShopifyOrder via Fulfillment API) → `public/pickup-success.html` shown to customer |
| 16 | **Manual Order Creation** — Seller can create orders manually from dashboard (not from Shopify checkout) | Implemented | `public/admin-dashboard.html` (manual order modal) → `server.js` → `POST /api/manual-order/:shop` |
| 17 | **Resend Notification** — Seller can resend pickup email/SMS from dashboard | Implemented | `public/admin-dashboard.html` (resend button) → `server.js` → `POST /api/resend-notification/:orderNumber` |
| 18 | **Cancel Order** — Seller cancels locker assignment, releases locker back to Harbor | Implemented | `public/admin-dashboard.html` (cancel button) → `server.js` → `POST /api/cancel-locker/:shop/:orderId` → `services/harbor.services.js` (releaseLocker) |
| 19 | **Subscription Management** — View plan, upgrade, cancel | Implemented (but billing enforcement bypassed) | `public/admin-dashboard.html` (Billing tab) → `server.js` → `GET /api/subscription/:shop`, `POST /api/subscribe/:shop` → Shopify GraphQL (appSubscriptionCreate) |

### Buyer Flow

| # | Step | Status | Files |
|---|------|--------|-------|
| 1 | **Browse Store** — Customer browses Shopify storefront; product pages can show "Locker Pickup Available" badge | Implemented | `extensions/lockerdrop-theme/blocks/product-pickup-badge.liquid` (theme block, merchant must add to theme) |
| 2 | **Add to Cart** — Customer adds items to cart; cart page can show locker pickup reminder | Implemented | `extensions/lockerdrop-theme/blocks/cart-pickup-reminder.liquid` (theme block, merchant must add to theme) |
| 3 | **Checkout — Shipping Rates (Carrier Service path)** — Shopify calls carrier service → app returns locker locations as shipping options based on customer address, product sizes, and availability | Implemented | `routes/carrier.js` → `POST /carrier/rates` → calculates required locker size from cart items → queries `product_locker_sizes` → geocodes destination → `services/harbor.services.js` (getLocations, getLocationAvailability) → filters by distance (100mi) and size → returns top 5 as rate options |
| 4 | **Checkout — Locker Selection (Checkout Extension path)** — Interactive UI in checkout: shows locker cards with distance + availability, date picker | Implemented | `extensions/lockerdrop-checkout/src/Checkout.jsx` → calls `GET /api/checkout/lockers` (server.js) → displays locker cards, auto-selects nearest → date picker calls `GET /api/available-pickup-dates/:shop` → selected locker written to shipping address `address2` field |
| 5 | **Place Order** — Customer completes checkout; Shopify creates order with locker info in shipping address | Implemented | Standard Shopify checkout → fires `orders/create` webhook → `server.js` → `POST /webhooks/orders/create` → order saved to `orders` table |
| 6 | **Thank You Page** — Confirmation with locker location, expected pickup date, and 3-step instructions | Implemented | `extensions/lockerdrop-thankyou/src/ThankYou.js` → calls `GET /api/customer/order-status/:orderId` (with retry logic, 6 attempts) → renders confirmation card with location, date, and steps |
| 7 | **Order Status Page** — In customer account, shows live order progress (Preparing → Ready → Picked Up) with status badges | Implemented | `extensions/lockerdrop-thankyou/src/OrderStatus.js` → calls `GET /api/customer/order-status/:orderId` → renders progress steps and pickup link when ready |
| 8 | **Receive Pickup Notification** — Customer gets email + SMS with pickup link when seller drops off package | Implemented | `server.js` → `POST /api/dropoff-complete` triggers Resend email + Twilio SMS with pickup link and locker location details |
| 9 | **Change Pickup Date** (optional) — Customer can reschedule via link in email → verify email → select new date | Implemented | `public/change-pickup-date.html` (3-step flow) → `server.js` → `GET /api/order-pickup-details/:orderNumber`, `POST /api/verify-order-email/:orderNumber`, `GET /api/available-pickup-dates/:shop`, `POST /api/update-pickup-date/:shop/:orderNumber` |
| 10 | **Pick Up Item** — Customer opens pickup link → Harbor locker opens → customer retrieves package | Implemented (Harbor handles physical interaction) | Customer opens Harbor pickup URL → Harbor opens locker → redirects to `/pickup-success` |
| 11 | **Pickup Success Page** — Branded confirmation page with order number, optional upsell products | Implemented | `public/pickup-success.html` → calls `POST /api/pickup-complete` + `GET /api/branding/:shop` + `GET /api/upsell-products/:shop` → displays success with optional brand customization and upsell grid |
| 12 | **Order Fulfilled in Shopify** — Shopify order automatically marked as fulfilled after pickup | Implemented | `server.js` → pickup-complete handler → `services/shopify.service.js` → Shopify Fulfillment API (`POST /admin/api/fulfillments.json`) |

### Supplemental Flows

| Flow | Status | Files |
|------|--------|-------|
| **Locker Finder (public)** — Anyone can search for nearby lockers via theme block or landing page | Implemented | `extensions/lockerdrop-theme/blocks/locker-finder.liquid`, `extensions/lockerdrop-theme/blocks/how-it-works-page.liquid`, `public/landing.html` → `GET /api/public/lockers` + Zippopotam.us geocoding |
| **Admin Order Block** — Shopify admin sees locker status on order detail page | Implemented | `extensions/lockerdrop-order-block/src/OrderDetailsBlock.jsx` → `GET /api/order-locker-data/:shopifyOrderId` |
| **Token Re-auth** — When Shopify token expires, dashboard shows re-auth prompt | Implemented | `server.js` → `GET /api/validate-token/:shop`, `GET /auth/reconnect` |
| **Order Sync** — Backfill past orders from Shopify into LockerDrop DB | Implemented | `server.js` → `GET /api/sync-orders/:shop` |
| **Emergency Locker Open** — Admin can force-open a locker | Implemented | `server.js` → `POST /api/emergency-open/:shop` |
| **Waitlist Signup** — Landing page email collection | Implemented | `public/landing.html` → `server.js` → `GET /api/waitlist` |

### Not Implemented / Gaps

| Feature | Status | Notes |
|---------|--------|-------|
| **Returns via locker** | Not started | Customer FAQ says "not available yet" |
| **Multi-package orders** | Not started | No support for splitting an order across multiple lockers |
| **Automated tests** | Not started | No test framework or test files |
| **CI/CD pipeline** | Not started | No deployment automation |
| **Production Harbor API** | Blocked | Awaiting production credentials from Harbor (email sent 2026-02-05) |

### Recently Completed (February 2026)

| Feature | Item | Notes |
|---------|------|-------|
| **App uninstall cleanup** | #1 | Releases lockers, deletes all shop data |
| **Hardcoded locker ID removed** | #3 | All 4 instances of ID 329 removed |
| **PostgreSQL session store** | #4 | `connect-pg-simple` sessions |
| **GraphQL migration** | #5 | All REST Admin API calls → GraphQL |
| **App Bridge + embedded** | #6-7 | CDN script, embedded=true, redirects |
| **SSL certificate validation** | #8 | CA cert loaded from env var |
| **Rate limiting** | #13 | 3 tiers via `express-rate-limit` |
| **Locker expiry automation** | #14 | `node-cron` every 6 hours |
| **Order update sync** | #15 | `ORDERS_UPDATED` webhook |
| **Structured logging** | #16 | pino replaces all console.log/error |
| **Frontend error tracking** | #17 | Backend endpoint + client handlers |
