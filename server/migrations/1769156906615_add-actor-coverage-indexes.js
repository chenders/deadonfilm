/**
 * Migration: Add actor coverage indexes
 *
 * Optimizes queries for death detail coverage management:
 * - Fast filtering by death page status
 * - Efficient sorting by popularity
 * - Optimized queries for enrichment candidate selection
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
  // Composite index for coverage queries
  // Supports: "deceased actors with/without death pages"
  // ============================================================
  pgm.createIndex('actors', ['deathday', 'has_detailed_death_info'], {
    name: 'idx_actors_coverage',
    method: 'btree',
  });

  // ============================================================
  // Composite index for priority sorting
  // Supports: "popular actors without death pages"
  // ============================================================
  pgm.createIndex('actors', ['popularity', 'has_detailed_death_info'], {
    name: 'idx_actors_popularity_coverage',
    method: 'btree',
  });

  // ============================================================
  // Partial index for deceased actors by popularity
  // Supports: "enrichment candidates sorted by priority"
  // Only indexes deceased actors (deathday IS NOT NULL)
  // ============================================================
  pgm.sql(`
    CREATE INDEX idx_actors_deceased_by_popularity
    ON actors (deathday DESC, popularity DESC)
    WHERE deathday IS NOT NULL
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropIndex('actors', ['deathday', 'popularity'], {
    name: 'idx_actors_deceased_by_popularity',
  });
  pgm.dropIndex('actors', ['popularity', 'has_detailed_death_info'], {
    name: 'idx_actors_popularity_coverage',
  });
  pgm.dropIndex('actors', ['deathday', 'has_detailed_death_info'], {
    name: 'idx_actors_coverage',
  });
};
