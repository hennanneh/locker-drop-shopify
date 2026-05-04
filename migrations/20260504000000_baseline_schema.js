// Baseline schema — captures all schema state created by the legacy
// ensure*/init* startup helpers in server.js prior to migration adoption.
// Every statement is idempotent (IF NOT EXISTS), so applying this against
// the already-populated prod DB is a no-op other than recording the
// migration row in `pgmigrations`.
//
// Future schema changes go in their own migration files via
// `npm run migrate:create -- <name>`.

exports.shorthands = undefined;

exports.up = pgm => {
    // audit_log
    pgm.sql(`
        CREATE TABLE IF NOT EXISTS audit_log (
            id SERIAL PRIMARY KEY,
            timestamp TIMESTAMP DEFAULT NOW(),
            user_id VARCHAR(255),
            action VARCHAR(100) NOT NULL,
            resource_type VARCHAR(50),
            resource_id VARCHAR(100),
            shop VARCHAR(255),
            ip_address VARCHAR(45),
            user_agent TEXT,
            details JSONB,
            created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
        CREATE INDEX IF NOT EXISTS idx_audit_log_shop ON audit_log(shop);
        CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
    `);

    // locker_reservations
    pgm.sql(`
        CREATE TABLE IF NOT EXISTS locker_reservations (
            id SERIAL PRIMARY KEY,
            reservation_ref VARCHAR(100) UNIQUE NOT NULL,
            shop VARCHAR(255) NOT NULL,
            location_id VARCHAR(50) NOT NULL,
            locker_id VARCHAR(50),
            tower_id VARCHAR(50),
            dropoff_link VARCHAR(500),
            dropoff_request_id VARCHAR(50),
            locker_size VARCHAR(20),
            customer_email VARCHAR(255),
            customer_phone VARCHAR(50),
            pickup_date DATE,
            created_at TIMESTAMP DEFAULT NOW(),
            expires_at TIMESTAMP NOT NULL,
            status VARCHAR(20) DEFAULT 'pending',
            used_by_order_id VARCHAR(100),
            used_at TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_reservations_shop ON locker_reservations(shop);
        CREATE INDEX IF NOT EXISTS idx_reservations_status ON locker_reservations(status);
        CREATE INDEX IF NOT EXISTS idx_reservations_expires ON locker_reservations(expires_at);
        CREATE INDEX IF NOT EXISTS idx_reservations_email ON locker_reservations(customer_email);
    `);
    // Repair pass for tables that may already exist with INTEGER ID columns
    // (legacy state on the prod DB from before we standardized on VARCHAR(50)).
    // ALTER TYPE to the same type is a no-op on a fresh DB.
    pgm.sql(`ALTER TABLE locker_reservations ALTER COLUMN tower_id TYPE VARCHAR(50) USING tower_id::VARCHAR(50);`);
    pgm.sql(`ALTER TABLE locker_reservations ALTER COLUMN locker_id TYPE VARCHAR(50) USING locker_id::VARCHAR(50);`);
    pgm.sql(`ALTER TABLE locker_reservations ALTER COLUMN location_id TYPE VARCHAR(50) USING location_id::VARCHAR(50);`);
    pgm.sql(`ALTER TABLE locker_reservations ALTER COLUMN dropoff_request_id TYPE VARCHAR(50) USING dropoff_request_id::VARCHAR(50);`);

    // subscriptions (usage-based billing)
    pgm.sql(`
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
    `);
    // Columns added in subsequent shapes of subscriptions (kept for prod DBs
    // that pre-date the consolidated CREATE above).
    pgm.sql(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS shopify_subscription_id VARCHAR(255);`);
    pgm.sql(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS shopify_line_item_id VARCHAR(255);`);
    pgm.sql(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS capped_amount DECIMAL(10,2) DEFAULT 200.00;`);
    pgm.sql(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS per_order_fee DECIMAL(10,2) DEFAULT 1.50;`);
    pgm.sql(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS total_charged_this_month DECIMAL(10,2) DEFAULT 0.00;`);

    // orders — additive columns accumulated over the project's lifetime
    pgm.sql(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT;`);
    pgm.sql(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS preferred_pickup_date DATE;`);
    pgm.sql(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS location_name VARCHAR(255);`);
    pgm.sql(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_charged BOOLEAN DEFAULT false;`);

    // product_locker_sizes — exclude flag
    pgm.sql(`ALTER TABLE product_locker_sizes ADD COLUMN IF NOT EXISTS excluded BOOLEAN DEFAULT FALSE;`);

    // stores — plan / capability columns populated by GraphQL plan check
    pgm.sql(`
        ALTER TABLE stores ADD COLUMN IF NOT EXISTS shop_plan VARCHAR(100);
        ALTER TABLE stores ADD COLUMN IF NOT EXISTS carrier_service_registered BOOLEAN DEFAULT false;
        ALTER TABLE stores ADD COLUMN IF NOT EXISTS plan_last_checked TIMESTAMP;
        ALTER TABLE stores ADD COLUMN IF NOT EXISTS partner_development BOOLEAN DEFAULT false;
        ALTER TABLE stores ADD COLUMN IF NOT EXISTS shopify_plus BOOLEAN DEFAULT false;
    `);

    // waitlist (landing-page signups)
    pgm.sql(`
        CREATE TABLE IF NOT EXISTS waitlist (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP
        );
    `);

    // branding_settings (per-shop pickup-page branding)
    pgm.sql(`
        CREATE TABLE IF NOT EXISTS branding_settings (
            id SERIAL PRIMARY KEY,
            shop VARCHAR(255) UNIQUE NOT NULL,
            logo_url TEXT,
            primary_color VARCHAR(7) DEFAULT '#5c6ac4',
            secondary_color VARCHAR(7) DEFAULT '#202223',
            success_message TEXT DEFAULT 'Thank you for picking up your order!',
            show_upsells BOOLEAN DEFAULT true,
            upsell_heading TEXT DEFAULT 'You might also like',
            upsell_product_ids TEXT[],
            rebuy_enabled BOOLEAN DEFAULT false,
            rebuy_api_key VARCHAR(255),
            rebuy_widget_id VARCHAR(255),
            custom_css TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_branding_shop ON branding_settings(shop);
    `);
};

exports.down = pgm => {
    // Down migration is intentionally non-destructive: rolling back the baseline
    // would wipe every shop's data. If you genuinely need to drop these tables,
    // do it manually with explicit SQL — don't make it a one-keystroke operation.
    throw new Error('Refusing to roll back baseline schema. Drop tables manually if intended.');
};
