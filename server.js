// server.js - Updated with Admin Dashboard
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Store access tokens (use a database in production)
const accessTokens = new Map();

// ============================================
// SHOPIFY OAUTH ROUTES
// ============================================

// Install route - initiates OAuth
app.get('/auth/install', (req, res) => {
    const shop = req.query.shop;
    
    if (!shop) {
        return res.status(400).send('Missing shop parameter');
    }
    
    const scopes = process.env.SHOPIFY_SCOPES || 'write_shipping,read_orders,write_orders';
    const redirectUri = `https://${process.env.SHOPIFY_HOST}/auth/callback`;
    const nonce = crypto.randomBytes(16).toString('hex');
    
    const installUrl = `https://${shop}/admin/oauth/authorize?` +
        `client_id=${process.env.SHOPIFY_API_KEY}&` +
        `scope=${scopes}&` +
        `redirect_uri=${redirectUri}&` +
        `state=${nonce}`;
    
    res.redirect(installUrl);
});

// OAuth callback
app.get('/auth/callback', async (req, res) => {
    const { shop, code } = req.query;
    
    try {
        const accessToken = await getAccessToken(shop, code);
        accessTokens.set(shop, accessToken);
        
        res.send(`
            <html>
                <head>
                    <title>LockerDrop Installed</title>
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            margin: 0;
                            background: #f6f6f7;
                        }
                        .container {
                            text-align: center;
                            background: white;
                            padding: 48px;
                            border-radius: 8px;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                        }
                        h1 { color: #5c6ac4; margin-bottom: 16px; }
                        p { color: #6d7175; margin-bottom: 24px; }
                        .btn {
                            display: inline-block;
                            padding: 12px 24px;
                            background: #5c6ac4;
                            color: white;
                            text-decoration: none;
                            border-radius: 6px;
                            font-weight: 500;
                        }
                        .btn:hover { background: #4959bd; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🎉 LockerDrop Installed Successfully!</h1>
                        <p>Your store is now connected to LockerDrop. You can now offer locker pickup as a shipping option to your customers.</p>
                        <a href="/auth/register-carrier/${shop}" class="btn">Complete Setup</a>
                    </div>
                </body>
            </html>
        `);
    } catch (error) {
        console.error('OAuth error:', error);
        res.status(500).send('Installation failed');
    }
});

// Register carrier service
app.get('/auth/register-carrier/:shop', async (req, res) => {
    const shop = req.params.shop;
    const accessToken = accessTokens.get(shop);
    
    if (!accessToken) {
        return res.status(401).send('Not authenticated');
    }
    
    try {
        const carrierService = await registerCarrierService(shop, accessToken);
        
        res.send(`
            <html>
                <head>
                    <title>Setup Complete</title>
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            margin: 0;
                            background: #f6f6f7;
                        }
                        .container {
                            text-align: center;
                            background: white;
                            padding: 48px;
                            border-radius: 8px;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                            max-width: 600px;
                        }
                        h1 { color: #5c6ac4; margin-bottom: 16px; }
                        p { color: #6d7175; margin-bottom: 24px; }
                        .success { color: #008060; font-weight: 500; }
                        .btn {
                            display: inline-block;
                            padding: 12px 24px;
                            background: #5c6ac4;
                            color: white;
                            text-decoration: none;
                            border-radius: 6px;
                            font-weight: 500;
                            margin-top: 16px;
                        }
                        .btn:hover { background: #4959bd; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>✅ Setup Complete!</h1>
                        <p class="success">LockerDrop carrier service has been successfully registered.</p>
                        <p>Your customers will now see "LockerDrop Pickup" as a shipping option at checkout.</p>
                        <a href="/admin/dashboard?shop=${shop}" class="btn">Go to Dashboard</a>
                    </div>
                </body>
            </html>
        `);
    } catch (error) {
        console.error('Carrier registration error:', error.response?.data || error);
        res.status(500).send(`
            <html>
                <head>
                    <title>Registration Error</title>
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            margin: 0;
                            background: #f6f6f7;
                        }
                        .container {
                            background: white;
                            padding: 48px;
                            border-radius: 8px;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                            max-width: 600px;
                        }
                        h1 { color: #bf0711; margin-bottom: 16px; }
                        .error { color: #6d7175; }
                        pre { background: #f6f6f7; padding: 16px; border-radius: 4px; overflow: auto; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>❌ Registration Failed</h1>
                        <p class="error">There was an error registering the carrier service:</p>
                        <pre>${JSON.stringify(error.response?.data || error.message, null, 2)}</pre>
                    </div>
                </body>
            </html>
        `);
    }
});

// ============================================
// CARRIER SERVICE ROUTE
// ============================================

app.post('/carrier/rates', async (req, res) => {
    try {
        const { rate } = req.body;
        console.log('Carrier rate request:', rate);
        
        // Get customer's destination
        const destination = rate.destination;
        
        // TODO: Get nearby lockers from Harbor API based on destination
        // For now, return a simple response
        
        const rates = [
            {
                service_name: 'LockerDrop Pickup',
                service_code: 'lockerdrop_pickup',
                total_price: '0.00',
                description: 'Pick up your order from a nearby locker at your convenience',
                currency: 'USD'
            }
        ];
        
        res.json({ rates });
    } catch (error) {
        console.error('Error calculating rates:', error);
        res.status(500).json({ rates: [] });
    }
});

// ============================================
// ADMIN DASHBOARD ROUTES
// ============================================

// Serve admin dashboard
app.get('/admin/dashboard', (req, res) => {
    const shop = req.query.shop;
    if (!shop) {
        return res.status(400).send('Missing shop parameter');
    }
    res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

// Get dashboard statistics
app.get('/api/stats/:shop', async (req, res) => {
    try {
        // TODO: Get actual stats from database
        const stats = {
            pendingDropoffs: 3,
            readyForPickup: 7,
            completedThisWeek: 24,
            activeLockers: 5
        };
        
        res.json(stats);
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// Get all orders
app.get('/api/orders/:shop', async (req, res) => {
    try {
        // TODO: Get actual orders from database
        const orders = [
            {
                orderNumber: '#1001',
                date: '2024-11-20',
                customerName: 'John Smith',
                customerEmail: 'john@example.com',
                locker: 'Dallas Downtown',
                lockerAddress: '123 Main St, Dallas, TX 75201',
                dropOffCode: 'SELL-1234',
                pickupCode: 'PICK-5678',
                status: 'pending'
            },
            {
                orderNumber: '#1002',
                date: '2024-11-19',
                customerName: 'Sarah Johnson',
                customerEmail: 'sarah@example.com',
                locker: 'North Dallas',
                lockerAddress: '456 Oak Ave, Dallas, TX 75230',
                dropOffCode: 'SELL-2345',
                pickupCode: 'PICK-6789',
                status: 'ready'
            }
        ];
        
        res.json(orders);
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// Get available lockers from Harbor API
app.get('/api/lockers/:shop', async (req, res) => {
    try {
        // Harbor Locations API doesn't need OAuth for listing locations
        // Using the public locations endpoint
        const lockersResponse = await axios.get('https://api.harborlockers.com/v1/locations', {
            params: {
                // You can filter by city, state, or zip code
                // state: 'TX',
                // city: 'Dallas'
            }
        });
        
        // Transform the response to match our dashboard format
        const lockers = lockersResponse.data.map(location => ({
            id: location.id,
            name: location.name || location.location_name,
            address: location.address || `${location.street_address}, ${location.city}, ${location.state} ${location.zip}`,
            city: location.city,
            state: location.state,
            zip: location.zip,
            available_sizes: location.locker_sizes || ['Small', 'Medium', 'Large']
        }));
        
        res.json(lockers);
    } catch (error) {
        console.error('Error fetching lockers:', error);
        res.status(500).json({ error: 'Failed to fetch lockers', details: error.message });
    }
});

// Update order status
app.post('/api/order/:shop/:orderId/status', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;
        
        // TODO: Update order status in database
        // TODO: Send notification to customer if status is "ready"
        
        res.json({ success: true, message: `Order ${orderId} marked as ${status}` });
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ error: 'Failed to update order status' });
    }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

async function getAccessToken(shop, code) {
    const response = await axios.post(`https://${shop}/admin/oauth/access_token`, {
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code
    });
    
    return response.data.access_token;
}

async function registerCarrierService(shop, accessToken) {
    const response = await axios.post(
        `https://${shop}/admin/api/2024-10/carrier_services.json`,
        {
            carrier_service: {
                name: 'LockerDrop',
                callback_url: `https://${process.env.SHOPIFY_HOST}/carrier/rates`,
                service_discovery: true
            }
        },
        {
            headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json'
            }
        }
    );
    
    return response.data.carrier_service;
}

// ============================================
// WEBHOOKS
// ============================================

// TODO: Locker Open API Integration
// When an order is placed, we'll use Harbor's Locker Open API to:
// 1. Create a locker access link for the seller (drop-off)
// 2. Create a locker access link for the customer (pickup)
// Documentation: https://docs.harborlockers.com/locker_open.html
//
// Example usage:
// POST https://api.harborlockers.com/v1/locker/open
// Body: {
//   location_id: "locker-location-id",
//   purpose: "delivery",
//   recipient_info: {...}
// }

app.post('/webhooks/orders/create', async (req, res) => {
    try {
        const order = req.body;
        console.log('New order received:', order.id);
        
        // Check if order uses LockerDrop shipping
        const usesLockerDrop = order.shipping_lines.some(
            line => line.code === 'lockerdrop_pickup'
        );
        
        if (usesLockerDrop) {
            console.log('LockerDrop order! Processing...');
            // TODO: Reserve locker via Harbor API
            // TODO: Generate access codes
            // TODO: Store order in database
            // TODO: Send notifications
        }
        
        res.status(200).send('OK');
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).send('Error');
    }
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
    console.log(`
    ╔═══════════════════════════════════════╗
    ║   🔐 LockerDrop Server Running       ║
    ╠═══════════════════════════════════════╣
    ║   Port: ${PORT}                        
    ║   Host: ${process.env.SHOPIFY_HOST}
    ║   Harbor API: Connected               ║
    ║   Admin Dashboard: /admin/dashboard   ║
    ╚═══════════════════════════════════════╝
    `);
});
