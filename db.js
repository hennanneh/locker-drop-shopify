const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 25060,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || (isProduction ? 'defaultdb' : 'defaultdb_dev'),
  ssl: getSSLConfig()
};

console.log(`📊 Database: ${dbConfig.database} on ${dbConfig.host} (${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'})`);

const pool = new Pool(dbConfig);

// =============================================================================
// At-rest encryption for Shopify access tokens (S2-10).
//
// Encryption: AES-256-GCM with a 32-byte key from TOKEN_ENCRYPTION_KEY (hex).
// Storage format: "enc:v1:<base64( iv || authTag || ciphertext )>"
// Anything not matching that prefix is treated as legacy plaintext, so we can
// transition existing rows without a hard migration.
//
// If TOKEN_ENCRYPTION_KEY is unset, encryption is a no-op and the column stays
// plaintext (with a startup warning). The `query` wrapper still works; reads
// without the prefix pass through untouched.
// =============================================================================

const ENC_PREFIX = 'enc:v1:';
let encryptionKey = null;

(function loadEncryptionKey() {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex) {
    console.warn('⚠️ TOKEN_ENCRYPTION_KEY not set — Shopify access tokens will be stored as plaintext.');
    console.warn('   Generate with: openssl rand -hex 32');
    return;
  }
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    console.error('❌ TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes). Encryption disabled.');
    return;
  }
  encryptionKey = Buffer.from(hex, 'hex');
  console.log('🔐 Token at-rest encryption enabled');
})();

function encryptToken(plaintext) {
  if (!plaintext || !encryptionKey) return plaintext;
  if (typeof plaintext === 'string' && plaintext.startsWith(ENC_PREFIX)) return plaintext; // already encrypted
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

function decryptToken(stored) {
  if (!stored || typeof stored !== 'string') return stored;
  if (!stored.startsWith(ENC_PREFIX)) return stored; // legacy plaintext — return as-is
  if (!encryptionKey) {
    // Encrypted blob present but no key configured — can't decrypt, return null to fail safely
    console.error('❌ Cannot decrypt access token: TOKEN_ENCRYPTION_KEY not set');
    return null;
  }
  try {
    const blob = Buffer.from(stored.slice(ENC_PREFIX.length), 'base64');
    const iv = blob.subarray(0, 12);
    const tag = blob.subarray(12, 28);
    const ciphertext = blob.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch (e) {
    console.error('❌ Failed to decrypt access token:', e.message);
    return null;
  }
}

// Wrapped query: auto-decrypts the access_token column on read so existing
// call sites don't need to know about encryption.
function query(text, params) {
  return pool.query(text, params).then(result => {
    if (result && Array.isArray(result.rows) && /\baccess_token\b/i.test(text)) {
      for (const row of result.rows) {
        if (row && typeof row.access_token === 'string') {
          row.access_token = decryptToken(row.access_token);
        }
      }
    }
    return result;
  });
}

// One-time migration: encrypt any plaintext access tokens already in the DB.
// Safe to run repeatedly; tokens already prefixed with enc:v1: are skipped.
async function migrateAccessTokensToEncrypted() {
  if (!encryptionKey) return; // nothing to do without a key
  try {
    // Read raw (non-wrapped) rows so we can see legacy plaintext as-is.
    const result = await pool.query("SELECT shop, access_token FROM stores WHERE access_token IS NOT NULL AND access_token NOT LIKE 'enc:v1:%'");
    if (result.rows.length === 0) return;
    for (const row of result.rows) {
      const enc = encryptToken(row.access_token);
      if (enc && enc !== row.access_token) {
        await pool.query('UPDATE stores SET access_token = $1 WHERE shop = $2', [enc, row.shop]);
      }
    }
    console.log(`🔐 Encrypted ${result.rows.length} legacy plaintext access token(s) at rest`);
  } catch (e) {
    console.error('❌ Token encryption migration failed:', e.message);
  }
}

module.exports = {
  query,
  pool,
  isProduction,
  encryptToken,
  decryptToken,
  migrateAccessTokensToEncrypted
};
