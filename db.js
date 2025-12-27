const { Pool } = require('pg');
require('dotenv').config();

// Environment-based database configuration
// Set NODE_ENV=production for production, NODE_ENV=development for dev
const isProduction = process.env.NODE_ENV === 'production';

// Database configuration
// For true separation, create a separate database in Digital Ocean for development
const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 25060,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || (isProduction ? 'defaultdb' : 'defaultdb_dev'),
  ssl: {
    rejectUnauthorized: false
  }
};

// Log which database we're connecting to (without sensitive info)
console.log(`📊 Database: ${dbConfig.database} on ${dbConfig.host} (${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'})`);

const pool = new Pool(dbConfig);

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  isProduction
};
