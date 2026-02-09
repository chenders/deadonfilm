/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined

/**
 * Add updated_at column to popularity history tables.
 * Keeps created_at immutable (first insert time) and tracks
 * last upsert time separately.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  const tables = [
    "actor_popularity_history",
    "movie_popularity_history",
    "show_popularity_history",
  ]

  for (const table of tables) {
    pgm.addColumn(table, {
      updated_at: {
        type: "timestamptz",
        notNull: true,
        default: pgm.func("NOW()"),
      },
    })
  }
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  const tables = [
    "actor_popularity_history",
    "movie_popularity_history",
    "show_popularity_history",
  ]

  for (const table of tables) {
    pgm.dropColumn(table, "updated_at")
  }
}
