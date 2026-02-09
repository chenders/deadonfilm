/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined

/**
 * Add Wikipedia pageview tracking columns to actors table.
 * Used for the Wikipedia pageviews fame signal in popularity scoring.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.addColumns("actors", {
    wikipedia_annual_pageviews: {
      type: "integer",
      notNull: false,
    },
    wikipedia_pageviews_updated_at: {
      type: "timestamptz",
      notNull: false,
    },
  })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropColumns("actors", [
    "wikipedia_annual_pageviews",
    "wikipedia_pageviews_updated_at",
  ])
}
