// Shopify is retiring permanent (non-expiring) offline access tokens; all public
// apps must use expiring offline tokens by 2027-01-01. Expiring tokens have a
// 60-minute access token plus a 90-day refresh token that we exchange for a new
// access token before expiry (see refreshAccessToken / refreshExpiringTokens in
// server.js).
//
//   refresh_token:             the refresh token (encrypted at rest, enc:v1:).
//   token_expires_at:          when the current access token expires.
//   refresh_token_expires_at:  when the refresh token itself expires (~90 days).
//
// All nullable: legacy rows with permanent tokens keep token_expires_at = NULL
// and are treated as non-expiring (passed through unchanged) until re-auth.
// Idempotent (IF NOT EXISTS) so it is safe against the already-populated prod DB.

exports.shorthands = undefined;

exports.up = pgm => {
    pgm.sql(`ALTER TABLE stores ADD COLUMN IF NOT EXISTS refresh_token TEXT;`);
    pgm.sql(`ALTER TABLE stores ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;`);
    pgm.sql(`ALTER TABLE stores ADD COLUMN IF NOT EXISTS refresh_token_expires_at TIMESTAMPTZ;`);
    pgm.sql(`CREATE INDEX IF NOT EXISTS idx_stores_token_expires_at ON stores(token_expires_at);`);
};

exports.down = pgm => {
    pgm.sql(`DROP INDEX IF EXISTS idx_stores_token_expires_at;`);
    pgm.sql(`ALTER TABLE stores DROP COLUMN IF EXISTS refresh_token_expires_at;`);
    pgm.sql(`ALTER TABLE stores DROP COLUMN IF EXISTS token_expires_at;`);
    pgm.sql(`ALTER TABLE stores DROP COLUMN IF EXISTS refresh_token;`);
};
