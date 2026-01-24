/**
 * Migration: Create death coverage snapshots
 *
 * Implements historical tracking of death detail page coverage:
 * - Daily snapshots of coverage statistics
 * - Enables trend visualization over time
 * - Tracks enrichment progress and high-priority candidates
 * - Populated by daily cron job (server/src/scripts/capture-coverage-snapshot.ts)
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  // ============================================================
  // Create death_coverage_snapshots table
  // ============================================================
  pgm.createTable('death_coverage_snapshots', {
    id: 'id', // serial primary key

    // Snapshot timestamp
    captured_at: {
      type: 'timestamptz',
      notNull: true,
      unique: true,
      default: pgm.func('NOW()'),
      comment: 'When this snapshot was captured (typically daily at 2 AM)',
    },

    // Coverage statistics
    total_deceased_actors: {
      type: 'integer',
      notNull: true,
      comment: 'Total number of actors with deathday set',
    },
    actors_with_death_pages: {
      type: 'integer',
      notNull: true,
      comment: 'Actors with has_detailed_death_info = true',
    },
    actors_without_death_pages: {
      type: 'integer',
      notNull: true,
      comment: 'Deceased actors without detailed death info',
    },
    coverage_percentage: {
      type: 'numeric(5,2)',
      notNull: true,
      comment: 'Percentage of deceased actors with death pages (0-100)',
    },

    // Enrichment candidates
    enrichment_candidates_count: {
      type: 'integer',
      notNull: true,
      comment: 'Actors eligible for enrichment (deceased, no death page, not recently enriched)',
    },
    high_priority_count: {
      type: 'integer',
      notNull: true,
      comment: 'Popular actors (popularity >= 10) without death pages',
    },
  });

  // ============================================================
  // Create indexes for efficient querying
  // ============================================================

  // Time-based queries (trend charts)
  pgm.createIndex('death_coverage_snapshots', ['captured_at'], {
    name: 'idx_coverage_snapshots_time',
    method: 'btree',
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('death_coverage_snapshots');
};
