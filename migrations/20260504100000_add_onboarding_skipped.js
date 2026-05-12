// Adds onboarding_skipped_at to stores so the "skipped onboarding" state
// persists across devices. Previously kept in browser localStorage, which
// meant a merchant who skipped on desktop saw the wizard again on phone
// (UX_AUDIT.md finding #3-2).
//
// Null = wizard should show. Non-null = wizard has been dismissed; show
// the setup-reminder banner instead.

exports.shorthands = undefined;

exports.up = pgm => {
    pgm.sql(`ALTER TABLE stores ADD COLUMN IF NOT EXISTS onboarding_skipped_at TIMESTAMP;`);
};

exports.down = pgm => {
    pgm.sql(`ALTER TABLE stores DROP COLUMN IF EXISTS onboarding_skipped_at;`);
};
