/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // Structured awards data (wins, nominations, pre-computed score)
  pgm.addColumn("actors", {
    actor_awards_data: {
      type: "jsonb",
      default: null,
    },
    actor_awards_updated_at: {
      type: "timestamptz",
      default: null,
    },
  })
}

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropColumn("actors", ["actor_awards_data", "actor_awards_updated_at"])
}
