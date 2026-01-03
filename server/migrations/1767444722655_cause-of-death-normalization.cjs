/**
 * Migration: Create cause_of_death_normalizations table
 *
 * Maps original cause_of_death strings to normalized/canonical versions.
 * This enables intelligent grouping of similar causes (e.g., "lung cancer" and "Lung cancer")
 * using Claude AI for semantic normalization.
 */

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createTable("cause_of_death_normalizations", {
    original_cause: {
      type: "text",
      primaryKey: true,
    },
    normalized_cause: {
      type: "text",
      notNull: true,
    },
    created_at: {
      type: "timestamp with time zone",
      default: pgm.func("now()"),
    },
  })

  // Index for reverse lookups (find all originals for a normalized cause)
  pgm.createIndex("cause_of_death_normalizations", "normalized_cause")
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable("cause_of_death_normalizations")
}
