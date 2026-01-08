# LockerDrop Admin Dashboard - Setup Guide

## Project Structure

```
lockerdrop-shopify/
├── server.js                 # Express server with all routes
├── .env                      # Environment configuration
├── package.json              # Dependencies
├── public/
│   ├── admin-dashboard.html  # Seller dashboard (Polaris design)
│   └── docs/                 # Help documentation pages
├── docs/                     # Markdown documentation
└── extensions/               # Shopify app extensions
```

## Environment Setup

Create a `.env` file with these variables:

```env
# Shopify App Credentials
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SHOPIFY_SCOPES=write_shipping,read_orders,write_orders,read_products
SHOPIFY_HOST=your-domain.com

# Harbor Locker API
HARBOR_CLIENT_ID=your_client_id
HARBOR_CLIENT_SECRET=your_client_secret
HARBOR_API_URL=https://api.harborlockers.com

# Database
DATABASE_URL=postgres://user:pass@host:5432/dbname

# Server
PORT=3000
```

## Running the Server

```bash
# Install dependencies
npm install

# Development (with auto-reload)
npm run dev

# Production
npm start
```

## Accessing the Dashboard

The dashboard is accessed via Shopify admin or directly:

```
https://your-domain.com/admin/dashboard?shop=store-name.myshopify.com
```

When accessed from Shopify admin, an interstitial page opens the dashboard in a new tab for better UX.

## Dashboard Features

### Orders Tab
- View and filter orders by status
- Order detail modal with access codes
- Mark orders as dropped off
- Resend pickup emails to customers
- Cancel locker reservations
- Create manual orders

### My Lockers Tab
- Browse Harbor Locker locations
- Search by city or zip code
- Filter by locker size
- View real-time availability
- Select which lockers to use

### Product Sizes Tab
- Assign dimensions to products
- Enter exact L x W x H measurements
- Quick locker size selection
- Multi-item stacking calculations

### Settings Tab
All settings auto-save when changed.

**Pricing:**
- Free pickup toggle
- Customer fee display

**Fulfillment & Timing:**
- Processing time (business days)
- Fulfillment days (Mon-Sun)
- Hold time before return
- Vacation days
- Pickup date preview

**Branding:**
- Logo upload
- Primary color
- Success message
- Upsell products

### Learn Tab
- Getting started guide
- Order lifecycle
- Locker sizes reference
- Theme blocks with previews
- FAQ and support

## API Endpoints

### Dashboard Stats
```
GET /api/stats/:shop
```

### Orders
```
GET  /api/orders/:shop
GET  /api/order/:shop/:orderId
POST /api/order/:shop/:orderId/status
POST /api/order/:shop/:orderId/resend-email
POST /api/order/:shop/:orderId/cancel
POST /api/orders/:shop/manual
```

### Lockers
```
GET  /api/lockers/:shop
POST /api/lockers/:shop/preferences
GET  /api/locker-availability/:shop
```

### Settings
```
GET  /api/settings/:shop
POST /api/settings/:shop
GET  /api/branding/:shop
POST /api/branding/:shop
```

### Products
```
GET  /api/products/:shop
POST /api/products/:shop/sizes
```

## Design System

The dashboard uses Shopify Polaris design tokens:

```css
:root {
    /* Colors */
    --p-color-bg-fill-brand: #008060;
    --p-color-text: #202223;
    --p-color-text-secondary: #6d7175;
    --p-color-border-secondary: #e1e3e5;

    /* Spacing (4px base) */
    --p-space-200: 8px;
    --p-space-400: 16px;
    --p-space-500: 20px;

    /* Border Radius */
    --p-border-radius-200: 8px;

    /* Shadows */
    --p-shadow-card: 0 0 0 1px rgba(63, 63, 68, 0.05),
                     0 1px 3px 0 rgba(63, 63, 68, 0.15);
}
```

## Troubleshooting

### Dashboard not loading?
- Verify the server is running
- Check the `shop` parameter in the URL
- Look at browser console for errors

### API errors?
- Verify `.env` variables are set
- Check server logs for detailed errors
- Test API endpoints with curl

### Lockers not showing?
- Verify Harbor API credentials
- Check if lockers are selected in preferences
- Look for API errors in server logs

### Settings not saving?
- Auto-save triggers on change
- Check network tab for API calls
- Verify database connection

## Support

- Email: support@lockerdrop.it
- Training: `/docs/training`
- FAQ: `/docs/faq`

---

**Last Updated:** January 2025
