/**
 * Drop unused rating/metric indexes on movies, shows, and episodes.
 *
 * These columns are populated by OMDb/Trakt/TheTVDB sync jobs and read
 * during aggregate score computation, but no queries filter or sort by
 * them directly. The indexes add write overhead without query benefit.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Movies — rating indexes never used in WHERE/ORDER BY
  pgm.dropIndex("movies", [], { name: "idx_movies_omdb_imdb_rating", ifExists: true });
  pgm.dropIndex("movies", [], { name: "idx_movies_omdb_rt_score", ifExists: true });
  pgm.dropIndex("movies", [], { name: "idx_movies_trakt_rating", ifExists: true });
  pgm.dropIndex("movies", [], { name: "idx_movies_trakt_trending", ifExists: true });

  // Shows — same pattern
  pgm.dropIndex("shows", [], { name: "idx_shows_omdb_imdb_rating", ifExists: true });
  pgm.dropIndex("shows", [], { name: "idx_shows_omdb_rt_score", ifExists: true });
  pgm.dropIndex("shows", [], { name: "idx_shows_trakt_rating", ifExists: true });
  pgm.dropIndex("shows", [], { name: "idx_shows_trakt_trending", ifExists: true });
  pgm.dropIndex("shows", [], { name: "idx_shows_thetvdb_score", ifExists: true });

  // Episodes
  pgm.dropIndex("episodes", [], { name: "idx_episodes_omdb_imdb_rating", ifExists: true });
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  // Movies — restore as partial indexes matching originals
  pgm.createIndex("movies", "omdb_imdb_rating", {
    name: "idx_movies_omdb_imdb_rating",
    ifNotExists: true,
    where: "omdb_imdb_rating IS NOT NULL",
  });
  pgm.createIndex("movies", "omdb_rotten_tomatoes_score", {
    name: "idx_movies_omdb_rt_score",
    ifNotExists: true,
    where: "omdb_rotten_tomatoes_score IS NOT NULL",
  });
  pgm.createIndex("movies", "trakt_rating", {
    name: "idx_movies_trakt_rating",
    ifNotExists: true,
    where: "trakt_rating IS NOT NULL",
  });
  pgm.createIndex("movies", "trakt_trending_rank", {
    name: "idx_movies_trakt_trending",
    ifNotExists: true,
    where: "trakt_trending_rank IS NOT NULL",
  });

  // Shows
  pgm.createIndex("shows", "omdb_imdb_rating", {
    name: "idx_shows_omdb_imdb_rating",
    ifNotExists: true,
    where: "omdb_imdb_rating IS NOT NULL",
  });
  pgm.createIndex("shows", "omdb_rotten_tomatoes_score", {
    name: "idx_shows_omdb_rt_score",
    ifNotExists: true,
    where: "omdb_rotten_tomatoes_score IS NOT NULL",
  });
  pgm.createIndex("shows", "trakt_rating", {
    name: "idx_shows_trakt_rating",
    ifNotExists: true,
    where: "trakt_rating IS NOT NULL",
  });
  pgm.createIndex("shows", "trakt_trending_rank", {
    name: "idx_shows_trakt_trending",
    ifNotExists: true,
    where: "trakt_trending_rank IS NOT NULL",
  });
  pgm.createIndex("shows", "thetvdb_score", {
    name: "idx_shows_thetvdb_score",
    ifNotExists: true,
    where: "thetvdb_score IS NOT NULL",
  });

  // Episodes
  pgm.createIndex("episodes", "omdb_imdb_rating", {
    name: "idx_episodes_omdb_imdb_rating",
    ifNotExists: true,
    where: "omdb_imdb_rating IS NOT NULL",
  });
};
