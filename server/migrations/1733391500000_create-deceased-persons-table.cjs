/**
 * Migration: Create deceased_persons table
 *
 * This is the initial table for storing deceased actor information.
 * Originally created manually, now tracked as a migration for CI/fresh installs.
 * Uses IF NOT EXISTS for idempotency on existing databases.
 */

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createTable('deceased_persons', {
    tmdb_id: {
      type: 'integer',
      primaryKey: true,
      notNull: true,
    },
    name: {
      type: 'text',
      notNull: true,
    },
    birthday: {
      type: 'date',
    },
    deathday: {
      type: 'date',
      notNull: true,
    },
    cause_of_death: {
      type: 'text',
    },
    wikipedia_url: {
      type: 'text',
    },
    created_at: {
      type: 'timestamp',
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
    updated_at: {
      type: 'timestamp',
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  }, { ifNotExists: true });

  pgm.createIndex('deceased_persons', 'tmdb_id', { name: 'idx_deceased_persons_tmdb_id', ifNotExists: true });
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable('deceased_persons');
};
