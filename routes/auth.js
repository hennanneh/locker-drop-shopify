const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// Store for sessions (in production, use a database)
const sessions = {};

// Shopify configuration
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SHOPIFY_SCOPES = process.env.SHOPIFY_SCOPES;
const SHOPIFY_HOST = process.env.SHOPIFY_HOST;

// Helper function to verify HMAC
function verifyHmac(query, hmac) {
  const message = Object.keys(query)
    .filter(key => key !== 'hmac' && key !== 'signature')
    .sort()
    .map(key => `${key}=${query[key]}`)
    .join('&');
  
  const generatedHash = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(message)
    .digest('hex');
  
  return generatedHash === hmac;
}

// Install route - Starts OAuth flow
router.get('/install', (req, res) => {
  const { shop } = req.query;
  
  if (!shop) {
    return res.status(400).send('Missing shop parameter');
  }
  
  console.log('🔐 Starting OAuth for shop:', shop);
  console.log('📋 Requested scopes:', SHOPIFY_SCOPES);
  console.log('🔑 API Key:', SHOPIFY_API_KEY);
  
  // Generate a random nonce for security
  const nonce = crypto.randomBytes(16).toString('hex');
  sessions[shop] = { nonce };
  
  // Build the authorization URL
  const installUrl = `https://${shop}/admin/oauth/authorize?` +
    `client_id=${SHOPIFY_API_KEY}&` +
    `scope=${SHOPIFY_SCOPES}&` +
    `redirect_uri=https://${SHOPIFY_HOST}/auth/callback&` +
    `state=${nonce}`;
  
  console.log('📍 Redirect URI:', `https://${SHOPIFY_HOST}/auth/callback`);
  console.log('🔗 Full install URL:', installUrl);
  
  res.redirect(installUrl);
});

// Callback route - Handles OAuth response
router.get('/callback', async (req, res) => {
  const { shop, code, state, hmac } = req.query;
  
  // Verify the request
  if (!shop || !code || !state || !hmac) {
    return res.status(400).send('Missing required parameters');
  }
  
  // Verify HMAC
  if (!verifyHmac(req.query, hmac)) {
    return res.status(403).send('HMAC verification failed');
  }
  
  // Verify nonce
  if (!sessions[shop] || sessions[shop].nonce !== state) {
    return res.status(403).send('Invalid state parameter');
  }
  
  try {
    // Exchange code for access token
    const axios = require('axios');
    const tokenResponse = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code: code
      }
    );
    
    const accessToken = tokenResponse.data.access_token;
    
    // Store the access token (in production, save to database)
    sessions[shop] = {
      ...sessions[shop],
      accessToken: accessToken,
      installedAt: new Date()
    };
    
    console.log('✅ App installed successfully for shop:', shop);
    
    // Redirect to success page
    res.send(`
      <html>
        <head>
          <title>LockerDrop Installation Success</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .container {
              background: white;
              padding: 3rem;
              border-radius: 10px;
              box-shadow: 0 10px 40px rgba(0,0,0,0.2);
              text-align: center;
              max-width: 500px;
            }
            h1 { color: #333; margin-bottom: 1rem; }
            p { color: #666; line-height: 1.6; }
            .emoji { font-size: 4rem; margin-bottom: 1rem; }
            .button {
              display: inline-block;
              margin-top: 2rem;
              padding: 1rem 2rem;
              background: #667eea;
              color: white;
              text-decoration: none;
              border-radius: 5px;
              font-weight: 600;
            }
            .button:hover { background: #5568d3; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="emoji">📦✅</div>
            <h1>LockerDrop Installed Successfully!</h1>
            <p>Your store is now connected to LockerDrop. You can now offer locker pickup as a shipping option to your customers.</p>
            <a href="https://${shop}/admin/apps" class="button">Go to Shopify Admin</a>
          </div>
        </body>
      </html>
    `);
    
  } catch (error) {
    console.error('❌ OAuth error:', error.response?.data || error.message);
    res.status(500).send('OAuth error: ' + error.message);
  }
});

// Test route to check if shop is installed
router.get('/register-carrier/:shop', async (req, res) => {
  const { shop } = req.params;
  const session = sessions[shop];
  
  if (!session || !session.accessToken) {
    return res.status(401).json({ 
      error: 'Shop not installed. Please install the app first.' 
    });
  }
  
  try {
    const ShopifyService = require('../services/shopify.service');
    const shopifyService = new ShopifyService(shop, session.accessToken);
    
    const carrierService = await shopifyService.registerCarrierService();
    
    res.json({
      success: true,
      message: 'Carrier service registered successfully!',
      carrierService: carrierService
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;