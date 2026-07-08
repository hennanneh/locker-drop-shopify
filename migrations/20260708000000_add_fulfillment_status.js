// Track the outcome of Shopify auto-fulfillment on each locker order so that
// failures are visible (dashboard) and recoverable (retry endpoint + cron
// backstop) instead of being silently swallowed.
//
//   fulfillment_status: NULL = not yet attempted, 'fulfilled' = succeeded,
//                       'failed' = attempted and Shopify rejected it.
//   fulfillment_error:  last error message when status = 'failed'.
//
// Idempotent (IF NOT EXISTS) so it is safe against the already-populated prod DB.

exports.shorthands = undefined;

exports.up = pgm => {
    pgm.sql(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_status VARCHAR(20);`);
    pgm.sql(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_error TEXT;`);
    pgm.sql(`CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_status ON orders(fulfillment_status);`);
};

exports.down = pgm => {
    pgm.sql(`DROP INDEX IF EXISTS idx_orders_fulfillment_status;`);
    pgm.sql(`ALTER TABLE orders DROP COLUMN IF EXISTS fulfillment_error;`);
    pgm.sql(`ALTER TABLE orders DROP COLUMN IF EXISTS fulfillment_status;`);
};
