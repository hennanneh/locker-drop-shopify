const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Environment-based database configuration
// Set NODE_ENV=production for production, NODE_ENV=development for dev
const isProduction = process.env.NODE_ENV === 'production';

// SSL configuration
// In production, use the DigitalOcean CA certificate for proper validation.
// Set DB_CA_CERT to the path of your ca-certificate.crt file (download from
// DigitalOcean database dashboard), or set DB_CA_CERT_BASE64 to the
// base64-encoded certificate content.
function getSSLConfig() {
  // Option 1: CA cert file path
  const caCertPath = process.env.DB_CA_CERT;
  if (caCertPath && fs.existsSync(caCertPath)) {
    console.log(`🔒 Using CA certificate from: ${caCertPath}`);
    return { ca: fs.readFileSync(caCertPath, 'utf8'), rejectUnauthorized: true };
  }

  // Option 2: Base64-encoded CA cert in env var
  const caCertBase64 = process.env.DB_CA_CERT_BASE64;
  if (caCertBase64) {
    console.log('🔒 Using CA certificate from DB_CA_CERT_BASE64 env var');
    return { ca: Buffer.from(caCertBase64, 'base64').toString('utf8'), rejectUnauthorized: true };
  }

  // Fallback: allow unverified (log warning)
  console.warn('⚠️ No CA certificate configured — SSL connections will not verify the server certificate.');
  console.warn('   Set DB_CA_CERT=/path/to/ca-certificate.crt or DB_CA_CERT_BASE64 for proper SSL validation.');
  return { rejectUnauthorized: false };
}

// Database configuration
// For true separation, create a separate database in Digital Ocean for development
const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 25060,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || (isProduction ? 'defaultdb' : 'defaultdb_dev'),
  ssl: getSSLConfig()
};

// Log which database we're connecting to (without sensitive info)
console.log(`📊 Database: ${dbConfig.database} on ${dbConfig.host} (${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'})`);

const pool = new Pool(dbConfig);

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  isProduction
};
