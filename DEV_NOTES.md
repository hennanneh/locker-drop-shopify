# Development Notes - December 12, 2024

## Session Summary - December 12

Migrated Shopify REST API product/variant endpoints to GraphQL Admin API.

---

## What Was Done Today (Dec 12)

### 1. REST API → GraphQL Migration
Migrated all deprecated REST API `/products` and `/variants` endpoints to GraphQL:

**New helper functions added** (server.js lines 101-303):
- `shopifyGraphQL()` - Generic GraphQL query helper
- `fetchProductsGraphQL()` - Fetch all products with pagination
- `fetchProductByIdGraphQL()` - Fetch single product by ID
- `fetchVariantByIdGraphQL()` - Fetch single variant by ID

**Endpoints migrated:**
| Old REST Endpoint | Usage | New GraphQL |
|---|---|---|
| `GET /products.json` | Product sizes admin page | `fetchProductsGraphQL()` |
| `GET /products/:id.json` | Upsell display | `fetchProductByIdGraphQL()` |
| `GET /products/:id.json` | Order dimensions | `fetchProductByIdGraphQL()` |
| `GET /variants/:id.json` | Checkout dimensions | `fetchVariantByIdGraphQL()` |

**API Version:** All GraphQL calls now use `SHOPIFY_API_VERSION = '2024-10'` constant for easy updates.

---

## Previous Session Summary (Dec 11)

Worked on several checkout and order management improvements.

---

## What Was Done Today

### 1. Size Filtering at Checkout
- Fixed carrier service to check locker availability BY SIZE
- If cart requires X-Large locker, only locations with X-Large available are shown
- Applies to both `/carrier/rates` and `/carrier-service/rates` endpoints

### 2. Multi-Item Order Size Calculation
- Orders with multiple items now stack dimensions (heights added)
- Example: Two 10"x6"x3" items → 10"x6"x6" combined → needs Medium locker
- Uses `getProductDimensionsFromOrder()` and `calculateRequiredLockerSize()`

### 3. Order Cancellation
- Added "Cancel Locker" button in order detail modal
- API endpoint: `POST /api/order/:shop/:orderId/cancel-locker`
- Sets status to 'cancelled', clears links
- **Note:** Harbor doesn't support canceling open-requests via API - locker stays "rented" until link expires (~24 hours)

### 4. Shopify Order Cancellation Webhook
- Added handler for `orders/cancelled` webhook
- Auto-cancels locker when order cancelled in Shopify
- Webhook registered at: `https://app.lockerdrop.it/webhooks/orders/cancelled`

### 5. Dashboard Filters
- Cancelled orders now excluded from "Active" view
- Added "Cancelled" filter button

### 6. Zip Code Fallback for Unverified Addresses
- When Shopify doesn't send coordinates (unverified address), we now geocode the zip code
- Uses OpenStreetMap Nominatim API (free, no key required)
- Function: `geocodeZipCode(postalCode, country)`

### 7. Pickup Date Format
- Changed from relative ("Tomorrow", "Day after tomorrow") to absolute ("Friday, Dec 13")

### 8. Product Size Tips
- Added tip box in Product Sizes tab explaining dimensions vs dropdown
- Updated Help tab with comprehensive documentation

---

## What To Test Tomorrow

### Locker Availability
The following lockers had active requests that should expire by tomorrow (~7pm Dec 12):
- Door 5 (small) - Request #210
- Door 6 (small) - Request #211
- Door 7 (medium) - Request #209
- Door 8 (large) - Request #212
- Door 9 (x-large) - Request #208

Once expired, all sizes should be available again.

### Test Scenarios
1. **Single small item** → Should show lockers with small+ available
2. **Single large item** → Should show lockers with large+ available
3. **Two small items** → Should calculate stacked size, may need medium
4. **X-Large item when X-Large not available** → Should NOT show LockerDrop option
5. **Unverified address with valid zip** → Should still show LockerDrop (geocode fallback)

---

## Known Issues

### 1. ~~REST API Deprecation Warning~~ ✅ RESOLVED (Dec 12)
~~Shopify shows: "As of 2024-04, the REST Admin API `/products` and `/variants` endpoints have been marked as deprecated"~~

**RESOLVED:** All product/variant REST API calls migrated to GraphQL Admin API.

### 2. Auto-Fulfillment Permission Error
```
Error fulfilling order: { errors: 'The api_client does not have the required permission(s).' }
```

**Action needed:** Add `write_fulfillments` to SHOPIFY_SCOPES in .env and re-authorize app

### 3. Harbor Locker Cancellation
Cannot cancel locker reservations via Harbor API. Tried:
- `DELETE /api/v1/lockers/:id/open-requests/:requestId` - 404
- `POST /api/v1/lockers/:id/open-requests/:requestId/cancel` - 404

Requests auto-expire after ~24 hours.

---

## Code Locations

### Carrier Service (Active)
`server.js` line ~4020 - `/carrier-service/rates` endpoint

### Size Calculation
- `calculateRequiredLockerSize()` - line ~3550
- `getProductDimensionsFromOrder()` - line ~3610
- `LOCKER_SIZES` constant - line ~3540

### Geocoding
- `geocodeZipCode()` - line ~3478

### Cancel Locker
- API endpoint - search for `/cancel-locker`
- Dashboard function - `cancelLockerRequest()` in admin-dashboard.html

### Webhook Handlers
- `orders/create` - search for `webhooks/orders/create`
- `orders/cancelled` - search for `webhooks/orders/cancelled`

---

## Environment

- Server: root@138.197.216.202
- PM2 process: `lockerdrop`
- Logs: `pm2 logs lockerdrop --lines 100`
- Harbor Sandbox Tower: `0100000000000175`
- Test Shop: `enna-test.myshopify.com`

---

## Quick Commands

```bash
# View recent logs
pm2 logs lockerdrop --lines 50

# Restart server
pm2 restart lockerdrop

# Check locker availability via Harbor API
curl -X GET "https://api.sandbox.harborlockers.com/api/v1/towers/0100000000000175/locker-availability" \
  -H "Authorization: Bearer $TOKEN"

# Get Harbor token
curl -X POST "https://accounts.sandbox.harborlockers.com/realms/harbor/protocol/openid-connect/token" \
  -d "grant_type=client_credentials&scope=service_provider&client_id=lockerdrop&client_secret=MNW5yezjMrwDWOuVPyOIJuDJeR8tdhps"
```

---

## Next Steps (Suggested)

1. Wait for locker requests to expire (~Dec 12, 7pm)
2. Test all locker sizes at checkout
3. Test multi-item orders
4. Test order cancellation flow end-to-end

---

## Feature Backlog

### High Priority

#### 1. Review Harbor Checklist Needs
- What does Harbor require before going to production?
- API credentials, compliance, testing requirements?
- Documentation: https://docs.harborlockers.com

#### 2. Manual Locker Selection - Size Validation
- When seller manually creates/assigns locker, validate size fits the order
- Currently can assign any locker regardless of product dimensions
- Should warn or prevent if package won't fit

#### 3. Product Size Import
- Add CSV/bulk import for product sizes
- Useful for stores with many products
- Fields: product_id, variant_id, length, width, height, locker_size

#### 4. Fix Shopify Errors
- ~~**REST API Deprecation**: Migrate `/products` and `/variants` calls to GraphQL~~ ✅ DONE
- **Fulfillment Permission**: Add `write_fulfillments` to scopes, re-auth app

#### 5. Checkout Extensions (Shopify Plus)
- Review actual checkout extensions available on Plus store
- Current implementation uses Carrier Service API
- Plus stores can use Checkout UI Extensions for richer experience
- Consider: locker map selector, real-time availability display

### Medium Priority

#### 6. Super Admin Dashboard
Create a separate admin site for LockerDrop management (not per-store):

**Features needed:**
- View all orders across ALL stores
- Filter by store, status, date range
- Revenue reports:
  - Total orders by period
  - Revenue per store
  - Average order value
  - Locker utilization rates
- Store management:
  - List all connected stores
  - View store settings
  - Usage statistics per store
- Locker analytics:
  - Most used locations
  - Size distribution
  - Failed/expired pickups

**Suggested URL:** `https://app.lockerdrop.it/superadmin`

**Authentication:** Separate from Shopify OAuth - use password or SSO

### Future Enhancements
- Customer tracking portal
- Analytics dashboard per store
- Multi-location support per order
- Locker capacity forecasting
- Mobile app for sellers
