/**
 * Migration: Add deathday verification columns to actors table
 *
 * Adds columns to track confidence in death date from source (TMDB):
 * - deathday_confidence: 'verified', 'unverified', or 'conflicting'
 * - deathday_verification_source: where verification came from (e.g., 'wikidata')
 * - deathday_verified_at: when the verification was performed
 *
 * This enables flagging actors with unverified death dates for review,
 * distinct from actor_death_circumstances.deathday_confidence which
 * tracks confidence in Claude's analysis of the death.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Add deathday_confidence column with check constraint
  pgm.addColumn("actors", {
    deathday_confidence: {
      type: "text",
      check: "deathday_confidence IN ('verified', 'unverified', 'conflicting')",
    },
  })

  // Add verification source tracking
  pgm.addColumn("actors", {
    deathday_verification_source: {
      type: "text",
    },
  })

  // Add verification timestamp
  pgm.addColumn("actors", {
    deathday_verified_at: {
      type: "timestamptz",
    },
  })

  // Create index for efficient querying of unverified deaths
  pgm.createIndex("actors", "deathday_confidence", {
    name: "idx_actors_deathday_confidence",
    where: "deathday IS NOT NULL AND (deathday_confidence = 'unverified' OR deathday_confidence = 'conflicting')",
  })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  // Drop index
  pgm.dropIndex("actors", [], { name: "idx_actors_deathday_confidence" })

  // Drop columns
  pgm.dropColumn("actors", "deathday_verified_at")
  pgm.dropColumn("actors", "deathday_verification_source")
  pgm.dropColumn("actors", "deathday_confidence")
}
