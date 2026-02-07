/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.sql("CREATE EXTENSION IF NOT EXISTS pg_trgm")
  pgm.sql(
    "CREATE INDEX idx_actors_name_trgm ON actors USING gin (name gin_trgm_ops)"
  )
}

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.sql("DROP INDEX IF EXISTS idx_actors_name_trgm")
}
