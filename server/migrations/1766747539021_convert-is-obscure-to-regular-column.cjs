/**
 * Migration: Convert is_obscure from computed to regular column
 *
 * This migration changes the is_obscure column on the actors table from a
 * computed column (based on profile_path and popularity) to a regular boolean
 * column that will be populated by a backfill script.
 *
 * The new obscurity logic considers movie and TV appearances:
 * - Has a movie with popularity >= 20
 * - Has a TV show with popularity >= 20
 * - Has 3+ English movies with popularity >= 5
 * - Has 3+ English TV shows with popularity >= 5
 * - Has 10+ movies total
 * - Has 50+ TV episodes total
 *
 * If ANY of these are true, the actor is NOT obscure.
 */

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Drop the existing index that references is_obscure
  pgm.dropIndex("actors", "deathday", { name: "idx_actors_not_obscure", ifExists: true })

  // Drop the computed column
  pgm.dropColumn("actors", "is_obscure")

  // Add a regular boolean column with default true (obscure until proven otherwise)
  pgm.addColumn("actors", {
    is_obscure: {
      type: "boolean",
      notNull: true,
      default: true,
    },
  })

  // Recreate the partial index for non-obscure deceased actors
  pgm.createIndex("actors", "deathday", {
    name: "idx_actors_not_obscure",
    where: "NOT is_obscure AND deathday IS NOT NULL",
    method: "btree",
  })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  // Drop the index first
  pgm.dropIndex("actors", "deathday", { name: "idx_actors_not_obscure" })

  // Drop the regular column
  pgm.dropColumn("actors", "is_obscure")

  // Recreate the computed column
  pgm.sql(`
    ALTER TABLE actors ADD COLUMN is_obscure BOOLEAN GENERATED ALWAYS AS (
      profile_path IS NULL OR COALESCE(popularity, 0) < 5.0
    ) STORED
  `)

  // Recreate the index
  pgm.createIndex("actors", "deathday", {
    name: "idx_actors_not_obscure",
    where: "NOT is_obscure AND deathday IS NOT NULL",
    method: "btree",
  })
}
