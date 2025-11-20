// routes/admin.js
const express = require('express');
const router = express.Router();
const path = require('path');

// Middleware to verify Shopify session
const verifyShopifySession = async (req, res, next) => {
    const shop = req.query.shop || req.params.shop;
    
    if (!shop) {
        return res.status(400).json({ error: 'Shop parameter required' });
    }
    
    // In production, verify the session token here
    req.shopDomain = shop;
    next();
};

// Serve the admin dashboard
router.get('/dashboard', verifyShopifySession, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin-dashboard.html'));
});

// Get dashboard statistics
router.get('/api/stats/:shop', verifyShopifySession, async (req, res) => {
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
router.get('/api/orders/:shop', verifyShopifySession, async (req, res) => {
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
            },
            {
                orderNumber: '#1003',
                date: '2024-11-18',
                customerName: 'Mike Wilson',
                customerEmail: 'mike@example.com',
                locker: 'Dallas Downtown',
                lockerAddress: '123 Main St, Dallas, TX 75201',
                dropOffCode: 'SELL-3456',
                pickupCode: 'PICK-7890',
                status: 'picked-up'
            }
        ];
        
        res.json(orders);
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// Get order details
router.get('/api/order/:shop/:orderId', verifyShopifySession, async (req, res) => {
    try {
        const { orderId } = req.params;
        
        // TODO: Get actual order from database
        const order = {
            orderNumber: orderId,
            date: '2024-11-20',
            customerName: 'John Smith',
            customerEmail: 'john@example.com',
            customerPhone: '555-0123',
            locker: 'Dallas Downtown',
            lockerAddress: '123 Main St, Dallas, TX 75201',
            lockerId: 'harbor-locker-001',
            dropOffCode: 'SELL-1234',
            pickupCode: 'PICK-5678',
            status: 'pending',
            items: [
                { name: 'T-Shirt', quantity: 2, sku: 'TSHIRT-001' }
            ]
        };
        
        res.json(order);
    } catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).json({ error: 'Failed to fetch order' });
    }
});

// Update order status
router.post('/api/order/:shop/:orderId/status', verifyShopifySession, async (req, res) => {
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

// Get available lockers from Harbor API
router.get('/api/lockers/:shop', verifyShopifySession, async (req, res) => {
    try {
        const axios = require('axios');
        
        // Get Harbor API token
        const tokenResponse = await axios.post('https://api.sandbox.harborlockers.com/oauth/token', {
            client_id: process.env.HARBOR_CLIENT_ID,
            client_secret: process.env.HARBOR_CLIENT_SECRET,
            grant_type: 'client_credentials'
        });
        
        const accessToken = tokenResponse.data.access_token;
        
        // Get lockers from Harbor API
        const lockersResponse = await axios.get('https://api.sandbox.harborlockers.com/api/v1/lockers', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        res.json(lockersResponse.data);
    } catch (error) {
        console.error('Error fetching lockers:', error);
        res.status(500).json({ error: 'Failed to fetch lockers' });
    }
});

// Save seller's locker preferences
router.post('/api/lockers/:shop/preferences', verifyShopifySession, async (req, res) => {
    try {
        const { selectedLockers } = req.body;
        
        // TODO: Save locker preferences to database
        
        res.json({ success: true, message: 'Locker preferences saved' });
    } catch (error) {
        console.error('Error saving locker preferences:', error);
        res.status(500).json({ error: 'Failed to save preferences' });
    }
});

// Get seller's settings
router.get('/api/settings/:shop', verifyShopifySession, async (req, res) => {
    try {
        // TODO: Get settings from database
        const settings = {
            baseRate: 0.00,
            processingTime: '2-3 business days',
            lockerHoldTime: '5 days',
            enableForAllProducts: true,
            notifications: {
                newOrder: true,
                dropoffReminder: true,
                itemPickedUp: true,
                deadlineApproaching: true
            }
        };
        
        res.json(settings);
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

// Update seller's settings
router.post('/api/settings/:shop', verifyShopifySession, async (req, res) => {
    try {
        const settings = req.body;
        
        // TODO: Save settings to database
        
        res.json({ success: true, message: 'Settings updated' });
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// Resend pickup email to customer
router.post('/api/order/:shop/:orderId/resend-email', verifyShopifySession, async (req, res) => {
    try {
        const { orderId } = req.params;
        
        // TODO: Get order details
        // TODO: Send email to customer with pickup code
        
        res.json({ success: true, message: 'Pickup email resent' });
    } catch (error) {
        console.error('Error resending email:', error);
        res.status(500).json({ error: 'Failed to resend email' });
    }
});

module.exports = router;
