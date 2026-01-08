# LockerDrop Admin Dashboard - Build Summary

## Overview

LockerDrop is a Shopify app that enables merchants to offer locker pickup as a shipping option. Customers can choose to pick up their orders from secure Harbor Lockers instead of traditional delivery.

## Current Features

### Admin Dashboard (`public/admin-dashboard.html`)

**Design System:** Shopify Polaris
- CSS custom properties for consistent theming
- Polaris design tokens (colors, spacing, shadows, typography)
- Responsive layout with mobile-first approach
- Professional, Shopify-native look and feel

**Tabs:**

#### Orders Tab
- View all LockerDrop orders with status filtering
- Filter by: Active, Pending Drop-off, Ready for Pickup, Completed, Cancelled
- Order details modal with drop-off/pickup links
- Actions: Mark as dropped off, resend pickup email, cancel locker
- Manual order creation for non-Shopify orders

#### My Lockers Tab
- Browse and select Harbor Locker locations
- Search by city or zip code
- Filter by locker size (Small, Medium, Large)
- View real-time availability
- Pagination for large locker lists
- Save locker preferences

#### Product Sizes Tab
- Assign dimensions to products/variants
- Enter exact L x W x H measurements
- Or use quick locker size dropdown
- Multi-item order stacking calculation
- Reference locker size chart

#### Settings Tab
- **Pricing:** Free pickup toggle, customer-facing fee display
- **Fulfillment & Timing:**
  - Processing time (business days)
  - Fulfillment days selection (Mon-Sun)
  - Hold time before return
  - Vacation days calendar
  - Pickup date preview
- **Branding:**
  - Custom logo upload
  - Primary color picker
  - Success message customization
  - Upsell products configuration
- Auto-save with status banner (no manual save buttons)

#### Learn Tab
- Getting Started quick guide
- Order lifecycle with status badges
- Locker sizes reference
- Product sizing tips
- Multi-item order handling
- Common questions FAQ
- Theme blocks with visual previews:
  - LockerDrop Badge
  - Cart Reminder
  - Steps Banner
  - Locker Finder
  - Promo Banner
  - Info Page
- Need Help section with support links

#### Billing Tab (Hidden by default)
- Subscription status display
- Usage meter with monthly limits
- Available plans (Basic, Pro, Enterprise)
- Dev mode plan switcher for test stores

### Server Features (`server.js`)

**Authentication:**
- Shopify OAuth flow
- Token storage and refresh
- Session validation
- Reconnection handling

**API Endpoints:**
- `/api/stats/:shop` - Dashboard statistics
- `/api/orders/:shop` - Order management
- `/api/lockers/:shop` - Harbor locker integration
- `/api/settings/:shop` - Settings CRUD
- `/api/branding/:shop` - Branding settings
- `/api/products/:shop` - Product data from Shopify

**Integrations:**
- Harbor Lockers API (reservations, availability)
- Shopify Admin API (orders, products, fulfillment)
- Carrier Service for checkout rates

**Features:**
- Interstitial page for dashboard launch from Shopify admin
- Webhook handlers for order events
- Email notification system
- Product size calculations

## Technical Stack

- **Frontend:** Vanilla HTML/CSS/JavaScript with Polaris design tokens
- **Backend:** Node.js with Express
- **Database:** PostgreSQL
- **APIs:** Shopify Admin API, Harbor Lockers API
- **Hosting:** Compatible with Railway, Heroku, DigitalOcean

## File Structure

```
lockerdrop-shopify/
├── server.js                 # Main Express server
├── public/
│   ├── admin-dashboard.html  # Seller dashboard (Polaris styled)
│   └── docs/                 # Help documentation
├── docs/                     # Markdown documentation
├── .env                      # Environment configuration
└── package.json              # Dependencies
```

## Environment Variables

```env
# Shopify
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SHOPIFY_SCOPES=write_shipping,read_orders,write_orders,read_products
SHOPIFY_HOST=your-domain.com

# Harbor Lockers
HARBOR_CLIENT_ID=
HARBOR_CLIENT_SECRET=
HARBOR_API_URL=https://api.harborlockers.com

# Database
DATABASE_URL=postgres://...

# Server
PORT=3000
```

## Recent Updates

### January 2025 - Polaris Design System
- Converted entire dashboard to Shopify Polaris design system
- Added CSS custom properties for theming
- Implemented auto-save for all settings
- Reorganized Settings tab into logical sections
- Added theme block visual previews
- Removed unused checkout mode option
- Improved mobile responsiveness
- Added interstitial page for Shopify admin launch

## Support

- Email: support@lockerdrop.it
- Documentation: `/docs/training`, `/docs/faq`

---

**Version:** 2.0.0
**Last Updated:** January 2025
