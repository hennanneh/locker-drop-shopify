// Expiring offline tokens, follow-up (deadline 2027-01-01).
//
//   needs_reauth: set when Shopify rejects the shop's refresh token (401) or the
//                 legacy-token migration (invalid_subject_token). The dashboard's
//                 /api/validate-token then reports the token as missing, which
//                 auto-runs OAuth once so the merchant is reconnected silently.
//                 Cleared whenever new tokens are stored.
//
// Idempotent (IF NOT EXISTS) so it is safe against the already-populated prod DB.

exports.shorthands = undefined;

exports.up = pgm => {
    pgm.sql(`ALTER TABLE stores ADD COLUMN IF NOT EXISTS needs_reauth BOOLEAN NOT NULL DEFAULT false;`);
};

exports.down = pgm => {
    pgm.sql(`ALTER TABLE stores DROP COLUMN IF EXISTS needs_reauth;`);
};
