# LockerDrop — Project Reference

> Last Updated: 2026-02-05
> Branch: `main`
> See also: [UX_REVIEW.md](UX_REVIEW.md) | [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md)

---

## Overview

LockerDrop is a Shopify app that enables merchants to offer smart locker pickup as a fulfillment option. Customers select a nearby Harbor Locker at checkout, the seller drops the package off, and the customer picks it up 24/7 using a secure link. The app integrates Shopify (orders, checkout, fulfillment), Harbor Lockers (physical locker network), and notification services (email via Resend, SMS via Twilio).

**Live URL:** https://app.lockerdrop.it
**Stack:** Node.js / Express / PostgreSQL / Shopify Extensions (React + Liquid)
**Logging:** pino (structured JSON in production, pretty-printed in dev)
**Revenue Model:** Per-order fee ($1-$2 per locker transaction via Shopify usage-based billing)

---

## Architecture

### System Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        CUSTOMER FLOW                             │
├─────────────────────────────────────────────────────────────────┤
│  1. Customer visits Shopify store                               │
│  2. Adds items to cart                                          │
│  3. Enters shipping address                                     │
│  4. Sees "LockerDrop Pickup - FREE" as shipping option          │
│  5. Selects LockerDrop and completes purchase                   │
│  6. Receives order confirmation with locker location + pickup   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                        SELLER FLOW                               │
├─────────────────────────────────────────────────────────────────┤
│  1. Seller receives order notification in admin dashboard       │
│  2. Views order details (customer info, locker, drop-off link)  │
│  3. Goes to locker location, opens drop-off link on phone       │
│  4. Places package inside, closes door                          │
│  5. System detects drop-off via Harbor callback                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      CUSTOMER PICKUP                             │
├─────────────────────────────────────────────────────────────────┤
│  1. Customer receives "Ready for Pickup" email + SMS            │
│  2. Goes to locker location, opens pickup link on phone         │
│  3. Retrieves package, system auto-confirms pickup              │
│  4. Locker released, Shopify order auto-fulfilled               │
└─────────────────────────────────────────────────────────────────┘
```

### Technical Architecture

```
┌──────────────────┐
│  Shopify Store   │
│  (enna-test)     │
└────────┬─────────┘
         │ Customer selects LockerDrop shipping
         ↓
┌──────────────────────────────────────────────────────────────┐
│                 APP SERVER (app.lockerdrop.it)                │
├──────────────────────────────────────────────────────────────┤
│  POST /carrier/rates          → Shipping rates at checkout   │
│  GET  /admin/dashboard        → Seller dashboard             │
│  GET  /api/*                  → REST API endpoints           │
│  POST /webhooks/*             → Shopify + Harbor callbacks   │
└────┬──────────────────────────────────────────────┬──────────┘
     │                                               │
     ↓                                               ↓
┌──────────────────────────────┐  ┌────────────────────────────┐
│   HARBOR LOCKERS API         │  │   POSTGRESQL DATABASE      │
│   api.sandbox.harborlockers  │  │   - stores, orders         │
│   .com                       │  │   - locker_preferences     │
│   • dropoff/pickup requests  │  │   - shop_settings          │
│   • locker availability      │  │   - product_locker_sizes   │
│   • release lockers          │  │   - locker_events          │
└──────────────────────────────┘  └────────────────────────────┘
```

### Order Creation Data Flow

```
Customer Places Order → Shopify fires orders/create webhook
  → Server parses locker info from shipping address / note_attributes
  → Saves order to DB (status: pending)
  → Seller generates dropoff link → Harbor reserves locker (5-min exclusive)
  → Seller drops off → Harbor callback → status: ready_for_pickup
  → Email + SMS sent to customer with pickup link
  → Customer picks up → Harbor callback → status: completed → locker released
```

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
│   ├── SELLER_TRAINING_GUIDE.md       # Merchant education / how-to
│   ├── CUSTOMER_FAQ.md                # Customer-facing FAQ
│   ├── FAQ.md                         # Comprehensive seller + customer FAQ
│   ├── EMAIL_SETUP_GUIDE.md           # How merchants install email template
│   ├── email-template-order-confirmation.liquid
│   ├── HARBOR_API_NOTES.md            # Harbor API behavior reference
│   └── INCIDENT_RESPONSE_POLICY.md    # Security incident response plan
│
├── PROJECT_STATUS.md                  # This file — single source of truth
├── UX_REVIEW.md                       # UI/UX documentation
└── LAUNCH_CHECKLIST.md                # Task tracking / project management
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
| POST | `/webhooks/customers/data_request` | GDPR — customer requests data export |
| POST | `/webhooks/customers/redact` | GDPR — anonymize customer PII in orders |
| POST | `/webhooks/shop/redact` | GDPR — delete all shop data (48hrs post-uninstall) |
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
- **Environment:** Sandbox (`api.sandbox.harborlockers.com`) — production keys available on request
- **Operations:** Create dropoff/pickup requests, release lockers, check availability, list locations, manage deliveries
- **Locker sizes:** small (1), medium (2), large (3), xlarge (4)
- **Key behaviors:** 5-min exclusive reservation on dropoff, retry same link works, built-in "doesn't fit" flow — see `docs/HARBOR_API_NOTES.md`

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
- **Deploy:** `shopify app deploy` (requires Shopify Plus for checkout extensions)

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
- **locker-finder:** Standalone map + zip code search (Leaflet.js + OpenStreetMap)
- **product-pickup-badge:** Product page badge showing locker eligibility
- **promo-banner:** Promotional banner for any page
- All blocks use merchant-customizable accent colors and real Harbor location data

### 5. disabled-extensions (Shopify Function — NOT DEPLOYED)
- **What:** Alternative approach using native Shopify pickup points (Function API)
- **Status:** Disabled, in `disabled-extensions/` directory

---

## Public Website

### Landing Page (lockerdrop.it)
- Marketing page with animated hero section, orange brand color scheme
- Interactive locker finder with Leaflet.js map (350+ Harbor locations)
- Email waitlist signup form (stored in `waitlist` PostgreSQL table)
- Mobile responsive design

### Locker Finder API
- **Endpoint:** `GET /api/public/lockers?lat=X&lon=Y&limit=8`
- **Data Source:** Static JSON (`/public/harbor-locations.json`) with 350+ locations
- Search by zip code (geocoded via zippopotam.us), interactive map, distance-sorted

### URL Routing
| URL | Purpose |
|-----|---------|
| `lockerdrop.it` | Public landing/marketing page |
| `app.lockerdrop.it/?shop=X` | Redirects to admin dashboard |
| `app.lockerdrop.it/admin/dashboard` | Seller admin dashboard (embedded in Shopify Admin) |
| `app.lockerdrop.it/api/*` | API endpoints |

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
32. **GDPR compliance webhooks** — `customers/data_request` (query for export), `customers/redact` (anonymize PII), `shop/redact` (full cleanup); declared in `shopify.app.toml`

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

## Environment Variables

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

## Developer Guide

### Server Commands
```bash
npm install          # Install dependencies
npm start            # Production (node server.js)
npm run dev          # Development with auto-reload (nodemon)
shopify app deploy   # Deploy Shopify extensions
```

### Server Environment
- **Server:** root@138.197.216.202 (DigitalOcean)
- **Process manager:** PM2 (`pm2 restart lockerdrop`, `pm2 logs lockerdrop --lines 100`)
- **Harbor sandbox tower:** `0100000000000175`
- **Test store:** `enna-test.myshopify.com`

### Testing

**Test store checkout:**
1. Go to dev store, add product to cart
2. Proceed to checkout, enter shipping address
3. Verify "LockerDrop Pickup" appears as shipping option
4. Complete order, check server logs for webhook

**Testing checklist:**
- [ ] Dashboard loads at `/admin/dashboard?shop=enna-test.myshopify.com`
- [ ] Orders tab displays with filtering
- [ ] My Lockers tab loads Harbor locations
- [ ] Product Sizes tab shows products with size inputs
- [ ] Settings tab saves changes
- [ ] Test order places and appears in dashboard
- [ ] Dropoff link opens Harbor locker flow

**Harbor API test:**
```bash
# Get Harbor token
curl -X POST "https://accounts.sandbox.harborlockers.com/realms/harbor/protocol/openid-connect/token" \
  -d "grant_type=client_credentials&scope=service_provider&client_id=$HARBOR_CLIENT_ID&client_secret=$HARBOR_CLIENT_SECRET"

# Check locker availability
curl -X GET "https://api.sandbox.harborlockers.com/api/v1/towers/0100000000000175/locker-availability" \
  -H "Authorization: Bearer $TOKEN"
```

### Troubleshooting

**Dashboard shows blank page:**
1. Check browser console (F12) for errors
2. Verify server is running (`pm2 status`)
3. Check server logs (`pm2 logs lockerdrop`)

**"Shop parameter missing" error:**
Add `?shop=enna-test.myshopify.com` to the URL

**Lockers not loading:**
1. Check Harbor API credentials in `.env`
2. Test Harbor token endpoint (see curl above)
3. Check server logs for API errors

**LockerDrop not showing at checkout:**
1. Verify carrier service is registered (check Shopify admin > Settings > Shipping)
2. Make sure the test address is within 100 miles of an enabled locker
3. Check ngrok/server URL hasn't changed

---

## User Flows (Step-by-Step)

### Seller Flow

| # | Step | Status | Files |
|---|------|--------|-------|
| 1 | **App Install** — Merchant clicks install link, redirected to Shopify OAuth consent screen | Implemented | `routes/auth.js` → `GET /auth/install` |
| 2 | **OAuth Callback** — Shopify redirects back with auth code; app exchanges for access token, saves to DB, registers webhooks and carrier service | Implemented | `routes/auth.js` → `GET /auth/callback` → `services/shopify.service.js` |
| 3 | **Dashboard Load** — Merchant visits `/admin/dashboard`; app verifies session/HMAC, serves dashboard HTML | Implemented | `server.js` → `public/admin-dashboard.html` |
| 4 | **Onboarding Wizard** — If no lockers configured, 3-step wizard: Welcome → Select Lockers → Done | Implemented | `public/admin-dashboard.html` |
| 5 | **Configure Lockers** — Search lockers by city/zip, enable/disable, view real-time availability | Implemented | My Lockers tab → `GET /api/lockers/:shop` |
| 6 | **Configure Products** — Set product dimensions or locker size; exclude products; CSV import/export | Implemented | Product Sizes tab → `GET/POST /api/product-sizes/:shop` |
| 7 | **Configure Settings** — Free pickup, processing days, fulfillment days, vacation days, hold time | Implemented | Settings tab → `GET/POST /api/settings/:shop` |
| 8 | **Configure Branding** — Logo, primary color, success message, upsell products | Implemented | Settings tab → `GET/POST /api/branding/:shop` |
| 9 | **Receive Order** — Customer places order → webhook → order saved with locker details | Implemented | `POST /webhooks/orders/create` |
| 10 | **View Orders** — Orders appear in dashboard with status badges, filtering, search | Implemented | Orders tab → `GET /api/orders/:shop` |
| 11 | **Generate Drop-off Link** — Creates Harbor dropoff request → returns secure URL | Implemented | `POST /api/generate-dropoff-link/:shop` |
| 12 | **Drop Off Item** — Seller opens link → Harbor locker opens → places package | Implemented | Harbor handles physical interaction |
| 13 | **Drop-off Callback** — Marks ready_for_pickup → generates pickup link → emails/SMS customer | Implemented | `POST /api/dropoff-complete` |
| 14 | **Customer Picks Up** — Customer clicks pickup link → locker opens → takes package | Implemented | Harbor handles physical interaction |
| 15 | **Pickup Callback** — Marks completed → releases locker → auto-fulfills Shopify order | Implemented | `POST /api/pickup-complete` |
| 16 | **Manual Order** — Create orders manually from dashboard (non-Shopify sales) | Implemented | `POST /api/manual-order/:shop` |
| 17 | **Resend Notification** — Resend pickup email/SMS from dashboard | Implemented | `POST /api/resend-notification/:orderNumber` |
| 18 | **Cancel Order** — Cancel locker assignment, release back to Harbor | Implemented | `POST /api/cancel-locker/:shop/:orderId` |

### Buyer Flow

| # | Step | Status | Files |
|---|------|--------|-------|
| 1 | **Browse Store** — Product pages can show "Locker Pickup Available" badge | Implemented | `product-pickup-badge.liquid` |
| 2 | **Add to Cart** — Cart can show locker pickup reminder | Implemented | `cart-pickup-reminder.liquid` |
| 3 | **Checkout (Carrier Service)** — Locker locations appear as shipping options based on address, product sizes, availability | Implemented | `POST /carrier/rates` |
| 4 | **Checkout (Extension)** — Interactive locker cards with distance, availability, date picker | Implemented | `Checkout.jsx` |
| 5 | **Place Order** — Shopify creates order with locker info → webhook saves to DB | Implemented | `POST /webhooks/orders/create` |
| 6 | **Thank You Page** — Confirmation with locker location, pickup date, 3-step instructions | Implemented | `ThankYou.js` |
| 7 | **Order Status Page** — Live progress (Preparing → Ready → Picked Up) with pickup link | Implemented | `OrderStatus.js` |
| 8 | **Pickup Notification** — Email + SMS with pickup link when seller drops off | Implemented | `POST /api/dropoff-complete` |
| 9 | **Change Pickup Date** — 3-step verified flow via link in email | Implemented | `change-pickup-date.html` |
| 10 | **Pick Up Item** — Open pickup link → locker opens → retrieve package | Implemented | Harbor handles |
| 11 | **Pickup Success Page** — Branded confirmation with optional upsell products | Implemented | `pickup-success.html` |
| 12 | **Auto-Fulfill** — Shopify order marked as fulfilled after pickup | Implemented | Shopify Fulfillment API |

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

## Known Issues & TODOs

### Architecture / Technical Debt
- **Monolithic server.js (~7500 lines)** — all routes, middleware, and business logic in one file; needs refactoring into modular route files
- **Sandbox Harbor API hardcoded** — ~50 `api.sandbox.harborlockers.com` + ~22 `accounts.sandbox.harborlockers.com` URLs hardcoded in server.js; need to use env vars before production switch

### Billing / Revenue
- **Subscription system built but bypassed** — per-order fee ($1-$2) is the launch model; subscription tiers exist in code but are not enforced
- **Need to implement Shopify `usageRecordCreate`** — to properly charge per-order via Shopify Billing API

### Missing Functionality
- **No returns support** — customer FAQ states returns are "not available yet"
- **No multi-package orders** — cannot split an order across multiple lockers
- **No super admin dashboard** — cross-store analytics, revenue reports, locker utilization (future feature)

### Operational
- **Geocoding dependency** — relies on external OpenStreetMap Nominatim API (rate-limited, no API key)
- **No automated tests** — no test files or test framework configured
- **No CI/CD pipeline** — no GitHub Actions or deployment automation

### Security Considerations
- **Access token stored in plaintext** — Shopify tokens stored as plain TEXT in database
- **No CSRF protection** — POST endpoints rely on session + HMAC but no CSRF tokens

---

## Recently Completed (February 2026)

| Feature | Checklist Item | Notes |
|---------|---------------|-------|
| App uninstall cleanup | #1 | Releases lockers, deletes all shop data |
| Hardcoded locker ID removed | #3 | All 4 instances of ID 329 removed |
| PostgreSQL session store | #4 | `connect-pg-simple` sessions |
| GraphQL migration | #5 | All REST Admin API calls → GraphQL |
| App Bridge + embedded | #6-7 | CDN script, embedded=true, redirects |
| SSL certificate validation | #8 | CA cert loaded from env var |
| Harbor Q&A answered | #9 | See `docs/HARBOR_API_NOTES.md` |
| Rate limiting | #13 | 3 tiers via `express-rate-limit` |
| Locker expiry automation | #14 | `node-cron` every 6 hours |
| Order update sync | #15 | `ORDERS_UPDATED` webhook |
| Structured logging | #16 | pino replaces all console.log/error |
| Frontend error tracking | #17 | Backend endpoint + client handlers |
| Custom email template | — | `docs/email-template-order-confirmation.liquid` |
| GDPR compliance webhooks | #38 | `customers/data_request`, `customers/redact`, `shop/redact` |

---

## Related Documentation

| File | Purpose |
|------|---------|
| [UX_REVIEW.md](UX_REVIEW.md) | Dashboard UI/UX, checkout extension, order modal details |
| [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) | Task tracking, priorities, blockers, execution order |
| [docs/HARBOR_API_NOTES.md](docs/HARBOR_API_NOTES.md) | Harbor API behaviors (reservations, retries, production switch) |
| [docs/SELLER_TRAINING_GUIDE.md](docs/SELLER_TRAINING_GUIDE.md) | Merchant education and how-to guides |
| [docs/FAQ.md](docs/FAQ.md) | Comprehensive FAQ (seller + customer questions) |
| [docs/CUSTOMER_FAQ.md](docs/CUSTOMER_FAQ.md) | Customer-facing FAQ |
| [docs/EMAIL_SETUP_GUIDE.md](docs/EMAIL_SETUP_GUIDE.md) | Email template installation for merchants |
| [docs/INCIDENT_RESPONSE_POLICY.md](docs/INCIDENT_RESPONSE_POLICY.md) | Security incident response plan |
