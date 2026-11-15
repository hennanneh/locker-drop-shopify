// orders.customer_phone and orders.locker_name exist on the prod DB but were
// never added by setup-database.js or any migration, so a fresh database (local
// dev DB, new environment) was missing them. Found by diffing a freshly built
// dev DB against prod on 2026-11-15. IF NOT EXISTS: no-op on prod.

exports.shorthands = undefined;

exports.up = pgm => {
    pgm.sql(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50);`);
    pgm.sql(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS locker_name VARCHAR(255);`);
};

exports.down = () => {
    // Intentionally a no-op: these columns pre-date this migration on prod.
};
