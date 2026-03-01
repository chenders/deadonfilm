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
  // Convert back to integer — semver strings like "5.0.0" will fail,
  // but pure numeric strings from pre-migration data will work
  pgm.alterColumn("actors", "biography_version", {
    type: "integer",
    using: "biography_version::integer",
  })
}
