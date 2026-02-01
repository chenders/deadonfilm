/**
 * Rename TMDB-sourced popularity fields for clarity.
 *
 * This migration renames:
 * - movies.popularity -> movies.tmdb_popularity
 * - movies.vote_average -> movies.tmdb_vote_average
 * - shows.popularity -> shows.tmdb_popularity
 * - shows.vote_average -> shows.tmdb_vote_average
 * - actors.popularity -> actors.tmdb_popularity
 *
 * The computed is_obscure columns on movies and shows are recreated
 * to reference the new tmdb_popularity column name.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // =========================================================================
  // MOVIES TABLE
  // =========================================================================

  // Drop the partial index that depends on is_obscure
  pgm.sql(`DROP INDEX IF EXISTS idx_movies_not_obscure_curse`);

  // Drop the computed is_obscure column (we'll recreate it)
  pgm.sql(`ALTER TABLE movies DROP COLUMN IF EXISTS is_obscure`);

  // Rename columns
  pgm.renameColumn("movies", "popularity", "tmdb_popularity");
  pgm.renameColumn("movies", "vote_average", "tmdb_vote_average");

  // Recreate computed is_obscure column with new column name
  pgm.sql(`
    ALTER TABLE movies ADD COLUMN is_obscure BOOLEAN GENERATED ALWAYS AS (
      poster_path IS NULL
      OR (original_language = 'en' AND COALESCE(tmdb_popularity, 0) < 5.0 AND COALESCE(cast_count, 0) < 5)
      OR (original_language != 'en' AND COALESCE(tmdb_popularity, 0) < 20.0)
    ) STORED
  `);

  // Recreate the partial index
  pgm.sql(`
    CREATE INDEX idx_movies_not_obscure_curse
    ON movies (mortality_surprise_score DESC)
    WHERE NOT is_obscure AND mortality_surprise_score IS NOT NULL
  `);

  // =========================================================================
  // SHOWS TABLE
  // =========================================================================

  // Drop the partial index that depends on is_obscure
  pgm.sql(`DROP INDEX IF EXISTS idx_shows_not_obscure_curse`);

  // Drop the computed is_obscure column (we'll recreate it)
  pgm.sql(`ALTER TABLE shows DROP COLUMN IF EXISTS is_obscure`);

  // Rename columns
  pgm.renameColumn("shows", "popularity", "tmdb_popularity");
  pgm.renameColumn("shows", "vote_average", "tmdb_vote_average");

  // Recreate computed is_obscure column with new column name
  pgm.sql(`
    ALTER TABLE shows ADD COLUMN is_obscure BOOLEAN GENERATED ALWAYS AS (
      poster_path IS NULL
      OR (original_language = 'en' AND COALESCE(tmdb_popularity, 0) < 5.0 AND COALESCE(cast_count, 0) < 5)
      OR (original_language != 'en' AND COALESCE(tmdb_popularity, 0) < 20.0)
    ) STORED
  `);

  // Recreate the partial index
  pgm.sql(`
    CREATE INDEX idx_shows_not_obscure_curse
    ON shows (mortality_surprise_score DESC)
    WHERE NOT is_obscure AND mortality_surprise_score IS NOT NULL
  `);

  // =========================================================================
  // ACTORS TABLE
  // =========================================================================

  // Rename column (actors don't have a computed is_obscure column using popularity)
  pgm.renameColumn("actors", "popularity", "tmdb_popularity");
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  // =========================================================================
  // ACTORS TABLE
  // =========================================================================

  pgm.renameColumn("actors", "tmdb_popularity", "popularity");

  // =========================================================================
  // SHOWS TABLE
  // =========================================================================

  pgm.sql(`DROP INDEX IF EXISTS idx_shows_not_obscure_curse`);
  pgm.sql(`ALTER TABLE shows DROP COLUMN IF EXISTS is_obscure`);

  // Rename columns back
  pgm.renameColumn("shows", "tmdb_vote_average", "vote_average");
  pgm.renameColumn("shows", "tmdb_popularity", "popularity");

  // Recreate computed is_obscure column with original column name
  pgm.sql(`
    ALTER TABLE shows ADD COLUMN is_obscure BOOLEAN GENERATED ALWAYS AS (
      poster_path IS NULL
      OR (original_language = 'en' AND COALESCE(popularity, 0) < 5.0 AND COALESCE(cast_count, 0) < 5)
      OR (original_language != 'en' AND COALESCE(popularity, 0) < 20.0)
    ) STORED
  `);

  pgm.sql(`
    CREATE INDEX idx_shows_not_obscure_curse
    ON shows (mortality_surprise_score DESC)
    WHERE NOT is_obscure AND mortality_surprise_score IS NOT NULL
  `);

  // =========================================================================
  // MOVIES TABLE
  // =========================================================================

  pgm.sql(`DROP INDEX IF EXISTS idx_movies_not_obscure_curse`);
  pgm.sql(`ALTER TABLE movies DROP COLUMN IF EXISTS is_obscure`);

  // Rename columns back
  pgm.renameColumn("movies", "tmdb_vote_average", "vote_average");
  pgm.renameColumn("movies", "tmdb_popularity", "popularity");

  // Recreate computed is_obscure column with original column name
  pgm.sql(`
    ALTER TABLE movies ADD COLUMN is_obscure BOOLEAN GENERATED ALWAYS AS (
      poster_path IS NULL
      OR (original_language = 'en' AND COALESCE(popularity, 0) < 5.0 AND COALESCE(cast_count, 0) < 5)
      OR (original_language != 'en' AND COALESCE(popularity, 0) < 20.0)
    ) STORED
  `);

  pgm.sql(`
    CREATE INDEX idx_movies_not_obscure_curse
    ON movies (mortality_surprise_score DESC)
    WHERE NOT is_obscure AND mortality_surprise_score IS NOT NULL
  `);
};
