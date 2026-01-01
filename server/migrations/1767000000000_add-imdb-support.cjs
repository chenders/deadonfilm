/**
 * Migration: Add IMDb dataset support
 *
 * This migration adds columns to support IMDb non-commercial datasets as a 4th
 * fallback data source for episodes and cast data.
 *
 * Changes:
 * 1. Add imdb_id to shows table (IMDb show ID like "tt0060316")
 * 2. Add imdb_episode_id to episodes table (IMDb episode ID like "tt0531270")
 * 3. Add imdb_person_id to actors table (IMDb person ID like "nm0000001")
 */

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // ============================================================
  // STEP 1: Add IMDb ID to shows table
  // ============================================================
  pgm.addColumn("shows", {
    imdb_id: { type: "text" },
  })

  pgm.createIndex("shows", "imdb_id", {
    name: "idx_shows_imdb_id",
    where: "imdb_id IS NOT NULL",
  })

  // ============================================================
  // STEP 2: Add IMDb episode ID to episodes table
  // ============================================================
  pgm.addColumn("episodes", {
    imdb_episode_id: { type: "text" },
  })

  pgm.createIndex("episodes", "imdb_episode_id", {
    name: "idx_episodes_imdb_id",
    where: "imdb_episode_id IS NOT NULL",
  })

  // ============================================================
  // STEP 3: Add IMDb person ID to actors table
  // ============================================================
  pgm.addColumn("actors", {
    imdb_person_id: { type: "text" },
  })

  pgm.createIndex("actors", "imdb_person_id", {
    name: "idx_actors_imdb_person_id",
    where: "imdb_person_id IS NOT NULL",
  })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  // ============================================================
  // STEP 3 ROLLBACK: Remove IMDb person ID from actors
  // ============================================================
  pgm.dropIndex("actors", "imdb_person_id", {
    name: "idx_actors_imdb_person_id",
  })
  pgm.dropColumn("actors", "imdb_person_id")

  // ============================================================
  // STEP 2 ROLLBACK: Remove IMDb episode ID from episodes
  // ============================================================
  pgm.dropIndex("episodes", "imdb_episode_id", {
    name: "idx_episodes_imdb_id",
  })
  pgm.dropColumn("episodes", "imdb_episode_id")

  // ============================================================
  // STEP 1 ROLLBACK: Remove IMDb ID from shows
  // ============================================================
  pgm.dropIndex("shows", "imdb_id", { name: "idx_shows_imdb_id" })
  pgm.dropColumn("shows", "imdb_id")
}
