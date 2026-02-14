/**
 * Recalculate mortality_surprise_score using empirical Bayes shrinkage (k=2).
 *
 * Old formula: (actual - expected) / expected
 * New formula: (actual - expected) / (expected + 2), with guard for expected = 0
 *
 * The +2 prior prevents extreme scores when expected deaths are near zero.
 * When expected_deaths = 0 (no birthday data), score stays neutral (0).
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Movies
  pgm.sql(`
    UPDATE movies
    SET mortality_surprise_score = CASE
      WHEN expected_deaths > 0 THEN ROUND(
        ((deceased_count - expected_deaths) / (expected_deaths + 2))::numeric, 3
      )
      ELSE 0
    END
    WHERE expected_deaths IS NOT NULL
      AND deceased_count IS NOT NULL
  `)

  // Shows
  pgm.sql(`
    UPDATE shows
    SET mortality_surprise_score = CASE
      WHEN expected_deaths > 0 THEN ROUND(
        ((deceased_count - expected_deaths) / (expected_deaths + 2))::numeric, 3
      )
      ELSE 0
    END
    WHERE expected_deaths IS NOT NULL
      AND deceased_count IS NOT NULL
  `)

  // Seasons
  pgm.sql(`
    UPDATE seasons
    SET mortality_surprise_score = CASE
      WHEN expected_deaths > 0 THEN ROUND(
        ((deceased_count - expected_deaths) / (expected_deaths + 2))::numeric, 3
      )
      ELSE 0
    END
    WHERE expected_deaths IS NOT NULL
      AND deceased_count IS NOT NULL
  `)

  // Episodes
  pgm.sql(`
    UPDATE episodes
    SET mortality_surprise_score = CASE
      WHEN expected_deaths > 0 THEN ROUND(
        ((deceased_count - expected_deaths) / (expected_deaths + 2))::numeric, 3
      )
      ELSE 0
    END
    WHERE expected_deaths IS NOT NULL
      AND deceased_count IS NOT NULL
  `)
}

/**
 * Revert to old formula: (actual - expected) / expected
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  // Movies
  pgm.sql(`
    UPDATE movies
    SET mortality_surprise_score = CASE
      WHEN expected_deaths > 0 THEN ROUND(
        ((deceased_count - expected_deaths) / expected_deaths)::numeric, 3
      )
      ELSE 0
    END
    WHERE expected_deaths IS NOT NULL
      AND deceased_count IS NOT NULL
  `)

  // Shows
  pgm.sql(`
    UPDATE shows
    SET mortality_surprise_score = CASE
      WHEN expected_deaths > 0 THEN ROUND(
        ((deceased_count - expected_deaths) / expected_deaths)::numeric, 3
      )
      ELSE 0
    END
    WHERE expected_deaths IS NOT NULL
      AND deceased_count IS NOT NULL
  `)

  // Seasons
  pgm.sql(`
    UPDATE seasons
    SET mortality_surprise_score = CASE
      WHEN expected_deaths > 0 THEN ROUND(
        ((deceased_count - expected_deaths) / expected_deaths)::numeric, 3
      )
      ELSE 0
    END
    WHERE expected_deaths IS NOT NULL
      AND deceased_count IS NOT NULL
  `)

  // Episodes
  pgm.sql(`
    UPDATE episodes
    SET mortality_surprise_score = CASE
      WHEN expected_deaths > 0 THEN ROUND(
        ((deceased_count - expected_deaths) / expected_deaths)::numeric, 3
      )
      ELSE 0
    END
    WHERE expected_deaths IS NOT NULL
      AND deceased_count IS NOT NULL
  `)
}
