/**
 * Migration: Add retry tracking columns for API fetches
 *
 * Adds columns to track retry attempts, last fetch times, errors, and permanent failures
 * for all external API calls (OMDb, Trakt, TheTVDB, external IDs, TMDB data).
 *
 * This enables:
 * 1. Exponential backoff retry logic (max 3 attempts)
 * 2. Marking permanently failed items to avoid infinite retries
 * 3. Error tracking for debugging
 * 4. Efficient queries to find items needing retry
 */

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // ============================================================
  // STEP 1: Add OMDb retry tracking to movies table
  // ============================================================
  pgm.addColumn("movies", {
    omdb_fetch_attempts: { type: "smallint", default: 0, notNull: true },
    omdb_last_fetch_attempt: { type: "timestamp" },
    omdb_fetch_error: { type: "text" },
    omdb_permanently_failed: { type: "boolean", default: false, notNull: true },
  })

  // Index for finding movies needing OMDb retry
  pgm.createIndex("movies", ["omdb_last_fetch_attempt"], {
    name: "idx_movies_omdb_retry",
    where:
      "omdb_updated_at IS NULL AND omdb_permanently_failed = false AND omdb_fetch_attempts < 3",
  })

  // ============================================================
  // STEP 2: Add Trakt retry tracking to movies table
  // ============================================================
  pgm.addColumn("movies", {
    trakt_fetch_attempts: { type: "smallint", default: 0, notNull: true },
    trakt_last_fetch_attempt: { type: "timestamp" },
    trakt_fetch_error: { type: "text" },
    trakt_permanently_failed: { type: "boolean", default: false, notNull: true },
  })

  pgm.createIndex("movies", ["trakt_last_fetch_attempt"], {
    name: "idx_movies_trakt_retry",
    where:
      "trakt_updated_at IS NULL AND trakt_permanently_failed = false AND trakt_fetch_attempts < 3",
  })

  // ============================================================
  // STEP 3: Add external IDs retry tracking to movies table
  // ============================================================
  pgm.addColumn("movies", {
    external_ids_fetch_attempts: { type: "smallint", default: 0, notNull: true },
    external_ids_last_fetch_attempt: { type: "timestamp" },
    external_ids_fetch_error: { type: "text" },
    external_ids_permanently_failed: { type: "boolean", default: false, notNull: true },
  })

  pgm.createIndex("movies", ["external_ids_last_fetch_attempt"], {
    name: "idx_movies_external_ids_retry",
    where:
      "imdb_id IS NULL AND external_ids_permanently_failed = false AND external_ids_fetch_attempts < 3",
  })

  // ============================================================
  // STEP 4: Add popularity retry tracking to movies table
  // ============================================================
  pgm.addColumn("movies", {
    popularity_fetch_attempts: { type: "smallint", default: 0, notNull: true },
    popularity_last_fetch_attempt: { type: "timestamp" },
    popularity_fetch_error: { type: "text" },
    popularity_permanently_failed: { type: "boolean", default: false, notNull: true },
  })

  pgm.createIndex("movies", ["popularity_last_fetch_attempt"], {
    name: "idx_movies_popularity_retry",
    where: "popularity IS NULL AND popularity_permanently_failed = false AND popularity_fetch_attempts < 3",
  })

  // ============================================================
  // STEP 5: Add OMDb retry tracking to shows table
  // ============================================================
  pgm.addColumn("shows", {
    omdb_fetch_attempts: { type: "smallint", default: 0, notNull: true },
    omdb_last_fetch_attempt: { type: "timestamp" },
    omdb_fetch_error: { type: "text" },
    omdb_permanently_failed: { type: "boolean", default: false, notNull: true },
  })

  pgm.createIndex("shows", ["omdb_last_fetch_attempt"], {
    name: "idx_shows_omdb_retry",
    where:
      "omdb_updated_at IS NULL AND omdb_permanently_failed = false AND omdb_fetch_attempts < 3",
  })

  // ============================================================
  // STEP 6: Add Trakt retry tracking to shows table
  // ============================================================
  pgm.addColumn("shows", {
    trakt_fetch_attempts: { type: "smallint", default: 0, notNull: true },
    trakt_last_fetch_attempt: { type: "timestamp" },
    trakt_fetch_error: { type: "text" },
    trakt_permanently_failed: { type: "boolean", default: false, notNull: true },
  })

  pgm.createIndex("shows", ["trakt_last_fetch_attempt"], {
    name: "idx_shows_trakt_retry",
    where:
      "trakt_updated_at IS NULL AND trakt_permanently_failed = false AND trakt_fetch_attempts < 3",
  })

  // ============================================================
  // STEP 7: Add TheTVDB retry tracking to shows table
  // ============================================================
  pgm.addColumn("shows", {
    thetvdb_fetch_attempts: { type: "smallint", default: 0, notNull: true },
    thetvdb_last_fetch_attempt: { type: "timestamp" },
    thetvdb_fetch_error: { type: "text" },
    thetvdb_permanently_failed: { type: "boolean", default: false, notNull: true },
  })

  pgm.createIndex("shows", ["thetvdb_last_fetch_attempt"], {
    name: "idx_shows_thetvdb_retry",
    where:
      "thetvdb_score IS NULL AND thetvdb_permanently_failed = false AND thetvdb_fetch_attempts < 3",
  })

  // ============================================================
  // STEP 8: Add external IDs retry tracking to shows table
  // ============================================================
  pgm.addColumn("shows", {
    external_ids_fetch_attempts: { type: "smallint", default: 0, notNull: true },
    external_ids_last_fetch_attempt: { type: "timestamp" },
    external_ids_fetch_error: { type: "text" },
    external_ids_permanently_failed: { type: "boolean", default: false, notNull: true },
  })

  pgm.createIndex("shows", ["external_ids_last_fetch_attempt"], {
    name: "idx_shows_external_ids_retry",
    where:
      "thetvdb_id IS NULL AND external_ids_permanently_failed = false AND external_ids_fetch_attempts < 3",
  })

  // ============================================================
  // STEP 9: Add OMDb retry tracking to episodes table
  // ============================================================
  pgm.addColumn("episodes", {
    omdb_fetch_attempts: { type: "smallint", default: 0, notNull: true },
    omdb_last_fetch_attempt: { type: "timestamp" },
    omdb_fetch_error: { type: "text" },
    omdb_permanently_failed: { type: "boolean", default: false, notNull: true },
  })

  pgm.createIndex("episodes", ["omdb_last_fetch_attempt"], {
    name: "idx_episodes_omdb_retry",
    where:
      "omdb_updated_at IS NULL AND omdb_permanently_failed = false AND omdb_fetch_attempts < 3",
  })

  // ============================================================
  // STEP 10: Add actor details retry tracking to actors table
  // ============================================================
  pgm.addColumn("actors", {
    details_fetch_attempts: { type: "smallint", default: 0, notNull: true },
    details_last_fetch_attempt: { type: "timestamp" },
    details_fetch_error: { type: "text" },
    details_permanently_failed: { type: "boolean", default: false, notNull: true },
  })

  pgm.createIndex("actors", ["details_last_fetch_attempt"], {
    name: "idx_actors_details_retry",
    where:
      "(birthday IS NULL OR profile_path IS NULL) AND details_permanently_failed = false AND details_fetch_attempts < 3",
  })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  // ============================================================
  // STEP 10 ROLLBACK: Drop actor details retry tracking
  // ============================================================
  pgm.dropIndex("actors", ["details_last_fetch_attempt"], {
    name: "idx_actors_details_retry",
  })

  pgm.dropColumn("actors", [
    "details_fetch_attempts",
    "details_last_fetch_attempt",
    "details_fetch_error",
    "details_permanently_failed",
  ])

  // ============================================================
  // STEP 9 ROLLBACK: Drop OMDb retry tracking from episodes
  // ============================================================
  pgm.dropIndex("episodes", ["omdb_last_fetch_attempt"], {
    name: "idx_episodes_omdb_retry",
  })

  pgm.dropColumn("episodes", [
    "omdb_fetch_attempts",
    "omdb_last_fetch_attempt",
    "omdb_fetch_error",
    "omdb_permanently_failed",
  ])

  // ============================================================
  // STEP 8 ROLLBACK: Drop external IDs retry tracking from shows
  // ============================================================
  pgm.dropIndex("shows", ["external_ids_last_fetch_attempt"], {
    name: "idx_shows_external_ids_retry",
  })

  pgm.dropColumn("shows", [
    "external_ids_fetch_attempts",
    "external_ids_last_fetch_attempt",
    "external_ids_fetch_error",
    "external_ids_permanently_failed",
  ])

  // ============================================================
  // STEP 7 ROLLBACK: Drop TheTVDB retry tracking from shows
  // ============================================================
  pgm.dropIndex("shows", ["thetvdb_last_fetch_attempt"], {
    name: "idx_shows_thetvdb_retry",
  })

  pgm.dropColumn("shows", [
    "thetvdb_fetch_attempts",
    "thetvdb_last_fetch_attempt",
    "thetvdb_fetch_error",
    "thetvdb_permanently_failed",
  ])

  // ============================================================
  // STEP 6 ROLLBACK: Drop Trakt retry tracking from shows
  // ============================================================
  pgm.dropIndex("shows", ["trakt_last_fetch_attempt"], {
    name: "idx_shows_trakt_retry",
  })

  pgm.dropColumn("shows", [
    "trakt_fetch_attempts",
    "trakt_last_fetch_attempt",
    "trakt_fetch_error",
    "trakt_permanently_failed",
  ])

  // ============================================================
  // STEP 5 ROLLBACK: Drop OMDb retry tracking from shows
  // ============================================================
  pgm.dropIndex("shows", ["omdb_last_fetch_attempt"], {
    name: "idx_shows_omdb_retry",
  })

  pgm.dropColumn("shows", [
    "omdb_fetch_attempts",
    "omdb_last_fetch_attempt",
    "omdb_fetch_error",
    "omdb_permanently_failed",
  ])

  // ============================================================
  // STEP 4 ROLLBACK: Drop popularity retry tracking from movies
  // ============================================================
  pgm.dropIndex("movies", ["popularity_last_fetch_attempt"], {
    name: "idx_movies_popularity_retry",
  })

  pgm.dropColumn("movies", [
    "popularity_fetch_attempts",
    "popularity_last_fetch_attempt",
    "popularity_fetch_error",
    "popularity_permanently_failed",
  ])

  // ============================================================
  // STEP 3 ROLLBACK: Drop external IDs retry tracking from movies
  // ============================================================
  pgm.dropIndex("movies", ["external_ids_last_fetch_attempt"], {
    name: "idx_movies_external_ids_retry",
  })

  pgm.dropColumn("movies", [
    "external_ids_fetch_attempts",
    "external_ids_last_fetch_attempt",
    "external_ids_fetch_error",
    "external_ids_permanently_failed",
  ])

  // ============================================================
  // STEP 2 ROLLBACK: Drop Trakt retry tracking from movies
  // ============================================================
  pgm.dropIndex("movies", ["trakt_last_fetch_attempt"], {
    name: "idx_movies_trakt_retry",
  })

  pgm.dropColumn("movies", [
    "trakt_fetch_attempts",
    "trakt_last_fetch_attempt",
    "trakt_fetch_error",
    "trakt_permanently_failed",
  ])

  // ============================================================
  // STEP 1 ROLLBACK: Drop OMDb retry tracking from movies
  // ============================================================
  pgm.dropIndex("movies", ["omdb_last_fetch_attempt"], {
    name: "idx_movies_omdb_retry",
  })

  pgm.dropColumn("movies", [
    "omdb_fetch_attempts",
    "omdb_last_fetch_attempt",
    "omdb_fetch_error",
    "omdb_permanently_failed",
  ])
}
