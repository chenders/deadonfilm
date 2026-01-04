/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Add column to track when we checked for cause of death (even if Claude returned null)
  // This prevents re-processing actors where we already tried and got no result
  pgm.addColumn("actors", {
    cause_of_death_checked_at: {
      type: "timestamp with time zone",
      notNull: false,
    },
  })

  // Index for efficient querying of unchecked deceased actors
  // Matches the exact query pattern: WHERE deathday IS NOT NULL AND cause_of_death IS NULL AND cause_of_death_checked_at IS NULL
  pgm.createIndex("actors", "cause_of_death_checked_at", {
    where:
      "deathday IS NOT NULL AND cause_of_death IS NULL AND cause_of_death_checked_at IS NULL",
  })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropIndex("actors", "cause_of_death_checked_at")
  pgm.dropColumn("actors", "cause_of_death_checked_at")
}
