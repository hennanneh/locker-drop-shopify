const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

// SSL config: use CA cert if available, otherwise fall back
function getSSLConfig() {
  const caCertPath = process.env.DB_CA_CERT;
  if (caCertPath && fs.existsSync(caCertPath)) {
    return { ca: fs.readFileSync(caCertPath, 'utf8'), rejectUnauthorized: true };
  }
  const caCertBase64 = process.env.DB_CA_CERT_BASE64;
  if (caCertBase64) {
    return { ca: Buffer.from(caCertBase64, 'base64').toString('utf8'), rejectUnauthorized: true };
  }
  console.warn('⚠️ No CA certificate configured — using rejectUnauthorized: false');
  return { rejectUnauthorized: false };
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 25060,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'defaultdb',
  ssl: getSSLConfig()
});

async function setupDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Setting up database...');
    
    // Create tables
    await client.query(`
      -- Stores table
      CREATE TABLE IF NOT EXISTS stores (
        id SERIAL PRIMARY KEY,
        shop VARCHAR(255) UNIQUE NOT NULL,
        access_token TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Locker preferences table
      CREATE TABLE IF NOT EXISTS locker_preferences (
        id SERIAL PRIMARY KEY,
        shop VARCHAR(255) NOT NULL,
        location_id INTEGER NOT NULL,
        location_name VARCHAR(255),
        is_enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(shop, location_id)
      );
      
      -- Orders table
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        shop VARCHAR(255) NOT NULL,
        shopify_order_id VARCHAR(255) UNIQUE NOT NULL,
        order_number VARCHAR(255),
        customer_email VARCHAR(255),
        customer_name VARCHAR(255),
        location_id INTEGER,
        locker_id INTEGER,
        tower_id VARCHAR(255),
        dropoff_link TEXT,
        dropoff_request_id INTEGER,
        pickup_link TEXT,
        pickup_request_id INTEGER,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Locker events table (from Harbor webhooks)
      CREATE TABLE IF NOT EXISTS locker_events (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id),
        event_type VARCHAR(100),
        locker_id INTEGER,
        tower_id VARCHAR(255),
        timestamp TIMESTAMP,
        payload JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Subscriptions table (usage-based billing)
      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        shop VARCHAR(255) UNIQUE NOT NULL,
        plan_name VARCHAR(50) DEFAULT 'usage',
        status VARCHAR(50) DEFAULT 'pending',
        shopify_subscription_id VARCHAR(255),
        shopify_line_item_id VARCHAR(255),
        capped_amount DECIMAL(10,2) DEFAULT 200.00,
        per_order_fee DECIMAL(10,2) DEFAULT 1.50,
        orders_this_month INTEGER DEFAULT 0,
        total_charged_this_month DECIMAL(10,2) DEFAULT 0.00,
        billing_cycle_start TIMESTAMP DEFAULT NOW(),
        trial_ends_at TIMESTAMP,
        monthly_order_limit INTEGER DEFAULT -1,
        shopify_charge_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_orders_shop ON orders(shop);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_locker_prefs_shop ON locker_preferences(shop);
    `);

    console.log('✅ Database setup complete!');
    console.log('📊 Tables created:');
    console.log('   - stores');
    console.log('   - locker_preferences');
    console.log('   - orders');
    console.log('   - locker_events');
    console.log('   - subscriptions');
    
  } catch (error) {
    console.error('❌ Error setting up database:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

setupDatabase();
