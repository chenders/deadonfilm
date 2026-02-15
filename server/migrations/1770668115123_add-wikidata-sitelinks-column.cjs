/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined

/**
 * Add Wikidata sitelinks tracking columns to actors table.
 * Used for the Wikidata sitelinks signal in popularity scoring (Proposal 06).
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.addColumns("actors", {
    wikidata_sitelinks: {
      type: "integer",
      notNull: false,
    },
    wikidata_sitelinks_updated_at: {
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
    "wikidata_sitelinks",
    "wikidata_sitelinks_updated_at",
  ])
}
