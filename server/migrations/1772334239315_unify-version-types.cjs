/**
 * Unify enrichment version types: change biography_version from integer to text
 * so both enrichment_version and biography_version use the same semver string format.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Convert biography_version from integer to text, preserving existing values
  pgm.alterColumn("actors", "biography_version", {
    type: "text",
    using: "biography_version::text",
  })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  // Convert back to integer — semver strings like "5.0.0" are cast to NULL
  // to avoid crashing on non-numeric values written after the up migration
  pgm.alterColumn("actors", "biography_version", {
    type: "integer",
    using:
      "CASE WHEN biography_version ~ '^[0-9]+$' THEN biography_version::integer ELSE NULL END",
  })
}
