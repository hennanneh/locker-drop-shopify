# LockerDrop Quick Start Checklist

## ✅ What You Already Have Working

- [x] Node.js v24.6.0 installed
- [x] VS Code as code editor
- [x] Shopify Partner account
- [x] Dev store (enna-test.myshopify.com)
- [x] Harbor Locker API sandbox access
- [x] ngrok account
- [x] Basic server running
- [x] Carrier service registered
- [x] LockerDrop showing at checkout!

## 📋 Integration Steps

### Step 1: Update Your Project Files
```bash
# In your lockerdrop-shopify folder

# Create public directory if it doesn't exist
mkdir -p public

# Copy the new files (downloaded from Claude)
# Replace these paths with where you downloaded the files
cp ~/Downloads/admin-dashboard.html public/
cp ~/Downloads/server.js server.js
cp ~/Downloads/package.json package.json
```

### Step 2: Install Any Missing Dependencies
```bash
npm install
```

### Step 3: Verify Your .env File
Open `.env` and make sure you have:
```env
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SHOPIFY_SCOPES=write_shipping,read_orders,write_orders,read_products
SHOPIFY_HOST=your-ngrok-url.ngrok.io

HARBOR_CLIENT_ID=lockerdrop
HARBOR_CLIENT_SECRET=UHAmeQiazptDLws87frl0TR7ddO3vhHh
HARBOR_API_URL=https://api.sandbox.harborlockers.com

PORT=3000
```

### Step 4: Restart Your Server
```bash
# Stop current server (Ctrl+C)
# Start updated server
npm start
```

### Step 5: Access Admin Dashboard
Open in browser:
```
https://your-ngrok-url.ngrok.app/admin/dashboard?shop=enna-test.myshopify.com
```

## 🧪 Testing Checklist

### Test 1: Access Dashboard
- [ ] Dashboard loads without errors
- [ ] All 6 tabs are visible
- [ ] Stats show sample data
- [ ] Store name shows in header

### Test 2: View Orders Tab
- [ ] Orders table displays
- [ ] Can click "View Details" on orders
- [ ] Modal opens with order information
- [ ] Access codes are visible

### Test 3: My Lockers Tab
- [ ] Lockers load from Harbor API
- [ ] Can click to select/deselect lockers
- [ ] Locker addresses display correctly
- [ ] "Save Changes" button works

### Test 4: Product Settings Tab
- [ ] Product dropdown is visible
- [ ] Size selector works
- [ ] Dimension inputs are functional

### Test 5: Shipping Rates Tab
- [ ] All form fields are editable
- [ ] Settings can be saved (shows confirmation)

### Test 6: Notifications Tab
- [ ] Toggle switches work
- [ ] Email template fields are editable

### Test 7: Place Test Order
- [ ] Go to your dev store
- [ ] Add product to cart
- [ ] Proceed to checkout
- [ ] Enter shipping address in Dallas, TX
- [ ] Verify "LockerDrop Pickup - FREE" appears
- [ ] Complete the order
- [ ] Check if webhook is triggered (check server logs)

## 🐛 Troubleshooting Guide

### Issue: Dashboard shows blank page
**Solution:**
1. Check browser console (F12) for errors
2. Verify `public/admin-dashboard.html` exists
3. Check server logs for errors
4. Make sure ngrok is running

### Issue: "Shop parameter missing" error
**Solution:**
Add `?shop=enna-test.myshopify.com` to the URL

### Issue: Lockers not loading
**Solution:**
1. Check Harbor API credentials in .env
2. Test API connection:
   ```bash
   curl -X POST https://api.sandbox.harborlockers.com/oauth/token \
     -d "client_id=lockerdrop" \
     -d "client_secret=UHAmeQiazptDLws87frl0TR7ddO3vhHh" \
     -d "grant_type=client_credentials"
   ```
3. Check server logs for API errors

### Issue: LockerDrop not showing at checkout
**Solution:**
1. Verify carrier service is registered (check Shopify admin)
2. Test carrier endpoint:
   ```bash
   curl -X POST https://your-ngrok-url.ngrok.app/carrier/rates \
     -H "Content-Type: application/json" \
     -d '{"rate": {"destination": {"postal_code": "75219"}}}'
   ```
3. Check ngrok is running and URL hasn't changed

### Issue: 404 errors on API calls
**Solution:**
1. Verify server.js has all API routes
2. Restart server after making changes
3. Check network tab in browser for actual endpoint being called

## 📝 Next Steps After Integration

### Immediate (Today)
1. ✅ Install updated files
2. ✅ Test dashboard access
3. ✅ Verify all tabs work
4. ✅ Place a test order

### Short Term (This Week)
1. [ ] Set up database (PostgreSQL on DigitalOcean)
2. [ ] Implement order storage
3. [ ] Set up email service (SendGrid/Mailgun)
4. [ ] Test full order flow end-to-end

### Medium Term (Next 2 Weeks)
1. [ ] Implement webhook handlers
2. [ ] Add locker reservation automation
3. [ ] Build email templates
4. [ ] Test with real Harbor API (if available)

### Long Term (Next Month)
1. [ ] Deploy to production hosting
2. [ ] Implement customer tracking portal
3. [ ] Add SMS notifications
4. [ ] Submit app to Shopify App Store

## 🎯 Success Criteria

You'll know everything is working when:

✅ **Admin Dashboard**
- Opens without errors
- Shows your store name
- All tabs load correctly
- API calls work (check Network tab)

✅ **Checkout Flow**
- LockerDrop appears as shipping option
- Shows correct price (FREE)
- Customer can complete order

✅ **Order Management**
- Orders appear in dashboard
- Can view order details
- Can update order status
- Access codes are generated

✅ **Harbor Integration**
- Lockers load in "My Lockers" tab
- API credentials work
- Can query lockers by location

## 📞 Getting Help

If you're stuck:

1. **Check the logs:**
   - Server logs in terminal
   - Browser console (F12)
   - Network tab for API calls

2. **Test components individually:**
   - Test Harbor API directly
   - Test Shopify API endpoints
   - Test each dashboard tab

3. **Reference documentation:**
   - ADMIN_SETUP_GUIDE.md
   - ARCHITECTURE.md
   - Harbor API docs: https://docs.harborlockers.com/
   - Shopify API docs: https://shopify.dev/docs/api

## 🚀 Ready to Launch?

Before going live:
- [ ] Switch to production Harbor API
- [ ] Set up production database
- [ ] Configure production email service
- [ ] Set up production hosting (not ngrok)
- [ ] Add SSL certificate
- [ ] Test with real customers
- [ ] Set up monitoring and logging
- [ ] Create backup strategy
- [ ] Document customer support procedures

---

**Current Status:** Development/Testing Phase
**Next Milestone:** Database Integration & Order Storage
**Target Launch:** [Set your date]

Good luck! 🎉
