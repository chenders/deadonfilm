/**
 * Add original_title and alternate_titles columns to movies table
 *
 * This stores:
 * - original_title: The original language title from TMDB (may differ from localized title)
 * - alternate_titles: JSON array of alternate titles from TMDB (titles in different countries)
 *
 * These enable better IMDb ID matching by comparing against alternate titles when
 * the primary title doesn't match.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  // The original title in the movie's native language
  pgm.addColumn("movies", {
    original_title: {
      type: "text",
      notNull: false,
    },
  })

  // Array of alternate titles from different countries/regions
  // Format: [{"title": "...", "iso_3166_1": "US", "type": "..."}]
  pgm.addColumn("movies", {
    alternate_titles: {
      type: "jsonb",
      notNull: false,
    },
  })

  // Retry tracking columns for backfill script
  pgm.addColumn("movies", {
    alternate_titles_fetch_attempts: {
      type: "integer",
      notNull: true,
      default: 0,
    },
  })

  pgm.addColumn("movies", {
    alternate_titles_last_fetch_attempt: {
      type: "timestamptz",
      notNull: false,
    },
  })

  pgm.addColumn("movies", {
    alternate_titles_fetch_error: {
      type: "text",
      notNull: false,
    },
  })

  pgm.addColumn("movies", {
    alternate_titles_permanently_failed: {
      type: "boolean",
      notNull: true,
      default: false,
    },
  })

  // Index on original_title for direct lookups
  pgm.createIndex("movies", ["original_title"], {
    name: "idx_movies_original_title",
    where: "original_title IS NOT NULL",
  })
}

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropIndex("movies", ["original_title"], {
    name: "idx_movies_original_title",
  })

  pgm.dropColumn("movies", "alternate_titles_permanently_failed")
  pgm.dropColumn("movies", "alternate_titles_fetch_error")
  pgm.dropColumn("movies", "alternate_titles_last_fetch_attempt")
  pgm.dropColumn("movies", "alternate_titles_fetch_attempts")
  pgm.dropColumn("movies", "alternate_titles")
  pgm.dropColumn("movies", "original_title")
}
