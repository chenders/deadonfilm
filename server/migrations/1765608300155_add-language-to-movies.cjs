/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Add original_language column to movies table
  // Uses ISO 639-1 two-letter codes (e.g., 'en', 'es', 'fr')
  pgm.addColumn("movies", {
    original_language: {
      type: "text",
      notNull: false, // Allow null for existing records until backfilled
    },
  })

  // Add index for filtering by language
  pgm.createIndex("movies", "original_language")
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropIndex("movies", "original_language")
  pgm.dropColumn("movies", "original_language")
}
