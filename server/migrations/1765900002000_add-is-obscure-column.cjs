/**
 * Add computed is_obscure column to movies table.
 *
 * The Cursed Movies page filters out obscure movies using complex OR logic:
 * - poster_path IS NULL
 * - English movies with low popularity (<5) AND small cast (<5)
 * - Non-English movies with low popularity (<20)
 *
 * A GENERATED ALWAYS STORED column pre-computes this flag for efficient filtering.
 * This allows a simple partial index on non-obscure movies.
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
    ALTER TABLE movies ADD COLUMN is_obscure BOOLEAN GENERATED ALWAYS AS (
      poster_path IS NULL
      OR (original_language = 'en' AND COALESCE(popularity, 0) < 5.0 AND COALESCE(cast_count, 0) < 5)
      OR (original_language != 'en' AND COALESCE(popularity, 0) < 20.0)
    ) STORED
  `);

  // Create partial index for non-obscure movies with mortality data
  pgm.sql(`
    CREATE INDEX idx_movies_not_obscure_curse
    ON movies (mortality_surprise_score DESC)
    WHERE NOT is_obscure AND mortality_surprise_score IS NOT NULL
  `);
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  // Drop the index first
  pgm.dropIndex("movies", [], {
    name: "idx_movies_not_obscure_curse",
    ifExists: true,
  });

  // Drop the computed column
  pgm.dropColumn("movies", "is_obscure");
};
