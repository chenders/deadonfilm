/**
 * Migration: Add aggregate score columns to movies and shows tables
 *
 * This migration adds columns to support the "Dead on Film Score" - a weighted
 * aggregate of ratings from multiple sources (IMDb, RT, Metacritic, Trakt, TMDB, TheTVDB).
 *
 * Columns added:
 * - aggregate_score: The calculated weighted average score (0-10 scale)
 * - aggregate_confidence: How confident we are in the score (0-1, based on vote counts)
 * - aggregate_updated_at: When the aggregate was last calculated
 */

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // ============================================================
  // STEP 1: Add aggregate score columns to movies table
  // ============================================================
  pgm.addColumn("movies", {
    aggregate_score: { type: "decimal(4,2)" }, // 0.00-10.00 scale
    aggregate_confidence: { type: "decimal(3,2)" }, // 0.00-1.00 scale
    aggregate_updated_at: { type: "timestamp" },
  })

  // Index for efficient sorting by aggregate score
  pgm.createIndex("movies", "aggregate_score", {
    name: "idx_movies_aggregate_score",
    method: "btree",
    where: "aggregate_score IS NOT NULL",
  })

  // ============================================================
  // STEP 2: Add aggregate score columns to shows table
  // ============================================================
  pgm.addColumn("shows", {
    aggregate_score: { type: "decimal(4,2)" },
    aggregate_confidence: { type: "decimal(3,2)" },
    aggregate_updated_at: { type: "timestamp" },
  })

  pgm.createIndex("shows", "aggregate_score", {
    name: "idx_shows_aggregate_score",
    method: "btree",
    where: "aggregate_score IS NOT NULL",
  })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  // ============================================================
  // STEP 2 ROLLBACK: Remove aggregate score columns from shows
  // ============================================================
  pgm.dropIndex("shows", "aggregate_score", {
    name: "idx_shows_aggregate_score",
  })

  pgm.dropColumn("shows", ["aggregate_score", "aggregate_confidence", "aggregate_updated_at"])

  // ============================================================
  // STEP 1 ROLLBACK: Remove aggregate score columns from movies
  // ============================================================
  pgm.dropIndex("movies", "aggregate_score", {
    name: "idx_movies_aggregate_score",
  })

  pgm.dropColumn("movies", ["aggregate_score", "aggregate_confidence", "aggregate_updated_at"])
}
