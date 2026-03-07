/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumns("actor_biography_details", {
    alternate_names: { type: "text[]", default: null },
    gender: { type: "text", default: null },
    nationality: { type: "text", default: null },
    occupations: { type: "text[]", default: null },
    awards: { type: "text[]", default: null },
  })

  pgm.addColumns("actors", {
    alternate_names: { type: "text[]", default: null },
  })

  // GIN index for array search on actors.alternate_names
  pgm.createIndex("actors", "alternate_names", {
    method: "gin",
    ifNotExists: true,
  })
}

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropIndex("actors", "alternate_names", { ifExists: true })
  pgm.dropColumns("actor_biography_details", [
    "alternate_names",
    "gender",
    "nationality",
    "occupations",
    "awards",
  ])
  pgm.dropColumns("actors", ["alternate_names"])
}
