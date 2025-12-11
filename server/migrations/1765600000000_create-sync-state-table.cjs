/**
 * Migration: Create sync_state table
 *
 * Tracks the last sync date for TMDB Changes API synchronization.
 * Used by the sync-tmdb-changes.ts script to resume from where it left off.
 */

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createTable('sync_state', {
    id: 'id',
    sync_type: { type: 'text', notNull: true, unique: true },
    last_sync_date: { type: 'date', notNull: true },
    last_run_at: { type: 'timestamp', default: pgm.func('NOW()') },
    items_processed: { type: 'integer', default: 0 },
    new_deaths_found: { type: 'integer', default: 0 },
    movies_updated: { type: 'integer', default: 0 },
    errors_count: { type: 'integer', default: 0 },
  }, { ifNotExists: true });
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable('sync_state');
};
