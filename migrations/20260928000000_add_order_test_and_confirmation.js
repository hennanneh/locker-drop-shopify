// App Store review follow-up (Shopify ref 96154).
//
//   is_test:               the Shopify order was a TEST order (Bogus Gateway / dev
//                          store / reviewer purchase). Drives the reviewer Sim
//                          drop-off/pickup controls per ORDER rather than relying only
//                          on the store's partnerDevelopment flag, which Shopify's own
//                          review stores don't reliably report.
//   confirmation_sent_at:  when the customer "order confirmed, locker pickup" email was
//                          sent. Claimed atomically so webhook retries never double-send.
//
// Idempotent (IF NOT EXISTS) so it is safe against the already-populated prod DB.

exports.shorthands = undefined;

exports.up = pgm => {
    pgm.sql(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;`);
    pgm.sql(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_sent_at TIMESTAMPTZ;`);
};

exports.down = pgm => {
    pgm.sql(`ALTER TABLE orders DROP COLUMN IF EXISTS confirmation_sent_at;`);
    pgm.sql(`ALTER TABLE orders DROP COLUMN IF EXISTS is_test;`);
};
