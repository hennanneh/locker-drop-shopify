const express = require('express');
const router = express.Router();

// This endpoint will be called by Shopify at checkout to get shipping rates
router.post('/rates', async (req, res) => {
  try {
    const rateRequest = req.body.rate;
    
    console.log('📦 Shipping rate request received');
    console.log('Destination:', rateRequest.destination);
    console.log('Items:', rateRequest.items.length);

    // Get destination information
    const destination = rateRequest.destination;
    const { city, province, country, zip } = destination;

    // For now, let's return a simple flat rate
    // Later we'll integrate Harbor API to find actual lockers
    const rates = [
      {
        service_name: 'LockerDrop Pickup',
        service_code: 'lockerdrop_standard',
        total_price: '0.00', // Free shipping to locker!
        currency: 'USD',
        description: 'Pick up your order from a nearby locker at your convenience'
      }
    ];

    console.log('✅ Returning rates:', rates);

    res.json({ rates });
  } catch (error) {
    console.error('❌ Error calculating rates:', error);
    res.status(500).json({ 
      rates: [],
      error: error.message 
    });
  }
});

module.exports = router;