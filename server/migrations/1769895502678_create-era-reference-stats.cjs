/**
 * Create era_reference_stats table for normalizing popularity metrics across eras.
 *
 * This table stores yearly statistics used to normalize box office and engagement
 * metrics when calculating popularity scores. For example, a $100M box office in 1980
 * means something very different than $100M in 2024.
 *
 * Data is computed from our own movie database and external inflation data.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createTable("era_reference_stats", {
    year: {
      type: "integer",
      primaryKey: true,
    },
    // Box office statistics (in cents for precision)
    median_box_office_cents: {
      type: "bigint",
      comment: "Median box office for movies released this year",
    },
    avg_box_office_cents: {
      type: "bigint",
      comment: "Average box office for movies released this year",
    },
    top_10_avg_box_office_cents: {
      type: "bigint",
      comment: "Average box office for top 10 movies this year",
    },
    // Inflation factor relative to reference year (2024)
    inflation_factor: {
      type: "decimal(8,6)",
      comment: "Inflation multiplier to convert to 2024 dollars",
    },
    // Volume statistics
    total_movies_released: {
      type: "integer",
      comment: "Total movies released this year (in our database)",
    },
    // Engagement baseline statistics
    avg_imdb_votes: {
      type: "integer",
      comment: "Average IMDb vote count for movies this year",
    },
    avg_trakt_watchers: {
      type: "integer",
      comment: "Average Trakt watchers for movies this year",
    },
    // Timestamps
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
  });

  // Add comment on table
  pgm.sql(`
    COMMENT ON TABLE era_reference_stats IS
    'Yearly statistics for normalizing popularity metrics across different eras. Used to compare box office and engagement metrics fairly across decades.'
  `);
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable("era_reference_stats");
};
