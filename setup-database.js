const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 25060,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'defaultdb',
  ssl: {
    rejectUnauthorized: false
  }
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
    
  } catch (error) {
    console.error('❌ Error setting up database:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

setupDatabase();
