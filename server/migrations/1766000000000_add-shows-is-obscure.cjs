/**
 * Add computed is_obscure column to shows table.
 *
 * Similar to the movies table, filters out obscure shows using:
 * - poster_path IS NULL
 * - English shows with low popularity (<5) AND small cast (<5)
 * - Non-English shows with low popularity (<20)
 *
 * A GENERATED ALWAYS STORED column pre-computes this flag for efficient filtering.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Add the computed column
  pgm.sql(`
    ALTER TABLE shows ADD COLUMN is_obscure BOOLEAN GENERATED ALWAYS AS (
      poster_path IS NULL
      OR (original_language = 'en' AND COALESCE(popularity, 0) < 5.0 AND COALESCE(cast_count, 0) < 5)
      OR (original_language != 'en' AND COALESCE(popularity, 0) < 20.0)
    ) STORED
  `);

  // Create partial index for non-obscure shows with mortality data
  pgm.sql(`
    CREATE INDEX idx_shows_not_obscure_curse
    ON shows (mortality_surprise_score DESC)
    WHERE NOT is_obscure AND mortality_surprise_score IS NOT NULL
  `);
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  // Drop the index first
  pgm.dropIndex("shows", [], {
    name: "idx_shows_not_obscure_curse",
    ifExists: true,
  });

  // Drop the computed column
  pgm.dropColumn("shows", "is_obscure");
};
