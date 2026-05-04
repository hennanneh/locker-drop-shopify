const path = require('path');
const { pool } = require('./db');

// Run all pending migrations against the configured database.
// Called at server startup; replaces the legacy ensure*/init* helpers.
// node-pg-migrate v8 is ESM-only, so we load it via dynamic import.
async function runMigrations({ logger } = {}) {
    const log = logger || console;
    const { runner } = await import('node-pg-migrate');
    const client = await pool.connect();
    try {
        const applied = await runner({
            dbClient: client,
            dir: path.join(__dirname, 'migrations'),
            direction: 'up',
            migrationsTable: 'pgmigrations',
            singleTransaction: true,
            log: (msg) => log.info ? log.info({ msg }, '[migrations]') : log.log('[migrations]', msg),
            verbose: false,
        });
        const count = Array.isArray(applied) ? applied.length : 0;
        if (count > 0) {
            const names = applied.map(m => m.name).join(', ');
            log.info ? log.info({ count, names }, '✅ Migrations applied') : log.log(`✅ Applied ${count} migration(s): ${names}`);
        } else {
            log.info ? log.info('✅ Migrations up to date') : log.log('✅ Migrations up to date');
        }
        return applied;
    } finally {
        client.release();
    }
}

module.exports = { runMigrations };
