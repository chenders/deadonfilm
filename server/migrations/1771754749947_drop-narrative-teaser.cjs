/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.dropColumn("actor_biography_details", "narrative_teaser")
}

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.addColumn("actor_biography_details", {
    narrative_teaser: { type: "text" },
  })
}
