/**
 * Migration: Add production_countries to movies
 *
 * Adds production_countries column (text array) to movies table
 * for filtering actors by US/English-language productions.
 */

/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Add production_countries column to movies table
  // Uses ISO 3166-1 alpha-2 country codes (e.g., 'US', 'GB', 'CA')
  pgm.addColumn("movies", {
    production_countries: {
      type: "text[]",
      notNull: false,
    },
  })

  // Add GIN index for efficient array containment queries
  pgm.createIndex("movies", "production_countries", {
    method: "gin",
    name: "idx_movies_production_countries",
  })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropIndex("movies", "production_countries", {
    name: "idx_movies_production_countries",
  })
  pgm.dropColumn("movies", "production_countries")
}
