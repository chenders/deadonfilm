/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.addColumn("actors", {
    biography: { type: "text" },
    biography_source_url: { type: "text" },
    biography_source_type: {
      type: "text",
      check: "biography_source_type IN ('wikipedia', 'tmdb', 'imdb')",
    },
    biography_generated_at: { type: "timestamp" },
    biography_raw_tmdb: { type: "text" },
    biography_has_content: { type: "boolean", default: false },
  })

  pgm.createIndex("actors", ["biography_generated_at"], {
    name: "idx_actors_biography_needs_generation",
    where: "biography IS NULL AND biography_raw_tmdb IS NOT NULL",
  })
}

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropIndex("actors", [], { name: "idx_actors_biography_needs_generation" })
  pgm.dropColumn("actors", [
    "biography",
    "biography_source_url",
    "biography_source_type",
    "biography_generated_at",
    "biography_raw_tmdb",
    "biography_has_content",
  ])
}
