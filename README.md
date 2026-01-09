# LockerDrop - Shopify Smart Locker Integration

**Production URL:** https://app.lockerdrop.it
**Dashboard:** https://app.lockerdrop.it/admin/dashboard?shop=enna-test.myshopify.com

LockerDrop is a Shopify app that enables smart locker pickup as a shipping option. Customers select locker pickup at checkout, sellers drop off packages using secure links, and customers pick up at their convenience.

---

## Current Status (January 2026)

### Working Features
- Shopify OAuth & app installation
- Carrier service integration (shows at checkout)
- Harbor Locker API integration (sandbox)
- Locker availability checking by size
- Multi-item order dimension stacking
- Automatic locker reservation on order creation
- Drop-off and pickup link generation
- Email notifications (via Resend)
- SMS notifications (via Twilio)
- Admin dashboard with full order management
- Product size configuration
- Order cancellation (manual + Shopify webhook)
- Zip code geocoding fallback for unverified addresses
- **Theme App Extension** with promotional blocks for non-Plus stores

### Infrastructure
- **Server:** DigitalOcean Droplet (138.197.216.202)
- **Database:** DigitalOcean Managed PostgreSQL
- **Domain:** lockerdrop.it (Cloudflare DNS)
- **Process Manager:** PM2
- **SSL:** Let's Encrypt via Certbot

---

## Quick Reference

### Server Commands
```bash
# SSH to server
ssh root@138.197.216.202

# View logs
pm2 logs lockerdrop --lines 100

# Restart server
pm2 restart lockerdrop

# Full restart (clears memory)
pm2 delete lockerdrop && pm2 start server.js --name lockerdrop
```

### Key Files
| File | Purpose |
|------|---------|
| `server.js` | Main application (~4500 lines) |
| `public/admin-dashboard.html` | Seller admin UI |
| `db.js` | PostgreSQL connection pool |
| `.env` | Environment variables |
| `extensions/lockerdrop-theme/` | Theme app extension blocks |

### Database Tables
- `stores` - Shopify store credentials
- `orders` - LockerDrop orders with status
- `locker_preferences` - Selected locker locations per shop
- `product_locker_sizes` - Product dimensions/size mappings
- `shop_settings` - Per-shop configuration
- `audit_logs` - Security audit trail

---

## Architecture

### Checkout Flow
1. Customer enters address at Shopify checkout
2. Shopify calls `/carrier-service/rates` endpoint
3. We calculate required locker size from cart items
4. Query Harbor API for nearby locations with availability
5. Return locker options as shipping rates
6. Customer selects LockerDrop option

### Order Flow
1. Order placed triggers `orders/create` webhook
2. We request dropoff link from Harbor API
3. Store order with dropoff_link in database
4. Send confirmation email/SMS to customer
5. Seller visits locker, uses dropoff link
6. Harbor notifies us when package deposited
7. Customer receives pickup link
8. Customer picks up, order marked complete

### Size Calculation
- Products can have exact dimensions (L x W x H) or assigned locker size
- Multi-item orders: dimensions stacked (heights added)
- System finds smallest locker that fits combined package
- Checkout only shows locations with required size available

---

## Checkout UI Extension (Shopify Plus)

For Shopify Plus stores, the app includes a Checkout UI Extension that provides an enhanced locker selection experience directly in checkout.

### Features
- Shows closest locker location by default with "CLOSEST" badge
- "See X more locations" button to view alternatives
- Displays pickup date, distance, and availability
- Auto-selects locker when LockerDrop shipping is chosen
- Debounced address updates to reduce UI flashing

### Deployment
```bash
shopify app deploy --force
```

---

## Theme App Extension

The app includes a theme extension with promotional blocks that merchants can add to their stores via the theme customizer. This works on all Shopify stores (not just Plus).

### Available Blocks
| Block | Purpose |
|-------|---------|
| `LockerDrop Badge` | "Available for Locker Pickup" badge for product pages |
| `LockerDrop Cart Reminder` | Reminder with steps on cart page |
| `LockerDrop Steps Banner` | Simple 3-step explanation section |
| `LockerDrop Info Page` | Full-page section with hero, steps, benefits, locker finder |
| `LockerDrop Locker Finder` | Standalone zip code search for nearby lockers |
| `LockerDrop Promo Banner` | Eye-catching promotional banner |

### Block Files
Located in `extensions/lockerdrop-theme/blocks/`:
- `product-pickup-badge.liquid` → LockerDrop Badge
- `cart-pickup-reminder.liquid` → LockerDrop Cart Reminder
- `how-it-works.liquid` → LockerDrop Steps Banner
- `how-it-works-page.liquid` → LockerDrop Info Page
- `locker-finder.liquid` → LockerDrop Locker Finder
- `promo-banner.liquid` → LockerDrop Promo Banner

### Public API Endpoint
The locker finder blocks use a public API endpoint:
```
GET /api/public/lockers?lat={latitude}&lon={longitude}&limit={count}
```
Returns nearby locker locations with availability info. Has CORS headers for cross-origin theme requests.

### Deployment
Theme extension is deployed via Shopify CLI:
```bash
shopify app deploy --force
```

---

## API Endpoints

### Shopify Integration
- `GET /shopify/auth` - OAuth initiation
- `GET /shopify/callback` - OAuth callback
- `POST /carrier/rates` - Legacy carrier service
- `POST /carrier-service/rates` - Active carrier service
- `POST /webhooks/orders/create` - Order creation webhook
- `POST /webhooks/orders/cancelled` - Order cancellation webhook

### Admin API
- `GET /api/orders/:shop` - List orders
- `GET /api/order/:shop/:orderId` - Order details
- `POST /api/order/:shop/:orderId/mark-dropped-off` - Update status
- `POST /api/order/:shop/:orderId/cancel-locker` - Cancel locker request
- `POST /api/order/:shop/:orderId/resend-pickup` - Resend notifications
- `GET /api/lockers` - List Harbor locations
- `GET /api/locker-preferences/:shop` - Get preferences
- `POST /api/locker-preferences/:shop` - Save preferences
- `GET /api/products/:shop` - List products
- `POST /api/product-sizes/:shop` - Save product sizes
- `GET /api/shop-settings/:shop` - Get settings
- `POST /api/shop-settings/:shop` - Save settings

### Public API (for Theme Extension)
- `GET /api/public/lockers` - Find nearby lockers (CORS enabled)

---

## Environment Variables

```env
# Shopify
SHOPIFY_API_KEY=xxx
SHOPIFY_API_SECRET=xxx
SHOPIFY_SCOPES=write_products,write_orders,read_shipping

# Harbor Locker (Sandbox)
HARBOR_CLIENT_ID=lockerdrop
HARBOR_CLIENT_SECRET=xxx
HARBOR_API_URL=https://api.sandbox.harborlockers.com
HARBOR_TOWER_ID=0100000000000175

# Database
DATABASE_URL=postgresql://...

# Notifications
RESEND_API_KEY=xxx
EMAIL_FROM=LockerDrop <noreply@lockerdrop.it>
TWILIO_ACCOUNT_SID=xxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+16824297313

# App
HOST=https://lockerdrop.it
SESSION_SECRET=xxx
NODE_ENV=production
```

---

## Locker Sizes

| Size | Dimensions (L x W x H) | Harbor Type ID |
|------|------------------------|----------------|
| Small | 12" x 8" x 4" | 1 |
| Medium | 16" x 12" x 8" | 2 |
| Large | 20" x 16" x 12" | 3 |
| X-Large | 24" x 20" x 16" | 4 |

---

## Known Issues / TODO

### Completed
- [x] Shopify GraphQL migration (completed January 2026)
- [x] Theme App Extension for non-Plus stores
- [x] Checkout UI Extension for Plus stores
- [x] Auto-release lockers on order cancellation
- [x] Admin dashboard Polaris redesign with actionable stat cards

### Pending
- [ ] `write_fulfillments` scope needed for auto-fulfillment

### Harbor API Limitations
- Locker release requires `tower_id` and `locker_id` (now captured on dropoff request creation)
- Order cancellation automatically releases lockers via Harbor `/release-locker` endpoint

### Future Enhancements
- Customer tracking portal
- Analytics dashboard
- Multi-location support per order
- Locker capacity forecasting

---

## Testing

### Test Store
- Shop: `enna-test.myshopify.com`
- Dashboard: https://app.lockerdrop.it/admin/dashboard?shop=enna-test.myshopify.com

### Harbor Sandbox
- Tower ID: `0100000000000175` (Lockerdrop tower)
- Location ID: `329`
- Doors: 5 (small), 6 (small), 7 (medium), 8 (large), 9 (x-large)

### Testing Checkout
1. Add product to cart
2. Go to checkout
3. Enter address near Dallas, TX (75001)
4. "LockerDrop Pickup" should appear as shipping option
5. If not showing, check: product size set, locker size available

---

## Deployment

```bash
# On server
cd /root/locker-drop-shopify
git pull origin main
npm install
pm2 restart lockerdrop
```

---

## Support

- **Email:** support@lockerdrop.it
- **Harbor Support:** https://docs.harborlockers.com

---

Last updated: January 9, 2026
