/**
 * Migration: Add popularity and rating metrics from multiple sources
 *
 * This migration adds columns to support ratings and popularity data from:
 * 1. OMDb API - IMDb ratings, Rotten Tomatoes, Metacritic scores
 * 2. Trakt.tv API - Trending data, user ratings, watch counts
 * 3. TheTVDB score - Community rating (already fetched during import)
 *
 * Changes:
 * 1. Add OMDb metrics to movies, shows, and episodes tables
 * 2. Add Trakt metrics to movies and shows tables
 * 3. Add TheTVDB score to shows table
 * 4. Add conditional indexes for efficient querying
 */

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // ============================================================
  // STEP 1: Add IMDb ID to movies table (required for OMDb/Trakt lookups)
  // ============================================================
  pgm.addColumn("movies", {
    imdb_id: { type: "text" },
  })

  pgm.createIndex("movies", "imdb_id", {
    name: "idx_movies_imdb_id",
    where: "imdb_id IS NOT NULL",
  })

  // ============================================================
  // STEP 2: Add OMDb metrics to movies table
  // ============================================================
  pgm.addColumn("movies", {
    omdb_imdb_rating: { type: "decimal(3,1)" },
    omdb_imdb_votes: { type: "integer" },
    omdb_rotten_tomatoes_score: { type: "smallint" }, // 0-100 (critics)
    omdb_rotten_tomatoes_audience: { type: "smallint" }, // 0-100 (audience)
    omdb_metacritic_score: { type: "smallint" }, // 0-100
    omdb_updated_at: { type: "timestamp" },
  })

  // ============================================================
  // STEP 3: Add Trakt metrics to movies table
  // ============================================================
  pgm.addColumn("movies", {
    trakt_rating: { type: "decimal(4,2)" }, // 0-10 scale (e.g., 8.15)
    trakt_votes: { type: "integer" },
    trakt_watchers: { type: "integer" },
    trakt_plays: { type: "integer" },
    trakt_trending_rank: { type: "smallint" }, // Nullable - only for trending content
    trakt_updated_at: { type: "timestamp" },
  })

  // ============================================================
  // STEP 4: Add OMDb metrics to shows table
  // ============================================================
  pgm.addColumn("shows", {
    omdb_imdb_rating: { type: "decimal(3,1)" },
    omdb_imdb_votes: { type: "integer" },
    omdb_rotten_tomatoes_score: { type: "smallint" },
    omdb_rotten_tomatoes_audience: { type: "smallint" },
    omdb_metacritic_score: { type: "smallint" },
    omdb_updated_at: { type: "timestamp" },
  })

  // ============================================================
  // STEP 5: Add Trakt metrics to shows table
  // ============================================================
  pgm.addColumn("shows", {
    trakt_rating: { type: "decimal(4,2)" },
    trakt_votes: { type: "integer" },
    trakt_watchers: { type: "integer" },
    trakt_plays: { type: "integer" },
    trakt_trending_rank: { type: "smallint" },
    trakt_updated_at: { type: "timestamp" },
  })

  // ============================================================
  // STEP 6: Add TheTVDB score to shows table
  // ============================================================
  pgm.addColumn("shows", {
    thetvdb_score: { type: "decimal(4,2)" }, // 0-10 scale
  })

  // ============================================================
  // STEP 7: Add OMDb metrics to episodes table
  // ============================================================
  pgm.addColumn("episodes", {
    omdb_imdb_rating: { type: "decimal(3,1)" },
    omdb_imdb_votes: { type: "integer" },
    omdb_rotten_tomatoes_score: { type: "smallint" },
    omdb_rotten_tomatoes_audience: { type: "smallint" },
    omdb_metacritic_score: { type: "smallint" },
    omdb_updated_at: { type: "timestamp" },
  })

  // ============================================================
  // STEP 8: Create conditional indexes for efficient querying
  // ============================================================

  // Movies indexes
  pgm.createIndex("movies", "omdb_imdb_rating", {
    name: "idx_movies_omdb_imdb_rating",
    where: "omdb_imdb_rating IS NOT NULL",
  })

  pgm.createIndex("movies", "omdb_rotten_tomatoes_score", {
    name: "idx_movies_omdb_rt_score",
    where: "omdb_rotten_tomatoes_score IS NOT NULL",
  })

  pgm.createIndex("movies", "trakt_rating", {
    name: "idx_movies_trakt_rating",
    where: "trakt_rating IS NOT NULL",
  })

  pgm.createIndex("movies", "trakt_trending_rank", {
    name: "idx_movies_trakt_trending",
    where: "trakt_trending_rank IS NOT NULL",
  })

  // Shows indexes
  pgm.createIndex("shows", "omdb_imdb_rating", {
    name: "idx_shows_omdb_imdb_rating",
    where: "omdb_imdb_rating IS NOT NULL",
  })

  pgm.createIndex("shows", "omdb_rotten_tomatoes_score", {
    name: "idx_shows_omdb_rt_score",
    where: "omdb_rotten_tomatoes_score IS NOT NULL",
  })

  pgm.createIndex("shows", "trakt_rating", {
    name: "idx_shows_trakt_rating",
    where: "trakt_rating IS NOT NULL",
  })

  pgm.createIndex("shows", "trakt_trending_rank", {
    name: "idx_shows_trakt_trending",
    where: "trakt_trending_rank IS NOT NULL",
  })

  pgm.createIndex("shows", "thetvdb_score", {
    name: "idx_shows_thetvdb_score",
    where: "thetvdb_score IS NOT NULL",
  })

  // Episodes indexes
  pgm.createIndex("episodes", "omdb_imdb_rating", {
    name: "idx_episodes_omdb_imdb_rating",
    where: "omdb_imdb_rating IS NOT NULL",
  })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  // ============================================================
  // STEP 8 ROLLBACK: Drop all indexes
  // ============================================================

  // Episodes indexes
  pgm.dropIndex("episodes", "omdb_imdb_rating", {
    name: "idx_episodes_omdb_imdb_rating",
  })

  // Shows indexes
  pgm.dropIndex("shows", "thetvdb_score", {
    name: "idx_shows_thetvdb_score",
  })

  pgm.dropIndex("shows", "trakt_trending_rank", {
    name: "idx_shows_trakt_trending",
  })

  pgm.dropIndex("shows", "trakt_rating", {
    name: "idx_shows_trakt_rating",
  })

  pgm.dropIndex("shows", "omdb_rotten_tomatoes_score", {
    name: "idx_shows_omdb_rt_score",
  })

  pgm.dropIndex("shows", "omdb_imdb_rating", {
    name: "idx_shows_omdb_imdb_rating",
  })

  // Movies indexes
  pgm.dropIndex("movies", "trakt_trending_rank", {
    name: "idx_movies_trakt_trending",
  })

  pgm.dropIndex("movies", "trakt_rating", {
    name: "idx_movies_trakt_rating",
  })

  pgm.dropIndex("movies", "omdb_rotten_tomatoes_score", {
    name: "idx_movies_omdb_rt_score",
  })

  pgm.dropIndex("movies", "omdb_imdb_rating", {
    name: "idx_movies_omdb_imdb_rating",
  })

  // ============================================================
  // STEP 7 ROLLBACK: Remove OMDb metrics from episodes
  // ============================================================
  pgm.dropColumn("episodes", [
    "omdb_imdb_rating",
    "omdb_imdb_votes",
    "omdb_rotten_tomatoes_score",
    "omdb_rotten_tomatoes_audience",
    "omdb_metacritic_score",
    "omdb_updated_at",
  ])

  // ============================================================
  // STEP 6 ROLLBACK: Remove TheTVDB score from shows
  // ============================================================
  pgm.dropColumn("shows", "thetvdb_score")

  // ============================================================
  // STEP 5 ROLLBACK: Remove Trakt metrics from shows
  // ============================================================
  pgm.dropColumn("shows", [
    "trakt_rating",
    "trakt_votes",
    "trakt_watchers",
    "trakt_plays",
    "trakt_trending_rank",
    "trakt_updated_at",
  ])

  // ============================================================
  // STEP 4 ROLLBACK: Remove OMDb metrics from shows
  // ============================================================
  pgm.dropColumn("shows", [
    "omdb_imdb_rating",
    "omdb_imdb_votes",
    "omdb_rotten_tomatoes_score",
    "omdb_rotten_tomatoes_audience",
    "omdb_metacritic_score",
    "omdb_updated_at",
  ])

  // ============================================================
  // STEP 3 ROLLBACK: Remove Trakt metrics from movies
  // ============================================================
  pgm.dropColumn("movies", [
    "trakt_rating",
    "trakt_votes",
    "trakt_watchers",
    "trakt_plays",
    "trakt_trending_rank",
    "trakt_updated_at",
  ])

  // ============================================================
  // STEP 2 ROLLBACK: Remove OMDb metrics from movies
  // ============================================================
  pgm.dropColumn("movies", [
    "omdb_imdb_rating",
    "omdb_imdb_votes",
    "omdb_rotten_tomatoes_score",
    "omdb_rotten_tomatoes_audience",
    "omdb_metacritic_score",
    "omdb_updated_at",
  ])

  // ============================================================
  // STEP 1 ROLLBACK: Remove IMDb ID from movies
  // ============================================================
  pgm.dropIndex("movies", "imdb_id", {
    name: "idx_movies_imdb_id",
  })

  pgm.dropColumn("movies", "imdb_id")
}
