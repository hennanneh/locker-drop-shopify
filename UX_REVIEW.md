# LockerDrop UX Review

This document provides a comprehensive overview of the LockerDrop user experience for sellers and buyers. Last updated: January 2026.

---

## 1. SELLER DASHBOARD

The seller dashboard is accessible at `/admin/dashboard?shop={shop-domain}` and uses Shopify Polaris design tokens for a native feel.

### Header
- **Logo**: "LockerDrop.it" with lock icon
- **Store Name**: Displays the connected Shopify store name
- **Reconnect Banner**: Yellow warning banner appears if Shopify OAuth token expires, with "Reconnect to Shopify" button

### Stats Grid (Top of Page)
Four clickable stat cards showing real-time metrics:
1. **Pending Drop-offs** - Orders awaiting seller drop-off (click filters Orders tab)
2. **Ready for Pickup** - Orders in lockers awaiting customer (click filters Orders tab)
3. **Completed This Week** - Successfully picked up orders (click filters Orders tab)
4. **Active Lockers** - Number of locker locations seller has enabled (click shows "My lockers only" filter)

### Tab: Orders (Default)
**Purpose**: View and manage all LockerDrop orders

**Features**:
- **Status Filter Buttons**: All, Pending Drop-off, Ready for Pickup, Completed, Cancelled
- **Search**: Filter by order number or customer name
- **Orders Table** (transforms to cards on mobile):
  - Order number (clickable)
  - Date
  - Customer name
  - Locker location
  - Drop-off link button (active when pending)
  - Pickup link button (active when ready)
  - Status badge (color-coded)
  - "View" button to open order modal
- **Add Manual Order Button**: Opens modal to create orders for non-Shopify sales
- **Empty States**: Contextual messages based on filter (e.g., "No orders pending drop-off")

**Order Statuses**:
- `pending_dropoff` (yellow) - Waiting for seller to drop off
- `ready_for_pickup` (blue) - In locker, customer notified
- `completed` (green) - Customer picked up
- `cancelled` (red) - Order cancelled, locker released

### Tab: My Lockers
**Purpose**: Select which locker locations to offer at checkout

**Features**:
- **Search Bar**: Search by city, zip code, or locker name
- **Size Filters**: Small, Medium, Large, X-Large checkboxes
- **Show Availability Checkbox**: Fetches real-time compartment counts
- **My Lockers Only Filter**: Shows only seller's saved selections (green, prominent)
- **Locker List**: Compact list view with:
  - Checkbox indicator (checked = selected)
  - Locker name
  - Full address
  - Size availability badges (S, M, L, XL with counts if availability enabled)
- **Selection Counter**: Shows "X lockers selected" (updates in real-time)
- **Save Changes Button**: Persists selections (shows loading spinner, then "Saved!")
- **Pagination**: 20 items per page with Previous/Next buttons

### Tab: Product Sizes
**Purpose**: Configure product dimensions for automatic locker size calculation

**Features**:
- **Tip Box**: Explains that exact dimensions allow multiple items to share lockers
- **Locker Sizes Reference**: S (12"×8"×4"), M (16"×12"×8"), L (20"×16"×12"), XL (24"×20"×16")
- **Product Grid**:
  - Product/Variant name
  - Length, Width, Height inputs (inches)
  - Locker Size dropdown (Small/Medium/Large/X-Large)
- **Save All Changes Button**: Batch saves with loading spinner

### Tab: Settings
**Purpose**: Configure pricing, fulfillment schedule, and branding

**Sections**:

#### Pricing
- **Free Locker Pickup Checkbox**: When checked, seller absorbs fees
- **Pricing Display**: Shows customer price ($1.00 service fee)

#### Fulfillment & Timing
- **Processing Time**: Number input (0-14 business days)
- **Fulfillment Days**: Day-of-week checkboxes (Mon-Sun) for when seller can drop off
- **Hold Time**: Dropdown (3, 5, 7, 10 days) - how long items stay in locker
- **Vacation Days**: Date range picker
  - Two date inputs (start/end) with smart "Add" button
  - Button shows "Add", "Add Day", or "Add X Days" based on selection
  - Added dates appear as removable chips
  - 60-day limit on ranges
- **Pickup Date Preview**: Shows when customers ordering today would see pickup available

#### Pickup Page Branding
- **Logo Upload**: Image file selector with preview
- **Primary Color**: Color picker + hex input
- **Success Message**: Textarea for custom message
- **Upsell Products**: Product search with autocomplete to add cross-sell items
- **Preview Link**: Opens sample pickup success page

### Tab: Learn
**Purpose**: Help documentation and onboarding

**Collapsible Sections**:

#### Getting Started (expandable)
- Quick Start checklist (7 steps)
- Order Lifecycle explanation with status badges
- Locker Sizes reference table
- Product Sizes setup guide (exact dimensions vs. dropdown)
- Common Questions
- Troubleshooting tips
- Links to Training Guide and FAQ

#### Theme Blocks for Your Store (expandable)
- Available Shopify theme blocks:
  - LockerDrop Hero Banner
  - Location Finder Widget
  - How It Works Section
  - FAQ Accordion
  - Trust Badges
  - Announcement Bar
- Instructions for adding blocks via Online Store > Themes > Customize

#### Need Help Section
- Contact email
- Documentation links

### Tab: Billing (Hidden)
Currently hidden (`display: none`). Reserved for future billing/subscription features.

---

## 2. SELLER WORKFLOW

### Step-by-Step Flow: Order to Pickup

#### 1. Order Placed
- Customer completes Shopify checkout with LockerDrop shipping
- Shopify webhook fires to LockerDrop server
- System creates locker_orders record with status `pending_dropoff`
- System reserves a locker compartment via Harbor API
- Seller receives notification (if enabled)

#### 2. Seller Prepares Order
- Order appears in Dashboard > Orders with "Pending Drop-off" status
- Seller clicks "View" to open order modal
- Modal shows:
  - Order number, customer name, email, phone
  - Assigned locker location
  - Drop-off link (clickable button to copy or open)

#### 3. Seller Drops Off
- Seller goes to locker location with package
- Opens drop-off link on phone
- Link opens Harbor locker door
- Seller places package in compartment
- Seller closes door
- System detects drop-off via Harbor webhook

#### 4. Customer Notified
- Status changes to `ready_for_pickup`
- Customer receives email with:
  - Order details
  - Locker location and address
  - Pickup link
  - QR code
  - Pickup deadline
- Customer receives SMS (if phone provided)

#### 5. Customer Picks Up
- Customer visits locker location
- Opens pickup link on phone
- Link opens Harbor locker door
- Customer retrieves package
- Harbor redirects to pickup-success page

#### 6. Order Completed
- Status changes to `completed`
- Seller sees order in "Completed" filter
- Locker compartment released for reuse
- Pickup success page shows:
  - Animated checkmark
  - Order number
  - Custom branding (if configured)
  - Upsell products (if configured)

### Seller Actions Available

#### From Orders Tab
- Filter orders by status
- Search orders
- View order details
- Open drop-off link directly

#### From Order Modal
- **Mark as Dropped Off**: Manual status update (useful if auto-detection fails)
- **Resend Pickup Email**: Re-sends notification to customer
- **Cancel Locker**: Releases reservation (with confirmation dialog)
- **Regenerate Links**: Creates new drop-off/pickup links if expired

---

## 3. BUYER CHECKOUT EXPERIENCE

### Standard Shopify Checkout (Non-Plus)
For stores without Shopify Plus, LockerDrop appears as a shipping rate:

1. Customer enters shipping address
2. At shipping method selection, sees "LockerDrop Pickup - $1.00" (or FREE)
3. Shipping rate description shows nearest locker location
4. Customer selects LockerDrop and proceeds to payment
5. After payment, order is processed with locker info in order notes

### Shopify Plus Checkout Extension
For Shopify Plus stores, a richer experience via checkout UI extension:

#### Location: After Delivery Address
- Renders in `purchase.checkout.delivery-address.render-after` target

#### Initial State
- Header: "LockerDrop Pickup" with delivery icon
- "FREE" badge (prominent)
- Subtext: "Pick up your order from a secure locker near you - available 24/7"
- "Choose locker pickup instead" button

#### Locker Selection (After Clicking Button)
- Shows up to 3 nearby lockers based on shipping address
- Each locker option shows:
  - Radio button indicator
  - Locker name
  - Distance in miles
  - Address
  - Available compartment count
- Selected locker highlighted with border and background

#### Date Selection
- After locker selection, date picker appears
- Shows available pickup dates (respects seller's fulfillment schedule)
- Each date shows day name and month/day
- Selected date gets checkmark indicator
- Confirmation text: "Pickup scheduled for [Day, Date]"

#### Deselection
- "Use regular shipping instead" button to revert

#### Data Storage
- Selected locker info stored in shipping address `address2` field
- Format: `LockerDrop: [Locker Name] (ID: [id]) | Pickup: [date]`

### Thank You Page Extension
Renders in `purchase.thank-you.block.render` target:

#### Loading State
- Shows "LockerDrop" with spinner
- Status messages: "Confirming your locker reservation...", "Securing your pickup spot...", etc.
- Retries up to 6 times with 1.5s delay (webhook timing)

#### Confirmed State
- Success banner: "Locker Pickup Confirmed!"
- Info card with:
  - Pickup Location name and address
  - Expected Pickup Date
  - "What happens next" steps:
    1. Order Processing - seller prepares order
    2. Pickup Link Sent - email/SMS when in locker
    3. Tap & Collect - visit locker and open with link
  - Footer notes: "24/7 availability", "secured until pickup"

---

## 4. ORDER DETAILS MODAL

When seller clicks "View" on an order in the Orders tab:

### Modal Structure

#### Header
- Close button (×)
- Title: "Order Details"

#### Order Information Grid
- **Order Number**: #XXXX
- **Customer**: Full name
- **Customer Email**: Email address or "Not provided"
- **Customer Phone**: Phone number or "Not provided"
- **Locker Location**: Assigned locker name or "Not assigned"
- **Status**: Current status with colored badge

#### Drop-off Section
- Section title: "Drop-off Link"
- If pending: Clickable link/button to open drop-off URL
- If already dropped off: Shows "Already dropped off" or link for reference
- Regenerate button if link expired

#### Pickup Section
- Section title: "Customer Pickup Link"
- If ready: Clickable link to view/copy pickup URL
- QR code display (if implemented)
- Link expiration info

#### Action Buttons (Bottom)
- **Mark as Dropped Off** (primary, blue): Manual status update
- **Resend Pickup Email** (secondary): Re-sends customer notification
- **Cancel Locker** (danger, red): Releases locker reservation

### Modal Behaviors
- Click outside or × to close
- Actions show loading state
- Success/error feedback via alerts
- Modal refreshes after actions

---

## 5. CURRENT STATE

### What's Working

#### Core Functionality
- Shopify OAuth installation flow (embedded app with App Bridge)
- Webhook processing for new orders, updates, cancellations, and uninstalls
- Harbor API integration for locker reservations
- Drop-off link generation and locker opening
- Pickup link generation and customer notification
- Status tracking through full lifecycle (including `expired` status)
- Email + SMS notifications with customizable templates
- Custom order confirmation email (reads from note_attributes)
- Automated locker expiry (cron every 6 hours, warning emails + auto-release)

#### Dashboard Features
- Real-time stats display
- Order filtering and search
- Locker selection with pagination and search
- Product size configuration with exclusions
- Settings auto-save
- Mobile-responsive design (cards on mobile)
- Polaris-inspired UI design
- Frontend error tracking (window.onerror + unhandledrejection → POST /api/errors)

#### Infrastructure
- Rate limiting (public 30/min, checkout 60/min, webhook 120/min)
- Structured logging with pino (JSON in production)
- PostgreSQL session store (survives restarts)
- SSL certificate validation for database

#### Checkout
- Carrier service for shipping rates
- Shopify Plus checkout extension with error tracking
- Thank you page extension

### What's Incomplete

#### Checkout Extension
- **Status**: Built but needs testing/deployment
- Cart product size calculation endpoint exists
- Date picker integration partial
- Needs end-to-end testing with real Plus store

#### Features Not Yet Implemented
- Per-order billing via Shopify `usageRecordCreate` (decision made, needs implementation)
- Multi-package order support
- Analytics/reporting dashboard
- Returns via locker
- Shopify Flow integration

### What Needs Improvement

#### UX Issues Identified
1. **Locker Availability Timing**: Size filter only works with "Show availability" - now auto-enabled but may be slow
2. **Loading States**: Some actions lack visual feedback
3. **Error Handling**: Generic error messages in some places
4. **Mobile Table**: Orders table transforms to cards but could be more refined
5. **Date Range Picker**: Works but could use calendar widget for better UX

#### Performance Considerations
1. **Locker Loading**: Fetching 1000 lockers when "My lockers only" checked - could optimize with server-side filter
2. **Product Loading**: Large catalogs may be slow - pagination needed
3. **Real-time Updates**: Currently requires manual refresh - could add polling or websockets

#### Missing Validations
1. No confirmation when deselecting all lockers
2. No warning when product has no size set
3. No check for conflicting vacation days

---

## 6. CHECKOUT EXTENSION STATUS

### Files
- **Main Component**: `/extensions/lockerdrop-checkout/src/Checkout.jsx`
- **Thank You Page**: `/extensions/lockerdrop-thankyou/src/ThankYou.js`
- **Order Status Page**: `/extensions/lockerdrop-thankyou/src/OrderStatus.js`
- **Admin Order Block**: `/extensions/lockerdrop-order-block/src/OrderDetailsBlock.jsx`

### Checkout Extension Features

#### Implemented
- Locker fetching based on shipping address
- Cart product extraction for size calculation
- Locker selection UI with radio buttons
- Distance display
- Available compartment count
- Date picker with seller schedule integration
- Address modification to store locker selection
- Toggle between locker pickup and regular shipping

#### API Endpoints Used
- `GET /api/checkout/lockers` - Fetch nearby lockers with availability
- `GET /api/available-pickup-dates/{shop}` - Get valid pickup dates

### Thank You Extension Features

#### Implemented
- Order confirmation detection
- Retry logic for webhook timing (6 retries, 1.5s apart)
- Success banner and info card
- Next steps explanation
- Loading states with progress messages

#### API Endpoints Used
- `GET /api/customer/order-status/{orderId}` - Check if LockerDrop order

### Admin Order Block Features

#### Implemented
- Displays in Shopify admin order details page
- Shows locker status badge
- Links to drop-off/pickup URLs
- Link to LockerDrop dashboard

#### API Endpoints Used
- `GET /api/order-locker-data/{orderId}` - Fetch locker details for order

### Deployment Status
- Extensions are built and configured
- Require Shopify Plus store for checkout extensions
- Admin block should work on any store
- Need to run `shopify app deploy` to publish

### Known Issues
1. Session token handling may need adjustment for production
2. Locker availability caching not implemented
3. Error states could be more graceful
4. No offline/network error handling

---

## Appendix: Key API Endpoints

### Seller APIs
- `GET /api/orders/{shop}` - List orders
- `GET /api/locker-preferences/{shop}` - Get saved lockers
- `POST /api/locker-preferences/{shop}` - Save locker selections
- `GET /api/lockers/{shop}` - List available lockers
- `GET /api/settings/{shop}` - Get seller settings
- `POST /api/settings/{shop}` - Save settings
- `GET /api/product-sizes/{shop}` - Get product dimensions
- `POST /api/product-sizes/{shop}` - Save product dimensions
- `POST /api/regenerate-dropoff-link` - Generate new drop-off link
- `POST /api/regenerate-pickup-link` - Generate new pickup link

### Customer/Checkout APIs
- `GET /api/checkout/lockers` - Lockers for checkout
- `GET /api/available-pickup-dates/{shop}` - Valid pickup dates
- `GET /api/customer/order-status/{orderId}` - Order locker status
- `POST /api/pickup-complete` - Record successful pickup

### Webhooks
- Shopify `orders/create` - New order processing
- Shopify `orders/cancelled` - Cancel locker reservation
- Harbor callbacks - Locker door events
