// server.js - Updated with Admin Dashboard
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const pino = require('pino');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Structured logger
const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV !== 'production' ? {
        target: 'pino-pretty',
        options: { colorize: true }
    } : undefined
});

// Configure multer for logo uploads
const logoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'public/uploads/logos'));
    },
    filename: (req, file, cb) => {
        // Use shop name + timestamp for unique filename
        const shop = req.params.shop.replace('.myshopify.com', '');
        const ext = path.extname(file.originalname);
        cb(null, `${shop}-${Date.now()}${ext}`);
    }
});

const uploadLogo = multer({
    storage: logoStorage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, GIF, WebP, and SVG are allowed.'));
        }
    }
});

const app = express();
const PORT = process.env.PORT || 3000;
const db = require('./db');

// Email service (Resend)
const { Resend } = require('resend');
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// SMS service (Twilio)
const twilio = require('twilio');
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;
const twilioFromNumber = process.env.TWILIO_PHONE_NUMBER;

// SMS helper function
async function sendSMS(to, message) {
    if (!twilioClient || !twilioFromNumber) {
        logger.info(`📱 SMS service not configured. Would send to ${to}: ${message}`);
        return { success: false, reason: 'SMS service not configured' };
    }

    try {
        // Format phone number (ensure it has country code)
        let formattedNumber = to.replace(/\D/g, ''); // Remove non-digits
        if (formattedNumber.length === 10) {
            formattedNumber = '+1' + formattedNumber; // Assume US if 10 digits
        } else if (!formattedNumber.startsWith('+')) {
            formattedNumber = '+' + formattedNumber;
        }

        const result = await twilioClient.messages.create({
            body: message,
            from: twilioFromNumber,
            to: formattedNumber
        });
        logger.info(`✅ SMS sent to ${formattedNumber}: ${result.sid}`);
        return { success: true, sid: result.sid };
    } catch (error) {
        logger.error(`❌ Failed to send SMS to ${to}:`, error.message);
        return { success: false, error: error.message };
    }
}

// Email helper function
async function sendEmail(to, subject, html) {
    if (!resend) {
        logger.info(`📧 Email service not configured. Would send to ${to}: ${subject}`);
        return { success: false, reason: 'Email service not configured' };
    }

    try {
        const result = await resend.emails.send({
            from: 'LockerDrop <notifications@lockerdrop.it>',
            to: [to],
            subject: subject,
            html: html
        });
        logger.info(`✅ Email sent to ${to}: ${subject}`);
        return { success: true, id: result.id };
    } catch (error) {
        logger.error(`❌ Failed to send email to ${to}:`, error.message);
        return { success: false, error: error.message };
    }
}

// Shopify GraphQL Admin API helper
const SHOPIFY_API_VERSION = '2025-10';

async function shopifyGraphQL(shop, accessToken, query, variables = {}) {
    const response = await axios.post(
        `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
        { query, variables },
        {
            headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json'
            }
        }
    );

    if (response.data.errors) {
        logger.error('GraphQL errors:', response.data.errors);
        throw new Error(response.data.errors[0]?.message || 'GraphQL query failed');
    }

    return response.data.data;
}

// Fetch all products with variants via GraphQL (paginated)
async function fetchProductsGraphQL(shop, accessToken, limit = 250) {
    const products = [];
    let hasNextPage = true;
    let cursor = null;

    const query = `
        query getProducts($first: Int!, $after: String) {
            products(first: $first, after: $after) {
                pageInfo {
                    hasNextPage
                    endCursor
                }
                edges {
                    node {
                        id
                        title
                        handle
                        featuredImage {
                            url
                        }
                        variants(first: 100) {
                            edges {
                                node {
                                    id
                                    title
                                    sku
                                    price
                                    inventoryItem {
                                        measurement {
                                            weight {
                                                value
                                                unit
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    `;

    while (hasNextPage && products.length < limit) {
        const batchSize = Math.min(50, limit - products.length);
        const data = await shopifyGraphQL(shop, accessToken, query, {
            first: batchSize,
            after: cursor
        });

        const productEdges = data.products.edges;
        for (const edge of productEdges) {
            const node = edge.node;
            // Convert GraphQL IDs to numeric IDs
            const productId = node.id.replace('gid://shopify/Product/', '');
            products.push({
                id: productId,
                title: node.title,
                handle: node.handle,
                image: node.featuredImage?.url || null,
                variants: node.variants.edges.map(v => ({
                    id: v.node.id.replace('gid://shopify/ProductVariant/', ''),
                    title: v.node.title,
                    sku: v.node.sku,
                    weight: v.node.inventoryItem?.measurement?.weight?.value || 0,
                    weight_unit: v.node.inventoryItem?.measurement?.weight?.unit?.toLowerCase(),
                    price: v.node.price
                }))
            });
        }

        hasNextPage = data.products.pageInfo.hasNextPage;
        cursor = data.products.pageInfo.endCursor;
    }

    return products;
}

// Fetch a single product by ID via GraphQL
async function fetchProductByIdGraphQL(shop, accessToken, productId) {
    const query = `
        query getProduct($id: ID!) {
            product(id: $id) {
                id
                title
                handle
                featuredImage {
                    url
                }
                images(first: 1) {
                    edges {
                        node {
                            url
                        }
                    }
                }
                variants(first: 100) {
                    edges {
                        node {
                            id
                            title
                            sku
                            price
                            inventoryItem {
                                measurement {
                                    weight {
                                        value
                                        unit
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    `;

    // Ensure we have a proper GraphQL ID
    const gid = productId.toString().startsWith('gid://')
        ? productId
        : `gid://shopify/Product/${productId}`;

    const data = await shopifyGraphQL(shop, accessToken, query, { id: gid });

    if (!data.product) {
        return null;
    }

    const product = data.product;
    const numericId = product.id.replace('gid://shopify/Product/', '');

    return {
        id: numericId,
        title: product.title,
        handle: product.handle,
        image: product.featuredImage?.url || product.images?.edges?.[0]?.node?.url || null,
        variants: product.variants.edges.map(v => ({
            id: v.node.id.replace('gid://shopify/ProductVariant/', ''),
            title: v.node.title,
            sku: v.node.sku,
            weight: v.node.inventoryItem?.measurement?.weight?.value || 0,
            weight_unit: v.node.inventoryItem?.measurement?.weight?.unit?.toLowerCase(),
            price: v.node.price
        }))
    };
}

// Fetch a single variant by ID via GraphQL
async function fetchVariantByIdGraphQL(shop, accessToken, variantId) {
    const query = `
        query getVariant($id: ID!) {
            productVariant(id: $id) {
                id
                title
                sku
                price
                inventoryItem {
                    measurement {
                        weight {
                            value
                            unit
                        }
                    }
                }
                product {
                    id
                    title
                }
            }
        }
    `;

    // Ensure we have a proper GraphQL ID
    const gid = variantId.toString().startsWith('gid://')
        ? variantId
        : `gid://shopify/ProductVariant/${variantId}`;

    const data = await shopifyGraphQL(shop, accessToken, query, { id: gid });

    if (!data.productVariant) {
        return null;
    }

    const variant = data.productVariant;

    return {
        id: variant.id.replace('gid://shopify/ProductVariant/', ''),
        title: variant.title,
        sku: variant.sku,
        weight: variant.inventoryItem?.measurement?.weight?.value || 0,
        weight_unit: variant.inventoryItem?.measurement?.weight?.unit?.toLowerCase(),
        price: variant.price,
        product_id: variant.product?.id?.replace('gid://shopify/Product/', '')
    };
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session middleware for admin dashboard authentication (PostgreSQL-backed)
app.use(session({
    store: new pgSession({
        pool: db.pool,
        tableName: 'user_sessions',
        createTableIfMissing: true
    }),
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: true, // Required for sameSite: 'none'
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'none' // Required for Shopify iframe
    },
    name: 'lockerdrop.sid'
}));

// Trust first proxy (for secure cookies behind nginx)
app.set('trust proxy', 1);

// CORS and headers for Shopify embedded apps
app.use((req, res, next) => {
    const origin = req.headers.origin;
    const shop = req.query.shop;

    // Allow framing by Shopify admin (required for embedded apps)
    if (shop) {
        res.setHeader('Content-Security-Policy', `frame-ancestors https://${shop} https://admin.shopify.com;`);
    } else {
        res.setHeader('Content-Security-Policy', `frame-ancestors https://*.myshopify.com https://admin.shopify.com;`);
    }

    // CORS headers - allow all origins for API endpoints (required for Shopify UI extensions)
    if (req.path.startsWith('/api/')) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    } else if (origin && (origin.includes('myshopify.com') || origin.includes('shopify.com') || origin.includes('lockerdrop.it'))) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Rate limiters for public endpoints
const publicApiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
});

const checkoutLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 60, // Higher limit for checkout flow
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
});

const webhookLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 120, // Webhooks need higher limits
    standardHeaders: true,
    legacyHeaders: false
});

// Apply rate limiters to public routes
app.use('/api/public/', publicApiLimiter);
app.use('/api/pickup-points', publicApiLimiter);
app.use('/api/waitlist', publicApiLimiter);
app.use('/api/customer/', publicApiLimiter);
app.use('/api/order-pickup-details/', publicApiLimiter);
app.use('/api/verify-order-email/', publicApiLimiter);
app.use('/api/update-pickup-date/', publicApiLimiter);
app.use('/api/available-pickup-dates/', publicApiLimiter);
app.use('/api/checkout/', checkoutLimiter);
app.use('/carrier/', checkoutLimiter);
app.use('/webhooks/', webhookLimiter);

// Store access tokens (use a database in production)
const accessTokens = new Map();

// ============================================
// SHOPIFY OAUTH ROUTES
// ============================================

// Install route - initiates OAuth
app.get('/auth/install', (req, res) => {
    const shop = req.query.shop;
    const redirectUri = `https://app.lockerdrop.it/auth/callback`;
    const scopes = 'write_shipping,read_orders,write_orders,read_products,write_products,read_shipping,read_fulfillments,write_fulfillments';
    const nonce = crypto.randomBytes(16).toString('hex');
    
    const installUrl = 
        `https://${shop}/admin/oauth/authorize?` +
        `client_id=${process.env.SHOPIFY_API_KEY}&` +
        `scope=${scopes}&` +
        `redirect_uri=${redirectUri}&` +
        `state=${nonce}&` +
        `grant_options[]=per-user`;  // This forces re-approval
    
    res.redirect(installUrl);
});

// OAuth callback
app.get('/auth/callback', async (req, res) => {
    const { shop, code } = req.query;

    try {
        const accessToken = await getAccessToken(shop, code);
        accessTokens.set(shop, accessToken);

        // Save to database
        try {
            await db.query(
                'INSERT INTO stores (shop, access_token) VALUES ($1, $2) ON CONFLICT (shop) DO UPDATE SET access_token = $2',
                [shop, accessToken]
            );
            logger.info('✅ Token saved to database for', shop);
        } catch (dbError) {
            logger.error('❌ Database save error:', dbError);
        }

        // Register webhooks and carrier service (don't fail if they already exist)
        try {
            await registerWebhooks(shop, accessToken);
        } catch (e) {
            logger.info('⚠️ Webhook registration skipped:', e.message);
        }

        try {
            await registerCarrierService(shop, accessToken);
        } catch (e) {
            logger.info('⚠️ Carrier service registration skipped (may already exist):', e.message);
        }

        // Create authenticated session
        req.session.authenticated = true;
        req.session.shop = shop;
        req.session.authenticatedAt = Date.now();
        logger.info(`🔐 Session created for ${shop}`);

        // Redirect to embedded app in Shopify Admin
        const shopHost = Buffer.from(`${shop}/admin`).toString('base64').replace(/=+$/, '');
        res.redirect(`https://${shop}/admin/apps/${process.env.SHOPIFY_API_KEY}?host=${shopHost}`);
    } catch (error) {
        logger.error('OAuth error:', error);
        res.status(500).send('Installation failed');
    }
});

// Reconnect route - forces re-authentication when token is invalid
app.get('/auth/reconnect', (req, res) => {
    const shop = req.query.shop;
    if (!shop) {
        return res.status(400).send('Shop parameter required');
    }

    logger.info(`🔄 Reconnect requested for ${shop}`);

    const redirectUri = `https://app.lockerdrop.it/auth/callback`;
    const scopes = 'write_shipping,read_orders,write_orders,read_products,write_products,read_shipping,read_fulfillments,write_fulfillments';
    const nonce = crypto.randomBytes(16).toString('hex');

    const installUrl =
        `https://${shop}/admin/oauth/authorize?` +
        `client_id=${process.env.SHOPIFY_API_KEY}&` +
        `scope=${scopes}&` +
        `redirect_uri=${redirectUri}&` +
        `state=${nonce}`;

    res.redirect(installUrl);
});

// Validate token endpoint - checks if Shopify token is still valid
app.get('/api/validate-token/:shop', async (req, res) => {
    const { shop } = req.params;

    try {
        // Get token from database
        const result = await db.query('SELECT access_token FROM stores WHERE shop = $1', [shop]);

        if (result.rows.length === 0 || !result.rows[0].access_token) {
            return res.json({ valid: false, error: 'No token found', needsReconnect: true });
        }

        const accessToken = result.rows[0].access_token;

        // Test the token with a GraphQL call
        const shopData = await shopifyGraphQL(shop, accessToken, `{ shop { name email } }`);

        if (shopData?.shop) {
            return res.json({
                valid: true,
                shopName: shopData.shop.name,
                email: shopData.shop.email
            });
        } else {
            return res.json({ valid: false, error: 'Invalid response', needsReconnect: true });
        }

    } catch (error) {
        logger.error(`❌ Token validation failed for ${shop}:`, error.response?.data || error.message);

        // Check if it's an auth error
        const isAuthError = error.response?.status === 401 ||
                           error.response?.status === 403 ||
                           (error.response?.data?.errors &&
                            error.response.data.errors.includes('Invalid API key'));

        return res.json({
            valid: false,
            error: error.response?.data?.errors || error.message,
            needsReconnect: isAuthError
        });
    }
});

// Check access scopes for a shop - validates if fulfillment permissions are granted
app.get('/api/check-scopes/:shop', async (req, res) => {
    const { shop } = req.params;

    try {
        // Get token from database
        const result = await db.query('SELECT access_token FROM stores WHERE shop = $1', [shop]);

        if (result.rows.length === 0 || !result.rows[0].access_token) {
            return res.json({ valid: false, error: 'No token found', needsReconnect: true });
        }

        const accessToken = result.rows[0].access_token;

        // Check access scopes via Shopify API
        const scopesResponse = await axios.get(
            `https://${shop}/admin/oauth/access_scopes.json`,
            { headers: { 'X-Shopify-Access-Token': accessToken } }
        );

        const grantedScopes = scopesResponse.data.access_scopes.map(s => s.handle);

        // Required scopes for full functionality
        const requiredScopes = ['write_fulfillments', 'read_fulfillments'];
        const missingScopes = requiredScopes.filter(s => !grantedScopes.includes(s));

        if (missingScopes.length > 0) {
            return res.json({
                valid: true,
                grantedScopes,
                missingScopes,
                needsReauth: true,
                reauthUrl: `https://app.lockerdrop.it/auth/reconnect?shop=${shop}`,
                message: `Missing permissions: ${missingScopes.join(', ')}. Re-authorize to enable auto-fulfillment.`
            });
        }

        return res.json({
            valid: true,
            grantedScopes,
            missingScopes: [],
            needsReauth: false
        });

    } catch (error) {
        logger.error(`❌ Scope check failed for ${shop}:`, error.response?.data || error.message);
        return res.json({
            valid: false,
            error: error.response?.data?.errors || error.message,
            needsReconnect: error.response?.status === 401 || error.response?.status === 403
        });
    }
});

// Get store location info for initial locker search
app.get('/api/store-location/:shop', async (req, res) => {
    const { shop } = req.params;

    try {
        // Get token from database
        const result = await db.query('SELECT access_token FROM stores WHERE shop = $1', [shop]);

        if (result.rows.length === 0 || !result.rows[0].access_token) {
            return res.json({ success: false, error: 'No token found' });
        }

        const accessToken = result.rows[0].access_token;

        // Fetch shop info including address via GraphQL
        const shopData = await shopifyGraphQL(shop, accessToken, `{
            shop {
                billingAddress {
                    zip
                    city
                    province
                    country
                }
            }
        }`);

        const addr = shopData.shop.billingAddress;

        return res.json({
            success: true,
            location: {
                zip: addr.zip,
                city: addr.city,
                province: addr.province,
                country: addr.country
            }
        });

    } catch (error) {
        logger.error(`❌ Store location fetch failed for ${shop}:`, error.response?.data || error.message);
        return res.json({ success: false, error: error.message });
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
        logger.error('Carrier registration error:', error.response?.data || error);
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
// Homepage - open dashboard in new tab when coming from Shopify admin
app.get('/', (req, res) => {
    const shop = req.query.shop;
    const hostParam = req.query.host;
    // Get hostname from various headers (Cloudflare may use different ones)
    const hostname = req.headers['x-forwarded-host'] || req.headers.host || req.hostname || '';
    const cleanHostname = hostname.split(':')[0]; // Remove port if present

    logger.info(`🌐 Root request - hostname: ${cleanHostname}, shop: ${shop || 'none'}`);

    // If this is the main domain (lockerdrop.it), serve the public landing page
    if (cleanHostname === 'lockerdrop.it' || cleanHostname === 'www.lockerdrop.it') {
        return res.sendFile(path.join(__dirname, 'public', 'landing.html'));
    }

    // For app.lockerdrop.it - if shop param exists, redirect to dashboard
    if (shop) {
        const dashboardUrl = `/admin/dashboard?shop=${encodeURIComponent(shop)}${hostParam ? '&host=' + encodeURIComponent(hostParam) : ''}`;
        return res.redirect(dashboardUrl);
    }

    // No shop param on app subdomain - redirect to dashboard selection or show simple page
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>LockerDrop</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f8f9fa; }
                .container { text-align: center; }
                h1 { color: #5c6ac4; }
                p { color: #666; margin-bottom: 20px; }
                a { color: #5c6ac4; text-decoration: none; font-weight: 600; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>LockerDrop</h1>
                <p>Please access this app from your Shopify admin.</p>
                <a href="https://lockerdrop.it">Visit lockerdrop.it →</a>
            </div>
        </body>
        </html>
    `);
});

// ============================================
// CARRIER SERVICE ROUTE
// ============================================

// Legacy carrier rates endpoint - now includes availability check
// Returns locker options as shipping rates for non-Plus stores
// Plus stores use the Pickup Point Function instead (native pickup UI)

// Minimum available lockers required to show a location (prevents race conditions)
const MIN_AVAILABLE_BUFFER = 2;

app.post('/carrier/rates', async (req, res) => {
    try {
        const { rate } = req.body;
        logger.info('📍 Shipping rate request received [v2-size-filter]');
        logger.info('📦 Rate items:', rate?.items?.length || 0, 'items');

        // Get shop domain from Shopify header
        const shopDomain = req.headers['x-shopify-shop-domain'];
        logger.info(`🏪 Shop: ${shopDomain || 'unknown'}`);

        // Get shop settings (including fulfillment settings for pickup date calculation)
        let freePickup = false;
        let processingDays = 1;
        let fulfillmentDays = ['monday','tuesday','wednesday','thursday','friday'];
        let vacationDays = [];
        let useNativePickup = false;

        if (shopDomain) {
            try {
                const settingsResult = await db.query('SELECT * FROM shop_settings WHERE shop = $1', [shopDomain]);
                if (settingsResult.rows.length > 0) {
                    const settings = settingsResult.rows[0];
                    freePickup = settings.free_pickup || false;
                    processingDays = settings.processing_days || 1;
                    fulfillmentDays = settings.fulfillment_days || ['monday','tuesday','wednesday','thursday','friday'];
                    vacationDays = settings.vacation_days || [];
                    useNativePickup = settings.use_checkout_extension || false;
                }
            } catch (e) {
                logger.info('Could not check shop settings:', e.message);
            }
        }

        // Calculate pickup date
        const { pickupDate } = calculatePickupDate(processingDays, fulfillmentDays, vacationDays);
        const pickupDateFormatted = formatPickupDate(pickupDate);

        // If checkout extension is enabled, return a single generic LockerDrop rate
        // The checkout extension UI handles the specific locker selection
        if (useNativePickup) {
            logger.info('🔀 Checkout extension enabled - returning single LockerDrop rate');
            const price = freePickup ? '0' : '100';
            return res.json({
                rates: [{
                    service_name: 'LockerDrop Pickup',
                    service_code: 'lockerdrop_pickup',
                    total_price: price,
                    currency: 'USD',
                    description: `📅 Ready ${pickupDateFormatted} • Select locker location below`
                }]
            });
        }

        logger.info(`📅 Expected pickup: ${pickupDateFormatted}`);

        const destination = rate.destination;
        let lat = destination.latitude;
        let lon = destination.longitude;

        // If no coordinates provided, try to geocode from zip code
        if (!lat || !lon) {
            logger.info(`📍 No coordinates provided, attempting zip code geocode for: ${destination.postal_code}`);
            const geocoded = await geocodeZipCode(destination.postal_code, destination.country || 'US');
            if (geocoded) {
                lat = geocoded.latitude;
                lon = geocoded.longitude;
                logger.info(`📍 Using geocoded coordinates from zip: ${lat}, ${lon}`);
            }
        }

        // Calculate required locker size from cart items
        let requiredLockerTypeId = 2; // Default to medium
        let requiredSizeName = 'medium';

        if (shopDomain && rate.items && rate.items.length > 0) {
            logger.info(`📦 First item: product_id=${rate.items[0].product_id}, variant_id=${rate.items[0].variant_id}`);
            try {
                // Get shop access token for fetching product dimensions
                let shopAccessToken = accessTokens.get(shopDomain);
                if (!shopAccessToken) {
                    const storeResult = await db.query('SELECT access_token FROM stores WHERE shop = $1', [shopDomain]);
                    if (storeResult.rows.length > 0) {
                        shopAccessToken = storeResult.rows[0].access_token;
                        accessTokens.set(shopDomain, shopAccessToken);
                    }
                }

                if (shopAccessToken) {
                    // Convert rate.items to the format expected by getProductDimensions
                    const lineItems = rate.items.map(item => ({
                        product_id: item.product_id,
                        variant_id: item.variant_id,
                        quantity: item.quantity
                    }));

                    logger.info(`📦 Calculating dimensions for ${lineItems.length} line items...`);
                    const productDimensions = await getProductDimensionsFromOrder(shopDomain, shopAccessToken, lineItems);
                    logger.info(`📦 Got ${productDimensions.length} product dimensions`);
                    requiredLockerTypeId = calculateRequiredLockerSize(productDimensions);

                    // If any product is not configured for LockerDrop, don't offer it
                    if (requiredLockerTypeId === null) {
                        logger.info('❌ One or more products not configured for LockerDrop - hiding option at checkout');
                        return res.json({ rates: [] });
                    }

                    requiredSizeName = LOCKER_SIZES.find(s => s.id === requiredLockerTypeId)?.name?.toLowerCase() || 'medium';
                    logger.info(`📦 Required locker size for cart: ${requiredSizeName} (type ${requiredLockerTypeId})`);
                } else {
                    logger.info(`⚠️ No access token found for ${shopDomain}`);
                    // No token means we can't verify product sizes - don't offer LockerDrop
                    return res.json({ rates: [] });
                }
            } catch (sizeError) {
                logger.info(`⚠️ Could not calculate locker size: ${sizeError.message} - hiding LockerDrop option`);
                return res.json({ rates: [] });
            }
        }

        // If no coordinates, return empty (can't check availability without location)
        if (!lat || !lon) {
            logger.info('❌ No coordinates available (even after geocode attempt)');
            return res.json({ rates: [] });
        }

        // Check if shop has enabled any locker locations
        let enabledLocationIds = [];
        if (shopDomain) {
            try {
                const prefsResult = await db.query(
                    'SELECT location_id FROM locker_preferences WHERE shop = $1',
                    [shopDomain]
                );
                enabledLocationIds = prefsResult.rows.map(r => r.location_id);

                if (enabledLocationIds.length === 0) {
                    logger.info('❌ No locker locations enabled for this shop - hiding LockerDrop at checkout');
                    return res.json({ rates: [] });
                }
                logger.info(`🔧 Shop has ${enabledLocationIds.length} enabled locations: ${enabledLocationIds.join(', ')}`);
            } catch (e) {
                logger.info('⚠️ Could not check locker preferences:', e.message);
            }
        }

        logger.info(`📍 Customer location: ${lat}, ${lon}`);

        // Get Harbor token
        const tokenResponse = await axios.post(
            'https://accounts.sandbox.harborlockers.com/realms/harbor/protocol/openid-connect/token',
            `grant_type=client_credentials&scope=service_provider&client_id=${process.env.HARBOR_CLIENT_ID}&client_secret=${process.env.HARBOR_CLIENT_SECRET}`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }}
        );

        const accessToken = tokenResponse.data.access_token;

        const locationsResponse = await axios.get(
            'https://api.sandbox.harborlockers.com/api/v1/locations/',
            {
                headers: { 'Authorization': `Bearer ${accessToken}` },
                params: { limit: 100 }
            }
        );

        const allLocations = locationsResponse.data;

        // Filter to only enabled locations for this shop
        const enabledLocations = enabledLocationIds.length > 0
            ? allLocations.filter(loc => enabledLocationIds.includes(loc.id))
            : allLocations;

        if (enabledLocations.length === 0) {
            logger.info('❌ None of the enabled locations match Harbor locations');
            return res.json({ rates: [] });
        }

        // Calculate distances and find nearest locations
        const locationsWithDistance = enabledLocations.map(location => {
            const distance = calculateDistance(lat, lon, location.lat, location.lon);
            return { ...location, distance };
        });

        // Filter to within 100 miles and sort by distance
        const MAX_DISTANCE_MILES = 100;
        const MAX_LOCKERS_TO_SHOW = 5;

        const nearestLocations = locationsWithDistance
            .filter(loc => loc.distance <= MAX_DISTANCE_MILES)
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 15); // Check up to 15 for availability

        // Check availability for each location - filtering by required size
        const availableLocations = [];
        for (const location of nearestLocations) {
            try {
                const availabilityResponse = await axios.get(
                    `https://api.sandbox.harborlockers.com/api/v1/locations/${location.id}/availability`,
                    { headers: { 'Authorization': `Bearer ${accessToken}` }}
                );

                const availability = availabilityResponse.data;
                let hasRequiredSizeAvailable = false;
                let availableForRequiredSize = 0;

                if (availability.byType && Array.isArray(availability.byType)) {
                    // New API format with size-specific availability
                    // Check if required size OR LARGER is available
                    for (const type of availability.byType) {
                        const typeId = type.lockerType?.id;
                        const typeName = type.lockerType?.name || '';
                        const available = type.lockerAvailability?.availableLockers || 0;

                        // Map Harbor's locker type to our size hierarchy
                        const harborSizeId = getLockerSizeIdFromName(typeName);

                        // Accept if this locker type is >= required size
                        if (harborSizeId >= requiredLockerTypeId && available > 0) {
                            hasRequiredSizeAvailable = true;
                            availableForRequiredSize += available;
                        }
                    }
                } else if (availability.lockerAvailability) {
                    // Fallback: just check total availability (less accurate but better than nothing)
                    const totalAvailable = availability.lockerAvailability.availableLockers || 0;
                    hasRequiredSizeAvailable = totalAvailable >= MIN_AVAILABLE_BUFFER;
                    availableForRequiredSize = totalAvailable;
                } else if (Array.isArray(availability)) {
                    // Old API format
                    hasRequiredSizeAvailable = availability.some(type => type.availableCount >= MIN_AVAILABLE_BUFFER);
                    availableForRequiredSize = availability.reduce((sum, type) => sum + (type.availableCount || 0), 0);
                }

                // Only show locations with enough buffer to prevent race conditions
                if (hasRequiredSizeAvailable && availableForRequiredSize >= MIN_AVAILABLE_BUFFER) {
                    logger.info(`✅ Location ${location.name}: ${availableForRequiredSize} lockers available (${requiredSizeName}+, min ${MIN_AVAILABLE_BUFFER})`);
                    availableLocations.push({ ...location, availableCount: availableForRequiredSize });
                } else {
                    logger.info(`❌ Location ${location.name}: Only ${availableForRequiredSize} ${requiredSizeName}+ lockers (need ${MIN_AVAILABLE_BUFFER}+)`);
                }
            } catch (availError) {
                logger.info(`⚠️ Could not check availability for ${location.name}:`, availError.message);
            }

            if (availableLocations.length >= MAX_LOCKERS_TO_SHOW) break;
        }

        if (availableLocations.length === 0) {
            logger.info(`❌ No lockers available with required size: ${requiredSizeName}`);
            return res.json({ rates: [] });
        }

        // Set price based on free pickup setting
        const price = freePickup ? '0' : '100'; // $0 if free, $1.00 otherwise
        logger.info(`💰 Price: ${freePickup ? 'FREE (seller absorbs fee)' : '$1.00'}`);
        logger.info(`✅ Returning ${availableLocations.length} available locker options (pickup: ${pickupDateFormatted})`);

        const rates = availableLocations.map(location => {
            // Build full address from Harbor location fields
            const address = location.address ||
                [location.address1 || location.street_address, location.city, location.state, location.zip]
                    .filter(Boolean).join(', ') || '';
            const shortAddress = [location.city, location.state].filter(Boolean).join(', ');

            return {
                // Format: LockerDrop @ Name (City, State) - clean title
                service_name: `LockerDrop @ ${location.name}${shortAddress ? ` (${shortAddress})` : ''}`,
                service_code: `lockerdrop_${location.id}`,
                total_price: price,
                currency: 'USD',
                // Date on its own line, then address details
                description: `📅 Ready ${pickupDateFormatted}\n📍 ${address} • ${location.distance.toFixed(1)} mi`
            };
        });

        res.json({ rates });
    } catch (error) {
        logger.error('Error calculating rates:', error);
        res.status(500).json({ rates: [] });
    }
});

// ============================================
// ADMIN DASHBOARD ROUTES
// ============================================

// Serve admin dashboard
// Authentication middleware for admin dashboard
async function requireAuth(req, res, next) {
    const shop = req.query.shop;
    const host = req.query.host;

    if (!shop) {
        return res.status(400).send('Missing shop parameter');
    }

    // Check if session is authenticated for this shop
    if (req.session && req.session.authenticated && req.session.shop === shop) {
        return next();
    }

    // Check for HMAC verification from Shopify (for embedded app access)
    const hmac = req.query.hmac;
    if (hmac) {
        // Verify HMAC from Shopify
        const queryParams = { ...req.query };
        delete queryParams.hmac;

        const sortedParams = Object.keys(queryParams)
            .sort()
            .map(key => `${key}=${queryParams[key]}`)
            .join('&');

        const calculatedHmac = crypto
            .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
            .update(sortedParams)
            .digest('hex');

        try {
            if (crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(calculatedHmac))) {
                // Valid HMAC - create session
                req.session.authenticated = true;
                req.session.shop = shop;
                req.session.authenticatedAt = Date.now();
                logger.info(`🔐 Session created via HMAC for ${shop}`);
                return next();
            }
        } catch (e) {
            logger.info(`⚠️ HMAC verification error: ${e.message}`);
        }
    }

    // For embedded apps with host parameter, verify the shop is installed (has token in DB)
    if (host) {
        try {
            const result = await db.query('SELECT access_token FROM stores WHERE shop = $1', [shop]);
            if (result.rows.length > 0 && result.rows[0].access_token) {
                // Shop is installed - create session
                req.session.authenticated = true;
                req.session.shop = shop;
                req.session.authenticatedAt = Date.now();
                logger.info(`🔐 Session created via host verification for ${shop}`);
                return next();
            }
        } catch (dbError) {
            logger.error('Database error during auth:', dbError);
        }
    }

    // Not authenticated - redirect to OAuth
    logger.info(`🔒 Unauthorized access attempt to dashboard for ${shop}`);
    res.redirect(`/auth/install?shop=${shop}`);
}

// API authentication middleware for sensitive dashboard API calls
function requireApiAuth(req, res, next) {
    const shop = req.params.shop;

    if (!shop) {
        return res.status(400).json({ error: 'Missing shop parameter' });
    }

    // Check if session is authenticated for this shop
    if (req.session && req.session.authenticated && req.session.shop === shop) {
        return next();
    }

    // For API calls, return 401 instead of redirecting
    logger.info(`🔒 Unauthorized API access attempt for ${shop}`);
    return res.status(401).json({
        error: 'Unauthorized',
        message: 'Please log in through the Shopify admin to access this resource.',
        loginUrl: `/auth/install?shop=${shop}`
    });
}

app.get('/admin/dashboard', requireAuth, (req, res) => {
    const shop = req.query.shop;
    const host = req.query.host;

    // If no host param and shop exists, redirect to embedded app URL in Shopify Admin
    // This ensures the app always loads inside the Shopify Admin iframe
    if (shop && !host) {
        const shopHost = Buffer.from(`${shop}/admin`).toString('base64').replace(/=+$/, '');
        return res.redirect(`https://${shop}/admin/apps/${process.env.SHOPIFY_API_KEY}?host=${shopHost}`);
    }

    res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

// Get dashboard statistics

// API endpoint for Shopify Admin App Block - get locker data for an order
app.get('/api/order-locker-data/:shopifyOrderId', async (req, res) => {
    try {
        const { shopifyOrderId } = req.params;
        const shop = req.query.shop; // Shop passed from the block

        // First, check if order exists in our database
        const result = await db.query(
            `SELECT
                o.id, o.shop, o.shopify_order_id, o.order_number, o.status,
                o.locker_id, o.location_id, o.dropoff_link, o.pickup_link,
                o.created_at, o.updated_at,
                lp.location_name
             FROM orders o
             LEFT JOIN locker_preferences lp ON o.location_id = lp.location_id AND o.shop = lp.shop
             WHERE o.shopify_order_id = $1`,
            [shopifyOrderId]
        );

        if (result.rows.length > 0) {
            // Order exists in LockerDrop database
            const order = result.rows[0];
            return res.json({
                orderId: order.shopify_order_id,
                orderNumber: order.order_number,
                status: order.status,
                shop: order.shop,
                lockerId: order.locker_id,
                locationId: order.location_id,
                locationName: order.location_name,
                dropoffLink: order.dropoff_link,
                pickupLink: order.pickup_link,
                createdAt: order.created_at,
                updatedAt: order.updated_at,
                completedAt: order.status === 'completed' ? order.updated_at : null,
                isLockerDropOrder: true
            });
        }

        // Order not in database - check Shopify to see if it's a LockerDrop shipping order
        if (shop) {
            try {
                // Get access token for the shop
                let accessToken = accessTokens.get(shop);
                if (!accessToken) {
                    const storeResult = await db.query('SELECT access_token FROM stores WHERE shop = $1', [shop]);
                    if (storeResult.rows.length > 0) {
                        accessToken = storeResult.rows[0].access_token;
                        accessTokens.set(shop, accessToken);
                    }
                }

                if (accessToken) {
                    // Fetch order from Shopify via GraphQL
                    const orderData = await shopifyGraphQL(shop, accessToken, `{
                        order(id: "gid://shopify/Order/${shopifyOrderId}") {
                            legacyResourceId
                            name
                            shippingLines(first: 5) {
                                edges {
                                    node {
                                        title
                                    }
                                }
                            }
                        }
                    }`);

                    const shopifyOrder = orderData.order;

                    // Check if shipping method is LockerDrop
                    const hasLockerDropShipping = shopifyOrder?.shippingLines?.edges?.some(edge =>
                        edge.node.title?.toLowerCase().includes('lockerdrop')
                    );

                    if (hasLockerDropShipping) {
                        // It's a LockerDrop order but not yet in our database
                        // This could happen if webhook failed - return pending status
                        return res.json({
                            orderId: shopifyOrderId,
                            orderNumber: shopifyOrder.name?.replace('#', ''),
                            status: 'pending',
                            shop: shop,
                            isLockerDropOrder: true,
                            needsSync: true, // Indicates order needs to be synced
                            message: 'Order uses LockerDrop shipping but needs to be synced'
                        });
                    } else {
                        // Not a LockerDrop order
                        return res.json({
                            isLockerDropOrder: false,
                            message: 'No LockerDrop data'
                        });
                    }
                }
            } catch (shopifyError) {
                logger.error('Error fetching from Shopify:', shopifyError.message);
            }
        }

        // Default: no locker data found
        return res.json({
            isLockerDropOrder: false,
            message: 'No LockerDrop data'
        });
    } catch (error) {
        logger.error('Error fetching order locker data:', error);
        res.status(500).json({ error: 'Failed to fetch order data' });
    }
});

// Sync orders from Shopify
app.get('/api/sync-orders/:shop', async (req, res) => {
    try {
        const { shop } = req.params;
        
        // Try memory first, then database
        let accessToken = accessTokens.get(shop);
        
        if (!accessToken) {
            const result = await db.query('SELECT access_token FROM stores WHERE shop = $1', [shop]);
            if (result.rows.length > 0) {
                accessToken = result.rows[0].access_token;
                accessTokens.set(shop, accessToken); // Cache it
            }
        }
        
        if (!accessToken) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        // Get orders with LockerDrop shipping from Shopify via GraphQL
        const ordersData = await shopifyGraphQL(shop, accessToken, `{
            orders(first: 250, sortKey: CREATED_AT, reverse: true) {
                edges {
                    node {
                        id
                        legacyResourceId
                        name
                        email
                        createdAt
                        customer {
                            firstName
                            lastName
                            email
                        }
                        shippingLines(first: 5) {
                            edges {
                                node {
                                    title
                                    code
                                }
                            }
                        }
                        shippingAddress {
                            address2
                        }
                        note
                        customAttributes {
                            key
                            value
                        }
                    }
                }
            }
        }`);

        // Transform GraphQL response to match expected format
        const orders = ordersData.orders.edges.map(edge => {
            const node = edge.node;
            return {
                id: node.legacyResourceId,
                order_number: node.name?.replace('#', ''),
                name: node.name,
                email: node.email || node.customer?.email,
                customer: node.customer ? {
                    first_name: node.customer.firstName,
                    last_name: node.customer.lastName
                } : null,
                shipping_lines: node.shippingLines.edges.map(e => ({
                    title: e.node.title,
                    code: e.node.code
                })),
                shipping_address: node.shippingAddress ? {
                    address2: node.shippingAddress.address2
                } : null,
                note_attributes: node.customAttributes?.map(a => ({
                    name: a.key,
                    value: a.value
                })),
                created_at: node.createdAt
            };
        });

        let syncedCount = 0;

        for (const order of orders) {
            // Check if order has LockerDrop shipping
            const hasLockerDrop = order.shipping_lines?.some(line => 
                line.title?.toLowerCase().includes('lockerdrop')
            );
            
            if (!hasLockerDrop) continue;
            
            // Check if order already exists
            const existing = await db.query(
                'SELECT id FROM orders WHERE shopify_order_id = $1',
                [order.id.toString()]
            );
            
            if (existing.rows.length > 0) continue; // Skip if already exists
            
            // Try to extract location ID from shipping lines
            let syncLocationId = null;
            const syncLockerLine = order.shipping_lines?.find(line =>
                line.title?.toLowerCase().includes('lockerdrop')
            );
            if (syncLockerLine?.code) {
                const codeMatch = syncLockerLine.code.match(/lockerdrop_(\d+)/i);
                if (codeMatch) {
                    syncLocationId = parseInt(codeMatch[1], 10);
                }
            }
            // Also try extracting from order attributes/address2
            if (!syncLocationId) {
                const syncLockerInfo = extractLockerDropInfo(order);
                if (syncLockerInfo?.locationId) {
                    syncLocationId = syncLockerInfo.locationId;
                }
            }

            // Add to database (location may be null — seller assigns manually from dashboard)
            await db.query(
                `INSERT INTO orders (
                    shop, shopify_order_id, order_number,
                    customer_email, customer_name,
                    location_id, status, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    shop,
                    order.id.toString(),
                    order.order_number?.toString() || order.name,
                    order.email || order.customer?.email,
                    order.customer ? `${order.customer.first_name} ${order.customer.last_name}` : 'Guest',
                    syncLocationId,
                    syncLocationId ? 'pending_dropoff' : 'pending',
                    order.created_at
                ]
            );
            
            syncedCount++;
        }
        
        res.json({ success: true, synced: syncedCount });
    } catch (error) {
        logger.error('Error syncing orders:', error);
        res.status(500).json({ error: 'Failed to sync orders' });
    }
});

// Get available lockers from Harbor API with search, filtering, and availability
// Simple geocoding cache to avoid repeated API calls
const geocodeCache = new Map();
const GEOCODE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

async function geocodeLocation(query) {
    const cacheKey = query.toLowerCase().trim();
    const cached = geocodeCache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp) < GEOCODE_CACHE_TTL) {
        return cached.coords;
    }

    try {
        // Add slight delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

        const response = await axios.get('https://nominatim.openstreetmap.org/search', {
            params: {
                q: query + ', USA',
                format: 'json',
                limit: 1
            },
            headers: { 'User-Agent': 'LockerDrop/1.0 (locker pickup service)' },
            timeout: 5000
        });

        if (response.data && response.data.length > 0) {
            const coords = {
                lat: parseFloat(response.data[0].lat),
                lon: parseFloat(response.data[0].lon)
            };
            geocodeCache.set(cacheKey, { coords, timestamp: Date.now() });
            return coords;
        }
    } catch (err) {
        logger.info(`⚠️ Geocoding error for "${query}": ${err.message}`);
    }

    return null;
}

// Calculate distance between two coordinates using Haversine formula (returns miles)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// In-memory cache for locker locations (refreshed every 5 minutes)
let lockerLocationsCache = { data: null, timestamp: 0 };
const LOCKER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Load locker locations from cache or static file (fast)
async function getLockerLocations() {
    const now = Date.now();

    // Return cached data if still fresh
    if (lockerLocationsCache.data && (now - lockerLocationsCache.timestamp) < LOCKER_CACHE_TTL) {
        return lockerLocationsCache.data;
    }

    // Load from static JSON file (much faster than Harbor API)
    try {
        const locationsPath = path.join(__dirname, 'public', 'harbor-locations.json');
        const locationsData = JSON.parse(fs.readFileSync(locationsPath, 'utf8'));

        // Transform to our format
        const lockers = locationsData.map(location => ({
            id: location.id,
            name: location.name || location.location_name,
            address: location.address1 || [location.street_address, location.city, location.state, location.zip].filter(Boolean).join(', '),
            city: location.city || '',
            state: location.state || '',
            zip: location.zip || '',
            latitude: location.lat || location.latitude || null,
            longitude: location.lon || location.longitude || null,
            available_sizes: ['Small', 'Medium', 'Large', 'X-Large']
        }));

        // Update cache
        lockerLocationsCache = { data: lockers, timestamp: now };
        logger.info(`📍 Loaded ${lockers.length} locker locations from static file`);
        return lockers;
    } catch (error) {
        logger.error('Failed to load static locker locations:', error.message);
        // Fall back to API if static file fails
        return null;
    }
}

app.get('/api/lockers/:shop', async (req, res) => {
    try {
        const { search, sizes, page = 1, limit = 12, includeAvailability, saved_only } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const shop = req.params.shop;

        // If saved_only is true, get the seller's saved locker IDs first
        let savedLockerIds = [];
        if (saved_only === 'true') {
            const prefsResult = await db.query(
                'SELECT location_id FROM locker_preferences WHERE shop = $1',
                [shop]
            );
            savedLockerIds = prefsResult.rows.map(r => r.location_id.toString());

            // If no saved lockers, return empty result immediately
            if (savedLockerIds.length === 0) {
                return res.json({
                    lockers: [],
                    pagination: { page: 1, limit: limitNum, totalCount: 0, totalPages: 0, hasMore: false }
                });
            }
        }

        // Step 1: Get locations from cache (fast) or static file
        let lockers = await getLockerLocations();

        // Fallback to Harbor API if static file unavailable
        if (!lockers) {
            const tokenResponse = await axios.post(
                'https://accounts.sandbox.harborlockers.com/realms/harbor/protocol/openid-connect/token',
                'grant_type=client_credentials&scope=service_provider&client_id=' + process.env.HARBOR_CLIENT_ID + '&client_secret=' + process.env.HARBOR_CLIENT_SECRET,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'accept': 'application/json' }}
            );
            const accessToken = tokenResponse.data.access_token;

            const lockersResponse = await axios.get('https://api.sandbox.harborlockers.com/api/v1/locations/', {
                headers: { 'Authorization': `Bearer ${accessToken}` },
                params: { limit: 500 }
            });

            lockers = lockersResponse.data.map(location => ({
                id: location.id,
                name: location.name || location.location_name,
                address: location.address || [location.street_address || location.address1, location.city, location.state, location.zip].filter(Boolean).join(', '),
                city: location.city || '',
                state: location.state || '',
                zip: location.zip || '',
                latitude: location.lat || location.latitude || null,
                longitude: location.lon || location.longitude || null,
                available_sizes: location.locker_sizes || ['Small', 'Medium', 'Large', 'X-Large']
            }));
        } else {
            // Clone the array to avoid modifying cached data
            lockers = [...lockers];
        }

        // Filter to saved lockers only if requested (do this first for performance)
        if (saved_only === 'true' && savedLockerIds.length > 0) {
            lockers = lockers.filter(locker => savedLockerIds.includes(locker.id.toString()));
        }

        // Apply search filter - try geocoding for distance search, fall back to text search
        if (search && search.trim()) {
            const searchQuery = search.trim();
            let useDistanceSearch = false;
            let searchCoords = null;

            // Try to geocode the search query for distance-based search (with caching)
            searchCoords = await geocodeLocation(searchQuery);
            if (searchCoords) {
                useDistanceSearch = true;
                logger.info(`📍 Geocoded "${searchQuery}" to ${searchCoords.lat}, ${searchCoords.lon}`);
            } else {
                logger.info(`⚠️ Could not geocode "${searchQuery}", using text search`);
            }

            if (useDistanceSearch && searchCoords) {
                // Distance-based search: filter within 50 miles and sort by distance
                const maxDistanceMiles = 50;

                const distanceResults = lockers
                    .map(locker => {
                        if (locker.latitude && locker.longitude) {
                            locker.distance = calculateDistance(
                                searchCoords.lat, searchCoords.lon,
                                locker.latitude, locker.longitude
                            );
                        } else {
                            locker.distance = Infinity;
                        }
                        return locker;
                    })
                    .filter(locker => locker.distance <= maxDistanceMiles)
                    .sort((a, b) => a.distance - b.distance);

                if (distanceResults.length > 0) {
                    lockers = distanceResults;
                    logger.info(`📍 Found ${lockers.length} lockers within ${maxDistanceMiles} miles of "${searchQuery}"`);
                } else {
                    // No lockers within 50 miles - fall back to text search
                    logger.info(`📍 No lockers within ${maxDistanceMiles} miles of "${searchQuery}", trying text search`);
                    useDistanceSearch = false;
                }
            }

            if (!useDistanceSearch) {
                // Text search fallback
                const searchLower = searchQuery.toLowerCase();
                const searchTerms = searchLower.split(/[,\s]+/).filter(t => t.length > 0);

                lockers = lockers.filter(locker => {
                    const lockerText = [
                        locker.city,
                        locker.state,
                        locker.zip,
                        locker.name,
                        locker.address
                    ].filter(Boolean).join(' ').toLowerCase();

                    return searchTerms.every(term => lockerText.includes(term));
                });
                logger.info(`📝 Text search for "${searchQuery}" found ${lockers.length} lockers`);
            }
        }

        // Total count before pagination
        const totalCount = lockers.length;
        const totalPages = Math.ceil(totalCount / limitNum);

        // Apply pagination
        const startIndex = (pageNum - 1) * limitNum;
        const paginatedLockers = lockers.slice(startIndex, startIndex + limitNum);

        // Fetch availability for each locker IN PARALLEL if requested (much faster)
        if (includeAvailability === 'true' && paginatedLockers.length > 0) {
            logger.info(`📦 Fetching availability for ${paginatedLockers.length} lockers...`);
            // Get Harbor token once
            const tokenResponse = await axios.post(
                'https://accounts.sandbox.harborlockers.com/realms/harbor/protocol/openid-connect/token',
                'grant_type=client_credentials&scope=service_provider&client_id=' + process.env.HARBOR_CLIENT_ID + '&client_secret=' + process.env.HARBOR_CLIENT_SECRET,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }}
            );
            const accessToken = tokenResponse.data.access_token;

            // Fetch all availabilities in parallel
            const availabilityPromises = paginatedLockers.map(async (locker) => {
                try {
                    const availabilityResponse = await axios.get(
                        `https://api.sandbox.harborlockers.com/api/v1/locations/${locker.id}/availability`,
                        { headers: { 'Authorization': `Bearer ${accessToken}` }, timeout: 5000 }
                    );

                    const availability = availabilityResponse.data;
                    locker.availability = {};

                    if (availability.byType && Array.isArray(availability.byType)) {
                        for (const type of availability.byType) {
                            const typeName = type.lockerType?.name || 'Unknown';
                            const available = type.lockerAvailability?.availableLockers || 0;
                            const total = type.lockerAvailability?.totalLockers || 0;
                            locker.availability[typeName] = { available, total };
                        }
                    } else if (availability.lockerAvailability) {
                        locker.availability['Total'] = {
                            available: availability.lockerAvailability.availableLockers || 0,
                            total: availability.lockerAvailability.totalLockers || 0
                        };
                    }

                    // If no availability data was parsed, set to null so frontend doesn't render empty badges
                    if (Object.keys(locker.availability).length === 0) {
                        logger.info(`📦 No availability data for locker ${locker.id} (${locker.name}):`, JSON.stringify(availability).substring(0, 200));
                        locker.availability = null;
                    }
                } catch (availError) {
                    logger.info(`⚠️ Failed to fetch availability for locker ${locker.id}: ${availError.message}`);
                    locker.availability = null;
                }
            });

            // Wait for all availability requests to complete
            await Promise.all(availabilityPromises);
        }

        // Apply size filter after fetching availability (filter out lockers without required sizes)
        let filteredLockers = paginatedLockers;
        if (sizes && includeAvailability === 'true') {
            const requiredSizes = sizes.split(',').map(s => s.trim().toLowerCase());
            filteredLockers = paginatedLockers.filter(locker => {
                if (!locker.availability) return true; // Include if we couldn't get availability
                const availableSizes = Object.keys(locker.availability).map(s => s.toLowerCase());
                return requiredSizes.some(rs =>
                    availableSizes.some(as => as.includes(rs)) &&
                    Object.entries(locker.availability).some(([name, data]) =>
                        name.toLowerCase().includes(rs) && data.available > 0
                    )
                );
            });
        }

        res.json({
            lockers: filteredLockers,
            pagination: {
                page: pageNum,
                limit: limitNum,
                totalCount,
                totalPages,
                hasMore: pageNum < totalPages
            }
        });
    } catch (error) {
        logger.error('Error fetching lockers:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to fetch lockers', details: error.response?.data || error.message });
    }
});

// Update order status
app.post('/api/order/:shop/:orderId/status', async (req, res) => {
    try {
        const { shop, orderId } = req.params;
        const { status } = req.body;

        // Remove # prefix if present (orderId comes as "#1029" from the modal)
        const orderNumber = orderId.replace(/^#/, '');

        logger.info(`📝 Updating order status: shop=${shop}, orderNumber=${orderNumber}, status=${status}`);

        // Map the status from frontend to database status
        let dbStatus;
        if (status === 'ready') {
            dbStatus = 'ready_for_pickup';
        } else if (status === 'picked_up' || status === 'completed') {
            dbStatus = 'completed';
        } else {
            dbStatus = status;
        }

        // Update order status in database
        const result = await db.query(
            'UPDATE orders SET status = $1, updated_at = NOW() WHERE shop = $2 AND order_number = $3 RETURNING id, order_number, status',
            [dbStatus, shop, orderNumber]
        );

        if (result.rows.length === 0) {
            logger.info(`❌ Order not found: ${orderNumber}`);
            return res.status(404).json({ error: 'Order not found' });
        }

        logger.info(`✅ Order ${orderNumber} updated to status: ${dbStatus}`);

        // Generate pickup link and send notification when status is "ready_for_pickup"
        if (dbStatus === 'ready_for_pickup') {
            // Get order details
            const orderDetails = await db.query(
                'SELECT id, shopify_order_id, customer_email, customer_name, customer_phone, pickup_link, locker_id, location_id FROM orders WHERE shop = $1 AND order_number = $2',
                [shop, orderNumber]
            );

            if (orderDetails.rows.length > 0) {
                const order = orderDetails.rows[0];
                let pickupUrl = order.pickup_link;

                // Generate pickup link if not already created and we have a locker_id
                if (!pickupUrl && order.locker_id) {
                    try {
                        logger.info(`🔗 Generating pickup link for order #${orderNumber}, locker_id: ${order.locker_id}`);

                        // Get Harbor token
                        const tokenResponse = await axios.post(
                            'https://accounts.sandbox.harborlockers.com/realms/harbor/protocol/openid-connect/token',
                            `grant_type=client_credentials&scope=service_provider&client_id=${process.env.HARBOR_CLIENT_ID}&client_secret=${process.env.HARBOR_CLIENT_SECRET}`,
                            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }}
                        );

                        const accessToken = tokenResponse.data.access_token;

                        // Create pickup request using the locker_id from when the item was dropped off
                        const pickupResponse = await axios.post(
                            'https://api.sandbox.harborlockers.com/api/v1/locker-open-requests/pickup-locker-request',
                            {
                                lockerId: order.locker_id,
                                keypadIntent: 'pickup',
                                persistKeypadCode: false,
                                returnUrl: `https://app.lockerdrop.it/pickup-success?order=${orderNumber}&shop=${order.shop}`,
                                clientInfo: `customer-${orderNumber}`,
                                payload: { order_id: order.shopify_order_id, order_number: orderNumber, customer_name: order.customer_name }
                            },
                            { headers: { 'Authorization': `Bearer ${accessToken}` }}
                        );

                        pickupUrl = pickupResponse.data.linkToken;
                        logger.info(`✅ Pickup link generated: ${pickupUrl}`);

                        // Save pickup link to database
                        await db.query(
                            'UPDATE orders SET pickup_link = $1, pickup_request_id = $2 WHERE id = $3',
                            [pickupUrl, pickupResponse.data.id, order.id]
                        );
                    } catch (pickupError) {
                        logger.error(`❌ Error generating pickup link:`, pickupError.response?.data || pickupError.message);
                    }
                }

                // Send email to customer
                if (order.customer_email && pickupUrl) {
                    await sendEmail(
                        order.customer_email,
                        `Your order #${orderNumber} is ready for pickup! 📦`,
                        `
                        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                            <h1 style="color: #5c6ac4;">Your Order is Ready! 🎉</h1>
                            <p>Hi ${order.customer_name || 'there'},</p>
                            <p>Great news! Your order <strong>#${orderNumber}</strong> has been dropped off at the locker and is ready for pickup.</p>

                            <div style="background: #f6f6f7; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                <h3 style="margin-top: 0;">Pickup Instructions:</h3>
                                <ol>
                                    <li>Go to the locker location</li>
                                    <li>Click the button below to open your locker</li>
                                    <li>Retrieve your package</li>
                                </ol>
                            </div>

                            <a href="${pickupUrl}" style="display: inline-block; background: #5c6ac4; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600;">
                                🔓 Open Locker & Pickup
                            </a>

                            <p style="margin-top: 20px; color: #6d7175; font-size: 14px;">
                                Please pick up your order within 5 days. If you have any questions, contact the seller.
                            </p>

                            <hr style="border: none; border-top: 1px solid #e1e3e5; margin: 30px 0;">
                            <p style="color: #6d7175; font-size: 12px;">Powered by LockerDrop.it</p>
                        </div>
                        `
                    );
                }

                // Send SMS to customer
                if (order.customer_phone && pickupUrl) {
                    await sendSMS(
                        order.customer_phone,
                        `LockerDrop: Your order #${orderNumber} is ready for pickup! Open your locker here: ${pickupUrl}`
                    );
                }
            }
        }

        res.json({ success: true, message: `Order ${orderNumber} marked as ${dbStatus}` });
    } catch (error) {
        logger.error('Error updating order status:', error);
        res.status(500).json({ error: 'Failed to update order status' });
    }
});

// Pickup complete callback - called from the success page when customer picks up
app.post('/api/pickup-complete', async (req, res) => {
    try {
        const { orderNumber, requestId, status } = req.body;

        logger.info(`📦 Pickup complete callback: order=${orderNumber}, requestId=${requestId}, status=${status}`);

        if (!orderNumber) {
            return res.status(400).json({ error: 'Order number required' });
        }

        // Find the order and update status to completed - include locker_id and tower_id for release
        const result = await db.query(
            "UPDATE orders SET status = 'completed', updated_at = NOW() WHERE order_number = $1 AND status = 'ready_for_pickup' RETURNING id, shop, shopify_order_id, order_number, customer_name, locker_id, tower_id",
            [orderNumber]
        );

        if (result.rows.length === 0) {
            logger.info(`⚠️ Order ${orderNumber} not found or already completed`);
            return res.json({ success: true, message: 'Order already processed or not found' });
        }

        const order = result.rows[0];
        logger.info(`✅ Order #${orderNumber} marked as completed (picked up by customer)`);

        // Release the locker in Harbor
        if (order.tower_id && order.locker_id) {
            try {
                logger.info(`🔓 Releasing locker ${order.locker_id} in tower ${order.tower_id}...`);
                const tokenResponse = await axios.post(
                    'https://accounts.sandbox.harborlockers.com/realms/harbor/protocol/openid-connect/token',
                    `grant_type=client_credentials&scope=service_provider&client_id=${process.env.HARBOR_CLIENT_ID}&client_secret=${process.env.HARBOR_CLIENT_SECRET}`,
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }}
                );
                const accessToken = tokenResponse.data.access_token;

                const releaseResponse = await axios.post(
                    `https://api.sandbox.harborlockers.com/api/v1/towers/${order.tower_id}/lockers/${order.locker_id}/release-locker`,
                    {},
                    { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }}
                );
                logger.info(`✅ Locker released successfully:`, releaseResponse.data?.status?.name || 'released');
            } catch (releaseError) {
                logger.info(`⚠️ Could not release locker: ${releaseError.response?.data?.detail || releaseError.message}`);
            }
        } else {
            logger.info(`⚠️ Cannot release locker - missing tower_id (${order.tower_id}) or locker_id (${order.locker_id})`);
        }

        // Fulfill the order in Shopify
        let fulfillmentWarning = null;
        if (order.shop && order.shopify_order_id) {
            logger.info(`🛍️ Fulfilling order ${order.shopify_order_id} in Shopify...`);
            const fulfillResult = await fulfillShopifyOrder(order.shop, order.shopify_order_id);
            if (fulfillResult.success) {
                logger.info(`✅ Order fulfilled in Shopify: ${fulfillResult.message}`);
            } else {
                logger.info(`⚠️ Shopify fulfillment issue: ${fulfillResult.message}`);
                if (fulfillResult.needsReauth) {
                    logger.info(`🔐 Re-authorization needed: ${fulfillResult.reauthUrl}`);
                    fulfillmentWarning = {
                        type: 'reauth_required',
                        message: 'Auto-fulfillment failed: App needs re-authorization to access fulfillment permissions.',
                        reauthUrl: fulfillResult.reauthUrl
                    };
                }
            }
        } else {
            logger.info(`⚠️ Cannot fulfill in Shopify - missing shop (${order.shop}) or shopify_order_id (${order.shopify_order_id})`);
        }

        // Log for seller notification (in production, you might send an email or push notification)
        logger.info(`📧 Notify seller: Customer picked up order #${orderNumber}`);

        const response = { success: true, message: `Order ${orderNumber} marked as completed` };
        if (fulfillmentWarning) {
            response.warning = fulfillmentWarning;
        }
        res.json(response);
    } catch (error) {
        logger.error('Error processing pickup complete:', error);
        res.status(500).json({ error: 'Failed to process pickup completion' });
    }
});

// Cancel locker request for an order
app.post('/api/order/:shop/:orderId/cancel-locker', async (req, res) => {
    try {
        const { shop, orderId } = req.params;
        const orderNumber = orderId.replace(/^#/, '');

        logger.info(`🚫 Cancelling locker request for order #${orderNumber}`);

        // Get the order details
        const orderResult = await db.query(
            'SELECT id, dropoff_request_id, pickup_request_id, status, locker_id, tower_id FROM orders WHERE shop = $1 AND order_number = $2',
            [shop, orderNumber]
        );

        if (orderResult.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const order = orderResult.rows[0];

        // Don't allow cancelling completed orders
        if (order.status === 'completed') {
            return res.status(400).json({ error: 'Cannot cancel a completed order' });
        }

        // Try to release the locker via Harbor API if we have tower_id and locker_id
        if (order.tower_id && order.locker_id) {
            try {
                const tokenResponse = await axios.post(
                    'https://accounts.sandbox.harborlockers.com/realms/harbor/protocol/openid-connect/token',
                    `grant_type=client_credentials&scope=service_provider&client_id=${process.env.HARBOR_CLIENT_ID}&client_secret=${process.env.HARBOR_CLIENT_SECRET}`,
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }}
                );
                const accessToken = tokenResponse.data.access_token;

                // Release the locker in Harbor
                logger.info(`   🔓 Releasing locker ${order.locker_id} in tower ${order.tower_id}...`);
                const releaseResponse = await axios.post(
                    `https://api.sandbox.harborlockers.com/api/v1/towers/${order.tower_id}/lockers/${order.locker_id}/release-locker`,
                    {},
                    { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }}
                );
                logger.info(`   ✅ Locker released:`, releaseResponse.data?.status?.name || 'released');
            } catch (harborError) {
                logger.info(`   ⚠️ Could not release locker: ${harborError.response?.data?.detail || harborError.message}`);
            }
        } else if (order.locker_id) {
            logger.info(`   ⚠️ Cannot release locker - missing tower_id`);
        }

        // Update order in database - clear locker info and set status to cancelled
        await db.query(
            `UPDATE orders SET
                status = 'cancelled',
                dropoff_link = NULL,
                pickup_link = NULL,
                locker_id = NULL,
                updated_at = NOW()
            WHERE id = $1`,
            [order.id]
        );

        logger.info(`✅ Order #${orderNumber} locker request cancelled`);

        res.json({ success: true, message: 'Locker request cancelled' });
    } catch (error) {
        logger.error('Error cancelling locker request:', error);
        res.status(500).json({ error: 'Failed to cancel locker request' });
    }
});

// Dropoff complete callback - called from the success page when seller drops off
app.post('/api/dropoff-complete', async (req, res) => {
    try {
        const { orderNumber, requestId, status, lockerId, towerId } = req.body;

        logger.info(`📦 Dropoff complete callback: order=${orderNumber}, requestId=${requestId}, status=${status}, lockerId=${lockerId}`);

        if (!orderNumber) {
            return res.status(400).json({ error: 'Order number required' });
        }

        // Find the order
        const orderResult = await db.query(
            "SELECT id, shop, shopify_order_id, customer_email, customer_name, customer_phone, locker_id, location_id FROM orders WHERE order_number = $1",
            [orderNumber]
        );

        if (orderResult.rows.length === 0) {
            logger.info(`⚠️ Order ${orderNumber} not found`);
            return res.json({ success: false, message: 'Order not found' });
        }

        const order = orderResult.rows[0];

        // Use locker_id from order first (most reliable), then callback, then fetch from Harbor
        // The order's locker_id is set when the dropoff link is created, so it should be correct
        let finalLockerId = order.locker_id || lockerId;
        logger.info(`📍 Locker ID sources - order.locker_id: ${order.locker_id}, callback lockerId: ${lockerId}, using: ${finalLockerId}`);

        // Get Harbor token
        const tokenResponse = await axios.post(
            'https://accounts.sandbox.harborlockers.com/realms/harbor/protocol/openid-connect/token',
            `grant_type=client_credentials&scope=service_provider&client_id=${process.env.HARBOR_CLIENT_ID}&client_secret=${process.env.HARBOR_CLIENT_SECRET}`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }}
        );
        const accessToken = tokenResponse.data.access_token;

        // If we don't have locker_id but have requestId, try to get it from the dropoff request
        let finalTowerId = towerId;
        if (!finalLockerId && requestId) {
            try {
                logger.info(`🔍 Fetching locker info from dropoff request ${requestId}`);
                const requestInfo = await axios.get(
                    `https://api.sandbox.harborlockers.com/api/v1/locker-open-requests/${requestId}`,
                    { headers: { 'Authorization': `Bearer ${accessToken}` }}
                );
                finalLockerId = requestInfo.data.lockerId || requestInfo.data.locker?.id;
                finalTowerId = requestInfo.data.towerId || finalTowerId;
                logger.info(`📍 Found locker ID: ${finalLockerId}, tower ID: ${finalTowerId}`);
            } catch (e) {
                logger.info(`⚠️ Could not fetch request info: ${e.response?.status || e.message}`);
            }
        }

        // Update order with locker_id and tower_id if we found them
        if (finalLockerId && !order.locker_id) {
            await db.query(
                "UPDATE orders SET locker_id = $1, tower_id = $2 WHERE order_number = $3",
                [finalLockerId, finalTowerId || null, orderNumber]
            );
            logger.info(`📍 Updated order with locker_id: ${finalLockerId}, tower_id: ${finalTowerId}`);
        }

        // Generate pickup link if we have a locker_id
        let pickupLink = null;
        if (finalLockerId) {
            try {
                logger.info(`🔗 Generating pickup link for order #${orderNumber} (locker: ${finalLockerId})`);

                // Create pickup request
                const pickupResponse = await axios.post(
                    'https://api.sandbox.harborlockers.com/api/v1/locker-open-requests/pickup-locker-request',
                    {
                        lockerId: parseInt(finalLockerId),
                        keypadIntent: 'pickup',
                        persistKeypadCode: false,
                        returnUrl: `https://app.lockerdrop.it/pickup-success?order=${orderNumber}&shop=${order.shop}`,
                        clientInfo: `customer-${orderNumber}`,
                        payload: { order_id: order.shopify_order_id, order_number: orderNumber }
                    },
                    { headers: { 'Authorization': `Bearer ${accessToken}` }}
                );

                pickupLink = pickupResponse.data.linkToken;
                logger.info(`✅ Pickup link generated: ${pickupLink}`);
            } catch (pickupError) {
                logger.error(`❌ Error generating pickup link:`, pickupError.response?.data || pickupError.message);
            }
        } else {
            logger.info(`⚠️ No locker_id available, cannot generate pickup link`);
        }

        // Update order status to ready_for_pickup and save pickup link
        await db.query(
            "UPDATE orders SET status = 'ready_for_pickup', pickup_link = COALESCE($1, pickup_link), updated_at = NOW() WHERE order_number = $2",
            [pickupLink, orderNumber]
        );

        logger.info(`✅ Order #${orderNumber} marked as ready_for_pickup`);

        // Send email to customer with pickup link
        if (order.customer_email && pickupLink) {
            // Generate change date link with verification token
            const changeDateToken = crypto.createHash('sha256')
                .update(orderNumber + order.customer_email + (process.env.SESSION_SECRET || 'lockerdrop'))
                .digest('hex')
                .substring(0, 16);
            const changeDateLink = `https://app.lockerdrop.it/change-pickup/${orderNumber}?token=${changeDateToken}`;

            await sendEmail(
                order.customer_email,
                `Your order #${orderNumber} is ready for pickup! 📦`,
                `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h1 style="color: #5c6ac4;">Your Order is Ready! 🎉</h1>
                    <p>Hi ${order.customer_name || 'there'},</p>
                    <p>Great news! Your order <strong>#${orderNumber}</strong> has been dropped off at the locker and is ready for pickup.</p>

                    <div style="background: #f6f6f7; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="margin-top: 0;">Pickup Instructions:</h3>
                        <ol>
                            <li>Go to the locker location</li>
                            <li>Click the button below to open your locker</li>
                            <li>Retrieve your package</li>
                        </ol>
                    </div>

                    <a href="${pickupLink}" style="display: inline-block; background: #5c6ac4; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600;">
                        🔓 Open Locker & Pickup
                    </a>

                    <p style="margin-top: 20px; color: #6d7175; font-size: 14px;">
                        Please pick up your order within 5 days.
                    </p>

                    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e1e3e5;">
                        <p style="color: #6d7175; font-size: 14px; margin: 0;">
                            Need to change your pickup date?
                            <a href="${changeDateLink}" style="color: #5c6ac4;">Change pickup date</a>
                        </p>
                    </div>

                    <hr style="border: none; border-top: 1px solid #e1e3e5; margin: 30px 0;">
                    <p style="color: #6d7175; font-size: 12px;">Powered by LockerDrop.it</p>
                </div>
                `
            );
            logger.info(`📧 Pickup email sent to ${order.customer_email}`);
        }

        // Send SMS to customer
        if (order.customer_phone && pickupLink) {
            await sendSMS(
                order.customer_phone,
                `LockerDrop: Your order #${orderNumber} is ready for pickup! Open your locker here: ${pickupLink}`
            );
            logger.info(`📱 Pickup SMS sent to ${order.customer_phone}`);
        }

        res.json({ success: true, message: `Order ${orderNumber} ready for pickup, customer notified` });
    } catch (error) {
        logger.error('Error processing dropoff complete:', error);
        res.status(500).json({ error: 'Failed to process dropoff completion' });
    }
});

// Resend pickup notification to customer (SMS and/or Email)
app.post('/api/resend-notification/:orderNumber', (req, res, next) => {
    // Verify session is authenticated
    if (req.session && req.session.authenticated) {
        return next();
    }
    return res.status(401).json({ error: 'Unauthorized' });
}, async (req, res) => {
    try {
        const { orderNumber } = req.params;
        const { type } = req.body; // 'sms', 'email', or 'both'

        // Get order details
        const orderResult = await db.query(
            "SELECT id, order_number, customer_email, customer_name, customer_phone, pickup_link, status FROM orders WHERE order_number = $1",
            [orderNumber]
        );

        if (orderResult.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const order = orderResult.rows[0];

        if (!order.pickup_link) {
            return res.status(400).json({ error: 'No pickup link available for this order' });
        }

        if (order.status !== 'ready_for_pickup' && order.status !== 'dropped_off') {
            return res.status(400).json({ error: `Cannot resend notification - order status is "${order.status}"` });
        }

        let emailSent = false;
        let smsSent = false;

        // Send email
        if ((type === 'email' || type === 'both') && order.customer_email) {
            // Generate change date link with verification token
            const changeDateToken = crypto.createHash('sha256')
                .update(orderNumber + order.customer_email + (process.env.SESSION_SECRET || 'lockerdrop'))
                .digest('hex')
                .substring(0, 16);
            const changeDateLink = `https://app.lockerdrop.it/change-pickup/${orderNumber}?token=${changeDateToken}`;

            await sendEmail(
                order.customer_email,
                `Reminder: Your order #${orderNumber} is ready for pickup! 📦`,
                `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h1 style="color: #5c6ac4;">Pickup Reminder 🔔</h1>
                    <p>Hi ${order.customer_name || 'there'},</p>
                    <p>Just a reminder that your order <strong>#${orderNumber}</strong> is waiting for you at the locker!</p>

                    <a href="${order.pickup_link}" style="display: inline-block; background: #5c6ac4; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600;">
                        🔓 Open Locker & Pickup
                    </a>

                    <p style="margin-top: 20px; color: #6d7175; font-size: 14px;">
                        Please pick up your order soon. If you have any questions, contact the seller.
                    </p>

                    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e1e3e5;">
                        <p style="color: #6d7175; font-size: 14px; margin: 0;">
                            Need to change your pickup date?
                            <a href="${changeDateLink}" style="color: #5c6ac4;">Change pickup date</a>
                        </p>
                    </div>

                    <hr style="border: none; border-top: 1px solid #e1e3e5; margin: 30px 0;">
                    <p style="color: #6d7175; font-size: 12px;">Powered by LockerDrop.it</p>
                </div>
                `
            );
            emailSent = true;
            logger.info(`📧 Resent pickup email to ${order.customer_email} for order #${orderNumber}`);
        }

        // Send SMS
        if ((type === 'sms' || type === 'both') && order.customer_phone) {
            await sendSMS(
                order.customer_phone,
                `LockerDrop Reminder: Your order #${orderNumber} is waiting for pickup! Open your locker here: ${order.pickup_link}`
            );
            smsSent = true;
            logger.info(`📱 Resent pickup SMS to ${order.customer_phone} for order #${orderNumber}`);
        }

        if (!emailSent && !smsSent) {
            return res.status(400).json({ error: 'No contact info available (no email or phone on file)' });
        }

        res.json({
            success: true,
            message: `Notification resent`,
            emailSent,
            smsSent
        });
    } catch (error) {
        logger.error('Error resending notification:', error);
        res.status(500).json({ error: 'Failed to resend notification' });
    }
});

// Serve pickup success page
app.get('/pickup-success', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/pickup-success.html'));
});

// Serve dropoff success page
app.get('/dropoff-success', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/dropoff-success.html'));
});

// ============================================
// SUBSCRIPTION PLANS & BILLING
// ============================================

// Plan definitions with feature flags
const PLANS = {
    trial: {
        name: 'Trial',
        price: 0,
        orderLimit: 25,
        trialDays: 3,
        features: { checkoutBlock: false, orderStatusBlock: false, customBranding: false, rebuyIntegration: false }
    },
    basic: {
        name: 'Basic',
        price: 9.00,
        orderLimit: 25,
        features: { checkoutBlock: false, orderStatusBlock: false, customBranding: false, rebuyIntegration: false }
    },
    pro: {
        name: 'Pro',
        price: 29.00,
        orderLimit: 100,
        features: { checkoutBlock: false, orderStatusBlock: false, customBranding: false, rebuyIntegration: false }
    },
    enterprise: {
        name: 'Enterprise',
        price: 99.00,
        orderLimit: -1, // -1 = unlimited
        features: { checkoutBlock: true, orderStatusBlock: true, customBranding: true, rebuyIntegration: true }
    }
};

// Get or create subscription for a shop
async function getOrCreateSubscription(shop) {
    let result = await db.query('SELECT * FROM subscriptions WHERE shop = $1', [shop]);

    if (result.rows.length === 0) {
        // Create new trial subscription
        const trialEnds = new Date();
        trialEnds.setDate(trialEnds.getDate() + PLANS.trial.trialDays);

        result = await db.query(`
            INSERT INTO subscriptions (shop, plan_name, status, monthly_order_limit, trial_ends_at, billing_cycle_start)
            VALUES ($1, 'trial', 'trial', $2, $3, NOW())
            RETURNING *
        `, [shop, PLANS.trial.orderLimit, trialEnds]);
    }

    return result.rows[0];
}

// Check if shop can process more orders
// NOTE: Subscription plans disabled - charging $1 per order via shipping rate instead
async function canProcessOrder(shop) {
    const sub = await getOrCreateSubscription(shop);

    // DISABLED: All subscription checks bypassed - revenue collected via $1 shipping fee
    // To re-enable subscription plans, uncomment the checks below:

    /*
    // Check trial expiry
    if (sub.status === 'trial' && new Date(sub.trial_ends_at) < new Date()) {
        return { allowed: false, reason: 'trial_expired', subscription: sub };
    }

    // Check order limit (-1 = unlimited)
    if (sub.monthly_order_limit !== -1 && sub.orders_this_month >= sub.monthly_order_limit) {
        return { allowed: false, reason: 'limit_reached', subscription: sub };
    }

    // Check if subscription is active
    if (sub.status !== 'trial' && sub.status !== 'active') {
        return { allowed: false, reason: 'inactive', subscription: sub };
    }
    */

    // Always allow - $1 fee collected at checkout
    return { allowed: true, subscription: sub };
}

// Increment order count
async function incrementOrderCount(shop) {
    await db.query(`
        UPDATE subscriptions
        SET orders_this_month = orders_this_month + 1, updated_at = NOW()
        WHERE shop = $1
    `, [shop]);
}

// Reset monthly order counts (run on 1st of month)
async function resetMonthlyOrderCounts() {
    await db.query(`
        UPDATE subscriptions
        SET orders_this_month = 0, billing_cycle_start = NOW(), updated_at = NOW()
    `);
    logger.info('📅 Monthly order counts reset');
}

// Get subscription status
app.get('/api/subscription/:shop', async (req, res) => {
    try {
        const { shop } = req.params;
        const subscription = await getOrCreateSubscription(shop);

        const plan = PLANS[subscription.plan_name] || PLANS.trial;
        const daysLeft = subscription.status === 'trial'
            ? Math.max(0, Math.ceil((new Date(subscription.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24)))
            : null;

        res.json({
            plan: subscription.plan_name,
            planName: plan.name,
            status: subscription.status,
            price: plan.price,
            orderLimit: subscription.monthly_order_limit,
            ordersUsed: subscription.orders_this_month,
            ordersRemaining: subscription.monthly_order_limit === -1
                ? 'unlimited'
                : Math.max(0, subscription.monthly_order_limit - subscription.orders_this_month),
            trialDaysLeft: daysLeft,
            trialEndsAt: subscription.trial_ends_at,
            billingCycleStart: subscription.billing_cycle_start,
            features: plan.features || {}
        });
    } catch (error) {
        logger.error('Error getting subscription:', error);
        res.status(500).json({ error: 'Failed to get subscription' });
    }
});

// ============================================
// SHOP SETTINGS
// ============================================

// Get shop settings
app.get('/api/settings/:shop', async (req, res) => {
    try {
        const { shop } = req.params;

        let result = await db.query('SELECT * FROM shop_settings WHERE shop = $1', [shop]);

        if (result.rows.length === 0) {
            // Create default settings with fulfillment defaults
            result = await db.query(`
                INSERT INTO shop_settings (shop, free_pickup, hold_time_days, processing_days, fulfillment_days, vacation_days)
                VALUES ($1, false, 5, 1, ARRAY['monday','tuesday','wednesday','thursday','friday'], ARRAY[]::DATE[])
                RETURNING *
            `, [shop]);
        }

        const settings = result.rows[0];
        res.json({
            freePickup: settings.free_pickup,
            holdTimeDays: settings.hold_time_days,
            processingDays: settings.processing_days || 1,
            fulfillmentDays: settings.fulfillment_days || ['monday','tuesday','wednesday','thursday','friday'],
            vacationDays: settings.vacation_days || [],
            useCheckoutExtension: settings.use_checkout_extension || false
        });
    } catch (error) {
        logger.error('Error getting settings:', error);
        res.status(500).json({ error: 'Failed to get settings' });
    }
});

// Save shop settings
app.post('/api/settings/:shop', requireApiAuth, async (req, res) => {
    try {
        const { shop } = req.params;
        const { freePickup, holdTimeDays, processingDays, fulfillmentDays, vacationDays, useCheckoutExtension } = req.body;

        await db.query(`
            INSERT INTO shop_settings (shop, free_pickup, hold_time_days, processing_days, fulfillment_days, vacation_days, use_checkout_extension, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            ON CONFLICT (shop) DO UPDATE SET
                free_pickup = $2,
                hold_time_days = $3,
                processing_days = $4,
                fulfillment_days = $5,
                vacation_days = $6,
                use_checkout_extension = $7,
                updated_at = NOW()
        `, [
            shop,
            freePickup || false,
            holdTimeDays || 5,
            processingDays || 1,
            fulfillmentDays || ['monday','tuesday','wednesday','thursday','friday'],
            vacationDays || [],
            useCheckoutExtension || false
        ]);

        logger.info(`✅ Settings saved for ${shop}: freePickup=${freePickup}, processingDays=${processingDays}, useCheckoutExtension=${useCheckoutExtension}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error saving settings:', error);
        res.status(500).json({ error: 'Failed to save settings' });
    }
});

// Get available pickup dates for next 7 days
app.get('/api/available-pickup-dates/:shop', async (req, res) => {
    try {
        const { shop } = req.params;

        // Get shop settings
        const settingsResult = await db.query(
            'SELECT processing_days, fulfillment_days, vacation_days FROM shop_settings WHERE shop = $1',
            [shop]
        );

        const settings = settingsResult.rows[0] || {
            processing_days: 1,
            fulfillment_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
            vacation_days: []
        };

        const processingDays = settings.processing_days || 1;
        const fulfillmentDays = settings.fulfillment_days || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
        const vacationDays = (settings.vacation_days || []).map(d => {
            if (d instanceof Date) return d.toISOString().split('T')[0];
            return d;
        });

        // Calculate available dates
        const dates = [];
        const current = new Date();
        current.setHours(0, 0, 0, 0);

        // Start after processing days
        current.setDate(current.getDate() + processingDays);

        // Find next 7 available pickup dates
        let daysChecked = 0;
        const maxDaysToCheck = 30; // Safety limit

        while (dates.length < 7 && daysChecked < maxDaysToCheck) {
            current.setDate(current.getDate() + 1);
            daysChecked++;

            const dayName = current.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
            const dateStr = current.toISOString().split('T')[0];

            // Check if this is a fulfillment day and not a vacation day
            if (fulfillmentDays.includes(dayName) && !vacationDays.includes(dateStr)) {
                dates.push({
                    date: dateStr,
                    dayName: current.toLocaleDateString('en-US', { weekday: 'short' }),
                    monthDay: current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                    display: current.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                });
            }
        }

        res.json({
            dates,
            processingDays,
            fulfillmentDays,
            vacationDays
        });

    } catch (error) {
        logger.error('Error getting available pickup dates:', error);
        res.status(500).json({ error: 'Failed to get available dates' });
    }
});

// Get order pickup details for date change page
app.get('/api/order-pickup-details/:orderNumber', async (req, res) => {
    try {
        const { orderNumber } = req.params;
        const token = req.query.token;

        // Find order by order number (strip # if present)
        const cleanOrderNumber = orderNumber.replace(/^#/, '');

        const result = await db.query(
            `SELECT o.*, s.shop as shop_domain
             FROM orders o
             LEFT JOIN shops s ON o.shop_id = s.id
             WHERE o.order_number = $1 OR o.shopify_order_id::text = $1`,
            [cleanOrderNumber]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const order = result.rows[0];

        // Parse locker info from address2 if available
        let lockerName = null;
        if (order.locker_name) {
            lockerName = order.locker_name;
        } else if (order.shipping_address) {
            const address = typeof order.shipping_address === 'string'
                ? JSON.parse(order.shipping_address)
                : order.shipping_address;
            const addr2 = address.address2 || '';
            const match = addr2.match(/LockerDrop:\s*([^(]+)/);
            if (match) lockerName = match[1].trim();
        }

        // Check if token is valid (simple hash check)
        let tokenValid = false;
        if (token && order.customer_email) {
            const expectedToken = crypto.createHash('sha256')
                .update(cleanOrderNumber + order.customer_email + (process.env.SESSION_SECRET || 'lockerdrop'))
                .digest('hex')
                .substring(0, 16);
            tokenValid = (token === expectedToken);
        }

        res.json({
            orderNumber: order.order_number || cleanOrderNumber,
            lockerName,
            currentDate: order.preferred_pickup_date,
            shop: order.shop_domain || order.shop,
            email: tokenValid ? order.customer_email : null,
            tokenValid
        });

    } catch (error) {
        logger.error('Error getting order pickup details:', error);
        res.status(500).json({ error: 'Failed to load order details' });
    }
});

// Verify email matches order for date change
app.post('/api/verify-order-email/:orderNumber', async (req, res) => {
    try {
        const { orderNumber } = req.params;
        const { email } = req.body;

        const cleanOrderNumber = orderNumber.replace(/^#/, '');

        const result = await db.query(
            `SELECT customer_email FROM orders
             WHERE (order_number = $1 OR shopify_order_id::text = $1)
             AND LOWER(customer_email) = LOWER($2)`,
            [cleanOrderNumber, email]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ verified: false, error: 'Email does not match this order' });
        }

        res.json({ verified: true });

    } catch (error) {
        logger.error('Error verifying email:', error);
        res.status(500).json({ error: 'Failed to verify email' });
    }
});

// Update pickup date for an order
app.post('/api/update-pickup-date/:shop/:orderNumber', async (req, res) => {
    try {
        const { shop, orderNumber } = req.params;
        const { email, newDate } = req.body;

        const cleanOrderNumber = orderNumber.replace(/^#/, '');

        // Verify email matches
        const orderResult = await db.query(
            `SELECT id, customer_email, customer_name, preferred_pickup_date
             FROM orders
             WHERE (order_number = $1 OR shopify_order_id::text = $1)
             AND LOWER(customer_email) = LOWER($2)`,
            [cleanOrderNumber, email]
        );

        if (orderResult.rows.length === 0) {
            return res.status(400).json({ error: 'Order not found or email mismatch' });
        }

        const order = orderResult.rows[0];

        // Update the pickup date
        await db.query(
            'UPDATE orders SET preferred_pickup_date = $1 WHERE id = $2',
            [newDate, order.id]
        );

        // Send confirmation email
        try {
            const displayDate = new Date(newDate + 'T00:00:00').toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric'
            });

            await sendEmail(
                order.customer_email,
                'Pickup Date Updated - LockerDrop',
                `Hi ${order.customer_name || 'there'},\n\nYour pickup date has been updated to ${displayDate}.\n\nYour order #${cleanOrderNumber} will be ready for pickup at the locker on this date.\n\nThank you for using LockerDrop!`,
                `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #667eea;">Pickup Date Updated</h2>
                    <p>Hi ${order.customer_name || 'there'},</p>
                    <p>Your pickup date has been updated to:</p>
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                        <div style="font-size: 24px; font-weight: bold;">${displayDate}</div>
                    </div>
                    <p>Your order #${cleanOrderNumber} will be ready for pickup at the locker on this date.</p>
                    <p>Thank you for using LockerDrop!</p>
                </div>`
            );
        } catch (emailErr) {
            logger.error('Failed to send date update email:', emailErr);
            // Don't fail the request if email fails
        }

        logger.info(`Pickup date updated for order ${cleanOrderNumber}: ${order.preferred_pickup_date} -> ${newDate}`);

        res.json({ success: true, newDate });

    } catch (error) {
        logger.error('Error updating pickup date:', error);
        res.status(500).json({ error: 'Failed to update pickup date' });
    }
});

// Serve date change page
app.get('/change-pickup/:orderNumber', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'change-pickup-date.html'));
});

// Get available plans
app.get('/api/plans', (req, res) => {
    const plans = Object.entries(PLANS)
        .filter(([key]) => key !== 'trial')
        .map(([key, plan]) => ({
            id: key,
            name: plan.name,
            price: plan.price,
            orderLimit: plan.orderLimit === -1 ? 'Unlimited' : plan.orderLimit,
            features: getPlanFeatures(key)
        }));

    res.json({ plans });
});

function getPlanFeatures(planId) {
    const features = {
        basic: [
            '25 LockerDrop orders/month',
            'Email notifications',
            'Basic support',
            'Dashboard access'
        ],
        pro: [
            '100 LockerDrop orders/month',
            'Email & SMS notifications',
            'Priority support',
            'Dashboard access',
            'Analytics'
        ],
        enterprise: [
            'Unlimited orders',
            'Email & SMS notifications',
            'Dedicated support',
            'Dashboard access',
            'Advanced analytics',
            'Checkout UI block',
            'Order status page block',
            'Custom branded pickup page',
            'Upsell widgets on success page',
            'Rebuy integration'
        ]
    };
    return features[planId] || [];
}

// Create subscription charge via Shopify Billing API
app.post('/api/subscribe/:shop', async (req, res) => {
    try {
        const { shop } = req.params;
        const { planId } = req.body;

        const plan = PLANS[planId];
        if (!plan || planId === 'trial') {
            return res.status(400).json({ error: 'Invalid plan' });
        }

        // Get access token
        let accessToken = accessTokens.get(shop);
        if (!accessToken) {
            const result = await db.query('SELECT access_token FROM stores WHERE shop = $1', [shop]);
            if (result.rows.length > 0) {
                accessToken = result.rows[0].access_token;
                accessTokens.set(shop, accessToken);
            }
        }

        if (!accessToken) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        // Create recurring application charge via Shopify GraphQL API
        const mutation = `
            mutation AppSubscriptionCreate($name: String!, $returnUrl: URL!, $trialDays: Int, $lineItems: [AppSubscriptionLineItemInput!]!) {
                appSubscriptionCreate(
                    name: $name,
                    returnUrl: $returnUrl,
                    trialDays: $trialDays,
                    lineItems: $lineItems
                ) {
                    appSubscription {
                        id
                        status
                    }
                    confirmationUrl
                    userErrors {
                        field
                        message
                    }
                }
            }
        `;

        const variables = {
            name: `LockerDrop ${plan.name} Plan`,
            returnUrl: `https://${process.env.SHOPIFY_HOST}/api/subscription/confirm?shop=${shop}&plan=${planId}`,
            trialDays: 3,
            lineItems: [{
                plan: {
                    appRecurringPricingDetails: {
                        price: { amount: plan.price, currencyCode: "USD" },
                        interval: "EVERY_30_DAYS"
                    }
                }
            }]
        };

        const response = await axios.post(
            `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
            { query: mutation, variables },
            { headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' } }
        );

        const result = response.data.data.appSubscriptionCreate;

        if (result.userErrors && result.userErrors.length > 0) {
            logger.error('Shopify billing error:', result.userErrors);
            return res.status(400).json({ error: result.userErrors[0].message });
        }

        // Return confirmation URL for merchant to approve
        res.json({
            confirmationUrl: result.confirmationUrl,
            subscriptionId: result.appSubscription?.id
        });

    } catch (error) {
        logger.error('Error creating subscription:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to create subscription' });
    }
});

// Subscription confirmation callback
app.get('/api/subscription/confirm', async (req, res) => {
    try {
        const { shop, plan, charge_id } = req.query;

        if (!charge_id) {
            // User declined
            return res.redirect(`/admin/dashboard?shop=${shop}&billing=cancelled`);
        }

        const planConfig = PLANS[plan];
        if (!planConfig) {
            return res.redirect(`/admin/dashboard?shop=${shop}&billing=error`);
        }

        // Update subscription in database
        await db.query(`
            UPDATE subscriptions
            SET plan_name = $1, status = 'active', shopify_charge_id = $2,
                monthly_order_limit = $3, orders_this_month = 0,
                billing_cycle_start = NOW(), updated_at = NOW()
            WHERE shop = $4
        `, [plan, charge_id, planConfig.orderLimit, shop]);

        logger.info(`✅ Subscription activated: ${shop} -> ${plan}`);

        // Redirect to dashboard with success message
        res.redirect(`/admin/dashboard?shop=${shop}&billing=success&plan=${plan}`);

    } catch (error) {
        logger.error('Error confirming subscription:', error);
        res.redirect(`/admin/dashboard?shop=${req.query.shop}&billing=error`);
    }
});

// Cancel subscription
app.post('/api/subscription/cancel/:shop', async (req, res) => {
    try {
        const { shop } = req.params;

        // Get current subscription
        const subResult = await db.query('SELECT * FROM subscriptions WHERE shop = $1', [shop]);
        if (subResult.rows.length === 0) {
            return res.status(404).json({ error: 'No subscription found' });
        }

        const subscription = subResult.rows[0];

        // Get access token
        let accessToken = accessTokens.get(shop);
        if (!accessToken) {
            const result = await db.query('SELECT access_token FROM stores WHERE shop = $1', [shop]);
            if (result.rows.length > 0) {
                accessToken = result.rows[0].access_token;
            }
        }

        // Cancel via Shopify API if there's a charge ID
        if (subscription.shopify_charge_id && accessToken) {
            try {
                const mutation = `
                    mutation AppSubscriptionCancel($id: ID!) {
                        appSubscriptionCancel(id: $id) {
                            appSubscription { id status }
                            userErrors { field message }
                        }
                    }
                `;

                await axios.post(
                    `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
                    { query: mutation, variables: { id: subscription.shopify_charge_id } },
                    { headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' } }
                );
            } catch (e) {
                logger.info('Could not cancel Shopify subscription:', e.message);
            }
        }

        // Update local status
        await db.query(`
            UPDATE subscriptions
            SET status = 'cancelled', updated_at = NOW()
            WHERE shop = $1
        `, [shop]);

        res.json({ success: true, message: 'Subscription cancelled' });

    } catch (error) {
        logger.error('Error cancelling subscription:', error);
        res.status(500).json({ error: 'Failed to cancel subscription' });
    }
});

// Dev mode: Switch plan freely (only for test stores)
const DEV_STORES = ['enna-test.myshopify.com'];

app.post('/api/subscription/dev-switch/:shop', async (req, res) => {
    try {
        const { shop } = req.params;
        const { planId } = req.body;

        // Only allow for dev stores
        if (!DEV_STORES.includes(shop)) {
            return res.status(403).json({ error: 'Dev mode only available for test stores' });
        }

        const plan = PLANS[planId];
        if (!plan) {
            return res.status(400).json({ error: 'Invalid plan' });
        }

        // Update subscription directly without Shopify billing
        await db.query(`
            UPDATE subscriptions
            SET plan_name = $1, status = 'active', monthly_order_limit = $2,
                orders_this_month = 0, billing_cycle_start = NOW(), updated_at = NOW()
            WHERE shop = $3
        `, [planId, plan.orderLimit, shop]);

        logger.info(`🔧 DEV: Switched ${shop} to ${planId} plan`);
        res.json({ success: true, plan: planId, message: `Switched to ${plan.name} plan` });

    } catch (error) {
        logger.error('Error switching plan:', error);
        res.status(500).json({ error: 'Failed to switch plan' });
    }
});

// ============================================
// PRODUCT SIZE SETTINGS API
// ============================================

// Get all products from Shopify for a shop
app.get('/api/products/:shop', async (req, res) => {
    try {
        const { shop } = req.params;
        logger.info(`📦 Loading products for shop: ${shop}`);

        // Get access token
        let accessToken = accessTokens.get(shop);
        if (!accessToken) {
            logger.info(`   Looking up token in database...`);
            const result = await db.query('SELECT access_token FROM stores WHERE shop = $1', [shop]);
            if (result.rows.length > 0) {
                accessToken = result.rows[0].access_token;
                accessTokens.set(shop, accessToken);
                logger.info(`   Found token: ${accessToken.substring(0, 15)}...`);
            } else {
                logger.info(`   No token found for shop: ${shop}`);
            }
        }

        if (!accessToken) {
            return res.status(401).json({ error: 'Not authenticated. Please reinstall the app.' });
        }

        // Fetch products from Shopify (using GraphQL API)
        logger.info(`   Fetching products from Shopify GraphQL API...`);
        const shopifyProducts = await fetchProductsGraphQL(shop, accessToken, 250);
        logger.info(`   Fetched ${shopifyProducts.length} products`);

        // Get existing size mappings from our database
        const sizeMappings = await db.query(
            'SELECT * FROM product_locker_sizes WHERE shop = $1',
            [shop]
        );

        // Create a lookup map
        const sizeMap = {};
        for (const mapping of sizeMappings.rows) {
            const key = mapping.variant_id ? `${mapping.product_id}-${mapping.variant_id}` : mapping.product_id;
            sizeMap[key] = mapping;
        }

        // Merge product data with size mappings
        const products = shopifyProducts.map(product => {
            const variants = product.variants.map(variant => {
                const key = `${product.id}-${variant.id}`;
                const mapping = sizeMap[key] || sizeMap[product.id.toString()];
                return {
                    id: variant.id,
                    title: variant.title,
                    sku: variant.sku,
                    weight: variant.weight,
                    weight_unit: variant.weight_unit,
                    // Size settings from our DB (or defaults)
                    length_inches: mapping?.length_inches || 0,
                    width_inches: mapping?.width_inches || 0,
                    height_inches: mapping?.height_inches || 0,
                    locker_size: mapping?.locker_size || null,
                    excluded: mapping?.excluded || false
                };
            });

            return {
                id: product.id,
                title: product.title,
                image: product.image || null,
                price: product.variants[0]?.price || null,
                variants
            };
        });

        res.json({ products });
    } catch (error) {
        logger.error('Error fetching products:', error.response?.data || error.message);

        // Check if it's an auth error
        if (error.response?.status === 401 || error.response?.data?.errors?.includes('Invalid API key')) {
            return res.status(401).json({
                error: 'Access token expired or revoked. Please reinstall the app from Shopify.',
                needsReauth: true
            });
        }

        res.status(500).json({ error: 'Failed to fetch products: ' + (error.response?.data?.errors || error.message) });
    }
});

// Save product size settings
app.post('/api/product-sizes/:shop', async (req, res) => {
    try {
        const { shop } = req.params;
        const { products } = req.body; // Array of { product_id, product_title, variant_id, variant_title, length, width, height, locker_size, excluded }

        for (const product of products) {
            await db.query(`
                INSERT INTO product_locker_sizes
                    (shop, product_id, product_title, variant_id, variant_title, length_inches, width_inches, height_inches, locker_size, excluded, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
                ON CONFLICT (shop, product_id, variant_id)
                DO UPDATE SET
                    product_title = $3,
                    variant_title = $5,
                    length_inches = $6,
                    width_inches = $7,
                    height_inches = $8,
                    locker_size = $9,
                    excluded = $10,
                    updated_at = NOW()
            `, [
                shop,
                product.product_id.toString(),
                product.product_title,
                product.variant_id?.toString() || null,
                product.variant_title || null,
                product.length || 0,
                product.width || 0,
                product.height || 0,
                product.locker_size || 'medium',
                product.excluded || false
            ]);
        }

        res.json({ success: true, message: `Saved ${products.length} product settings` });
    } catch (error) {
        logger.error('Error saving product sizes:', error);
        res.status(500).json({ error: 'Failed to save product sizes' });
    }
});

// Get saved product sizes for order calculation
app.get('/api/product-sizes/:shop', async (req, res) => {
    try {
        const { shop } = req.params;
        const result = await db.query(
            'SELECT * FROM product_locker_sizes WHERE shop = $1',
            [shop]
        );
        res.json({ sizes: result.rows });
    } catch (error) {
        logger.error('Error fetching product sizes:', error);
        res.status(500).json({ error: 'Failed to fetch product sizes' });
    }
});

// ============================================
// DOCUMENTATION ROUTES
// ============================================

// Serve documentation pages
app.get('/docs/training', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/docs/training.html'));
});

app.get('/docs/faq', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/docs/faq.html'));
});

app.get('/docs/customer-faq', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/docs/customer-faq.html'));
});

// Privacy policy
app.get('/privacy', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/privacy-policy.html'));
});
app.get('/privacy-policy', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/privacy-policy.html'));
});

// Get dashboard stats
app.get('/api/stats/:shop', async (req, res) => {
    try {
        const { shop } = req.params;

        const pendingDropoffs = await db.query(
            "SELECT COUNT(*) FROM orders WHERE shop = $1 AND status = 'pending_dropoff'",
            [shop]
        );

        const readyForPickup = await db.query(
            "SELECT COUNT(*) FROM orders WHERE shop = $1 AND status = 'ready_for_pickup'",
            [shop]
        );

        const completedThisWeek = await db.query(
            "SELECT COUNT(*) FROM orders WHERE shop = $1 AND status = 'completed' AND created_at > NOW() - INTERVAL '7 days'",
            [shop]
        );

        const activeLockers = await db.query(
            "SELECT COUNT(*) FROM locker_preferences WHERE shop = $1",
            [shop]
        );

        // Count future dropoffs (pending orders with pickup date in the future)
        const futureDropoffs = await db.query(
            "SELECT COUNT(*) FROM orders WHERE shop = $1 AND status = 'pending_dropoff' AND preferred_pickup_date > CURRENT_DATE",
            [shop]
        );

        // Get next dropoff location (most common location for pending orders)
        let nextDropoffLocation = null;
        const pendingCount = parseInt(pendingDropoffs.rows[0].count);
        if (pendingCount > 0) {
            const nextLocation = await db.query(`
                SELECT lp.location_name, o.location_id
                FROM orders o
                LEFT JOIN locker_preferences lp ON o.location_id = lp.location_id AND o.shop = lp.shop
                WHERE o.shop = $1 AND o.status = 'pending_dropoff'
                GROUP BY lp.location_name, o.location_id
                ORDER BY COUNT(*) DESC
                LIMIT 1
            `, [shop]);

            if (nextLocation.rows.length > 0) {
                nextDropoffLocation = {
                    name: nextLocation.rows[0].location_name || `Location ${nextLocation.rows[0].location_id}`,
                    locationId: nextLocation.rows[0].location_id
                };
            }
        }

        res.json({
            pendingDropoffs: pendingCount,
            readyForPickup: parseInt(readyForPickup.rows[0].count),
            completedThisWeek: parseInt(completedThisWeek.rows[0].count),
            activeLockers: parseInt(activeLockers.rows[0].count),
            futureDropoffs: parseInt(futureDropoffs.rows[0].count),
            nextDropoffLocation
        });
    } catch (error) {
        logger.error('Error loading stats:', error);
        res.status(500).json({ error: 'Failed to load stats' });
    }
});

// Get all orders for shop
app.get('/api/orders/:shop', auditCustomerDataAccess('view_orders'), async (req, res) => {
    try {
        const { shop } = req.params;

        const result = await db.query(
            `SELECT
                o.order_number as "orderNumber",
                o.customer_name as "customerName",
                o.customer_email as "customerEmail",
                o.customer_phone as "customerPhone",
                o.dropoff_link as "dropoffLink",
                o.pickup_link as "pickupLink",
                o.status,
                o.locker_id as "lockerId",
                o.tower_id as "towerId",
                o.location_id as "locationId",
                COALESCE(lp.location_name, 'Location ' || o.location_id) as "lockerName",
                TO_CHAR(o.created_at, 'YYYY-MM-DD') as date,
                TO_CHAR(o.preferred_pickup_date, 'YYYY-MM-DD') as "pickupDate"
            FROM orders o
            LEFT JOIN locker_preferences lp ON o.location_id = lp.location_id AND o.shop = lp.shop
            WHERE o.shop = $1
            ORDER BY o.created_at DESC`,
            [shop]
        );

        res.json(result.rows);
    } catch (error) {
        logger.error('Error loading orders:', error);
        res.status(500).json({ error: 'Failed to load orders' });
    }
});
// ============================================
// DATABASE ROUTES
// ============================================

// Save locker preferences
app.post('/api/locker-preferences/:shop', async (req, res) => {
    try {
        const { shop } = req.params;
        const { selectedLockers } = req.body;
        
        // Delete existing preferences
        await db.query('DELETE FROM locker_preferences WHERE shop = $1', [shop]);
        
        // Insert new preferences
        for (const locker of selectedLockers) {
            await db.query(
                'INSERT INTO locker_preferences (shop, location_id, location_name) VALUES ($1, $2, $3)',
                [shop, locker.id, locker.name]
            );
        }
        
        res.json({ success: true, message: 'Preferences saved' });
    } catch (error) {
        logger.error('Error saving preferences:', error);
        res.status(500).json({ error: 'Failed to save preferences' });
    }
});

// Get locker preferences
app.get('/api/locker-preferences/:shop', async (req, res) => {
    try {
        const { shop } = req.params;
        const result = await db.query(
            'SELECT * FROM locker_preferences WHERE shop = $1',
            [shop]
        );
        res.json(result.rows);
    } catch (error) {
        logger.error('Error fetching preferences:', error);
        res.status(500).json({ error: 'Failed to fetch preferences' });
    }
});

// Get real-time locker availability for dashboard
app.get('/api/locker-availability/:shop', async (req, res) => {
    try {
        const { shop } = req.params;

        // Get shop's enabled lockers (columns: location_id, location_name)
        const prefsResult = await db.query(
            'SELECT location_id, location_name FROM locker_preferences WHERE shop = $1',
            [shop]
        );

        if (prefsResult.rows.length === 0) {
            return res.json({ locations: [], message: 'No lockers enabled for this shop' });
        }

        // Get Harbor token
        const tokenResponse = await axios.post(
            'https://accounts.sandbox.harborlockers.com/realms/harbor/protocol/openid-connect/token',
            `grant_type=client_credentials&scope=service_provider&client_id=${process.env.HARBOR_CLIENT_ID}&client_secret=${process.env.HARBOR_CLIENT_SECRET}`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        const accessToken = tokenResponse.data.access_token;

        // Fetch all locations to get addresses
        const locationsResponse = await axios.get(
            'https://api.sandbox.harborlockers.com/api/v1/locations/',
            { headers: { 'Authorization': `Bearer ${accessToken}` }, params: { limit: 100 } }
        );
        const allLocations = locationsResponse.data || [];

        // Fetch availability for each enabled locker
        const locationsWithAvailability = [];

        for (const pref of prefsResult.rows) {
            // Find location details from Harbor API
            const locationDetails = allLocations.find(l => l.id === pref.location_id);
            const address = locationDetails
                ? `${locationDetails.street_address || ''}, ${locationDetails.city || ''}, ${locationDetails.state || ''} ${locationDetails.zip || ''}`.replace(/^, /, '')
                : '';

            try {
                const availabilityResponse = await axios.get(
                    `https://api.sandbox.harborlockers.com/api/v1/locations/${pref.location_id}/availability`,
                    { headers: { 'Authorization': `Bearer ${accessToken}` } }
                );

                const availability = availabilityResponse.data;
                let sizeBreakdown = [];
                let totalAvailable = 0;
                let totalCapacity = 0;

                if (availability.byType && Array.isArray(availability.byType)) {
                    // Harbor API format: byType[].lockerType.name, byType[].lockerAvailability.availableLockers/totalLockers
                    sizeBreakdown = availability.byType.map(type => ({
                        size: type.lockerType?.displayName || type.lockerType?.name || type.type || type.name || 'Unknown',
                        available: type.lockerAvailability?.availableLockers || type.availableCount || 0,
                        total: type.lockerAvailability?.totalLockers || type.totalCount || 0,
                        inUse: (type.lockerAvailability?.totalLockers || type.totalCount || 0) - (type.lockerAvailability?.availableLockers || type.availableCount || 0)
                    }));
                    totalAvailable = sizeBreakdown.reduce((sum, t) => sum + t.available, 0);
                    totalCapacity = sizeBreakdown.reduce((sum, t) => sum + t.total, 0);
                } else if (availability.lockerAvailability) {
                    totalAvailable = availability.lockerAvailability.availableLockers || 0;
                    totalCapacity = availability.lockerAvailability.totalLockers || totalAvailable;
                }

                locationsWithAvailability.push({
                    id: pref.location_id,
                    name: pref.location_name,
                    address: address,
                    totalAvailable,
                    totalCapacity,
                    sizeBreakdown,
                    lastUpdated: new Date().toISOString()
                });
            } catch (availError) {
                logger.error(`Failed to get availability for locker ${pref.location_id}:`, availError.message);
                locationsWithAvailability.push({
                    id: pref.location_id,
                    name: pref.location_name,
                    address: address,
                    error: 'Failed to fetch availability',
                    lastUpdated: new Date().toISOString()
                });
            }
        }

        res.json({
            locations: locationsWithAvailability,
            fetchedAt: new Date().toISOString(),
            minAvailableBuffer: MIN_AVAILABLE_BUFFER
        });
    } catch (error) {
        logger.error('Error fetching locker availability:', error);
        res.status(500).json({ error: 'Failed to fetch availability', details: error.message });
    }
});

// Get availability for a single locker location (used by manual order modal)
app.get('/api/location-availability/:locationId', async (req, res) => {
    try {
        const { locationId } = req.params;

        if (!locationId || isNaN(parseInt(locationId))) {
            return res.status(400).json({ error: 'Invalid location ID' });
        }

        // Get Harbor token
        const tokenResponse = await axios.post(
            'https://accounts.sandbox.harborlockers.com/realms/harbor/protocol/openid-connect/token',
            `grant_type=client_credentials&scope=service_provider&client_id=${process.env.HARBOR_CLIENT_ID}&client_secret=${process.env.HARBOR_CLIENT_SECRET}`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }}
        );
        const accessToken = tokenResponse.data.access_token;

        // Fetch availability for this location
        const availabilityResponse = await axios.get(
            `https://api.sandbox.harborlockers.com/api/v1/locations/${locationId}/availability`,
            { headers: { 'Authorization': `Bearer ${accessToken}` }}
        );

        res.json(availabilityResponse.data);
    } catch (error) {
        logger.error('Error fetching single locker availability:', error.message);
        res.status(500).json({ error: 'Failed to fetch availability', details: error.message });
    }
});

// ============================================
// CHECKOUT UI EXTENSION API
// ============================================

// Get nearby lockers for checkout extension
app.get('/api/checkout/lockers', async (req, res) => {
    try {
        const { address, shop, lat, lon, products } = req.query;

        logger.info(`📍 Checkout locker request: address="${address}", shop="${shop}"`);

        // Get shop settings for pickup date calculation
        let processingDays = 1;
        let fulfillmentDays = ['monday','tuesday','wednesday','thursday','friday'];
        let vacationDays = [];
        let freePickup = true; // Default to free

        if (shop) {
            try {
                const settingsResult = await db.query('SELECT * FROM shop_settings WHERE shop = $1', [shop]);
                if (settingsResult.rows.length > 0) {
                    const settings = settingsResult.rows[0];
                    processingDays = settings.processing_days || 1;
                    fulfillmentDays = settings.fulfillment_days || ['monday','tuesday','wednesday','thursday','friday'];
                    vacationDays = settings.vacation_days || [];
                    freePickup = settings.free_pickup !== false; // Default to true if not set
                }
            } catch (e) {
                logger.info('⚠️ Could not fetch shop settings for pickup date:', e.message);
            }
        }

        // Calculate pickup date based on shop settings
        const { pickupDate } = calculatePickupDate(processingDays, fulfillmentDays, vacationDays);
        const pickupDateFormatted = formatPickupDate(pickupDate);
        const pickupDateISO = pickupDate.toISOString().split('T')[0];
        logger.info(`📅 Checkout pickup date: ${pickupDateFormatted}`);

        // Check if shop has enabled any locker locations
        let enabledLocationIds = [];
        if (shop) {
            try {
                const prefsResult = await db.query(
                    'SELECT location_id FROM locker_preferences WHERE shop = $1',
                    [shop]
                );
                enabledLocationIds = prefsResult.rows.map(r => r.location_id);

                if (enabledLocationIds.length === 0) {
                    logger.info('❌ No locker locations enabled for this shop - returning empty');
                    return res.json({ lockers: [], requiredSize: 'medium', requiredSizeId: 2, pickupDate: pickupDateFormatted, pickupDateISO: pickupDateISO, freePickup });
                }
                logger.info(`🔧 Shop has ${enabledLocationIds.length} enabled locations: ${enabledLocationIds.join(', ')}`);
            } catch (e) {
                logger.info('⚠️ Could not check locker preferences:', e.message);
            }
        }

        // Calculate required locker size from cart products
        let requiredLockerTypeId = 2; // Default to medium
        let requiredSizeName = 'medium';

        if (products && shop) {
            try {
                const cartProducts = JSON.parse(decodeURIComponent(products));
                logger.info(`📦 Cart products for size calculation:`, cartProducts.length, 'items');

                // Get shop access token
                let shopAccessToken = accessTokens.get(shop);
                if (!shopAccessToken) {
                    const storeResult = await db.query('SELECT access_token FROM stores WHERE shop = $1', [shop]);
                    if (storeResult.rows.length > 0) {
                        shopAccessToken = storeResult.rows[0].access_token;
                        accessTokens.set(shop, shopAccessToken);
                    }
                }

                if (shopAccessToken && cartProducts.length > 0) {
                    // Fetch product dimensions and calculate required size
                    const productDimensions = await getProductDimensionsFromCheckout(shop, shopAccessToken, cartProducts);
                    requiredLockerTypeId = calculateRequiredLockerSize(productDimensions);

                    // If any product is not configured for LockerDrop, return empty
                    if (requiredLockerTypeId === null) {
                        logger.info('❌ One or more products not configured for LockerDrop - returning empty lockers');
                        return res.json({
                            lockers: [],
                            pickupDate: null,
                            message: 'One or more items in your cart are not available for locker pickup.'
                        });
                    }

                    requiredSizeName = LOCKER_SIZES.find(s => s.id === requiredLockerTypeId)?.name?.toLowerCase() || 'medium';
                    logger.info(`📦 Required locker size for cart: ${requiredSizeName} (type ${requiredLockerTypeId})`);
                }
            } catch (parseError) {
                logger.info(`⚠️ Could not parse products for size calculation: ${parseError.message}`);
            }
        }

        // Get Harbor token
        const tokenResponse = await axios.post(
            'https://accounts.sandbox.harborlockers.com/realms/harbor/protocol/openid-connect/token',
            `grant_type=client_credentials&scope=service_provider&client_id=${process.env.HARBOR_CLIENT_ID}&client_secret=${process.env.HARBOR_CLIENT_SECRET}`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }}
        );

        const harborAccessToken = tokenResponse.data.access_token;

        // Get all locations from Harbor
        const locationsResponse = await axios.get(
            'https://api.sandbox.harborlockers.com/api/v1/locations/',
            {
                headers: { 'Authorization': `Bearer ${harborAccessToken}` },
                params: { limit: 100 }
            }
        );

        const allLocations = locationsResponse.data;

        // Filter to only enabled locations for this shop
        const enabledLocations = enabledLocationIds.length > 0
            ? allLocations.filter(loc => enabledLocationIds.includes(loc.id))
            : allLocations;

        if (enabledLocations.length === 0) {
            logger.info('❌ None of the enabled locations match Harbor locations');
            return res.json({ lockers: [], requiredSize: requiredSizeName, requiredSizeId: requiredLockerTypeId, pickupDate: pickupDateFormatted, pickupDateISO: pickupDateISO, freePickup });
        }

        // If we have lat/lon, use them for distance calculation
        let customerLat = parseFloat(lat);
        let customerLon = parseFloat(lon);

        // If no coordinates, try to geocode from address/zip
        if ((!customerLat || !customerLon) && address) {
            // Try to extract zip code from address
            const zipMatch = address.match(/\b(\d{5})\b/);
            if (zipMatch) {
                const geocoded = await geocodeZipCode(zipMatch[1], 'US');
                if (geocoded) {
                    customerLat = geocoded.latitude;
                    customerLon = geocoded.longitude;
                    logger.info(`📍 Geocoded zip ${zipMatch[1]} to: ${customerLat}, ${customerLon}`);
                }
            }
        }

        if (!customerLat || !customerLon) {
            logger.info('⚠️ No coordinates available, will sort by name');
        }

        // Check availability and calculate distances
        const availableLockers = [];
        for (const location of enabledLocations) {
            try {
                const availabilityResponse = await axios.get(
                    `https://api.sandbox.harborlockers.com/api/v1/locations/${location.id}/availability`,
                    { headers: { 'Authorization': `Bearer ${harborAccessToken}` }}
                );

                const availability = availabilityResponse.data;

                // Check if location has availability for the required size OR LARGER
                let hasRequiredSizeAvailable = false;
                let availableForRequiredSize = 0;

                if (availability.byType && Array.isArray(availability.byType)) {
                    // New API format with per-type availability
                    logger.info(`📦 Location ${location.name} availability by type:`, JSON.stringify(availability.byType.map(t => ({
                        id: t.lockerType?.id,
                        name: t.lockerType?.name,
                        available: t.lockerAvailability?.availableLockers
                    }))));

                    for (const typeAvail of availability.byType) {
                        const typeId = typeAvail.lockerType?.id;
                        const typeName = typeAvail.lockerType?.name?.toLowerCase() || '';
                        const available = typeAvail.lockerAvailability?.availableLockers || 0;

                        // Map Harbor type name to our size ID for comparison
                        const harborSizeId = getLockerSizeIdFromName(typeName);

                        // Check if this type is >= required size and has availability
                        if (harborSizeId >= requiredLockerTypeId && available > 0) {
                            hasRequiredSizeAvailable = true;
                            availableForRequiredSize += available;
                            logger.info(`  ✓ ${typeName} (id:${typeId}, sizeId:${harborSizeId}): ${available} available - FITS required size ${requiredSizeName}`);
                        } else if (available > 0) {
                            logger.info(`  ✗ ${typeName} (id:${typeId}, sizeId:${harborSizeId}): ${available} available - TOO SMALL for ${requiredSizeName}`);
                        }
                    }
                } else if (availability.lockerAvailability) {
                    // Fallback: just check total availability (less accurate)
                    const totalAvailable = availability.lockerAvailability.availableLockers || 0;
                    hasRequiredSizeAvailable = totalAvailable >= MIN_AVAILABLE_BUFFER;
                    availableForRequiredSize = totalAvailable;
                } else if (Array.isArray(availability)) {
                    // Old API format
                    hasRequiredSizeAvailable = availability.some(type => type.availableCount >= MIN_AVAILABLE_BUFFER);
                    availableForRequiredSize = availability.reduce((sum, type) => sum + (type.availableCount || 0), 0);
                }

                // Only show locations with enough buffer to prevent race conditions
                if (hasRequiredSizeAvailable && availableForRequiredSize >= MIN_AVAILABLE_BUFFER) {
                    // Calculate distance if we have coordinates
                    let distance = null;
                    if (customerLat && customerLon && location.lat && location.lon) {
                        distance = calculateDistance(customerLat, customerLon, location.lat, location.lon);
                    }

                    availableLockers.push({
                        id: location.id,
                        name: location.name || location.location_name,
                        address: location.address || `${location.street_address}, ${location.city}, ${location.state} ${location.zip}`,
                        city: location.city,
                        state: location.state,
                        zip: location.zip,
                        lat: location.lat,
                        lon: location.lon,
                        distance: distance ? distance.toFixed(1) : null,
                        availableCount: availableForRequiredSize,
                        requiredSize: requiredSizeName,
                        availability: availability
                    });
                } else {
                    logger.info(`📦 Location ${location.name} (ID: ${location.id}) skipped - only ${availableForRequiredSize} ${requiredSizeName}+ lockers (need ${MIN_AVAILABLE_BUFFER}+)`);
                }
            } catch (availError) {
                logger.info(`⚠️ Could not check availability for ${location.name} (ID: ${location.id}):`, availError.message);
            }
        }

        // Sort by distance FIRST, then take top 5
        availableLockers.sort((a, b) => {
            if (a.distance && b.distance) {
                return parseFloat(a.distance) - parseFloat(b.distance);
            }
            // If one has distance and other doesn't, prefer the one with distance
            if (a.distance && !b.distance) return -1;
            if (!a.distance && b.distance) return 1;
            return (a.name || '').localeCompare(b.name || '');
        });

        // Now limit to 5 nearest locations
        const topLockers = availableLockers.slice(0, 5);

        logger.info(`✅ Found ${availableLockers.length} available locations, returning top ${topLockers.length} nearest`);

        res.json({
            lockers: topLockers,
            requiredSize: requiredSizeName,
            requiredSizeId: requiredLockerTypeId,
            pickupDate: pickupDateFormatted,
            pickupDateISO: pickupDateISO,
            freePickup
        });
    } catch (error) {
        logger.error('Error fetching checkout lockers:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to fetch lockers', lockers: [] });
    }
});

// ============================================
// LOCKER RESERVATION API (for checkout)
// ============================================

// Reserve a locker during checkout - creates actual Harbor dropoff link
// This prevents pending_allocation by reserving before payment
app.post('/api/checkout/reserve-locker', async (req, res) => {
    try {
        const { locationId, lockerTypeId, shop, customerEmail, customerPhone, pickupDate } = req.body;

        logger.info(`🔒 Checkout reservation request: location=${locationId}, size=${lockerTypeId}, shop=${shop}`);

        // Validate required fields
        if (!locationId || !lockerTypeId || !shop) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: locationId, lockerTypeId, shop'
            });
        }

        // Create a temporary order reference for the reservation
        const reservationRef = `CHECKOUT_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        // Try to create a dropoff link with Harbor (this actually reserves the locker)
        const allSizes = [
            { id: 1, name: 'small' },
            { id: 2, name: 'medium' },
            { id: 3, name: 'large' },
            { id: 4, name: 'x-large' }
        ];
        const sizesToTry = allSizes.filter(s => s.id >= lockerTypeId);

        let dropoffLink = null;
        let usedSize = null;

        for (const size of sizesToTry) {
            try {
                logger.info(`🔗 Trying ${size.name} locker (type ${size.id}) for reservation...`);
                dropoffLink = await generateDropoffLink(
                    locationId,
                    size.id,
                    reservationRef, // Use temp reference
                    reservationRef
                );
                usedSize = size.name;
                logger.info(`✅ Reservation success with ${size.name} locker!`);
                break;
            } catch (sizeError) {
                const errorDetail = sizeError.response?.data?.detail || sizeError.message;
                logger.info(`   ❌ ${size.name} failed: ${errorDetail}`);
                if (!errorDetail.includes('No locker available')) {
                    throw sizeError;
                }
            }
        }

        if (!dropoffLink) {
            logger.info(`❌ No lockers available for reservation at location ${locationId}`);
            return res.status(409).json({
                success: false,
                error: 'no_availability',
                message: 'No lockers available at this location. Please select a different pickup location.'
            });
        }

        // Store the reservation in database
        await db.query(
            `INSERT INTO locker_reservations (
                reservation_ref, shop, location_id, locker_id, tower_id,
                dropoff_link, dropoff_request_id, locker_size,
                customer_email, customer_phone, pickup_date,
                created_at, expires_at, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW() + INTERVAL '30 minutes', 'pending')
            ON CONFLICT (reservation_ref) DO UPDATE SET
                dropoff_link = $6, dropoff_request_id = $7, expires_at = NOW() + INTERVAL '30 minutes'`,
            [
                reservationRef,
                shop,
                locationId,
                dropoffLink.lockerId,
                dropoffLink.towerId,
                dropoffLink.linkToken,
                dropoffLink.id,
                usedSize,
                customerEmail || null,
                customerPhone || null,
                pickupDate || null
            ]
        );

        logger.info(`✅ Reservation created: ${reservationRef} (expires in 30 min)`);

        res.json({
            success: true,
            reservationRef,
            lockerSize: usedSize,
            lockerId: dropoffLink.lockerId,
            expiresIn: 30 * 60 // seconds
        });
    } catch (error) {
        logger.error('Error creating locker reservation:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: 'reservation_failed',
            message: 'Failed to reserve locker. Please try again.'
        });
    }
});

// Check if a reservation is still valid
app.get('/api/checkout/reservation/:ref', async (req, res) => {
    try {
        const { ref } = req.params;

        const result = await db.query(
            `SELECT * FROM locker_reservations
             WHERE reservation_ref = $1 AND status = 'pending' AND expires_at > NOW()`,
            [ref]
        );

        if (result.rows.length === 0) {
            return res.json({ valid: false });
        }

        res.json({
            valid: true,
            reservation: result.rows[0]
        });
    } catch (error) {
        logger.error('Error checking reservation:', error.message);
        res.status(500).json({ valid: false, error: 'Failed to check reservation' });
    }
});

// ============================================
// PUBLIC LOCKER FINDER API
// ============================================

// Public endpoint for theme locker finder section
// No authentication required - for customer-facing locker discovery
// Load Harbor locations from static JSON (from Harbor's open source map)
let harborLocationsCache = null;
function getHarborLocations() {
    if (!harborLocationsCache) {
        try {
            const locationsPath = path.join(__dirname, 'public', 'harbor-locations.json');
            harborLocationsCache = JSON.parse(fs.readFileSync(locationsPath, 'utf8'));
            logger.info(`📍 Loaded ${harborLocationsCache.length} Harbor locations from static file`);
        } catch (err) {
            logger.error('Error loading Harbor locations:', err.message);
            harborLocationsCache = [];
        }
    }
    return harborLocationsCache;
}

app.get('/api/public/lockers', async (req, res) => {
    try {
        const { lat, lon, limit = 6 } = req.query;

        logger.info(`📍 Public locker finder request: lat=${lat}, lon=${lon}, limit=${limit}`);

        // Validate coordinates
        if (!lat || !lon) {
            return res.status(400).json({ error: 'Latitude and longitude are required', locations: [] });
        }

        const latitude = parseFloat(lat);
        const longitude = parseFloat(lon);
        const resultLimit = Math.min(parseInt(limit) || 6, 20); // Max 20 results

        if (isNaN(latitude) || isNaN(longitude)) {
            return res.status(400).json({ error: 'Invalid coordinates', locations: [] });
        }

        // Get locations from static JSON file (450+ real Harbor locations)
        const allLocations = getHarborLocations();

        // Calculate distances
        const locationsWithDistance = allLocations
            .filter(location => location.lat && location.lon)
            .map(location => ({
                id: location.id,
                name: location.name,
                address: location.address1 || '',
                city: location.city,
                state: location.state,
                zip: location.zip,
                lat: location.lat,
                lon: location.lon,
                distance: calculateDistance(latitude, longitude, location.lat, location.lon)
            }));

        // Sort by distance
        locationsWithDistance.sort((a, b) => a.distance - b.distance);

        // Limit results
        const results = locationsWithDistance.slice(0, resultLimit);

        logger.info(`✅ Public locker finder returning ${results.length} locations`);

        // Add CORS headers for theme extension
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET');
        res.header('Access-Control-Allow-Headers', 'Content-Type');

        res.json({ locations: results });
    } catch (error) {
        logger.error('Error in public locker finder:', error.message);
        res.status(500).json({ error: 'Failed to fetch lockers', locations: [] });
    }
});

// Waitlist signup for landing page
app.post('/api/waitlist', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: 'Valid email required' });
        }

        // Store email in database
        await db.query(
            `INSERT INTO waitlist (email, created_at) VALUES ($1, NOW())
             ON CONFLICT (email) DO UPDATE SET updated_at = NOW()`,
            [email.toLowerCase().trim()]
        );

        logger.info(`📧 Waitlist signup: ${email}`);

        res.json({ success: true, message: 'Added to waitlist' });
    } catch (error) {
        logger.error('Waitlist signup error:', error.message);
        res.status(500).json({ error: 'Failed to join waitlist' });
    }
});

// ============================================
// CUSTOMER ORDER STATUS API
// ============================================

// Public endpoint for checkout extension to get order locker status
// Used by Thank You and Order Status pages
app.get('/api/customer/order-status/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;

        logger.info(`📦 Customer order status request for order: ${orderId}`);

        // Add CORS headers
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        // Find order in our database
        const orderResult = await db.query(
            `SELECT o.*, lp.location_name as locker_name
             FROM orders o
             LEFT JOIN locker_preferences lp ON o.location_id::text = lp.location_id::text AND o.shop = lp.shop
             WHERE o.shopify_order_id = $1 OR o.order_number = $1 OR o.id::text = $1`,
            [orderId]
        );

        if (orderResult.rows.length === 0) {
            // Order not found in our system - might not be a LockerDrop order
            return res.json({
                status: 'not_found',
                message: 'This order is not using locker pickup'
            });
        }

        const order = orderResult.rows[0];

        // Fetch location address from Harbor API if we have a location_id
        let lockerAddress = null;
        if (order.location_id) {
            try {
                const tokenResponse = await axios.post(
                    'https://accounts.sandbox.harborlockers.com/realms/harbor/protocol/openid-connect/token',
                    `grant_type=client_credentials&scope=service_provider&client_id=${process.env.HARBOR_CLIENT_ID}&client_secret=${process.env.HARBOR_CLIENT_SECRET}`,
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                );
                const harborToken = tokenResponse.data.access_token;

                const locationResponse = await axios.get(
                    `https://api.sandbox.harborlockers.com/api/v1/locations/${order.location_id}/`,
                    { headers: { 'Authorization': `Bearer ${harborToken}` } }
                );

                if (locationResponse.data) {
                    const loc = locationResponse.data;
                    lockerAddress = [
                        loc.address1,
                        loc.city,
                        loc.state,
                        loc.zip
                    ].filter(Boolean).join(', ');
                }
            } catch (locErr) {
                logger.error('Error fetching location address:', locErr.message);
            }
        }

        // Calculate expected pickup date - use preferred_pickup_date or default to next business day
        let expectedPickupDate = order.preferred_pickup_date;
        if (!expectedPickupDate) {
            // Default: next business day from order creation
            const orderDate = new Date(order.created_at);
            const nextDay = new Date(orderDate);
            nextDay.setDate(nextDay.getDate() + 1);
            // Skip weekends (0 = Sunday, 6 = Saturday)
            while (nextDay.getDay() === 0 || nextDay.getDay() === 6) {
                nextDay.setDate(nextDay.getDate() + 1);
            }
            expectedPickupDate = nextDay.toISOString();
        }

        // Build response
        const response = {
            isLockerDropOrder: true,
            status: order.status,
            lockerName: order.locker_name || order.location_name,
            lockerAddress: lockerAddress,
            pickupUrl: order.status === 'ready_for_pickup' ? order.pickup_link : null,
            dropoffDate: order.dropoff_date,
            expectedPickupDate: expectedPickupDate,
            createdAt: order.created_at
        };

        logger.info(`✅ Returning order status: ${order.status} for order ${orderId}`);

        res.json(response);
    } catch (error) {
        logger.error('Error fetching customer order status:', error.message);
        res.status(500).json({ error: 'Failed to fetch order status' });
    }
});

// CORS preflight for customer order status
app.options('/api/customer/order-status/:orderId', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.sendStatus(200);
});

// ============================================
// PICKUP POINTS FUNCTION API
// ============================================

// Get nearby lockers for Pickup Point Function (Plus stores)
// Called by the Shopify Function fetch target
app.get('/api/pickup-points', async (req, res) => {
    try {
        const { lat, lon, zip, shop } = req.query;

        logger.info(`📍 Pickup Points Function request: lat=${lat}, lon=${lon}, zip=${zip}, shop=${shop}`);

        // Validate coordinates
        if (!lat || !lon) {
            logger.info('❌ No coordinates provided');
            return res.json({ lockers: [], pickupDate: null, pickupDateISO: null });
        }

        const latitude = parseFloat(lat);
        const longitude = parseFloat(lon);

        // Get shop settings for pickup date calculation and pricing
        let processingDays = 1;
        let fulfillmentDays = ['monday','tuesday','wednesday','thursday','friday'];
        let vacationDays = [];
        let freePickup = false;

        if (shop) {
            try {
                const settingsResult = await db.query('SELECT * FROM shop_settings WHERE shop = $1', [shop]);
                if (settingsResult.rows.length > 0) {
                    const settings = settingsResult.rows[0];
                    processingDays = settings.processing_days || 1;
                    fulfillmentDays = settings.fulfillment_days || ['monday','tuesday','wednesday','thursday','friday'];
                    vacationDays = settings.vacation_days || [];
                    freePickup = settings.free_pickup || false;
                }
            } catch (e) {
                logger.info('⚠️ Could not fetch shop settings:', e.message);
            }
        }

        // Calculate pickup date
        const { pickupDate } = calculatePickupDate(processingDays, fulfillmentDays, vacationDays);
        const pickupDateFormatted = formatPickupDate(pickupDate);
        const pickupDateISO = pickupDate.toISOString().split('T')[0];
        logger.info(`📅 Pickup Points pickup date: ${pickupDateFormatted}`);

        // Check if shop has enabled any locker locations
        let enabledLocationIds = [];
        if (shop) {
            try {
                const prefsResult = await db.query(
                    'SELECT location_id FROM locker_preferences WHERE shop = $1',
                    [shop]
                );
                enabledLocationIds = prefsResult.rows.map(r => r.location_id);

                if (enabledLocationIds.length === 0) {
                    logger.info('❌ No locker locations enabled for this shop');
                    return res.json({ lockers: [], pickupDate: pickupDateFormatted, pickupDateISO: pickupDateISO });
                }
                logger.info(`🔧 Shop has ${enabledLocationIds.length} enabled locations`);
            } catch (e) {
                logger.info('⚠️ Could not check locker preferences:', e.message);
            }
        }

        // Get Harbor token
        const tokenResponse = await axios.post(
            'https://accounts.sandbox.harborlockers.com/realms/harbor/protocol/openid-connect/token',
            `grant_type=client_credentials&scope=service_provider&client_id=${process.env.HARBOR_CLIENT_ID}&client_secret=${process.env.HARBOR_CLIENT_SECRET}`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }}
        );

        const accessToken = tokenResponse.data.access_token;

        // Get all Harbor locations
        const locationsResponse = await axios.get(
            'https://api.sandbox.harborlockers.com/api/v1/locations/',
            {
                headers: { 'Authorization': `Bearer ${accessToken}` },
                params: { limit: 100 }
            }
        );

        const allLocations = locationsResponse.data;

        // Filter to only enabled locations for this shop
        const enabledLocations = enabledLocationIds.length > 0
            ? allLocations.filter(loc => enabledLocationIds.includes(loc.id))
            : allLocations;

        if (enabledLocations.length === 0) {
            logger.info('❌ None of the enabled locations match Harbor locations');
            return res.json({ lockers: [], pickupDate: pickupDateFormatted, pickupDateISO: pickupDateISO });
        }

        // Calculate distances and find nearest locations
        const locationsWithDistance = enabledLocations.map(location => {
            const distance = calculateDistance(latitude, longitude, location.lat, location.lon);
            return { ...location, distance };
        });

        const nearestLocations = locationsWithDistance
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 5); // Get top 5 nearest

        // Check availability for each location
        const availableLockers = [];
        for (const location of nearestLocations) {
            try {
                const availabilityResponse = await axios.get(
                    `https://api.sandbox.harborlockers.com/api/v1/locations/${location.id}/availability`,
                    { headers: { 'Authorization': `Bearer ${accessToken}` }}
                );

                const availability = availabilityResponse.data;
                let totalAvailable = 0;

                if (availability.byType && Array.isArray(availability.byType)) {
                    for (const type of availability.byType) {
                        totalAvailable += type.lockerAvailability?.availableLockers || 0;
                    }
                } else if (availability.lockerAvailability) {
                    totalAvailable = availability.lockerAvailability.availableLockers || 0;
                }

                if (totalAvailable > 0) {
                    availableLockers.push({
                        id: location.id,
                        name: location.name,
                        address: location.address || location.street_address,
                        city: location.city,
                        state: location.state || location.province,
                        zip: location.zip || location.postal_code,
                        country_code: 'US',
                        lat: location.lat,
                        lon: location.lon,
                        distance: location.distance,
                        availableCount: totalAvailable,
                        hours: { is24_7: true }, // Harbor lockers are 24/7
                        cost: freePickup ? null : { amount: "1.00", currencyCode: "USD" }
                    });
                    logger.info(`✅ Location ${location.name}: ${totalAvailable} lockers available`);
                }
            } catch (availError) {
                logger.info(`⚠️ Could not check availability for ${location.name}:`, availError.message);
            }

            // Limit to 3 available locations
            if (availableLockers.length >= 3) break;
        }

        logger.info(`✅ Returning ${availableLockers.length} pickup points`);

        res.json({
            lockers: availableLockers,
            pickupDate: pickupDateFormatted,
            pickupDateISO: pickupDateISO
        });

    } catch (error) {
        logger.error('Error in pickup points API:', error.message);
        res.status(500).json({ lockers: [], error: error.message });
    }
});

// Save selected locker from checkout
app.post('/api/checkout/select-locker', async (req, res) => {
    try {
        const { shop, checkoutToken, lockerId, locationId, lockerName } = req.body;

        logger.info(`📦 Locker selected at checkout: shop=${shop}, locker=${lockerName} (${lockerId})`);

        // Store the selection temporarily (will be matched with order on webhook)
        // In production, you might want to use Redis or a checkout_selections table
        // For now, we'll rely on the address2 field containing the locker info

        res.json({ success: true, message: 'Locker selection saved' });
    } catch (error) {
        logger.error('Error saving locker selection:', error);
        res.status(500).json({ error: 'Failed to save locker selection' });
    }
});

// Create manual order
app.post('/api/manual-order/:shop', async (req, res) => {
    try {
        const shop = req.params.shop;
        const { orderNumber, customerName, customerEmail, lockerId, lockerName, sendEmail, requiredLockerSize, preferredPickupDate } = req.body;

        // Parse required locker size (1=small, 2=medium, 3=large, 4=x-large), default to 2 (medium)
        const requiredSizeId = parseInt(requiredLockerSize) || 2;
        const requiredSizeName = LOCKER_SIZES.find(s => s.id === requiredSizeId)?.name || 'Medium';

        logger.info(`📦 Creating manual order #${orderNumber} for ${shop}, required size: ${requiredSizeName} (${requiredSizeId})${preferredPickupDate ? `, pickup: ${preferredPickupDate}` : ''}`);

        // Get Harbor token
        const tokenResponse = await axios.post(
            'https://accounts.sandbox.harborlockers.com/realms/harbor/protocol/openid-connect/token',
            `grant_type=client_credentials&scope=service_provider&client_id=${process.env.HARBOR_CLIENT_ID}&client_secret=${process.env.HARBOR_CLIENT_SECRET}`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }}
        );

        const accessToken = tokenResponse.data.access_token;

        // Check availability at this location to find an available locker type
        const availabilityResponse = await axios.get(
            `https://api.sandbox.harborlockers.com/api/v1/locations/${lockerId}/availability`,
            { headers: { 'Authorization': `Bearer ${accessToken}` }}
        );

        const availability = availabilityResponse.data;
        let availableLockerTypeId = null;
        let availableLockerTypeName = null;

        // Check byType array for available lockers that meet size requirement
        // API format: byType[].lockerType.id, byType[].lockerAvailability.availableLockers
        // Harbor uses names like "small", "medium", "large" - we convert to our size IDs using getLockerSizeIdFromName
        if (availability.byType && Array.isArray(availability.byType)) {
            // Sort by size (using our size mapping) to prefer smaller fitting lockers first
            const sortedTypes = [...availability.byType].sort((a, b) => {
                const sizeA = getLockerSizeIdFromName(a.lockerType?.name);
                const sizeB = getLockerSizeIdFromName(b.lockerType?.name);
                return sizeA - sizeB;
            });

            for (const type of sortedTypes) {
                const typeName = type.lockerType?.name || '';
                const harborSizeId = getLockerSizeIdFromName(typeName);
                const available = type.lockerAvailability?.availableLockers || 0;

                // Only consider lockers that are >= required size
                if (harborSizeId >= requiredSizeId && available > 0) {
                    availableLockerTypeId = type.lockerType?.id;
                    availableLockerTypeName = typeName;
                    logger.info(`✓ Found suitable locker type: ${availableLockerTypeName} (size ${harborSizeId}) >= required ${requiredSizeName} (${requiredSizeId}) - ${available} available`);
                    break;
                } else if (available > 0) {
                    logger.info(`✗ Skipping ${typeName} (size ${harborSizeId}) - too small for ${requiredSizeName} (${requiredSizeId})`);
                }
            }
        }

        if (!availableLockerTypeId) {
            // Build a helpful error message showing what sizes ARE available
            const availableSizes = (availability.byType || [])
                .filter(t => (t.lockerAvailability?.availableLockers || 0) > 0)
                .map(t => t.lockerType?.name)
                .filter(Boolean);

            const availableMsg = availableSizes.length > 0
                ? `Available sizes: ${availableSizes.join(', ')}`
                : 'No lockers currently available';

            return res.status(400).json({
                success: false,
                error: `No ${requiredSizeName} or larger locker available at ${lockerName}. ${availableMsg}. Please try a different location or select a smaller size.`
            });
        }

        // Create dropoff request with Harbor using available locker type
        const dropoffResponse = await axios.post(
            'https://api.sandbox.harborlockers.com/api/v1/locker-open-requests/dropoff-locker-request',
            {
                locationId: parseInt(lockerId),
                lockerTypeId: availableLockerTypeId,
                keypadIntent: 'pickup',
                persistKeypadCode: false,
                requireLowLocker: false,  // Don't require low locker - use any available
                returnUrl: `https://app.lockerdrop.it/dropoff-success?order=${orderNumber}`,
                clientInfo: `manual-order-${orderNumber}`,
                payload: { order_number: orderNumber, customer_name: customerName, manual: true }
            },
            { headers: { 'Authorization': `Bearer ${accessToken}` }}
        );

        const dropoffData = dropoffResponse.data;
        logger.info(`📦 Manual order dropoff - Locker ID: ${dropoffData.lockerId}, Tower ID: ${dropoffData.towerId}`);

        // Insert order into database with locker_id and tower_id for proper release on cancellation
        const insertResult = await db.query(
            `INSERT INTO orders (shop, shopify_order_id, order_number, customer_name, customer_email, location_id, location_name, locker_id, tower_id, dropoff_request_id, status, dropoff_link, preferred_pickup_date, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
             RETURNING id`,
            [shop, `MANUAL-${orderNumber}`, orderNumber, customerName, customerEmail, lockerId, lockerName, dropoffData.lockerId, dropoffData.towerId, dropoffData.id, 'pending_dropoff', dropoffData.linkToken, preferredPickupDate || null]
        );

        logger.info(`✅ Manual order #${orderNumber} created with dropoff link, locker_id: ${dropoffData.lockerId}, tower_id: ${dropoffData.towerId}`);

        res.json({
            success: true,
            orderId: insertResult.rows[0].id,
            orderNumber,
            dropoffLink: dropoffData.linkToken,
            lockerId: dropoffData.lockerId,
            towerId: dropoffData.towerId,
            message: 'Manual order created. Drop off link is ready.'
        });
    } catch (error) {
        logger.error('Error creating manual order:', error.response?.data || error.message);
        let errorMsg = error.message;
        if (error.response?.data?.detail) {
            if (Array.isArray(error.response.data.detail)) {
                errorMsg = error.response.data.detail.map(d => d.msg).join(', ');
            } else {
                errorMsg = error.response.data.detail;
            }
        }
        res.status(500).json({ success: false, error: errorMsg });
    }
});

// Generate dropoff link
app.post('/api/generate-dropoff-link/:shop', async (req, res) => {
    try {
        const { locationId, lockerTypeId, orderId, orderNumber } = req.body;
        
        // Get Harbor token
        const tokenResponse = await axios.post(
            'https://accounts.sandbox.harborlockers.com/realms/harbor/protocol/openid-connect/token',
            `grant_type=client_credentials&scope=service_provider&client_id=${process.env.HARBOR_CLIENT_ID}&client_secret=${process.env.HARBOR_CLIENT_SECRET}`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }}
        );
        
        const accessToken = tokenResponse.data.access_token;
        
        // Create dropoff request
        const dropoffResponse = await axios.post(
            'https://api.sandbox.harborlockers.com/api/v1/locker-open-requests/dropoff-locker-request',
            {
                locationId,
                lockerTypeId,
                keypadIntent: 'pickup',
                persistKeypadCode: false,
                requireLowLocker: true,
                returnUrl: `https://app.lockerdrop.it/dropoff-success`,
                clientInfo: `order-${orderNumber}`,
                payload: { order_id: orderId, order_number: orderNumber }
            },
            { headers: { 'Authorization': `Bearer ${accessToken}` }}
        );
        
        res.json(dropoffResponse.data);
    } catch (error) {
        logger.error('Error generating dropoff link:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to generate dropoff link' });
    }
});

// Generate pickup link
app.post('/api/generate-pickup-link/:shop', async (req, res) => {
    try {
        const { lockerId, orderId, orderNumber, customerName } = req.body;
        
        // Get Harbor token
        const tokenResponse = await axios.post(
            'https://accounts.sandbox.harborlockers.com/realms/harbor/protocol/openid-connect/token',
            `grant_type=client_credentials&scope=service_provider&client_id=${process.env.HARBOR_CLIENT_ID}&client_secret=${process.env.HARBOR_CLIENT_SECRET}`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }}
        );
        
        const accessToken = tokenResponse.data.access_token;
        
        // Create pickup request
        const pickupResponse = await axios.post(
            'https://api.sandbox.harborlockers.com/api/v1/locker-open-requests/pickup-locker-request',
            {
                lockerId,
                keypadIntent: 'pickup',
                persistKeypadCode: false,
                returnUrl: `https://app.lockerdrop.it/pickup-success?order=${orderNumber}&shop=${req.params.shop}`,
                clientInfo: `customer-${orderNumber}`,
                payload: { order_id: orderId, order_number: orderNumber, customer_name: customerName }
            },
            { headers: { 'Authorization': `Bearer ${accessToken}` }}
        );
        
        res.json(pickupResponse.data);
    } catch (error) {
        logger.error('Error generating pickup link:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to generate pickup link' });
    }

});

// ============================================
// FIX ORDER LOCKER INFO
// ============================================

// Fix order that's missing locker/tower info by fetching from Harbor
app.post('/api/fix-order-locker/:shop', requireApiAuth, async (req, res) => {
    try {
        const { shop } = req.params;
        const { orderNumber } = req.body;

        logger.info(`🔧 Fixing locker info for order #${orderNumber} (${shop})`);

        // Get order
        const orderResult = await db.query(
            `SELECT id, order_number, dropoff_request_id, pickup_request_id, locker_id, tower_id
             FROM orders WHERE shop = $1 AND order_number = $2`,
            [shop, orderNumber]
        );

        if (orderResult.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const order = orderResult.rows[0];
        const requestId = order.dropoff_request_id || order.pickup_request_id;

        if (!requestId) {
            return res.status(400).json({ error: 'No Harbor request ID found for this order' });
        }

        // Get Harbor token
        const tokenResponse = await axios.post(
            'https://accounts.sandbox.harborlockers.com/realms/harbor/protocol/openid-connect/token',
            `grant_type=client_credentials&scope=service_provider&client_id=${process.env.HARBOR_CLIENT_ID}&client_secret=${process.env.HARBOR_CLIENT_SECRET}`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }}
        );
        const accessToken = tokenResponse.data.access_token;

        // Fetch request info from Harbor
        const requestInfo = await axios.get(
            `https://api.sandbox.harborlockers.com/api/v1/locker-open-requests/${requestId}`,
            { headers: { 'Authorization': `Bearer ${accessToken}` }}
        );

        const lockerId = requestInfo.data.lockerId;
        const towerId = requestInfo.data.towerId;

        if (!lockerId || !towerId) {
            return res.status(400).json({ error: 'Could not find locker/tower info in Harbor response' });
        }

        // Update order
        await db.query(
            `UPDATE orders SET locker_id = $1, tower_id = $2, updated_at = NOW() WHERE id = $3`,
            [lockerId, towerId, order.id]
        );

        logger.info(`✅ Fixed order #${orderNumber}: locker_id=${lockerId}, tower_id=${towerId}`);

        res.json({
            success: true,
            orderNumber,
            lockerId,
            towerId,
            message: 'Order locker info updated successfully'
        });

    } catch (error) {
        logger.error('Error fixing order:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to fix order', details: error.message });
    }
});

// ============================================
// EMERGENCY LOCKER OPEN
// ============================================

// Emergency open locker - for when customer link doesn't work
app.post('/api/emergency-open/:shop', requireApiAuth, async (req, res) => {
    try {
        const { shop } = req.params;
        const { orderNumber, reason, openType = 'pickup' } = req.body;

        logger.info(`🚨 EMERGENCY OPEN requested for order #${orderNumber} (${shop})`);
        logger.info(`   Reason: ${reason}`);
        logger.info(`   Open type: ${openType}`);

        // Validate required fields
        if (!orderNumber) {
            return res.status(400).json({ error: 'Order number is required' });
        }
        if (!reason) {
            return res.status(400).json({ error: 'Reason is required for emergency open' });
        }

        // Get order details
        const orderResult = await db.query(
            `SELECT id, order_number, customer_name, customer_email, customer_phone,
                    locker_id, tower_id, location_id, location_name, status
             FROM orders WHERE shop = $1 AND order_number = $2`,
            [shop, orderNumber]
        );

        if (orderResult.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const order = orderResult.rows[0];

        // Check if we have the necessary locker info
        if (!order.locker_id) {
            return res.status(400).json({
                error: 'No locker assigned to this order. The package may not have been dropped off yet.'
            });
        }

        if (!order.tower_id) {
            return res.status(400).json({
                error: 'Tower ID not found. Cannot open locker without tower information.'
            });
        }

        // Get Harbor token
        const tokenResponse = await axios.post(
            'https://accounts.sandbox.harborlockers.com/realms/harbor/protocol/openid-connect/token',
            `grant_type=client_credentials&scope=service_provider&client_id=${process.env.HARBOR_CLIENT_ID}&client_secret=${process.env.HARBOR_CLIENT_SECRET}`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }}
        );

        const accessToken = tokenResponse.data.access_token;

        let openResult;
        let method = 'new-pickup-link';
        let newPickupLink = null;

        // Generate a new pickup link
        try {
            logger.info(`   🔗 Generating new pickup link for locker ${order.locker_id}...`);

            const pickupResponse = await axios.post(
                'https://api.sandbox.harborlockers.com/api/v1/locker-open-requests/pickup-locker-request',
                {
                    lockerId: parseInt(order.locker_id),
                    keypadIntent: 'pickup',
                    persistKeypadCode: false,
                    returnUrl: `https://app.lockerdrop.it/pickup-success?order=${orderNumber}&shop=${shop}`,
                    clientInfo: `emergency-${orderNumber}-${Date.now()}`,
                    payload: { order_id: order.shopify_order_id, order_number: orderNumber, emergency: true }
                },
                { headers: { 'Authorization': `Bearer ${accessToken}` }}
            );

            newPickupLink = pickupResponse.data.linkToken;
            openResult = pickupResponse.data;

            logger.info(`   ✅ New pickup link generated: ${newPickupLink}`);

            // Update the pickup link in the database
            await db.query(
                'UPDATE orders SET pickup_link = $1, pickup_request_id = $2, updated_at = NOW() WHERE id = $3',
                [newPickupLink, pickupResponse.data.id, order.id]
            );

        } catch (linkError) {
            logger.error(`   ❌ Failed to generate pickup link:`, linkError.response?.data || linkError.message);

            // Check for specific error types
            const errorDetail = linkError.response?.data?.detail || '';
            if (errorDetail.includes('not assigned') || errorDetail.includes('not occupied')) {
                return res.status(400).json({
                    error: 'Locker assignment lost',
                    details: 'The locker is no longer assigned to this order. This can happen if the package was already picked up or the assignment expired.',
                    suggestion: 'Contact Harbor support to verify the package status and re-assign the locker if needed.'
                });
            }

            throw linkError;
        }

        // Log the emergency open action
        await logDataAccess('admin', 'emergency_locker_open', {
            resource_type: 'order',
            resource_id: order.id,
            shop: shop,
            order_number: orderNumber,
            locker_id: order.locker_id,
            tower_id: order.tower_id,
            reason: reason,
            method: method,
            result: 'success'
        }, req);

        // Add note to order
        await db.query(
            `UPDATE orders SET
                notes = COALESCE(notes, '') || $1,
                updated_at = NOW()
             WHERE id = $2`,
            [`\n[${new Date().toISOString()}] EMERGENCY OPEN: ${reason} (Method: ${method})`, order.id]
        );

        res.json({
            success: true,
            message: 'New pickup link generated',
            method: method,
            lockerId: order.locker_id,
            towerId: order.tower_id,
            locationName: order.location_name,
            pickupLink: newPickupLink,
            openResult: openResult,
            note: 'Click the link at the locker to open it, or share with the customer.'
        });

    } catch (error) {
        logger.error('❌ Emergency open failed:', error.response?.data || error.message);

        // Log the failed attempt
        await logDataAccess('admin', 'emergency_locker_open', {
            resource_type: 'order',
            resource_id: req.body.orderNumber,
            shop: req.params.shop,
            reason: req.body.reason,
            result: 'failed',
            error: error.response?.data || error.message
        }, req);

        res.status(500).json({
            error: 'Failed to open locker',
            details: error.response?.data?.message || error.message,
            suggestion: 'If this persists, contact Harbor support directly.'
        });
    }
});

// Regenerate dropoff links for orders without them
app.post('/api/regenerate-links/:shop', requireApiAuth, async (req, res) => {
    try {
        const { shop } = req.params;

        logger.info(`\n🔄 === REGENERATE LINKS DEBUG ===`);
        logger.info(`📍 Shop parameter: "${shop}"`);

        // First, let's see ALL orders for this shop to understand the data
        const allOrders = await db.query(
            'SELECT id, shop, shopify_order_id, order_number, location_id, dropoff_link, status FROM orders WHERE shop = $1',
            [shop]
        );
        logger.info(`📊 Total orders for shop "${shop}": ${allOrders.rows.length}`);
        if (allOrders.rows.length > 0) {
            logger.info(`📋 Orders data:`, JSON.stringify(allOrders.rows, null, 2));
        }

        // Also check what shops exist in the database
        const allShops = await db.query('SELECT DISTINCT shop FROM orders');
        logger.info(`🏪 All shops in orders table:`, allShops.rows.map(r => r.shop));

        // Get orders without dropoff links
        const orders = await db.query(
            'SELECT id, shopify_order_id, order_number, location_id, dropoff_link FROM orders WHERE shop = $1 AND (dropoff_link IS NULL OR dropoff_link = \'\')',
            [shop]
        );

        logger.info(`🔍 Found ${orders.rows.length} orders needing dropoff links`);
        if (orders.rows.length > 0) {
            logger.info(`📝 Orders to regenerate:`, JSON.stringify(orders.rows, null, 2));
        }
        
        let regeneratedCount = 0;
        const errors = [];

        for (const order of orders.rows) {
            try {
                logger.info(`\n🔧 Processing order #${order.order_number} (ID: ${order.id})`);

                if (!order.location_id) {
                    logger.info(`   ⚠️ Skipping order #${order.order_number} — no locker location assigned`);
                    errors.push({ order: order.order_number, error: 'No locker location assigned' });
                    continue;
                }
                const locationId = order.location_id;
                logger.info(`   📍 Using location ID: ${locationId}`);

                // Try to calculate locker size from product dimensions
                let lockerTypeId = 2; // Default to Medium
                let accessToken = accessTokens.get(shop);
                if (!accessToken) {
                    const storeResult = await db.query('SELECT access_token FROM stores WHERE shop = $1', [shop]);
                    if (storeResult.rows.length > 0) {
                        accessToken = storeResult.rows[0].access_token;
                        accessTokens.set(shop, accessToken);
                    }
                }

                // Note: For regenerating links, we don't have the line_items readily available
                // Would need to fetch from Shopify - using default Medium for regeneration
                logger.info(`   📦 Using default Medium locker for regeneration`);

                // Generate dropoff link
                logger.info(`   🔗 Generating dropoff link via Harbor API...`);
                const dropoffLink = await generateDropoffLink(
                    locationId,
                    lockerTypeId,
                    order.shopify_order_id,
                    order.order_number
                );
                logger.info(`   ✅ Got dropoff link:`, dropoffLink.linkToken);
                logger.info(`   📦 Locker ID:`, dropoffLink.lockerId);
                logger.info(`   🏢 Tower ID:`, dropoffLink.towerId);

                // Update order with link, locker_id, and tower_id for proper release on cancellation
                const updateResult = await db.query(
                    'UPDATE orders SET dropoff_link = $1, location_id = $2, locker_id = $3, dropoff_request_id = $4, tower_id = $5 WHERE id = $6 RETURNING id',
                    [dropoffLink.linkToken, locationId, dropoffLink.lockerId, dropoffLink.id, dropoffLink.towerId, order.id]
                );
                logger.info(`   💾 Updated order in DB, rows affected: ${updateResult.rowCount}`);

                regeneratedCount++;
            } catch (error) {
                const errorMsg = error.response?.data?.detail || error.response?.data || error.message;
                logger.error(`❌ Error regenerating link for order ${order.order_number}:`, errorMsg);
                errors.push({ order: order.order_number, error: errorMsg });
            }
        }

        logger.info(`\n🏁 === REGENERATION COMPLETE ===`);
        logger.info(`📊 Found: ${orders.rows.length} orders needing links`);
        logger.info(`✅ Successfully regenerated: ${regeneratedCount} links`);
        logger.info(`❌ Failed: ${errors.length} orders`);

        res.json({
            success: true,
            found: orders.rows.length,
            regenerated: regeneratedCount,
            failed: errors.length,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        logger.error('❌ Error in regenerate-links endpoint:', error);
        res.status(500).json({ error: 'Failed to regenerate links', details: error.message });
    }
});

// Regenerate dropoff link for a SPECIFIC order (handles expired links)
app.post('/api/regenerate-order-link/:shop/:orderNumber', requireApiAuth, async (req, res) => {
    try {
        const { shop, orderNumber } = req.params;

        logger.info(`\n🔄 === REGENERATE SINGLE ORDER LINK ===`);
        logger.info(`📍 Shop: "${shop}", Order: "${orderNumber}"`);

        // Find the order
        const orderResult = await db.query(
            'SELECT id, shopify_order_id, order_number, location_id, locker_id, dropoff_link, status FROM orders WHERE shop = $1 AND order_number = $2',
            [shop, orderNumber]
        );

        if (orderResult.rows.length === 0) {
            logger.info(`❌ Order ${orderNumber} not found for shop ${shop}`);
            return res.status(404).json({ error: 'Order not found' });
        }

        const order = orderResult.rows[0];
        logger.info(`📋 Found order:`, JSON.stringify(order, null, 2));

        if (!order.location_id) {
            return res.status(400).json({ error: 'No locker location assigned to this order. Please assign a locker first.' });
        }
        const locationId = order.location_id;

        // Determine minimum required locker size from product settings
        let minRequiredSize = 'auto';
        const sizeHierarchy = ['small', 'medium', 'large', 'x-large'];

        try {
            // Get the Shopify order to find product IDs
            const accessToken = accessTokens.get(shop) || (await db.query('SELECT access_token FROM stores WHERE shop = $1', [shop])).rows[0]?.access_token;

            if (accessToken && order.shopify_order_id) {
                // Fetch order from Shopify via GraphQL to get line items
                const orderData = await shopifyGraphQL(shop, accessToken, `{
                    order(id: "gid://shopify/Order/${order.shopify_order_id}") {
                        lineItems(first: 50) {
                            edges {
                                node {
                                    product {
                                        legacyResourceId
                                    }
                                    variant {
                                        legacyResourceId
                                    }
                                    quantity
                                }
                            }
                        }
                    }
                }`);

                const lineItems = (orderData.order?.lineItems?.edges || []).map(e => ({
                    product_id: e.node.product?.legacyResourceId,
                    variant_id: e.node.variant?.legacyResourceId,
                    quantity: e.node.quantity
                }));
                logger.info(`📦 Order has ${lineItems.length} line items`);

                // Check product size requirements
                for (const item of lineItems) {
                    const productId = item.product_id?.toString();
                    const variantId = item.variant_id?.toString();

                    if (productId) {
                        const sizeResult = await db.query(
                            'SELECT locker_size FROM product_locker_sizes WHERE shop = $1 AND product_id = $2',
                            [shop, productId]
                        );

                        if (sizeResult.rows.length > 0 && sizeResult.rows[0].locker_size) {
                            const productSize = sizeResult.rows[0].locker_size.toLowerCase();
                            logger.info(`📦 Product ${productId} requires: ${productSize}`);

                            // If product has specific size (not auto), update minimum
                            if (productSize !== 'auto') {
                                const currentIndex = sizeHierarchy.indexOf(minRequiredSize === 'auto' ? 'small' : minRequiredSize);
                                const productIndex = sizeHierarchy.indexOf(productSize);
                                if (productIndex > currentIndex || minRequiredSize === 'auto') {
                                    minRequiredSize = productSize;
                                }
                            }
                        }
                    }
                }
            }
        } catch (e) {
            logger.info(`⚠️ Could not determine product size requirements: ${e.message}`);
        }

        logger.info(`📦 Minimum required locker size: ${minRequiredSize}`);

        // Build list of sizes to try based on minimum requirement
        // Order: start from minimum size, then try larger sizes
        const allSizes = [
            { id: 1, name: 'small' },
            { id: 2, name: 'medium' },
            { id: 3, name: 'large' },
            { id: 4, name: 'x-large' }
        ];

        let lockerSizesToTry;
        if (minRequiredSize === 'auto') {
            // Auto mode: try medium first (most common), then small, then large
            lockerSizesToTry = [
                { id: 2, name: 'medium' },
                { id: 1, name: 'small' },
                { id: 3, name: 'large' },
                { id: 4, name: 'x-large' }
            ];
        } else {
            // Specific size: only try that size and larger
            const minIndex = sizeHierarchy.indexOf(minRequiredSize);
            lockerSizesToTry = allSizes.filter(s => sizeHierarchy.indexOf(s.name) >= minIndex);
            logger.info(`📦 Will only try sizes >= ${minRequiredSize}: ${lockerSizesToTry.map(s => s.name).join(', ')}`);
        }

        let dropoffLink = null;
        let usedSize = null;

        for (const size of lockerSizesToTry) {
            try {
                logger.info(`🔗 Trying ${size.name} locker (type ${size.id})...`);
                dropoffLink = await generateDropoffLink(
                    locationId,
                    size.id,
                    order.shopify_order_id,
                    order.order_number
                );
                usedSize = size.name;
                logger.info(`✅ Success with ${size.name} locker!`);
                break;
            } catch (sizeError) {
                const errorDetail = sizeError.response?.data?.detail || sizeError.message;
                logger.info(`   ❌ ${size.name} failed: ${errorDetail}`);
                if (!errorDetail.includes('No locker available')) {
                    throw sizeError; // Re-throw if it's not an availability issue
                }
            }
        }

        if (!dropoffLink) {
            const triedSizes = lockerSizesToTry.map(s => s.name).join(', ');
            return res.status(400).json({
                error: 'No lockers available',
                details: `No lockers available at this location. Tried: ${triedSizes}. Product requires minimum: ${minRequiredSize}`
            });
        }

        logger.info(`✅ Got new dropoff link:`, dropoffLink.linkToken);
        logger.info(`📦 Locker ID:`, dropoffLink.lockerId, `(${usedSize})`);
        logger.info(`🏢 Tower ID:`, dropoffLink.towerId);

        // Update order with new link and tower_id for proper release on cancellation
        await db.query(
            'UPDATE orders SET dropoff_link = $1, locker_id = $2, dropoff_request_id = $3, tower_id = $4, updated_at = NOW() WHERE id = $5',
            [dropoffLink.linkToken, dropoffLink.lockerId, dropoffLink.id, dropoffLink.towerId, order.id]
        );

        logger.info(`💾 Updated order in database`);

        res.json({
            success: true,
            orderNumber: order.order_number,
            newDropoffLink: dropoffLink.linkToken,
            lockerId: dropoffLink.lockerId,
            lockerSize: usedSize,
            minimumRequired: minRequiredSize
        });
    } catch (error) {
        logger.error('❌ Error regenerating order link:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Failed to regenerate link',
            details: error.response?.data?.detail || error.message
        });
    }
});


// ============================================
// SHOPIFY WEBHOOKS
// ============================================

// Register webhooks after OAuth
async function registerWebhooks(shop, accessToken) {
    const webhooks = [
        { topic: 'ORDERS_CREATE', callbackUrl: 'https://app.lockerdrop.it/webhooks/orders/create' },
        { topic: 'ORDERS_UPDATED', callbackUrl: 'https://app.lockerdrop.it/webhooks/orders/updated' },
        { topic: 'ORDERS_CANCELLED', callbackUrl: 'https://app.lockerdrop.it/webhooks/orders/cancelled' },
        { topic: 'APP_UNINSTALLED', callbackUrl: 'https://app.lockerdrop.it/webhooks/app/uninstalled' }
    ];

    for (const wh of webhooks) {
        try {
            const result = await shopifyGraphQL(shop, accessToken, `
                mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
                    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
                        webhookSubscription { id }
                        userErrors { field message }
                    }
                }
            `, {
                topic: wh.topic,
                webhookSubscription: {
                    callbackUrl: wh.callbackUrl,
                    format: 'JSON'
                }
            });

            const errors = result.webhookSubscriptionCreate?.userErrors;
            if (errors && errors.length > 0) {
                if (errors[0].message?.includes('already been taken') || errors[0].message?.includes('already exists')) {
                    logger.info(`ℹ️ Webhook ${wh.topic} already registered`);
                } else {
                    logger.error(`❌ Error registering ${wh.topic}:`, errors);
                }
            } else {
                logger.info(`✅ Webhook registered: ${wh.topic}`);
            }
        } catch (error) {
            logger.error(`❌ Error registering ${wh.topic}:`, error.message);
        }
    }
}

// Helper to extract LockerDrop info from order (checks note_attributes first, then address2 for backwards compatibility)
function extractLockerDropInfo(order) {
    let lockerInfo = null;

    // First check note_attributes (new method - preserves customer's address2)
    if (order.note_attributes && Array.isArray(order.note_attributes)) {
        const lockerAttr = order.note_attributes.find(attr =>
            attr.name === 'LockerDrop Pickup' && attr.value
        );
        if (lockerAttr) {
            lockerInfo = lockerAttr.value;
            logger.info('📋 Found LockerDrop info in order attributes:', lockerInfo);
        }
    }

    // Fall back to address2 for backwards compatibility
    if (!lockerInfo && order.shipping_address?.address2) {
        const address2 = order.shipping_address.address2;
        if (address2.includes('LockerDrop:')) {
            lockerInfo = address2;
            logger.info('📋 Found LockerDrop info in address2 (legacy):', lockerInfo);
        }
    }

    if (!lockerInfo) {
        return null;
    }

    // Parse the locker info string
    const result = {
        raw: lockerInfo,
        locationId: null,
        reservationRef: null,
        lockerSize: null,
        pickupDate: null
    };

    // Extract location ID: "(ID: 123)"
    const idMatch = lockerInfo.match(/\(ID:\s*(\d+)\)/);
    if (idMatch) {
        result.locationId = parseInt(idMatch[1], 10);
    }

    // Extract reservation ref: "[Res: CHECKOUT_xxx]"
    const resMatch = lockerInfo.match(/\[Res:\s*([^\]]+)\]/);
    if (resMatch) {
        result.reservationRef = resMatch[1].trim();
    }

    // Extract locker size: "[Size: medium]"
    const sizeMatch = lockerInfo.match(/\[Size:\s*([^\]]+)\]/);
    if (sizeMatch) {
        result.lockerSize = sizeMatch[1].trim();
    }

    // Extract pickup date: "Pickup: 2024-01-15"
    const pickupMatch = lockerInfo.match(/Pickup:\s*(\d{4}-\d{2}-\d{2})/);
    if (pickupMatch) {
        result.pickupDate = pickupMatch[1];
    }

    return result;
}

// Webhook receiver for new orders
app.post('/webhooks/orders/create', express.json(), async (req, res) => {
    try {
        const order = req.body;
        // Get shop domain from Shopify webhook header
        const shopDomain = req.headers['x-shopify-shop-domain'];
        logger.info('📦 New order received:', order.id, 'from shop:', shopDomain);

        // Process the order with shop domain
        await processNewOrder(order, shopDomain);

        res.status(200).send('OK');
    } catch (error) {
        logger.error('Error processing order webhook:', error);
        res.status(500).send('Error');
    }
});

// Webhook receiver for order updates
app.post('/webhooks/orders/updated', express.json(), async (req, res) => {
    try {
        const order = req.body;
        const shopDomain = req.headers['x-shopify-shop-domain'];
        logger.info({ orderId: order.id, shop: shopDomain }, 'Order updated webhook received');

        await processOrderUpdate(order, shopDomain);

        res.status(200).send('OK');
    } catch (error) {
        logger.error({ err: error }, 'Error processing order update webhook');
        res.status(500).send('Error');
    }
});

// Webhook receiver for cancelled orders
app.post('/webhooks/orders/cancelled', express.json(), async (req, res) => {
    try {
        const order = req.body;
        const shopDomain = req.headers['x-shopify-shop-domain'];
        logger.info('🚫 Order cancelled:', order.id, 'from shop:', shopDomain);

        await processOrderCancellation(order, shopDomain);

        res.status(200).send('OK');
    } catch (error) {
        logger.error('Error processing cancellation webhook:', error);
        res.status(500).send('Error');
    }
});

// Webhook receiver for app uninstall
app.post('/webhooks/app/uninstalled', express.json(), async (req, res) => {
    try {
        const shopDomain = req.headers['x-shopify-shop-domain'];
        logger.info('🗑️ App uninstalled for shop:', shopDomain);

        await processAppUninstall(shopDomain);

        res.status(200).send('OK');
    } catch (error) {
        logger.error('Error processing app/uninstalled webhook:', error);
        res.status(200).send('OK'); // Always respond 200 to Shopify
    }
});

// ==================== GDPR Mandatory Webhooks ====================

// customers/data_request — Customer requests a copy of their data
app.post('/webhooks/customers/data_request', express.json(), async (req, res) => {
    try {
        const shopDomain = req.headers['x-shopify-shop-domain'];
        const { shop_domain, customer, orders_requested } = req.body;
        const shop = shopDomain || shop_domain;
        const customerId = customer?.id;
        const customerEmail = customer?.email;

        logger.info({ shop, customerId, customerEmail, ordersRequested: orders_requested },
            'GDPR: Customer data request received');

        // Query all order data we hold for this customer
        const customerOrders = await db.query(
            `SELECT order_number, customer_name, customer_email, customer_phone,
                    locker_name, status, preferred_pickup_date, created_at, updated_at
             FROM orders WHERE shop = $1 AND (customer_email = $2 OR customer_name = $3)`,
            [shop, customerEmail, customer?.first_name ? `${customer.first_name} ${customer.last_name}` : '']
        );

        logger.info({ shop, customerId, orderCount: customerOrders.rows.length },
            'GDPR: Customer data request processed — data available for manual export if needed');

        // Shopify expects a 200 response. The actual data export is handled
        // offline per GDPR requirements (respond to customer within 30 days).
        res.status(200).send('OK');
    } catch (error) {
        logger.error({ err: error }, 'Error processing customers/data_request webhook');
        res.status(200).send('OK');
    }
});

// customers/redact — Customer requests deletion of their personal data
app.post('/webhooks/customers/redact', express.json(), async (req, res) => {
    try {
        const shopDomain = req.headers['x-shopify-shop-domain'];
        const { shop_domain, customer, orders_to_redact } = req.body;
        const shop = shopDomain || shop_domain;
        const customerId = customer?.id;
        const customerEmail = customer?.email;

        logger.info({ shop, customerId, customerEmail, ordersToRedact: orders_to_redact },
            'GDPR: Customer redact request received');

        // Redact customer PII from orders — replace with anonymized placeholders
        const result = await db.query(
            `UPDATE orders
             SET customer_email = 'redacted@redacted.com',
                 customer_name = 'Redacted Customer',
                 customer_phone = NULL,
                 updated_at = NOW()
             WHERE shop = $1 AND customer_email = $2`,
            [shop, customerEmail]
        );

        // Also redact by order IDs if Shopify provided them
        if (orders_to_redact && orders_to_redact.length > 0) {
            const orderIds = orders_to_redact.map(String);
            await db.query(
                `UPDATE orders
                 SET customer_email = 'redacted@redacted.com',
                     customer_name = 'Redacted Customer',
                     customer_phone = NULL,
                     updated_at = NOW()
                 WHERE shop = $1 AND shopify_order_id = ANY($2)`,
                [shop, orderIds]
            );
        }

        logger.info({ shop, customerId, rowsUpdated: result.rowCount },
            'GDPR: Customer data redacted from orders');

        res.status(200).send('OK');
    } catch (error) {
        logger.error({ err: error }, 'Error processing customers/redact webhook');
        res.status(200).send('OK');
    }
});

// shop/redact — Shop data deletion request (48 hours after app uninstall)
app.post('/webhooks/shop/redact', express.json(), async (req, res) => {
    try {
        const shopDomain = req.headers['x-shopify-shop-domain'];
        const { shop_domain } = req.body;
        const shop = shopDomain || shop_domain;

        logger.info({ shop }, 'GDPR: Shop redact request received');

        // Reuse the same cleanup logic as app/uninstalled
        // This is a safety net — data should already be deleted by processAppUninstall
        await processAppUninstall(shop);

        logger.info({ shop }, 'GDPR: Shop data redacted');

        res.status(200).send('OK');
    } catch (error) {
        logger.error({ err: error }, 'Error processing shop/redact webhook');
        res.status(200).send('OK');
    }
});

// ==================== End GDPR Webhooks ====================

async function processAppUninstall(shop) {
    if (!shop) {
        logger.info('❌ No shop domain in uninstall webhook');
        return;
    }

    try {
        logger.info(`🗑️ Cleaning up data for ${shop}...`);

        // Release any active lockers in Harbor before deleting orders
        const activeOrders = await db.query(
            `SELECT id, locker_id, tower_id, status FROM orders
             WHERE shop = $1 AND status NOT IN ('completed', 'cancelled')
             AND locker_id IS NOT NULL AND tower_id IS NOT NULL`,
            [shop]
        );

        if (activeOrders.rows.length > 0) {
            logger.info(`   🔓 Releasing ${activeOrders.rows.length} active locker(s)...`);
            try {
                const tokenResponse = await axios.post(
                    'https://accounts.sandbox.harborlockers.com/realms/harbor/protocol/openid-connect/token',
                    `grant_type=client_credentials&scope=service_provider&client_id=${process.env.HARBOR_CLIENT_ID}&client_secret=${process.env.HARBOR_CLIENT_SECRET}`,
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }}
                );
                const harborToken = tokenResponse.data.access_token;

                for (const order of activeOrders.rows) {
                    try {
                        await axios.post(
                            `https://api.sandbox.harborlockers.com/api/v1/towers/${order.tower_id}/lockers/${order.locker_id}/release-locker`,
                            {},
                            { headers: { 'Authorization': `Bearer ${harborToken}` }}
                        );
                        logger.info(`   ✅ Released locker ${order.locker_id} (order ${order.id})`);
                    } catch (harborError) {
                        logger.info(`   ⚠️ Could not release locker ${order.locker_id}: ${harborError.response?.data?.detail || harborError.message}`);
                    }
                }
            } catch (tokenError) {
                logger.info(`   ⚠️ Could not authenticate with Harbor to release lockers: ${tokenError.message}`);
            }
        }

        // Delete shop data in order (respecting foreign keys)
        await db.query('DELETE FROM locker_events WHERE order_id IN (SELECT id FROM orders WHERE shop = $1)', [shop]);
        await db.query('DELETE FROM orders WHERE shop = $1', [shop]);
        await db.query('DELETE FROM locker_preferences WHERE shop = $1', [shop]);
        await db.query('DELETE FROM product_locker_sizes WHERE shop = $1', [shop]);
        await db.query('DELETE FROM shop_settings WHERE shop = $1', [shop]);
        await db.query('DELETE FROM subscriptions WHERE shop = $1', [shop]);

        // Delete branding settings and uploaded logo
        try {
            const branding = await db.query('SELECT logo_url FROM branding_settings WHERE shop = $1', [shop]);
            if (branding.rows.length > 0 && branding.rows[0].logo_url) {
                const logoPath = path.join(__dirname, 'public', branding.rows[0].logo_url);
                if (fs.existsSync(logoPath)) {
                    fs.unlinkSync(logoPath);
                    logger.info(`   🗑️ Deleted logo file: ${logoPath}`);
                }
            }
            await db.query('DELETE FROM branding_settings WHERE shop = $1', [shop]);
        } catch (e) {
            // branding_settings table may not exist yet
        }

        // Delete sessions for this shop
        try {
            await db.query(`DELETE FROM user_sessions WHERE sess::text LIKE $1`, [`%${shop}%`]);
        } catch (e) {
            // user_sessions table may not exist yet
        }

        // Delete store record and access token last
        await db.query('DELETE FROM stores WHERE shop = $1', [shop]);

        // Remove from in-memory token cache
        accessTokens.delete(shop);

        logger.info(`✅ All data cleaned up for ${shop}`);
    } catch (error) {
        logger.error(`❌ Error cleaning up data for ${shop}:`, error);
    }
}

async function processOrderCancellation(order, shopDomain) {
    try {
        const shopifyOrderId = order.id?.toString();
        const orderNumber = order.order_number?.toString() || order.name?.replace('#', '');

        logger.info(`🚫 Processing cancellation for order #${orderNumber} (${shopifyOrderId})`);

        // Find the order in our database
        const orderResult = await db.query(
            'SELECT id, locker_id, tower_id, dropoff_request_id, status FROM orders WHERE shopify_order_id = $1 OR order_number = $2',
            [shopifyOrderId, orderNumber]
        );

        if (orderResult.rows.length === 0) {
            logger.info(`   Order not found in LockerDrop database, skipping`);
            return;
        }

        const lockerOrder = orderResult.rows[0];

        // Don't cancel already completed orders
        if (lockerOrder.status === 'completed') {
            logger.info(`   Order already completed, skipping cancellation`);
            return;
        }

        // Release the locker in Harbor if we have the necessary info
        if (lockerOrder.locker_id && lockerOrder.tower_id) {
            try {
                const tokenResponse = await axios.post(
                    'https://accounts.sandbox.harborlockers.com/realms/harbor/protocol/openid-connect/token',
                    `grant_type=client_credentials&scope=service_provider&client_id=${process.env.HARBOR_CLIENT_ID}&client_secret=${process.env.HARBOR_CLIENT_SECRET}`,
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }}
                );
                const accessToken = tokenResponse.data.access_token;

                logger.info(`   🔓 Releasing locker ${lockerOrder.locker_id} in tower ${lockerOrder.tower_id}...`);
                await axios.post(
                    `https://api.sandbox.harborlockers.com/api/v1/towers/${lockerOrder.tower_id}/lockers/${lockerOrder.locker_id}/release-locker`,
                    {},
                    { headers: { 'Authorization': `Bearer ${accessToken}` }}
                );
                logger.info(`   ✅ Locker released successfully`);
            } catch (harborError) {
                logger.info(`   ⚠️ Could not release locker: ${harborError.response?.data?.detail || harborError.message}`);
            }
        } else {
            logger.info(`   ⚠️ Cannot release locker - missing tower_id or locker_id`);
        }

        // Update our database - clear locker info and mark as cancelled
        await db.query(
            `UPDATE orders SET
                status = 'cancelled',
                dropoff_link = NULL,
                pickup_link = NULL,
                locker_id = NULL,
                tower_id = NULL,
                updated_at = NOW()
            WHERE id = $1`,
            [lockerOrder.id]
        );

        logger.info({ orderNumber }, 'Order cancelled in LockerDrop');
    } catch (error) {
        logger.error({ err: error }, 'Error processing order cancellation');
    }
}

// Process order updates from Shopify (sync customer info, shipping changes, etc.)
async function processOrderUpdate(order, shopDomain) {
    try {
        const shopifyOrderId = order.id?.toString();
        const orderNumber = order.order_number?.toString() || order.name?.replace('#', '');

        // Find the order in our database
        const orderResult = await db.query(
            'SELECT id, status FROM orders WHERE shopify_order_id = $1 OR order_number = $2',
            [shopifyOrderId, orderNumber]
        );

        if (orderResult.rows.length === 0) {
            // Not a LockerDrop order, skip silently
            return;
        }

        const lockerOrder = orderResult.rows[0];

        // Don't update completed/cancelled/expired orders
        if (['completed', 'cancelled', 'expired'].includes(lockerOrder.status)) {
            return;
        }

        // Sync customer info and shipping details
        const customerName = order.customer ?
            `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() :
            order.shipping_address ? `${order.shipping_address.first_name || ''} ${order.shipping_address.last_name || ''}`.trim() : null;

        const customerEmail = order.email || order.customer?.email || null;
        const customerPhone = order.phone || order.customer?.phone || order.shipping_address?.phone || null;

        // Update customer info if changed
        const updates = [];
        const values = [];
        let paramIndex = 1;

        if (customerName) {
            updates.push(`customer_name = $${paramIndex++}`);
            values.push(customerName);
        }
        if (customerEmail) {
            updates.push(`customer_email = $${paramIndex++}`);
            values.push(customerEmail);
        }
        if (customerPhone) {
            updates.push(`customer_phone = $${paramIndex++}`);
            values.push(customerPhone);
        }

        // Check if Shopify order was fulfilled externally
        if (order.fulfillment_status === 'fulfilled' && lockerOrder.status !== 'completed') {
            updates.push(`status = $${paramIndex++}`);
            values.push('completed');
            logger.info({ orderNumber }, 'Order marked completed via Shopify fulfillment');
        }

        if (updates.length > 0) {
            updates.push(`updated_at = NOW()`);
            values.push(lockerOrder.id);
            await db.query(
                `UPDATE orders SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
                values
            );
            logger.info({ orderNumber, updatedFields: updates.length - 1 }, 'Order synced from Shopify update');
        }
    } catch (error) {
        logger.error({ err: error }, 'Error processing order update');
    }
}

async function processNewOrder(order, shopDomain) {
    try {
        logger.info('📦 Processing order:', order.id);
        logger.info('🏪 Order data:', JSON.stringify(order, null, 2).substring(0, 500)); // First 500 chars

        // Check if this order uses LockerDrop shipping
        const hasLockerDropShipping = order.shipping_lines.some(line =>
            line.title && line.title.toLowerCase().includes('lockerdrop')
        );

        if (!hasLockerDropShipping) {
            logger.info('⏭️ Order does not use LockerDrop shipping, skipping');
            return;
        }

        logger.info('✅ Order uses LockerDrop! Processing...');

        // Get shop from webhook header, fallback to order URL parsing
        const shop = shopDomain || order.order_status_url?.match(/https:\/\/([^\/]+)/)?.[1];
        if (!shop) {
            logger.info('❌ Could not determine shop domain');
            return;
        }
        logger.info('🏪 Using shop:', shop);

        // Check for existing reservation from checkout
        // LockerDrop info can be in note_attributes (new) or address2 (legacy)
        const lockerDropInfo = extractLockerDropInfo(order);
        const reservationRef = lockerDropInfo?.reservationRef || null;
        const preferredPickupDate = lockerDropInfo?.pickupDate || null;

        if (preferredPickupDate) {
            logger.info(`📅 Customer selected pickup date: ${preferredPickupDate}`);
        }

        if (reservationRef) {
            logger.info(`🔒 Found reservation reference: ${reservationRef}`);

            // Look up the reservation
            const reservationResult = await db.query(
                `SELECT * FROM locker_reservations
                 WHERE reservation_ref = $1 AND status = 'pending' AND expires_at > NOW()`,
                [reservationRef]
            );

            if (reservationResult.rows.length > 0) {
                const reservation = reservationResult.rows[0];
                logger.info(`✅ Using pre-reserved locker: ${reservation.locker_id} (${reservation.locker_size})`);

                // Mark reservation as used
                await db.query(
                    `UPDATE locker_reservations
                     SET status = 'used', used_by_order_id = $1, used_at = NOW()
                     WHERE reservation_ref = $2`,
                    [order.id.toString(), reservationRef]
                );

                // Get customer phone
                const customerPhone = order.phone ||
                    order.shipping_address?.phone ||
                    order.billing_address?.phone ||
                    order.customer?.phone ||
                    null;

                // Save order using the reservation's dropoff link
                await db.query(
                    `INSERT INTO orders (
                        shop, shopify_order_id, order_number,
                        customer_email, customer_name, customer_phone,
                        location_id, locker_id, tower_id,
                        dropoff_link, dropoff_request_id, status, preferred_pickup_date
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
                    [
                        shop,
                        order.id.toString(),
                        order.order_number.toString(),
                        order.email,
                        order.customer ? `${order.customer.first_name} ${order.customer.last_name}` : 'Guest',
                        customerPhone,
                        reservation.location_id,
                        reservation.locker_id,
                        reservation.tower_id,
                        reservation.dropoff_link,
                        reservation.dropoff_request_id,
                        'pending_dropoff',
                        preferredPickupDate
                    ]
                );

                // Increment order count for billing
                const canProcess = await canProcessOrder(shop);
                if (canProcess.allowed) {
                    await incrementOrderCount(shop);
                }

                logger.info(`✅ Order saved with pre-reserved locker! Link: ${reservation.dropoff_link}`);
                return; // Done - no need to allocate a new locker
            } else {
                logger.info(`⚠️ Reservation ${reservationRef} not found or expired, falling back to new allocation`);
            }
        }

        // No reservation found - proceed with normal allocation
        logger.info('📦 No reservation found, attempting new locker allocation...');

        // Check subscription status before processing
        const canProcess = await canProcessOrder(shop);
        if (!canProcess.allowed) {
            logger.info(`⚠️ Order rejected - subscription issue: ${canProcess.reason}`);
            if (canProcess.reason === 'trial_expired') {
                logger.info('   Trial has expired - shop needs to subscribe');
            } else if (canProcess.reason === 'limit_reached') {
                logger.info(`   Monthly limit reached (${canProcess.subscription.orders_this_month}/${canProcess.subscription.monthly_order_limit})`);
            } else {
                logger.info('   Subscription is inactive');
            }
            // Still save the order but mark it as subscription_blocked
            // For now we'll let it through but log the warning
            // In production, you might want to notify the merchant
        } else {
            // Increment order count for billing
            await incrementOrderCount(shop);
            logger.info(`📊 Order counted for billing (${canProcess.subscription.orders_this_month + 1} this month)`);
        }

        // Get access token for fetching product details
        let accessToken = accessTokens.get(shop);
        if (!accessToken) {
            const storeResult = await db.query('SELECT access_token FROM stores WHERE shop = $1', [shop]);
            if (storeResult.rows.length > 0) {
                accessToken = storeResult.rows[0].access_token;
                accessTokens.set(shop, accessToken);
            }
        }

        // Calculate required locker size from product dimensions
        let minLockerTypeId = 2; // Default to Medium
        if (accessToken && order.line_items?.length > 0) {
            logger.info('📦 Fetching product dimensions for locker size calculation...');
            const productDimensions = await getProductDimensionsFromOrder(shop, accessToken, order.line_items);
            minLockerTypeId = calculateRequiredLockerSize(productDimensions);
            logger.info(`📦 Selected minimum locker type: ${minLockerTypeId} (${LOCKER_SIZES.find(s => s.id === minLockerTypeId)?.name || 'Unknown'})`);
        } else {
            logger.info('📦 No access token or line items, using default Medium locker');
        }

        // First, try to extract location ID from shipping_lines service_code (e.g., "lockerdrop_329")
        let locationId = null;
        const lockerDropShippingLine = order.shipping_lines?.find(line =>
            line.title?.toLowerCase().includes('lockerdrop')
        );

        if (lockerDropShippingLine?.code) {
            const codeMatch = lockerDropShippingLine.code.match(/lockerdrop_(\d+)/i);
            if (codeMatch) {
                locationId = parseInt(codeMatch[1], 10);
                logger.info(`📍 Extracted location ID ${locationId} from shipping line code: ${lockerDropShippingLine.code}`);
            }
        }

        // Also try to extract from note_attributes or address2 if checkout extension set it
        if (!locationId && lockerDropInfo?.locationId) {
            locationId = lockerDropInfo.locationId;
            logger.info(`📍 Extracted location ID ${locationId} from order attributes/address2`);
        }

        // Fall back to seller's preferred lockers if no location found
        if (!locationId) {
            const preferences = await db.query(
                'SELECT * FROM locker_preferences WHERE shop = $1 AND is_enabled = true ORDER BY created_at ASC LIMIT 1',
                [shop]
            );

            if (preferences.rows.length === 0) {
                logger.info('❌ No locker preferences set for this shop and no location in shipping lines');
                return;
            }
            locationId = preferences.rows[0].location_id;
            logger.info(`📍 Using seller preferred location: ${locationId}`);
        }

        const preferredLocation = { location_id: locationId };

        // Get customer phone from order (try multiple places)
        const customerPhone = order.phone ||
                              order.shipping_address?.phone ||
                              order.billing_address?.phone ||
                              order.customer?.phone ||
                              null;

        // Build list of locker sizes to try (from minimum required size up to x-large)
        const allSizes = [
            { id: 1, name: 'small' },
            { id: 2, name: 'medium' },
            { id: 3, name: 'large' },
            { id: 4, name: 'x-large' }
        ];
        const lockerSizesToTry = allSizes.filter(s => s.id >= minLockerTypeId);
        logger.info(`📦 Will try locker sizes: ${lockerSizesToTry.map(s => s.name).join(', ')}`);

        // Try each locker size starting from minimum required
        let dropoffLink = null;
        let usedSize = null;

        for (const size of lockerSizesToTry) {
            try {
                logger.info(`🔗 Trying ${size.name} locker (type ${size.id})...`);
                dropoffLink = await generateDropoffLink(
                    preferredLocation.location_id,
                    size.id,
                    order.id,
                    order.order_number
                );
                usedSize = size.name;
                logger.info(`✅ Success with ${size.name} locker!`);
                break;
            } catch (sizeError) {
                const errorDetail = sizeError.response?.data?.detail || sizeError.message;
                logger.info(`   ❌ ${size.name} failed: ${errorDetail}`);
                if (!errorDetail.includes('No locker available')) {
                    throw sizeError; // Re-throw if it's not an availability issue
                }
            }
        }

        // Save order to database (even if no locker available)
        if (dropoffLink) {
            await db.query(
                `INSERT INTO orders (
                    shop, shopify_order_id, order_number,
                    customer_email, customer_name, customer_phone,
                    location_id, locker_id, tower_id,
                    dropoff_link, dropoff_request_id, status, preferred_pickup_date
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
                [
                    shop,
                    order.id.toString(),
                    order.order_number.toString(),
                    order.email,
                    order.customer ? `${order.customer.first_name} ${order.customer.last_name}` : 'Guest',
                    customerPhone,
                    preferredLocation.location_id,
                    dropoffLink.lockerId,
                    dropoffLink.towerId,
                    dropoffLink.linkToken,
                    dropoffLink.id,
                    'pending_dropoff',
                    preferredPickupDate
                ]
            );
            logger.info(`✅ Order saved! Dropoff link: ${dropoffLink.linkToken} (${usedSize} locker)`);
        } else {
            // No locker available - save order with pending_allocation status
            const triedSizes = lockerSizesToTry.map(s => s.name).join(', ');
            logger.info(`⚠️ No lockers available at location ${preferredLocation.location_id}. Tried: ${triedSizes}`);

            await db.query(
                `INSERT INTO orders (
                    shop, shopify_order_id, order_number,
                    customer_email, customer_name, customer_phone,
                    location_id, status, preferred_pickup_date
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    shop,
                    order.id.toString(),
                    order.order_number.toString(),
                    order.email,
                    order.customer ? `${order.customer.first_name} ${order.customer.last_name}` : 'Guest',
                    customerPhone,
                    preferredLocation.location_id,
                    'pending_allocation',
                    preferredPickupDate
                ]
            );
            logger.info(`✅ Order saved with pending_allocation status - needs manual locker assignment`);
        }

        // Send email to seller with dropoff link
        // Get store email from Shopify or use a default notification email
        const storeResult = await db.query('SELECT shop FROM stores WHERE shop = $1', [shop]);
        if (storeResult.rows.length > 0) {
            const customerName = order.customer ? `${order.customer.first_name} ${order.customer.last_name}` : 'Guest';

            if (dropoffLink) {
                // For now, we'll log the notification. In production, you'd get the seller's email from the store settings
                const dropoffUrl = dropoffLink.linkToken;
                logger.info(`📧 Seller notification: New LockerDrop order #${order.order_number} from ${customerName}`);
                logger.info(`   Dropoff link: ${dropoffUrl}`);
            } else {
                // No locker available - notify seller to manually assign
                logger.info(`📧 Seller notification: New LockerDrop order #${order.order_number} from ${customerName}`);
                logger.info(`   ⚠️ NO LOCKER AVAILABLE - please assign a locker manually from the admin dashboard`);
            }

            // If you have the seller's email stored, you could send:
            // await sendEmail(
            //     sellerEmail,
            //     `New LockerDrop Order #${order.order_number} - Action Required`,
            //     `... email template with dropoff link ...`
            // );
        }

    } catch (error) {
        logger.error('Error processing order:', error);
    }
}

async function generateDropoffLink(locationId, lockerTypeId, orderId, orderNumber) {
    logger.info(`🔗 generateDropoffLink called with: locationId=${locationId}, lockerTypeId=${lockerTypeId}, orderId=${orderId}, orderNumber=${orderNumber}`);

    // Get Harbor token
    const tokenResponse = await axios.post(
        'https://accounts.sandbox.harborlockers.com/realms/harbor/protocol/openid-connect/token',
        `grant_type=client_credentials&scope=service_provider&client_id=${process.env.HARBOR_CLIENT_ID}&client_secret=${process.env.HARBOR_CLIENT_SECRET}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }}
    );

    const accessToken = tokenResponse.data.access_token;
    logger.info(`   ✅ Got Harbor access token`);

    // Create dropoff request
    // Note: requireLowLocker removed to allow all available lockers
    const dropoffResponse = await axios.post(
        'https://api.sandbox.harborlockers.com/api/v1/locker-open-requests/dropoff-locker-request',
        {
            locationId,
            lockerTypeId,
            keypadIntent: 'pickup',
            persistKeypadCode: false,
            returnUrl: `https://app.lockerdrop.it/dropoff-success?order=${orderNumber}`,
            clientInfo: `order-${orderNumber}`,
            payload: { order_id: orderId, order_number: orderNumber }
        },
        { headers: { 'Authorization': `Bearer ${accessToken}` }}
    );

    logger.info(`   ✅ Harbor API response:`, JSON.stringify(dropoffResponse.data, null, 2));

    return dropoffResponse.data;
}

// ============================================
// DATA RETENTION - Auto-delete old customer data
// ============================================

// Run daily to delete customer PII from orders completed > 90 days ago
async function cleanupOldCustomerData() {
    try {
        const result = await db.query(`
            UPDATE orders
            SET
                customer_email = NULL,
                customer_name = 'Deleted',
                customer_phone = NULL,
                updated_at = NOW()
            WHERE
                status = 'completed'
                AND updated_at < NOW() - INTERVAL '90 days'
                AND customer_email IS NOT NULL
            RETURNING id, order_number
        `);

        if (result.rows.length > 0) {
            logger.info(`🗑️ Data retention: Cleaned up customer data from ${result.rows.length} old orders`);

            // Log this cleanup action
            await logDataAccess('system', 'data_retention_cleanup', {
                action: 'delete_customer_pii',
                orders_cleaned: result.rows.length,
                order_numbers: result.rows.map(r => r.order_number)
            });
        }
    } catch (error) {
        logger.error('Error in data retention cleanup:', error);
    }
}

// Schedule cleanup to run daily at 3 AM
function scheduleDataRetention() {
    // Run immediately on startup (in case server was down)
    cleanupOldCustomerData();

    // Then run every 24 hours
    setInterval(cleanupOldCustomerData, 24 * 60 * 60 * 1000);
    logger.info('Data retention cleanup scheduled (daily)');
}

// ============================================
// LOCKER EXPIRY - Auto-release expired orders
// ============================================

// Check for orders past their hold_time_days and send warnings / auto-release
async function checkLockerExpiry() {
    try {
        // Get all shops with their hold_time_days setting
        const shops = await db.query(`
            SELECT s.shop, COALESCE(ss.hold_time_days, 5) as hold_time_days
            FROM stores s
            LEFT JOIN shop_settings ss ON ss.shop = s.shop
        `);

        for (const shopRow of shops.rows) {
            const { shop, hold_time_days } = shopRow;

            // Find orders that are past their hold time (pending_dropoff or ready_for_pickup)
            const expiredOrders = await db.query(`
                SELECT o.id, o.order_number, o.customer_email, o.customer_name,
                       o.locker_id, o.tower_id, o.status, o.created_at,
                       EXTRACT(DAY FROM NOW() - o.created_at) as days_since_created
                FROM orders o
                WHERE o.shop = $1
                  AND o.status IN ('pending_dropoff', 'ready_for_pickup')
                  AND o.created_at < NOW() - INTERVAL '1 day' * $2
                  AND o.locker_id IS NOT NULL
                  AND o.tower_id IS NOT NULL
            `, [shop, hold_time_days]);

            if (expiredOrders.rows.length === 0) continue;

            logger.info({ shop, count: expiredOrders.rows.length, hold_time_days }, 'Found expired locker orders');

            // Get Harbor token for releasing lockers
            let harborToken = null;
            try {
                const tokenResponse = await axios.post(
                    'https://accounts.sandbox.harborlockers.com/realms/harbor/protocol/openid-connect/token',
                    `grant_type=client_credentials&scope=service_provider&client_id=${process.env.HARBOR_CLIENT_ID}&client_secret=${process.env.HARBOR_CLIENT_SECRET}`,
                    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }}
                );
                harborToken = tokenResponse.data.access_token;
            } catch (tokenError) {
                logger.error({ err: tokenError, shop }, 'Could not authenticate with Harbor for expiry check');
                continue;
            }

            for (const order of expiredOrders.rows) {
                try {
                    // Release the locker in Harbor
                    await axios.post(
                        `https://api.sandbox.harborlockers.com/api/v1/towers/${order.tower_id}/lockers/${order.locker_id}/release-locker`,
                        {},
                        { headers: { 'Authorization': `Bearer ${harborToken}` }}
                    );

                    // Update order status to expired
                    await db.query(
                        `UPDATE orders SET status = 'expired', locker_id = NULL, tower_id = NULL, updated_at = NOW() WHERE id = $1`,
                        [order.id]
                    );

                    logger.info({ orderId: order.id, orderNumber: order.order_number, daysSinceCreated: order.days_since_created }, 'Locker released due to expiry');

                    // Notify customer if we have their email
                    if (order.customer_email) {
                        await sendEmail(
                            order.customer_email,
                            `Your LockerDrop pickup for order #${order.order_number} has expired`,
                            `<p>Hi ${order.customer_name || 'there'},</p>
                            <p>Your locker pickup for order <strong>#${order.order_number}</strong> has expired after ${hold_time_days} days.</p>
                            <p>Please contact the store to arrange a new pickup or alternative delivery.</p>
                            <p>— LockerDrop</p>`
                        );
                    }

                    // Notify seller via email
                    const storeResult = await db.query('SELECT access_token FROM stores WHERE shop = $1', [shop]);
                    if (storeResult.rows.length > 0) {
                        try {
                            const shopData = await shopifyGraphQL(shop, storeResult.rows[0].access_token, '{ shop { email } }');
                            if (shopData.shop?.email) {
                                await sendEmail(
                                    shopData.shop.email,
                                    `LockerDrop: Order #${order.order_number} locker expired`,
                                    `<p>Order <strong>#${order.order_number}</strong> has expired after ${hold_time_days} days in the locker.</p>
                                    <p>The locker has been released. Please arrange alternative fulfillment for this order.</p>
                                    <p>Customer: ${order.customer_name || 'N/A'} (${order.customer_email || 'no email'})</p>`
                                );
                            }
                        } catch (e) {
                            // Non-critical: seller notification failed
                        }
                    }
                } catch (releaseError) {
                    logger.error({ err: releaseError, orderId: order.id }, 'Failed to release expired locker');
                }
            }
        }

        // Also warn about orders approaching expiry (1 day before)
        const warningOrders = await db.query(`
            SELECT o.id, o.order_number, o.customer_email, o.customer_name, o.shop,
                   COALESCE(ss.hold_time_days, 5) as hold_time_days
            FROM orders o
            JOIN stores s ON s.shop = o.shop
            LEFT JOIN shop_settings ss ON ss.shop = o.shop
            WHERE o.status IN ('pending_dropoff', 'ready_for_pickup')
              AND o.locker_id IS NOT NULL
              AND o.created_at >= NOW() - INTERVAL '1 day' * COALESCE(ss.hold_time_days, 5)
              AND o.created_at < NOW() - INTERVAL '1 day' * (COALESCE(ss.hold_time_days, 5) - 1)
        `);

        for (const order of warningOrders.rows) {
            if (order.customer_email) {
                await sendEmail(
                    order.customer_email,
                    `Reminder: Pick up order #${order.order_number} from your locker tomorrow`,
                    `<p>Hi ${order.customer_name || 'there'},</p>
                    <p>This is a friendly reminder that your locker pickup for order <strong>#${order.order_number}</strong> expires tomorrow.</p>
                    <p>Please pick up your package as soon as possible to avoid having to arrange a new delivery.</p>
                    <p>— LockerDrop</p>`
                );
                logger.info({ orderNumber: order.order_number }, 'Sent expiry warning email');
            }
        }
    } catch (error) {
        logger.error({ err: error }, 'Error in locker expiry check');
    }
}

// Schedule locker expiry check - runs every 6 hours
function scheduleLockerExpiryCheck() {
    // Run at 6 AM, 12 PM, 6 PM, midnight
    cron.schedule('0 0,6,12,18 * * *', () => {
        logger.info('Running scheduled locker expiry check');
        checkLockerExpiry();
    });
    // Also run once on startup after a short delay
    setTimeout(checkLockerExpiry, 30000);
    logger.info('Locker expiry check scheduled (every 6 hours)');
}

// ============================================
// STUCK ORDER DETECTION
// ============================================

async function checkStuckOrders() {
    try {
        const shops = await db.query(`
            SELECT s.shop, s.access_token FROM stores s
        `);

        for (const shopRow of shops.rows) {
            const { shop, access_token } = shopRow;

            // 1. Orders stuck in pending_dropoff for 24+ hours
            //    Seller either forgot or dropped off but callback never fired
            const stuckPendingDropoff = await db.query(`
                SELECT id, order_number, customer_name, customer_email, locker_name,
                       dropoff_link, created_at,
                       EXTRACT(HOURS FROM NOW() - created_at) as hours_stuck
                FROM orders
                WHERE shop = $1
                  AND status = 'pending_dropoff'
                  AND created_at < NOW() - INTERVAL '24 hours'
            `, [shop]);

            // 2. Orders stuck in dropped_off for 1+ hour
            //    Dropoff detected but pickup link generation may have failed
            const stuckDroppedOff = await db.query(`
                SELECT id, order_number, customer_name, customer_email, locker_name,
                       updated_at,
                       EXTRACT(HOURS FROM NOW() - updated_at) as hours_stuck
                FROM orders
                WHERE shop = $1
                  AND status = 'dropped_off'
                  AND updated_at < NOW() - INTERVAL '1 hour'
            `, [shop]);

            const totalStuck = stuckPendingDropoff.rows.length + stuckDroppedOff.rows.length;
            if (totalStuck === 0) continue;

            logger.warn({
                shop,
                stuckPendingDropoff: stuckPendingDropoff.rows.length,
                stuckDroppedOff: stuckDroppedOff.rows.length
            }, `Found ${totalStuck} stuck order(s)`);

            // Build alert email for the seller
            let emailHtml = `<p>The following LockerDrop orders may need your attention:</p>`;

            if (stuckPendingDropoff.rows.length > 0) {
                emailHtml += `<h3>Awaiting Drop-off (24+ hours)</h3>
                    <p>These orders have been waiting for drop-off for over 24 hours. If you already dropped off the package, the confirmation may not have been recorded — try opening the order in your dashboard and clicking "Mark as Dropped Off".</p>
                    <table style="border-collapse:collapse;width:100%">
                    <tr style="background:#f4f4f4"><th style="padding:8px;text-align:left;border:1px solid #ddd">Order</th><th style="padding:8px;text-align:left;border:1px solid #ddd">Customer</th><th style="padding:8px;text-align:left;border:1px solid #ddd">Locker</th><th style="padding:8px;text-align:left;border:1px solid #ddd">Hours Waiting</th></tr>`;
                for (const order of stuckPendingDropoff.rows) {
                    emailHtml += `<tr>
                        <td style="padding:8px;border:1px solid #ddd">#${order.order_number}</td>
                        <td style="padding:8px;border:1px solid #ddd">${order.customer_name || 'N/A'}</td>
                        <td style="padding:8px;border:1px solid #ddd">${order.locker_name || 'N/A'}</td>
                        <td style="padding:8px;border:1px solid #ddd">${Math.round(order.hours_stuck)}h</td>
                    </tr>`;
                }
                emailHtml += `</table>`;
            }

            if (stuckDroppedOff.rows.length > 0) {
                emailHtml += `<h3>Dropped Off But Not Ready for Pickup</h3>
                    <p>These orders show as dropped off but the customer pickup link was not generated. Please open the order in your dashboard and click "Generate Pickup Link".</p>
                    <table style="border-collapse:collapse;width:100%">
                    <tr style="background:#f4f4f4"><th style="padding:8px;text-align:left;border:1px solid #ddd">Order</th><th style="padding:8px;text-align:left;border:1px solid #ddd">Customer</th><th style="padding:8px;text-align:left;border:1px solid #ddd">Hours Stuck</th></tr>`;
                for (const order of stuckDroppedOff.rows) {
                    emailHtml += `<tr>
                        <td style="padding:8px;border:1px solid #ddd">#${order.order_number}</td>
                        <td style="padding:8px;border:1px solid #ddd">${order.customer_name || 'N/A'}</td>
                        <td style="padding:8px;border:1px solid #ddd">${Math.round(order.hours_stuck)}h</td>
                    </tr>`;
                }
                emailHtml += `</table>`;
            }

            emailHtml += `<p style="margin-top:16px"><a href="https://app.lockerdrop.it/admin/dashboard?shop=${shop}" style="background:#5c6ac4;color:white;padding:10px 20px;border-radius:4px;text-decoration:none">Open Dashboard</a></p>`;

            // Send alert to shop owner
            try {
                const shopData = await shopifyGraphQL(shop, access_token, '{ shop { email } }');
                if (shopData.shop?.email) {
                    await sendEmail(
                        shopData.shop.email,
                        `LockerDrop: ${totalStuck} order(s) need attention`,
                        emailHtml
                    );
                    logger.info({ shop, totalStuck, recipient: shopData.shop.email }, 'Sent stuck order alert to seller');
                }
            } catch (emailError) {
                logger.error({ err: emailError, shop }, 'Failed to send stuck order alert email');
            }
        }
    } catch (error) {
        logger.error({ err: error }, 'Error in stuck order detection');
    }
}

function scheduleStuckOrderCheck() {
    // Run at 2 AM, 10 AM, 6 PM (offset from expiry cron which runs at 0,6,12,18)
    cron.schedule('0 2,10,18 * * *', () => {
        logger.info('Running scheduled stuck order check');
        checkStuckOrders();
    });
    logger.info('Stuck order check scheduled (3x daily at 2 AM, 10 AM, 6 PM)');
}

// ============================================
// BRANDING SETTINGS (Enterprise Feature)
// ============================================

// Create branding settings table
async function initBrandingSettings() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS branding_settings (
                id SERIAL PRIMARY KEY,
                shop VARCHAR(255) UNIQUE NOT NULL,
                logo_url TEXT,
                primary_color VARCHAR(7) DEFAULT '#5c6ac4',
                secondary_color VARCHAR(7) DEFAULT '#202223',
                success_message TEXT DEFAULT 'Thank you for picking up your order!',
                show_upsells BOOLEAN DEFAULT true,
                upsell_heading TEXT DEFAULT 'You might also like',
                upsell_product_ids TEXT[],
                rebuy_enabled BOOLEAN DEFAULT false,
                rebuy_api_key VARCHAR(255),
                rebuy_widget_id VARCHAR(255),
                custom_css TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_branding_shop ON branding_settings(shop);
        `);
        logger.info('🎨 Branding settings table ready');
    } catch (error) {
        logger.error('Error creating branding settings table:', error);
    }
}

// Get branding settings for a shop
app.get('/api/branding/:shop', async (req, res) => {
    try {
        const { shop } = req.params;

        // NOTE: Subscription checks disabled - branding available to all shops
        // Previously required Enterprise plan

        // Get branding settings
        let result = await db.query('SELECT * FROM branding_settings WHERE shop = $1', [shop]);

        if (result.rows.length === 0) {
            // Create default settings
            result = await db.query(`
                INSERT INTO branding_settings (shop)
                VALUES ($1)
                RETURNING *
            `, [shop]);
        }

        const settings = result.rows[0];
        res.json({
            enabled: true,
            logoUrl: settings.logo_url,
            primaryColor: settings.primary_color,
            secondaryColor: settings.secondary_color,
            successMessage: settings.success_message,
            showUpsells: settings.show_upsells,
            upsellHeading: settings.upsell_heading,
            upsellProductIds: settings.upsell_product_ids || [],
            rebuyEnabled: settings.rebuy_enabled,
            rebuyApiKey: settings.rebuy_api_key ? '***configured***' : null,
            rebuyWidgetId: settings.rebuy_widget_id,
            customCss: settings.custom_css
        });
    } catch (error) {
        logger.error('Error getting branding settings:', error);
        res.status(500).json({ error: 'Failed to get branding settings' });
    }
});

// Update branding settings
app.post('/api/branding/:shop', requireApiAuth, async (req, res) => {
    try {
        const { shop } = req.params;
        const {
            logoUrl,
            primaryColor,
            secondaryColor,
            successMessage,
            showUpsells,
            upsellHeading,
            upsellProductIds,
            rebuyEnabled,
            rebuyApiKey,
            rebuyWidgetId,
            customCss
        } = req.body;

        // NOTE: Subscription checks disabled - branding available to all shops
        // Previously required Enterprise plan

        // Upsert branding settings
        const result = await db.query(`
            INSERT INTO branding_settings (
                shop, logo_url, primary_color, secondary_color, success_message,
                show_upsells, upsell_heading, upsell_product_ids,
                rebuy_enabled, rebuy_api_key, rebuy_widget_id, custom_css, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
            ON CONFLICT (shop) DO UPDATE SET
                logo_url = COALESCE($2, branding_settings.logo_url),
                primary_color = COALESCE($3, branding_settings.primary_color),
                secondary_color = COALESCE($4, branding_settings.secondary_color),
                success_message = COALESCE($5, branding_settings.success_message),
                show_upsells = COALESCE($6, branding_settings.show_upsells),
                upsell_heading = COALESCE($7, branding_settings.upsell_heading),
                upsell_product_ids = COALESCE($8, branding_settings.upsell_product_ids),
                rebuy_enabled = COALESCE($9, branding_settings.rebuy_enabled),
                rebuy_api_key = COALESCE($10, branding_settings.rebuy_api_key),
                rebuy_widget_id = COALESCE($11, branding_settings.rebuy_widget_id),
                custom_css = COALESCE($12, branding_settings.custom_css),
                updated_at = NOW()
            RETURNING *
        `, [
            shop, logoUrl, primaryColor, secondaryColor, successMessage,
            showUpsells, upsellHeading, upsellProductIds,
            rebuyEnabled, rebuyApiKey, rebuyWidgetId, customCss
        ]);

        logger.info(`🎨 Branding settings updated for ${shop}`);
        res.json({ success: true, settings: result.rows[0] });
    } catch (error) {
        logger.error('Error updating branding settings:', error);
        res.status(500).json({ error: 'Failed to update branding settings' });
    }
});

// Get upsell products for success page
app.get('/api/upsell-products/:shop', async (req, res) => {
    try {
        const { shop } = req.params;
        const { ids } = req.query;

        if (!ids) {
            return res.json({ products: [] });
        }

        const productIds = ids.split(',').filter(id => id);
        if (productIds.length === 0) {
            return res.json({ products: [] });
        }

        // Get access token
        let accessToken = accessTokens.get(shop);
        if (!accessToken) {
            const result = await db.query('SELECT access_token FROM stores WHERE shop = $1', [shop]);
            if (result.rows.length > 0) {
                accessToken = result.rows[0].access_token;
                accessTokens.set(shop, accessToken);
            }
        }

        if (!accessToken) {
            return res.json({ products: [] });
        }

        // Fetch products from Shopify (using GraphQL API)
        const products = [];
        for (const productId of productIds.slice(0, 4)) { // Max 4 products
            try {
                const product = await fetchProductByIdGraphQL(shop, accessToken, productId);
                if (product) {
                    products.push({
                        id: product.id,
                        title: product.title,
                        image: product.image,
                        price: product.variants?.[0]?.price ? `$${product.variants[0].price}` : '',
                        url: `https://${shop}/products/${product.handle}`
                    });
                }
            } catch (e) {
                logger.info(`Could not fetch product ${productId}:`, e.message);
            }
        }

        res.json({ products });
    } catch (error) {
        logger.error('Error fetching upsell products:', error);
        res.json({ products: [] });
    }
});

// Upload logo endpoint - handles file upload
app.post('/api/branding/:shop/logo', requireApiAuth, uploadLogo.single('logo'), async (req, res) => {
    try {
        const { shop } = req.params;

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Build the public URL for the uploaded file
        const logoUrl = `https://app.lockerdrop.it/uploads/logos/${req.file.filename}`;

        // Delete old logo file if exists
        const oldResult = await db.query('SELECT logo_url FROM branding_settings WHERE shop = $1', [shop]);
        if (oldResult.rows.length > 0 && oldResult.rows[0].logo_url) {
            const oldUrl = oldResult.rows[0].logo_url;
            if (oldUrl.includes('/uploads/logos/')) {
                const oldFilename = oldUrl.split('/').pop();
                const oldPath = path.join(__dirname, 'public/uploads/logos', oldFilename);
                const fs = require('fs');
                fs.unlink(oldPath, (err) => {
                    if (err) logger.info('Could not delete old logo:', err.message);
                    else logger.info('Deleted old logo:', oldFilename);
                });
            }
        }

        // Update database with new logo URL
        await db.query(`
            UPDATE branding_settings
            SET logo_url = $2, updated_at = NOW()
            WHERE shop = $1
        `, [shop, logoUrl]);

        logger.info(`✅ Logo uploaded for ${shop}: ${logoUrl}`);
        res.json({ success: true, logoUrl });
    } catch (error) {
        logger.error('Error uploading logo:', error);
        res.status(500).json({ error: 'Failed to upload logo' });
    }
});

// Delete logo endpoint
app.delete('/api/branding/:shop/logo', async (req, res) => {
    try {
        const { shop } = req.params;

        // Get current logo URL
        const result = await db.query('SELECT logo_url FROM branding_settings WHERE shop = $1', [shop]);
        if (result.rows.length > 0 && result.rows[0].logo_url) {
            const logoUrl = result.rows[0].logo_url;
            if (logoUrl.includes('/uploads/logos/')) {
                const filename = logoUrl.split('/').pop();
                const filePath = path.join(__dirname, 'public/uploads/logos', filename);
                const fs = require('fs');
                fs.unlink(filePath, (err) => {
                    if (err) logger.info('Could not delete logo file:', err.message);
                });
            }
        }

        // Clear logo URL in database
        await db.query(`
            UPDATE branding_settings
            SET logo_url = NULL, updated_at = NOW()
            WHERE shop = $1
        `, [shop]);

        res.json({ success: true });
    } catch (error) {
        logger.error('Error deleting logo:', error);
        res.status(500).json({ error: 'Failed to delete logo' });
    }
});

// ============================================
// AUDIT LOGGING
// ============================================

// Create audit log table if it doesn't exist
async function initAuditLog() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS audit_log (
                id SERIAL PRIMARY KEY,
                timestamp TIMESTAMP DEFAULT NOW(),
                user_id VARCHAR(255),
                action VARCHAR(100) NOT NULL,
                resource_type VARCHAR(50),
                resource_id VARCHAR(100),
                shop VARCHAR(255),
                ip_address VARCHAR(45),
                user_agent TEXT,
                details JSONB,
                created_at TIMESTAMP DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
            CREATE INDEX IF NOT EXISTS idx_audit_log_shop ON audit_log(shop);
            CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
        `);
        logger.info('📋 Audit log table ready');
    } catch (error) {
        logger.error('Error creating audit log table:', error);
    }
}

// Create locker reservations table for checkout reservations
async function initLockerReservations() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS locker_reservations (
                id SERIAL PRIMARY KEY,
                reservation_ref VARCHAR(100) UNIQUE NOT NULL,
                shop VARCHAR(255) NOT NULL,
                location_id VARCHAR(50) NOT NULL,
                locker_id VARCHAR(50),
                tower_id VARCHAR(50),
                dropoff_link VARCHAR(500),
                dropoff_request_id VARCHAR(50),
                locker_size VARCHAR(20),
                customer_email VARCHAR(255),
                customer_phone VARCHAR(50),
                pickup_date DATE,
                created_at TIMESTAMP DEFAULT NOW(),
                expires_at TIMESTAMP NOT NULL,
                status VARCHAR(20) DEFAULT 'pending',
                used_by_order_id VARCHAR(100),
                used_at TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_reservations_shop ON locker_reservations(shop);
            CREATE INDEX IF NOT EXISTS idx_reservations_status ON locker_reservations(status);
            CREATE INDEX IF NOT EXISTS idx_reservations_expires ON locker_reservations(expires_at);
            CREATE INDEX IF NOT EXISTS idx_reservations_email ON locker_reservations(customer_email);
        `);
        // Fix column types if table already exists with wrong types (INTEGER -> VARCHAR)
        await db.query(`ALTER TABLE locker_reservations ALTER COLUMN tower_id TYPE VARCHAR(50)`).catch(() => {});
        await db.query(`ALTER TABLE locker_reservations ALTER COLUMN locker_id TYPE VARCHAR(50)`).catch(() => {});
        await db.query(`ALTER TABLE locker_reservations ALTER COLUMN location_id TYPE VARCHAR(50)`).catch(() => {});
        await db.query(`ALTER TABLE locker_reservations ALTER COLUMN dropoff_request_id TYPE VARCHAR(50)`).catch(() => {});
        logger.info('🔒 Locker reservations table ready');
    } catch (error) {
        logger.error('Error creating locker reservations table:', error);
    }
}

// Ensure notes column exists on orders table
async function ensureOrdersNotesColumn() {
    try {
        await db.query(`
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT;
        `);
        logger.info('📝 Orders notes column ready');
    } catch (error) {
        logger.error('Error adding notes column:', error);
    }
}

// Create waitlist table for landing page signups
async function ensureWaitlistTable() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS waitlist (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP
            );
        `);
        logger.info('📧 Waitlist table ready');
    } catch (error) {
        logger.error('Error creating waitlist table:', error);
    }
}

// Ensure preferred_pickup_date column exists on orders table
async function ensurePickupDateColumn() {
    try {
        await db.query(`
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS preferred_pickup_date DATE;
        `);
        logger.info('📅 Orders preferred_pickup_date column ready');
    } catch (error) {
        logger.error('Error adding preferred_pickup_date column:', error);
    }
}

// Ensure excluded column exists on product_locker_sizes table
async function ensureProductExcludedColumn() {
    try {
        await db.query(`
            ALTER TABLE product_locker_sizes ADD COLUMN IF NOT EXISTS excluded BOOLEAN DEFAULT FALSE;
        `);
        logger.info('🚫 Product excluded column ready');
    } catch (error) {
        logger.error('Error adding excluded column:', error);
    }
}

// Log data access
async function logDataAccess(userId, action, details = {}, req = null) {
    try {
        await db.query(`
            INSERT INTO audit_log (user_id, action, resource_type, resource_id, shop, ip_address, user_agent, details)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
            userId,
            action,
            details.resource_type || null,
            details.resource_id || null,
            details.shop || null,
            req?.ip || req?.connection?.remoteAddress || null,
            req?.headers?.['user-agent'] || null,
            JSON.stringify(details)
        ]);
    } catch (error) {
        logger.error('Error logging data access:', error);
    }
}

// Middleware to log customer data access
function auditCustomerDataAccess(action) {
    return async (req, res, next) => {
        const shop = req.params.shop || req.body?.shop;
        const orderId = req.params.orderId || req.params.orderNumber || req.body?.orderNumber;

        // Log before the request is processed
        await logDataAccess(
            shop || 'unknown',
            action,
            {
                shop,
                resource_type: 'order',
                resource_id: orderId,
                endpoint: req.path,
                method: req.method
            },
            req
        );

        next();
    };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

// Calculate the expected pickup date based on fulfillment settings
// Logic: Start from today, add processing days (only counting fulfillment days),
// find next fulfillment day = dropoff day, pickup day = day after dropoff
function calculatePickupDate(processingDays, fulfillmentDays, vacationDays) {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    // Convert vacation days to Set of date strings for fast lookup
    const vacationSet = new Set((vacationDays || []).map(d => {
        const date = new Date(d);
        return date.toISOString().split('T')[0];
    }));

    // Normalize fulfillment days to lowercase
    const fulfillmentSet = new Set((fulfillmentDays || ['monday','tuesday','wednesday','thursday','friday']).map(d => d.toLowerCase()));

    // Helper to check if a date is a fulfillment day (and not a vacation day)
    function isFulfillmentDay(date) {
        const dayName = dayNames[date.getDay()];
        const dateStr = date.toISOString().split('T')[0];
        return fulfillmentSet.has(dayName) && !vacationSet.has(dateStr);
    }

    // Start from today
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);

    // Count processing days (only fulfillment days count)
    let daysProcessed = 0;
    const targetProcessingDays = processingDays || 1;

    while (daysProcessed < targetProcessingDays) {
        currentDate.setDate(currentDate.getDate() + 1);
        if (isFulfillmentDay(currentDate)) {
            daysProcessed++;
        }
    }

    // currentDate is now the dropoff day - find next fulfillment day if not already one
    while (!isFulfillmentDay(currentDate)) {
        currentDate.setDate(currentDate.getDate() + 1);
    }

    // Dropoff day found - pickup day is the next day
    const pickupDate = new Date(currentDate);
    pickupDate.setDate(pickupDate.getDate() + 1);

    return {
        dropoffDate: currentDate,
        pickupDate: pickupDate
    };
}

// Format pickup date for display (e.g., "Friday, Dec 13")
function formatPickupDate(pickupDate) {
    const pickup = new Date(pickupDate);
    pickup.setHours(0, 0, 0, 0);

    // Always format as "Wednesday, Dec 13"
    const options = { weekday: 'long', month: 'short', day: 'numeric' };
    return pickup.toLocaleDateString('en-US', options);
}

// Geocode a zip code to coordinates using OpenStreetMap Nominatim
async function geocodeZipCode(postalCode, country = 'US') {
    if (!postalCode) return null;

    try {
        const response = await axios.get('https://nominatim.openstreetmap.org/search', {
            params: {
                postalcode: postalCode,
                country: country,
                format: 'json',
                limit: 1
            },
            headers: {
                'User-Agent': 'LockerDrop/1.0 (contact@lockerdrop.it)'
            },
            timeout: 5000
        });

        if (response.data && response.data.length > 0) {
            const result = response.data[0];
            logger.info(`📍 Geocoded zip ${postalCode} to: ${result.lat}, ${result.lon}`);
            return {
                latitude: parseFloat(result.lat),
                longitude: parseFloat(result.lon)
            };
        }
        logger.info(`⚠️ No geocode result for zip: ${postalCode}`);
        return null;
    } catch (error) {
        logger.info(`⚠️ Geocoding error for ${postalCode}: ${error.message}`);
        return null;
    }
}

// Map Harbor locker type name to our size ID
// This handles cases where Harbor's type IDs don't match our assumed 1,2,3,4 ordering
function getLockerSizeIdFromName(typeName) {
    const name = (typeName || '').toLowerCase().trim();
    if (name.includes('small') && !name.includes('x-small')) return 1;
    if (name.includes('medium')) return 2;
    if (name.includes('large') && !name.includes('x-large') && !name.includes('extra')) return 3;
    if (name.includes('x-large') || name.includes('xlarge') || name.includes('extra-large') || name.includes('extra large')) return 4;
    // Default to medium if unknown
    logger.info(`⚠️ Unknown locker type name: "${typeName}", defaulting to medium`);
    return 2;
}

// Locker size definitions (in inches) - maps Harbor locker type IDs to dimensions
// These IDs may vary - check Harbor API for your actual locker type IDs
const LOCKER_SIZES = [
    { id: 1, name: 'Small',   maxLength: 12, maxWidth: 8,  maxHeight: 4  },
    { id: 2, name: 'Medium',  maxLength: 16, maxWidth: 12, maxHeight: 8  },
    { id: 3, name: 'Large',   maxLength: 20, maxWidth: 16, maxHeight: 12 },
    { id: 4, name: 'X-Large', maxLength: 24, maxWidth: 20, maxHeight: 16 }
];

// Calculate required locker size based on product dimensions
// For multiple items, calculates total package size (stacking items)
// Returns the smallest locker type ID that fits all products
// Returns null if ANY product lacks size configuration (product is not eligible for LockerDrop)
function calculateRequiredLockerSize(products) {
    if (!products || products.length === 0) {
        logger.info('📦 No product dimensions available - products not configured for LockerDrop');
        return null; // No dimensions = not eligible for LockerDrop
    }

    let allProductsConfigured = true;
    let totalVolume = 0;
    let maxLength = 0, maxWidth = 0;
    let totalHeight = 0; // Stack items vertically
    let unconfiguredProducts = [];

    for (const product of products) {
        const length = parseFloat(product.length) || 0;
        const width = parseFloat(product.width) || 0;
        const height = parseFloat(product.height) || 0;
        const quantity = parseInt(product.quantity) || 1;
        const isConfigured = product.isConfigured !== false; // Explicit flag from dimension fetching

        if (!isConfigured || (length === 0 && width === 0 && height === 0)) {
            allProductsConfigured = false;
            unconfiguredProducts.push(product.title || product.productId || 'Unknown product');
        } else {
            // For multiple items, we assume they stack
            // The base (length x width) is the max of all items
            // The height is cumulative (stacking)
            maxLength = Math.max(maxLength, length);
            maxWidth = Math.max(maxWidth, width);
            totalHeight += height * quantity; // Stack multiple of same item

            totalVolume += length * width * height * quantity;
        }
    }

    if (!allProductsConfigured) {
        logger.info(`📦 Products not configured for LockerDrop: ${unconfiguredProducts.join(', ')}`);
        return null; // Not all products have sizes = not eligible for LockerDrop
    }

    logger.info(`📦 Package dimensions: ${maxLength}" x ${maxWidth}" x ${totalHeight}" (${products.length} item types, volume: ${totalVolume.toFixed(1)} cu in)`);

    // Sort the two horizontal dimensions (can rotate package), keep height as-is
    const baseDims = [maxLength, maxWidth].sort((a, b) => b - a);
    const packageDims = [baseDims[0], baseDims[1], totalHeight].sort((a, b) => b - a);

    // Find the smallest locker that fits
    for (const locker of LOCKER_SIZES) {
        const lockerDims = [locker.maxLength, locker.maxWidth, locker.maxHeight].sort((a, b) => b - a);
        if (packageDims[0] <= lockerDims[0] && packageDims[1] <= lockerDims[1] && packageDims[2] <= lockerDims[2]) {
            logger.info(`📦 Package fits in ${locker.name} locker (type ${locker.id})`);
            return locker.id;
        }
    }

    // If nothing fits, return largest
    logger.info('📦 Package exceeds all locker sizes, using X-Large');
    return 4;
}

// Fetch product dimensions for order line items
// Priority: 1) Our saved product sizes, 2) Shopify variant data, 3) Weight-based estimate
async function getProductDimensionsFromOrder(shop, accessToken, lineItems) {
    const productDimensions = [];

    // First, get all saved product sizes from our database
    let savedSizes = {};
    try {
        const sizesResult = await db.query(
            'SELECT product_id, variant_id, length_inches, width_inches, height_inches, locker_size, excluded FROM product_locker_sizes WHERE shop = $1',
            [shop]
        );
        for (const row of sizesResult.rows) {
            const key = row.variant_id ? `${row.product_id}-${row.variant_id}` : row.product_id;
            savedSizes[key] = row;
        }
        logger.info(`📦 Loaded ${sizesResult.rows.length} saved product size settings`);
    } catch (e) {
        logger.info('⚠️ Could not load saved product sizes:', e.message);
    }

    for (const item of lineItems) {
        try {
            const productId = item.product_id?.toString();
            const variantId = item.variant_id?.toString();

            if (!productId) continue;

            // Check for saved dimensions in our database first
            const savedKey = variantId ? `${productId}-${variantId}` : productId;
            const saved = savedSizes[savedKey] || savedSizes[productId];

            // Check if product is explicitly excluded from LockerDrop
            if (saved && saved.excluded) {
                logger.info(`🚫 Product ${productId} is excluded from LockerDrop`);
                productDimensions.push({
                    length: 0,
                    width: 0,
                    height: 0,
                    quantity: item.quantity,
                    productId: productId,
                    isConfigured: false,
                    isExcluded: true,
                    source: 'excluded'
                });
                continue;
            }

            if (saved && (saved.length_inches > 0 || saved.width_inches > 0 || saved.height_inches > 0)) {
                // Use our saved dimensions
                const dimensions = {
                    length: parseFloat(saved.length_inches) || 0,
                    width: parseFloat(saved.width_inches) || 0,
                    height: parseFloat(saved.height_inches) || 0,
                    quantity: item.quantity,
                    source: 'saved'
                };
                productDimensions.push(dimensions);
                logger.info(`📦 Product ${productId} (saved): ${dimensions.length}" x ${dimensions.width}" x ${dimensions.height}" (qty: ${item.quantity})`);
                continue;
            }

            // If we have a locker_size override without dimensions, use standard sizes
            if (saved && saved.locker_size) {
                const sizeDefaults = {
                    'small': { length: 10, width: 6, height: 3 },
                    'medium': { length: 14, width: 10, height: 6 },
                    'large': { length: 18, width: 14, height: 10 },
                    'x-large': { length: 22, width: 18, height: 14 }
                };
                const defaults = sizeDefaults[saved.locker_size.toLowerCase()] || sizeDefaults['medium'];
                const dimensions = {
                    length: defaults.length,
                    width: defaults.width,
                    height: defaults.height,
                    quantity: item.quantity,
                    source: 'size_override',
                    isConfigured: true
                };
                productDimensions.push(dimensions);
                logger.info(`📦 Product ${productId} (size override: ${saved.locker_size}): ${dimensions.length}" x ${dimensions.width}" x ${dimensions.height}" (qty: ${item.quantity})`);
                continue;
            }

            // Product has no saved size configuration - mark as unconfigured
            // Fetch product title for logging
            const product = await fetchProductByIdGraphQL(shop, accessToken, productId);
            const productTitle = product?.title || `Product ${productId}`;
            logger.info(`⚠️ Product "${productTitle}" (${productId}) has no size configured - not eligible for LockerDrop`);
            productDimensions.push({
                length: 0,
                width: 0,
                height: 0,
                quantity: item.quantity,
                productId: productId,
                title: productTitle,
                isConfigured: false,
                source: 'unconfigured'
            });
            continue;

        } catch (error) {
            logger.info(`⚠️ Could not process product ${item.product_id}:`, error.message);
            // Mark product as unconfigured on error
            productDimensions.push({
                length: 0,
                width: 0,
                height: 0,
                quantity: item.quantity,
                productId: item.product_id?.toString(),
                title: `Product ${item.product_id}`,
                isConfigured: false,
                source: 'error'
            });
        }
    }

    return productDimensions;
}

// Get product dimensions from checkout cart items (variant IDs in GraphQL format)
async function getProductDimensionsFromCheckout(shop, accessToken, cartProducts) {
    const productDimensions = [];

    // First, get all saved product sizes from our database
    let savedSizes = {};
    try {
        const sizesResult = await db.query(
            'SELECT product_id, variant_id, length_inches, width_inches, height_inches, locker_size, excluded FROM product_locker_sizes WHERE shop = $1',
            [shop]
        );
        for (const row of sizesResult.rows) {
            const key = row.variant_id ? `${row.product_id}-${row.variant_id}` : row.product_id;
            savedSizes[key] = row;
        }
        logger.info(`📦 Checkout: Loaded ${sizesResult.rows.length} saved product size settings`);
    } catch (e) {
        logger.info('⚠️ Could not load saved product sizes:', e.message);
    }

    for (const item of cartProducts) {
        try {
            // Extract numeric IDs from GraphQL format (gid://shopify/ProductVariant/12345)
            let variantId = item.variantId?.replace('gid://shopify/ProductVariant/', '') || null;
            let productId = item.productId?.replace('gid://shopify/Product/', '') || null;

            logger.info(`📦 DEBUG: Cart item raw: variantId=${item.variantId}, productId=${item.productId}`);
            logger.info(`📦 DEBUG: Cart item parsed: variantId=${variantId}, productId=${productId}`);
            logger.info(`📦 DEBUG: Available keys in savedSizes: ${Object.keys(savedSizes).join(', ')}`);

            if (!variantId && !productId) continue;

            // Check for saved dimensions in our database first
            const savedKey = variantId && productId ? `${productId}-${variantId}` : productId;
            logger.info(`📦 DEBUG: Looking for key="${savedKey}" or fallback="${productId}"`);
            const saved = savedSizes[savedKey] || savedSizes[productId];
            logger.info(`📦 DEBUG: Found saved=${saved ? 'YES' : 'NO'} (size: ${saved?.locker_size || 'none'})`);

            // Check if product is explicitly excluded from LockerDrop
            if (saved && saved.excluded) {
                logger.info(`🚫 Checkout: Product ${productId} is excluded from LockerDrop`);
                productDimensions.push({
                    length: 0,
                    width: 0,
                    height: 0,
                    quantity: item.quantity || 1,
                    productId: productId,
                    isConfigured: false,
                    isExcluded: true,
                    source: 'excluded'
                });
                continue;
            }

            if (saved && (saved.length_inches > 0 || saved.width_inches > 0 || saved.height_inches > 0)) {
                // Use our saved dimensions
                const dimensions = {
                    length: parseFloat(saved.length_inches) || 0,
                    width: parseFloat(saved.width_inches) || 0,
                    height: parseFloat(saved.height_inches) || 0,
                    quantity: item.quantity || 1,
                    source: 'saved'
                };
                productDimensions.push(dimensions);
                logger.info(`📦 Checkout product ${productId} (saved): ${dimensions.length}" x ${dimensions.width}" x ${dimensions.height}" (qty: ${dimensions.quantity})`);
                continue;
            }

            // If we have a locker_size override without dimensions, use standard sizes
            if (saved && saved.locker_size) {
                const sizeDefaults = {
                    'small': { length: 10, width: 6, height: 3 },
                    'medium': { length: 14, width: 10, height: 6 },
                    'large': { length: 18, width: 14, height: 10 },
                    'x-large': { length: 22, width: 18, height: 14 }
                };
                const defaults = sizeDefaults[saved.locker_size.toLowerCase()] || sizeDefaults['medium'];
                const dimensions = {
                    length: defaults.length,
                    width: defaults.width,
                    height: defaults.height,
                    quantity: item.quantity || 1,
                    source: 'size_override'
                };
                productDimensions.push(dimensions);
                logger.info(`📦 Checkout product ${productId} (size override: ${saved.locker_size}): ${dimensions.length}" x ${dimensions.width}" x ${dimensions.height}" (qty: ${dimensions.quantity})`);
                continue;
            }

            // Product has no saved size configuration - try to get product info for logging
            let productTitle = `Product ${productId || variantId}`;
            if (variantId) {
                try {
                    const variant = await fetchVariantByIdGraphQL(shop, accessToken, variantId);
                    if (variant) {
                        productId = variant.product_id?.toString();
                        productTitle = variant.product_title || productTitle;

                        // Check saved sizes again with the product ID we just got
                        const variantSavedKey = `${productId}-${variantId}`;
                        const variantSaved = savedSizes[variantSavedKey] || savedSizes[productId];

                        if (variantSaved && variantSaved.locker_size) {
                            const sizeDefaults = {
                                'small': { length: 10, width: 6, height: 3 },
                                'medium': { length: 14, width: 10, height: 6 },
                                'large': { length: 18, width: 14, height: 10 },
                                'x-large': { length: 22, width: 18, height: 14 }
                            };
                            const defaults = sizeDefaults[variantSaved.locker_size.toLowerCase()] || sizeDefaults['medium'];
                            productDimensions.push({
                                length: defaults.length,
                                width: defaults.width,
                                height: defaults.height,
                                quantity: item.quantity || 1,
                                source: 'size_override_variant',
                                isConfigured: true
                            });
                            continue;
                        }
                    }
                } catch (variantError) {
                    logger.info(`⚠️ Could not fetch variant ${variantId}:`, variantError.message);
                }
            }

            // Product is not configured for LockerDrop
            logger.info(`⚠️ Product "${productTitle}" has no size configured - not eligible for LockerDrop`);
            productDimensions.push({
                length: 0,
                width: 0,
                height: 0,
                quantity: item.quantity || 1,
                productId: productId,
                title: productTitle,
                isConfigured: false,
                source: 'unconfigured'
            });
        } catch (error) {
            logger.info(`⚠️ Could not process cart item:`, error.message);
            productDimensions.push({
                length: 0,
                width: 0,
                height: 0,
                quantity: item.quantity || 1,
                isConfigured: false,
                source: 'error'
            });
        }
    }

    return productDimensions;
}

async function getAccessToken(shop, code) {
    const response = await axios.post(`https://${shop}/admin/oauth/access_token`, {
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code
    });
    
    return response.data.access_token;
}

async function registerCarrierService(shop, accessToken) {
    try {
        logger.info('🚚 Registering carrier service...');
        const result = await shopifyGraphQL(shop, accessToken, `
            mutation carrierServiceCreate($input: DeliveryCarrierServiceCreateInput!) {
                carrierServiceCreate(input: $input) {
                    carrierService {
                        id
                        name
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }
        `, {
            input: {
                name: 'LockerDrop',
                callbackUrl: 'https://app.lockerdrop.it/carrier-service/rates',
                active: true,
                serviceDiscovery: true
            }
        });

        const errors = result.carrierServiceCreate?.userErrors;
        if (errors && errors.length > 0) {
            logger.info('⚠️ Carrier service registration:', errors[0].message);
            return null;
        }

        logger.info('✅ Carrier service registered:', result.carrierServiceCreate.carrierService);
        return result.carrierServiceCreate.carrierService;
    } catch (error) {
        logger.error('❌ Carrier service error:', error.message);
        throw error;
    }
}

// Fulfill order in Shopify when customer picks up from locker
async function fulfillShopifyOrder(shop, shopifyOrderId) {
    try {
        // Get the shop's access token
        let accessToken = accessTokens.get(shop);
        if (!accessToken) {
            const result = await db.query('SELECT access_token FROM stores WHERE shop = $1', [shop]);
            if (result.rows.length > 0) {
                accessToken = result.rows[0].access_token;
                accessTokens.set(shop, accessToken);
            } else {
                throw new Error(`No access token found for shop: ${shop}`);
            }
        }

        // Get fulfillment orders via GraphQL
        const orderData = await shopifyGraphQL(shop, accessToken, `{
            order(id: "gid://shopify/Order/${shopifyOrderId}") {
                fulfillmentOrders(first: 10) {
                    edges {
                        node {
                            id
                            status
                        }
                    }
                }
            }
        }`);

        const fulfillmentOrders = orderData.order?.fulfillmentOrders?.edges?.map(e => e.node) || [];

        if (fulfillmentOrders.length === 0) {
            logger.info(`⚠️ No fulfillment orders found for order ${shopifyOrderId}`);
            return { success: false, message: 'No fulfillment orders found' };
        }

        // Find open fulfillment orders
        const openFulfillmentOrders = fulfillmentOrders.filter(fo =>
            fo.status === 'OPEN' || fo.status === 'IN_PROGRESS'
        );

        if (openFulfillmentOrders.length === 0) {
            logger.info(`ℹ️ Order ${shopifyOrderId} already fulfilled or no open fulfillment orders`);
            return { success: true, message: 'Order already fulfilled' };
        }

        // Create fulfillment via GraphQL
        for (const fo of openFulfillmentOrders) {
            const fulfillResult = await shopifyGraphQL(shop, accessToken, `
                mutation fulfillmentCreateV2($fulfillment: FulfillmentV2Input!) {
                    fulfillmentCreateV2(fulfillment: $fulfillment) {
                        fulfillment {
                            id
                            status
                        }
                        userErrors {
                            field
                            message
                        }
                    }
                }
            `, {
                fulfillment: {
                    lineItemsByFulfillmentOrder: [
                        { fulfillmentOrderId: fo.id }
                    ],
                    notifyCustomer: true,
                    trackingInfo: {
                        company: 'LockerDrop',
                        number: `LOCKER-${shopifyOrderId}`,
                        url: 'https://app.lockerdrop.it'
                    }
                }
            });

            const errors = fulfillResult.fulfillmentCreateV2?.userErrors;
            if (errors && errors.length > 0) {
                logger.error(`❌ Fulfillment error for order ${shopifyOrderId}:`, errors);
            } else {
                logger.info(`✅ Fulfillment created for order ${shopifyOrderId}:`, fulfillResult.fulfillmentCreateV2?.fulfillment?.id);
            }
        }

        return { success: true, message: 'Order fulfilled in Shopify' };
    } catch (error) {
        const errorMessage = error.response?.data?.errors?.[0]?.message || error.message;
        logger.error(`❌ Error fulfilling order ${shopifyOrderId} in Shopify:`, errorMessage);

        // Check for permission/scope error
        if (errorMessage && (
            errorMessage.includes('permission') ||
            errorMessage.includes('scope') ||
            errorMessage.includes('Access denied') ||
            error.response?.status === 403
        )) {
            logger.error(`🔐 Permission error detected - shop "${shop}" needs to re-authorize with write_fulfillments scope`);
            return {
                success: false,
                message: errorMessage,
                needsReauth: true,
                reauthUrl: `https://app.lockerdrop.it/auth/reconnect?shop=${shop}`
            };
        }

        return { success: false, message: errorMessage };
    }
}


// ============================================
// CARRIER SERVICE - SHIPPING RATES
// Returns locker options as shipping rates for non-Plus stores
// Plus stores use the Pickup Point Function instead (native pickup UI)
// ============================================

app.post('/carrier-service/rates', async (req, res) => {
    try {
        const rateRequest = req.body;
        logger.info('📍 Shipping rate request received');

        // Get shop domain from Shopify header
        const shopDomain = req.headers['x-shopify-shop-domain'];
        logger.info(`🏪 Shop: ${shopDomain || 'unknown'}`);

        // Get shop settings (including fulfillment settings for pickup date calculation)
        let freePickup = false;
        let processingDays = 1;
        let fulfillmentDays = ['monday','tuesday','wednesday','thursday','friday'];
        let vacationDays = [];
        let useNativePickup = false;

        if (shopDomain) {
            try {
                const settingsResult = await db.query('SELECT * FROM shop_settings WHERE shop = $1', [shopDomain]);
                if (settingsResult.rows.length > 0) {
                    const settings = settingsResult.rows[0];
                    freePickup = settings.free_pickup || false;
                    processingDays = settings.processing_days || 1;
                    fulfillmentDays = settings.fulfillment_days || ['monday','tuesday','wednesday','thursday','friday'];
                    vacationDays = settings.vacation_days || [];
                    useNativePickup = settings.use_checkout_extension || false;
                }
            } catch (e) {
                logger.info('Could not check shop settings:', e.message);
            }
        }

        // Calculate pickup date based on fulfillment settings
        const { pickupDate } = calculatePickupDate(processingDays, fulfillmentDays, vacationDays);
        const pickupDateFormatted = formatPickupDate(pickupDate);
        const pickupDateISO = pickupDate.toISOString().split('T')[0];
        logger.info(`📅 Expected pickup: ${pickupDateFormatted} (${pickupDateISO})`);

        // If checkout extension is enabled, return a single generic LockerDrop rate
        // The checkout extension UI handles the specific locker selection
        if (useNativePickup) {
            logger.info('🔀 Checkout extension enabled - returning single LockerDrop rate');
            const price = freePickup ? '0' : '100';
            return res.json({
                rates: [{
                    service_name: 'LockerDrop Pickup',
                    service_code: 'lockerdrop_pickup',
                    total_price: price,
                    currency: 'USD',
                    description: `📅 Ready ${pickupDateFormatted} • Select locker location below`
                }]
            });
        }

        const destination = rateRequest.rate.destination;
        let lat = destination.latitude;
        let lon = destination.longitude;

        // If no coordinates provided, try to geocode from zip code
        if (!lat || !lon) {
            logger.info(`📍 No coordinates provided, attempting zip code geocode for: ${destination.postal_code}`);
            const geocoded = await geocodeZipCode(destination.postal_code, destination.country || 'US');
            if (geocoded) {
                lat = geocoded.latitude;
                lon = geocoded.longitude;
                logger.info(`📍 Using geocoded coordinates from zip: ${lat}, ${lon}`);
            }
        }

        // Calculate required locker size from cart items
        let requiredLockerTypeId = 2; // Default to medium
        let requiredSizeName = 'medium';
        const rateItems = rateRequest.rate?.items || [];

        logger.info(`📦 Cart has ${rateItems.length} items`);

        if (shopDomain && rateItems.length > 0) {
            try {
                // Get shop access token for fetching product dimensions
                let shopAccessToken = accessTokens.get(shopDomain);
                if (!shopAccessToken) {
                    const storeResult = await db.query('SELECT access_token FROM stores WHERE shop = $1', [shopDomain]);
                    if (storeResult.rows.length > 0) {
                        shopAccessToken = storeResult.rows[0].access_token;
                        accessTokens.set(shopDomain, shopAccessToken);
                    }
                }

                if (shopAccessToken) {
                    // Convert rate.items to the format expected by getProductDimensionsFromOrder
                    const lineItems = rateItems.map(item => ({
                        product_id: item.product_id,
                        variant_id: item.variant_id,
                        quantity: item.quantity || 1
                    }));

                    // Get stacked dimensions for all items
                    const productDimensions = await getProductDimensionsFromOrder(shopDomain, shopAccessToken, lineItems);

                    // Calculate required locker size from combined dimensions
                    requiredLockerTypeId = calculateRequiredLockerSize(productDimensions);
                    requiredSizeName = LOCKER_SIZES.find(s => s.id === requiredLockerTypeId)?.name?.toLowerCase() || 'medium';

                    logger.info(`📦 Required locker size for cart: ${requiredSizeName} (type ${requiredLockerTypeId})`);
                } else {
                    logger.info(`⚠️ No access token for ${shopDomain}, defaulting to medium`);
                }
            } catch (sizeError) {
                logger.info(`⚠️ Could not calculate locker size: ${sizeError.message}, defaulting to medium`);
            }
        }

        if (!lat || !lon) {
            logger.info('❌ No coordinates available (even after geocode attempt)');
            return res.json({ rates: [] });
        }

        // Check if shop has enabled any locker locations
        let enabledLocationIds = [];
        if (shopDomain) {
            try {
                const prefsResult = await db.query(
                    'SELECT location_id FROM locker_preferences WHERE shop = $1',
                    [shopDomain]
                );
                enabledLocationIds = prefsResult.rows.map(r => r.location_id);

                if (enabledLocationIds.length === 0) {
                    logger.info('❌ No locker locations enabled for this shop - hiding LockerDrop at checkout');
                    return res.json({ rates: [] });
                }
                logger.info(`🔧 Shop has ${enabledLocationIds.length} enabled locations: ${enabledLocationIds.join(', ')}`);
            } catch (e) {
                logger.info('⚠️ Could not check locker preferences:', e.message);
            }
        }

        logger.info(`📍 Customer location: ${lat}, ${lon}`);

        // Get Harbor token
        const tokenResponse = await axios.post(
            'https://accounts.sandbox.harborlockers.com/realms/harbor/protocol/openid-connect/token',
            `grant_type=client_credentials&scope=service_provider&client_id=${process.env.HARBOR_CLIENT_ID}&client_secret=${process.env.HARBOR_CLIENT_SECRET}`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }}
        );

        const accessToken = tokenResponse.data.access_token;

        // Get nearby locations from Harbor
        const locationsResponse = await axios.get(
            'https://api.sandbox.harborlockers.com/api/v1/locations/',
            {
                headers: { 'Authorization': `Bearer ${accessToken}` },
                params: { limit: 100 }
            }
        );

        const allLocations = locationsResponse.data;

        // Filter to only enabled locations for this shop
        const enabledLocations = enabledLocationIds.length > 0
            ? allLocations.filter(loc => enabledLocationIds.includes(loc.id))
            : allLocations;

        if (enabledLocations.length === 0) {
            logger.info('❌ None of the enabled locations match Harbor locations');
            return res.json({ rates: [] });
        }

        // Calculate distances and find nearest locations
        const locationsWithDistance = enabledLocations.map(location => {
            const distance = calculateDistance(lat, lon, location.lat, location.lon);
            return { ...location, distance };
        });

        const nearestLocations = locationsWithDistance
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 10); // Check top 10 nearest for availability

        // Check availability for each location
        const availableLocations = [];
        for (const location of nearestLocations) {
            try {
                // Check if there are available lockers at this location
                const availabilityResponse = await axios.get(
                    `https://api.sandbox.harborlockers.com/api/v1/locations/${location.id}/availability`,
                    {
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    }
                );

                const availability = availabilityResponse.data;
                // Check for size-specific availability
                let hasRequiredSizeAvailable = false;
                let availableForRequiredSize = 0;

                if (availability.byType && Array.isArray(availability.byType)) {
                    // New API format with size-specific availability
                    for (const type of availability.byType) {
                        const typeName = type.lockerType?.name || '';
                        const available = type.lockerAvailability?.availableLockers || 0;
                        const harborSizeId = getLockerSizeIdFromName(typeName);

                        // Accept if this locker type is >= required size
                        if (harborSizeId >= requiredLockerTypeId && available > 0) {
                            hasRequiredSizeAvailable = true;
                            availableForRequiredSize += available;
                        }
                    }
                } else if (availability.lockerAvailability) {
                    // Fallback: just check total availability
                    const totalAvailable = availability.lockerAvailability.availableLockers || 0;
                    hasRequiredSizeAvailable = totalAvailable >= MIN_AVAILABLE_BUFFER;
                    availableForRequiredSize = totalAvailable;
                } else if (Array.isArray(availability)) {
                    // Old API format
                    hasRequiredSizeAvailable = availability.some(type => type.availableCount >= MIN_AVAILABLE_BUFFER);
                    availableForRequiredSize = availability.reduce((sum, type) => sum + (type.availableCount || 0), 0);
                }

                // Only show locations with enough buffer to prevent race conditions
                if (hasRequiredSizeAvailable && availableForRequiredSize >= MIN_AVAILABLE_BUFFER) {
                    logger.info(`✅ Location ${location.name}: ${availableForRequiredSize} lockers available (${requiredSizeName}+, min ${MIN_AVAILABLE_BUFFER})`);
                    availableLocations.push({
                        ...location,
                        availableCount: availableForRequiredSize,
                        availability: availability
                    });
                } else {
                    logger.info(`❌ Location ${location.name}: Only ${availableForRequiredSize} ${requiredSizeName}+ lockers (need ${MIN_AVAILABLE_BUFFER}+)`);
                }
            } catch (availError) {
                // If availability check fails, skip this location
                logger.info(`⚠️ Could not check availability for ${location.name}:`, availError.response?.data?.detail || availError.message);
            }

            // Stop after finding 3 available locations
            if (availableLocations.length >= 3) break;
        }

        if (availableLocations.length === 0) {
            logger.info('❌ No lockers available at any nearby location');
            return res.json({ rates: [] });
        }

        // Set price based on free pickup setting
        const price = freePickup ? '0' : '100'; // $0 if free, $1.00 otherwise
        logger.info(`💰 Price: ${freePickup ? 'FREE (seller absorbs fee)' : '$1.00'}`);

        // Create shipping rates only for locations with available lockers
        const rates = availableLocations.map(location => {
            // Build full address from Harbor location fields
            const address = location.address ||
                [location.address1 || location.street_address, location.city, location.state, location.zip]
                    .filter(Boolean).join(', ') || '';
            const shortAddress = [location.city, location.state].filter(Boolean).join(', ');

            return {
                // Format: LockerDrop @ Name (City, State) - shows full address in description
                service_name: `LockerDrop @ ${location.name}${shortAddress ? ` (${shortAddress})` : ''} - Pickup ${pickupDateFormatted}`,
                service_code: `lockerdrop_${location.id}`,
                total_price: price,
                currency: 'USD',
                description: `📍 ${address} • ${location.distance.toFixed(1)} mi away • Available 24/7`,
                min_delivery_date: pickupDateISO,
                max_delivery_date: pickupDateISO
            };
        });

        logger.info(`✅ Returning ${rates.length} available locker options (pickup: ${pickupDateFormatted})`);

        res.json({ rates });

    } catch (error) {
        logger.error('❌ Error in carrier service:', error.message);
        res.json({ rates: [] });
    }
});

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 3959; // Earth's radius in miles
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function toRad(degrees) {
    return degrees * (Math.PI / 180);
}

// ============================================
// FRONTEND ERROR TRACKING
// ============================================

// Endpoint for frontend clients to report errors
app.post('/api/errors', express.json(), (req, res) => {
    const { message, stack, source, context, url, userAgent } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'message is required' });
    }

    logger.error({
        type: 'frontend_error',
        errorMessage: message,
        stack: stack || null,
        source: source || 'unknown',
        context: context || {},
        url: url || null,
        userAgent: userAgent || req.headers['user-agent'],
        ip: req.ip
    }, `Frontend error: ${message}`);

    res.status(200).json({ received: true });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, async () => {
    // Initialize audit logging table
    await initAuditLog();

    // Initialize locker reservations table
    await initLockerReservations();

    // Ensure notes column exists on orders table
    await ensureOrdersNotesColumn();

    // Ensure preferred_pickup_date column exists
    await ensurePickupDateColumn();

    // Ensure excluded column exists on product_locker_sizes
    await ensureProductExcludedColumn();

    // Initialize branding settings table
    await initBrandingSettings();

    // Initialize waitlist table
    await ensureWaitlistTable();

    // Schedule data retention cleanup
    scheduleDataRetention();

    // Schedule locker expiry checks
    scheduleLockerExpiryCheck();

    // Schedule stuck order detection
    scheduleStuckOrderCheck();

    logger.info({
        port: PORT,
        host: process.env.SHOPIFY_HOST,
        nodeEnv: process.env.NODE_ENV
    }, `LockerDrop server running on port ${PORT}`);
});

