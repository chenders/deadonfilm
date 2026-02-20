/**
 * Migration: Add IMDb death verification confidence values
 *
 * Extends the deathday_confidence check constraint to include:
 * - 'imdb_verified': IMDb confirms death year, Wikidata unavailable
 * - 'suspicious': Actor found in IMDb but has no deathYear (IMDb says alive)
 *
 * Also updates the partial index to cover the new values.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Drop the old check constraint (created inline with column)
  pgm.sql(`ALTER TABLE actors DROP CONSTRAINT IF EXISTS actors_deathday_confidence_check`)

  // Add updated check constraint with new values
  pgm.sql(`
    ALTER TABLE actors ADD CONSTRAINT actors_deathday_confidence_check
    CHECK (deathday_confidence IN ('verified', 'unverified', 'conflicting', 'imdb_verified', 'suspicious'))
  `)

  // Drop and recreate partial index to include new confidence values
  pgm.dropIndex("actors", [], { name: "idx_actors_deathday_confidence", ifExists: true })

  pgm.createIndex("actors", "deathday_confidence", {
    name: "idx_actors_deathday_confidence",
    where:
      "deathday IS NOT NULL AND deathday_confidence IN ('unverified', 'conflicting', 'suspicious', 'imdb_verified')",
  })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  // Convert new values back to 'unverified' before restoring the original constraint
  pgm.sql(`
    UPDATE actors
    SET deathday_confidence = 'unverified'
    WHERE deathday_confidence IN ('imdb_verified', 'suspicious')
  `)

  // Drop updated constraint
  pgm.sql(`ALTER TABLE actors DROP CONSTRAINT IF EXISTS actors_deathday_confidence_check`)

  // Restore original constraint (3 values only)
  pgm.sql(`
    ALTER TABLE actors ADD CONSTRAINT actors_deathday_confidence_check
    CHECK (deathday_confidence IN ('verified', 'unverified', 'conflicting'))
  `)

  // Drop and recreate original partial index
  pgm.dropIndex("actors", [], { name: "idx_actors_deathday_confidence", ifExists: true })

  pgm.createIndex("actors", "deathday_confidence", {
    name: "idx_actors_deathday_confidence",
    where:
      "deathday IS NOT NULL AND (deathday_confidence = 'unverified' OR deathday_confidence = 'conflicting')",
  })
}
