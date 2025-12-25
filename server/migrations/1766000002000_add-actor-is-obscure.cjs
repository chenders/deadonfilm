/**
 * Add popularity and is_obscure columns to deceased_persons table.
 *
 * An actor is considered "obscure" if:
 * - No profile photo (profile_path IS NULL)
 * - OR low popularity (< 5.0)
 *
 * This matches the logic used in the Death Watch feature for living actors.
 */

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Add popularity column
  pgm.addColumn("deceased_persons", {
    popularity: {
      type: "decimal(10,3)",
      notNull: false,
    },
  })

  // Add the computed is_obscure column
  pgm.sql(`
    ALTER TABLE deceased_persons ADD COLUMN is_obscure BOOLEAN GENERATED ALWAYS AS (
      profile_path IS NULL
      OR COALESCE(popularity, 0) < 5.0
    ) STORED
  `)

  // Create partial index for non-obscure actors (useful for filtering in queries)
  pgm.sql(`
    CREATE INDEX idx_deceased_persons_not_obscure
    ON deceased_persons (deathday DESC)
    WHERE NOT is_obscure
  `)
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.sql("DROP INDEX IF EXISTS idx_deceased_persons_not_obscure")
  pgm.sql("ALTER TABLE deceased_persons DROP COLUMN IF EXISTS is_obscure")
  pgm.dropColumns("deceased_persons", ["popularity"])
}
