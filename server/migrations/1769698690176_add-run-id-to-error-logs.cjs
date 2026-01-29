/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined

/**
 * Add run_id column to error_logs table for linking logs to enrichment runs.
 * This enables filtering logs by run ID in the admin UI.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Add run_id column (nullable since most logs won't be associated with a run)
  pgm.addColumn("error_logs", {
    run_id: { type: "integer" },
  })

  // Create index for efficient queries by run_id
  pgm.createIndex("error_logs", "run_id", {
    method: "btree",
    name: "idx_error_logs_run_id",
    where: "run_id IS NOT NULL",
  })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropIndex("error_logs", "run_id", { name: "idx_error_logs_run_id" })
  pgm.dropColumn("error_logs", "run_id")
}
