# LockerDrop Admin Dashboard - Setup Guide

## Files Created

1. **admin-dashboard.html** - The complete admin interface for sellers
2. **server-updated.js** - Updated server with admin dashboard routes
3. **routes-admin.js** - Separate admin routes file (optional, for modularity)

## Setup Instructions

### Step 1: Update Your Project Structure

Your project should have this structure:

```
lockerdrop-shopify/
├── server.js (replace with server-updated.js)
├── .env
├── package.json
├── public/
│   └── admin-dashboard.html (new)
├── routes/
│   ├── auth.js
│   ├── carrier.js
│   └── admin.js (optional)
└── services/
    ├── harbor.service.js
    └── shopify.service.js
```

### Step 2: Copy Files to Your Project

1. **Copy admin-dashboard.html to public folder:**
   ```bash
   cp /home/claude/admin-dashboard.html /path/to/your/project/public/
   ```

2. **Replace your server.js:**
   ```bash
   cp /home/claude/server-updated.js /path/to/your/project/server.js
   ```

### Step 3: Create the public Directory

In your project root:
```bash
mkdir public
mv admin-dashboard.html public/
```

### Step 4: Update Your .env File

Make sure you have these variables:
```env
# Shopify App Credentials
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SHOPIFY_SCOPES=write_shipping,read_orders,write_orders,read_products
SHOPIFY_HOST=your-ngrok-url.ngrok.io

# Harbor Locker API
HARBOR_CLIENT_ID=lockerdrop
HARBOR_CLIENT_SECRET=UHAmeQiazptDLws87frl0TR7ddO3vhHh
HARBOR_API_URL=https://api.sandbox.harborlockers.com

# Server
PORT=3000
```

### Step 5: Restart Your Server

1. **Stop your current server** (Ctrl+C in terminal)

2. **Start the updated server:**
   ```bash
   npm start
   ```

   Or if you're using nodemon:
   ```bash
   nodemon server.js
   ```

### Step 6: Access the Admin Dashboard

Once the carrier service is registered, you can access the dashboard at:
```
https://your-ngrok-url.ngrok.app/admin/dashboard?shop=enna-test.myshopify.com
```

Or after completing the installation flow, you'll be automatically redirected to the dashboard.

## Features of the Admin Dashboard

### 📊 Dashboard Tab
- View statistics: Pending drop-offs, Ready for pickup, Completed orders, Active lockers
- Recent orders table with quick actions
- Real-time order status updates

### 📦 Orders Tab
- Complete list of all LockerDrop orders
- View drop-off and pickup codes
- Filter and search orders
- Update order status
- Resend pickup emails to customers

### 🔐 My Lockers Tab
- View all available Harbor lockers in your area
- Select which lockers you want to use
- See locker sizes and addresses
- Save locker preferences

### 📐 Product Settings Tab
- Assign locker sizes to products
- Set product dimensions
- Ensure customers see only compatible lockers

### 💰 Shipping Rates Tab
- Configure base shipping rate
- Set processing time
- Configure locker hold time
- Enable/disable for specific products

### 📧 Notifications Tab
- Email notification settings
- Customize email templates
- Toggle different notification types

## API Endpoints

The dashboard uses these API endpoints:

### Dashboard Stats
```
GET /api/stats/:shop
```

### Orders
```
GET /api/orders/:shop          - Get all orders
GET /api/order/:shop/:orderId  - Get order details
POST /api/order/:shop/:orderId/status - Update order status
POST /api/order/:shop/:orderId/resend-email - Resend pickup email
```

### Lockers
```
GET /api/lockers/:shop - Get available lockers from Harbor API
POST /api/lockers/:shop/preferences - Save locker preferences
```

### Settings
```
GET /api/settings/:shop - Get seller settings
POST /api/settings/:shop - Update seller settings
```

## Next Steps

### 1. Database Integration
Currently, the dashboard uses sample data. You'll need to:
- Set up a database (PostgreSQL recommended)
- Create tables for: orders, locker_preferences, settings, etc.
- Update API endpoints to read/write from database

### 2. Order Webhook Implementation
When a customer places an order:
```javascript
// In server.js, webhook handler
app.post('/webhooks/orders/create', async (req, res) => {
    const order = req.body;
    
    // 1. Check if order uses LockerDrop
    // 2. Reserve locker via Harbor API
    // 3. Generate access codes
    // 4. Store in database
    // 5. Send notification emails
});
```

### 3. Email Notifications
Implement email sending:
- Use Sendgrid, Mailgun, or similar
- Send to seller when order is placed
- Send to customer with pickup codes
- Send reminders before deadline

### 4. Harbor API Integration
Complete the locker reservation flow:
```javascript
// Reserve locker
const reservation = await harborAPI.reserveLocker({
    lockerId: selectedLocker.id,
    duration: 5, // days
    size: 'medium'
});

// Generate access codes
const codes = {
    dropOff: reservation.seller_code,
    pickup: reservation.customer_code
};
```

## Testing the Dashboard

1. **Install the app** on your Shopify dev store
2. **Register the carrier service**
3. **Access the dashboard** using the URL provided
4. **Test each tab** to ensure UI loads correctly
5. **Make a test order** on your store using LockerDrop shipping

## Troubleshooting

### Dashboard not loading?
- Check that ngrok is running
- Verify `public` folder exists with admin-dashboard.html
- Check server logs for errors

### API endpoints returning errors?
- Verify .env variables are set
- Check that shop parameter is in URL
- Look at network tab in browser dev tools

### Lockers not loading?
- Test Harbor API credentials
- Check server logs for API errors
- Verify Harbor API is accessible

## Development vs Production

### Current Setup (Development)
- Using ngrok for public URL
- Sample data in memory
- No database
- Sandbox Harbor API

### Production Requirements
- Real hosting (Railway, Heroku, DigitalOcean)
- Production database
- Production Harbor API credentials
- SSL certificate
- Environment-specific configurations

## Support

If you run into issues:
1. Check server logs in terminal
2. Check browser console for JavaScript errors
3. Verify all .env variables are set
4. Test API endpoints individually using Postman/curl
