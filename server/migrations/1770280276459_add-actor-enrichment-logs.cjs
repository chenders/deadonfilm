/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.addColumn("enrichment_run_actors", {
    log_entries: {
      type: "jsonb",
      default: pgm.func("'[]'::jsonb"),
    },
  })
}

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropColumn("enrichment_run_actors", "log_entries")
}
