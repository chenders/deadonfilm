/**
 * Migration: Add IMDb ID source tracking columns
 *
 * Adds columns to track where IMDb IDs came from (TMDB, dataset fuzzy match, OMDB)
 * and whether they need manual review (for borderline confidence matches).
 *
 * This enables:
 * 1. Tracking the source of IMDb IDs for auditing
 * 2. Identifying items that need manual review
 * 3. Differentiating between TMDB-provided and dataset-matched IDs
 */

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // ============================================================
  // STEP 1: Add source tracking to movies table
  // ============================================================
  pgm.addColumn("movies", {
    // Source of the IMDb ID: 'tmdb', 'dataset', 'omdb', or null (legacy/unknown)
    imdb_id_source: { type: "text" },
    // Whether this match needs manual review (borderline confidence matches)
    imdb_id_needs_review: { type: "boolean", default: false, notNull: true },
  })

  // Partial index for finding movies needing review
  pgm.createIndex("movies", ["id"], {
    name: "idx_movies_imdb_review",
    where: "imdb_id_needs_review = true",
  })

  // ============================================================
  // STEP 2: Add source tracking to shows table (for consistency)
  // ============================================================
  pgm.addColumn("shows", {
    imdb_id_source: { type: "text" },
    imdb_id_needs_review: { type: "boolean", default: false, notNull: true },
  })

  pgm.createIndex("shows", ["id"], {
    name: "idx_shows_imdb_review",
    where: "imdb_id_needs_review = true",
  })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  // ============================================================
  // STEP 2 ROLLBACK: Drop shows columns
  // ============================================================
  pgm.dropIndex("shows", ["id"], {
    name: "idx_shows_imdb_review",
  })

  pgm.dropColumn("shows", ["imdb_id_source", "imdb_id_needs_review"])

  // ============================================================
  // STEP 1 ROLLBACK: Drop movies columns
  // ============================================================
  pgm.dropIndex("movies", ["id"], {
    name: "idx_movies_imdb_review",
  })

  pgm.dropColumn("movies", ["imdb_id_source", "imdb_id_needs_review"])
}
