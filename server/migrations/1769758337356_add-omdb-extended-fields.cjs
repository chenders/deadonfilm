/**
 * Migration: Add OMDB extended fields for popularity metrics
 *
 * Movies: BoxOffice revenue, Awards (wins/nominations)
 * TV Shows: totalSeasons, Awards (wins/nominations)
 */

/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  // Movies table - add box office and awards
  pgm.addColumn("movies", {
    omdb_box_office_cents: {
      type: "bigint",
      comment: "Box office revenue in cents (from OMDB BoxOffice field)",
    },
    omdb_awards_wins: {
      type: "smallint",
      comment: "Number of award wins (parsed from OMDB Awards field)",
    },
    omdb_awards_nominations: {
      type: "smallint",
      comment: "Number of award nominations (parsed from OMDB Awards field)",
    },
  })

  // Shows table - add total seasons and awards
  pgm.addColumn("shows", {
    omdb_total_seasons: {
      type: "smallint",
      comment: "Total number of seasons (from OMDB totalSeasons field)",
    },
    omdb_awards_wins: {
      type: "smallint",
      comment: "Number of award wins (parsed from OMDB Awards field)",
    },
    omdb_awards_nominations: {
      type: "smallint",
      comment: "Number of award nominations (parsed from OMDB Awards field)",
    },
  })
}

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  // Remove columns from movies
  pgm.dropColumn("movies", [
    "omdb_box_office_cents",
    "omdb_awards_wins",
    "omdb_awards_nominations",
  ])

  // Remove columns from shows
  pgm.dropColumn("shows", ["omdb_total_seasons", "omdb_awards_wins", "omdb_awards_nominations"])
}
