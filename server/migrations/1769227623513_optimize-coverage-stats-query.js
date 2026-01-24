/**
 * Migration: Optimize coverage stats query
 *
 * Adds a partial index specifically for enrichment candidates counting in getCoverageStats().
 * This index significantly speeds up the enrichment_stats CTE by avoiding full table scans
 * when counting candidates and high-priority candidates.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  // ============================================================
  // Partial index for enrichment candidates
  // Optimizes the enrichment_stats CTE in getCoverageStats()
  // Only indexes deceased actors without death pages
  // Sorted by popularity DESC for fast high-priority counts
  // ============================================================
  pgm.sql(`
    CREATE INDEX idx_actors_enrichment_candidates
    ON actors (popularity DESC, enriched_at)
    WHERE deathday IS NOT NULL
      AND (has_detailed_death_info = false OR has_detailed_death_info IS NULL)
  `)
}

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropIndex("actors", [], { name: "idx_actors_enrichment_candidates" })
}
