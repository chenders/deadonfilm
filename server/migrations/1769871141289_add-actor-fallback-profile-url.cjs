/**
 * Add fallback_profile_url column to actors table
 *
 * This stores an alternative image URL (from Wikidata/Commons) for actors
 * who don't have a TMDB profile photo.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.addColumn("actors", {
    fallback_profile_url: {
      type: "text",
      notNull: false,
    },
  })
}

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropColumn("actors", "fallback_profile_url")
}
