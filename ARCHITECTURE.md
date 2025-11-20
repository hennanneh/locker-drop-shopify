# LockerDrop Architecture Overview

## System Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        CUSTOMER FLOW                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Customer visits Shopify store                               │
│  2. Adds items to cart                                          │
│  3. Enters shipping address (Dallas, TX 75219)                  │
│  4. Sees "LockerDrop Pickup - FREE" as shipping option          │
│  5. Selects LockerDrop and completes purchase                   │
│  6. Receives order confirmation email with:                     │
│     - Locker location and address                               │
│     - Pickup access code                                         │
│     - Pickup instructions                                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

                              ↓

┌─────────────────────────────────────────────────────────────────┐
│                        SELLER FLOW                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Seller receives order notification in admin dashboard       │
│  2. Views order details including:                              │
│     - Customer info                                              │
│     - Locker location                                            │
│     - Drop-off access code                                       │
│  3. Prepares package                                            │
│  4. Goes to locker location                                     │
│  5. Uses drop-off code to open locker                           │
│  6. Places package inside                                       │
│  7. Marks order as "Dropped Off" in dashboard                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

                              ↓

┌─────────────────────────────────────────────────────────────────┐
│                      CUSTOMER PICKUP                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Customer receives "Ready for Pickup" notification           │
│  2. Goes to locker location within 5 days                       │
│  3. Uses pickup code to open locker                             │
│  4. Retrieves package                                           │
│  5. System auto-confirms pickup                                 │
│  6. Seller receives "Picked Up" confirmation                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

## Technical Architecture

```
┌──────────────────┐
│  Shopify Store   │
│  (enna-test)     │
└────────┬─────────┘
         │
         │ 1. Customer selects LockerDrop shipping
         │
         ↓
┌──────────────────────────────────────────────────────────────┐
│                    YOUR SERVER                                │
│                (lockerdrop.ngrok.app)                         │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  CARRIER SERVICE ENDPOINT                           │    │
│  │  POST /carrier/rates                                │    │
│  │  → Returns available lockers based on zip code      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  ADMIN DASHBOARD                                    │    │
│  │  GET /admin/dashboard?shop=enna-test.myshopify.com  │    │
│  │  → Serves admin interface for sellers               │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  API ENDPOINTS                                      │    │
│  │  GET  /api/stats/:shop                              │    │
│  │  GET  /api/orders/:shop                             │    │
│  │  GET  /api/lockers/:shop                            │    │
│  │  POST /api/order/:shop/:id/status                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  WEBHOOKS                                           │    │
│  │  POST /webhooks/orders/create                       │    │
│  │  → Triggered when order is placed                   │    │
│  │  → Reserves locker                                  │    │
│  │  → Generates access codes                           │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
└────┬──────────────────────────────────────────────┬──────────┘
     │                                               │
     │ 2. Get lockers by zip                        │ 3. Reserve locker
     │                                               │    Generate codes
     ↓                                               ↓
┌──────────────────────────────┐     ┌────────────────────────────┐
│   HARBOR LOCKERS API         │     │   DATABASE (Future)        │
│   api.sandbox.harborlockers  │     │   - Orders                 │
│   .com                       │     │   - Locker preferences     │
│                              │     │   - Settings               │
│  • GET /lockers              │     │   - Access codes           │
│  • POST /reserve             │     └────────────────────────────┘
│  • GET /locker/:id/status    │
└──────────────────────────────┘
```

## Data Flow for Order Creation

```
Customer Places Order
        ↓
Shopify sends webhook to /webhooks/orders/create
        ↓
Server receives order data:
{
    "id": 123456,
    "customer": {
        "name": "John Smith",
        "email": "john@example.com",
        "phone": "555-0123"
    },
    "shipping_address": {
        "address1": "123 Main St",
        "city": "Dallas",
        "zip": "75219"
    },
    "shipping_lines": [{
        "code": "lockerdrop_pickup",
        "title": "LockerDrop Pickup"
    }]
}
        ↓
1. Find nearest locker to zip code 75219
        ↓
2. Reserve locker via Harbor API
        ↓
3. Generate access codes:
   - Seller drop-off code: SELL-1234
   - Customer pickup code: PICK-5678
        ↓
4. Store order in database
        ↓
5. Send emails:
   - To Seller: "New order! Drop off at [locker] using code SELL-1234"
   - To Customer: "Your order will be ready at [locker]. Code: PICK-5678"
        ↓
Order appears in seller's admin dashboard
```

## Admin Dashboard Tabs Functionality

### 1. Dashboard Tab
**Purpose:** Quick overview of business metrics
**Data Sources:**
- Database query for order counts by status
- Real-time stats display
- Recent orders from last 7 days

### 2. Orders Tab
**Purpose:** Complete order management
**Features:**
- Full order history
- Search and filter
- View access codes
- Update order status
- Resend customer emails

### 3. My Lockers Tab
**Purpose:** Configure which lockers to use
**Integration:**
- Fetches lockers from Harbor API
- Filters by seller's city/region
- Saves preferences to database
- Used by carrier service to show only preferred lockers

### 4. Product Settings Tab
**Purpose:** Assign locker sizes to products
**Logic:**
- Maps product SKUs to required locker sizes
- Ensures customers only see compatible lockers
- Prevents "package too large" issues

### 5. Shipping Rates Tab
**Purpose:** Configure pricing and timing
**Settings:**
- Base shipping rate (currently FREE)
- Processing time before drop-off
- How long items stay in locker
- Product availability restrictions

### 6. Notifications Tab
**Purpose:** Email and communication settings
**Features:**
- Toggle email notifications
- Customize email templates
- Set reminder schedules

## Security Considerations

### Shopify Authentication
- OAuth 2.0 flow for app installation
- Access token stored securely (use database in production)
- Session verification on admin dashboard access

### Harbor API Authentication
- Client credentials OAuth flow
- Token refresh handling
- Secure credential storage in .env

### Access Code Generation
- Unique codes per order
- Time-limited validity
- Separate codes for seller and customer

## Future Enhancements

### Phase 1 (Current)
✅ Carrier service integration
✅ Admin dashboard UI
✅ Basic order flow
✅ Harbor API connection

### Phase 2 (Next)
⏭ Database implementation
⏭ Real order storage
⏭ Email notifications
⏭ Locker reservation automation

### Phase 3 (Future)
⏭ Customer portal for tracking
⏭ SMS notifications
⏭ Analytics and reporting
⏭ Multi-location support
⏭ Automated locker selection based on customer proximity
⏭ Integration with Shopify fulfillment API
⏭ Mobile app for sellers

### Phase 4 (Advanced)
⏭ AI-powered locker selection
⏭ Demand forecasting
⏭ Dynamic pricing
⏭ Integration with multiple locker providers
⏭ White-label solution for other platforms
