/**
 * Add Dead on Film (DOF) popularity scoring columns.
 *
 * These columns store calculated popularity scores that combine multiple signals
 * (box office, Trakt watchers, IMDb votes, TMDB popularity, etc.) into unified
 * 0-100 scores for ranking and prioritization.
 *
 * Movies and shows get both:
 * - dof_popularity: How popular/well-known the content is (0-100)
 * - dof_weight: How much the content should count toward an actor's score (0-100)
 *
 * Actors get:
 * - dof_popularity: Derived from filmography weighted by content scores
 *
 * All entities get confidence scores indicating data quality.
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

  pgm.addColumn("movies", {
    dof_popularity: {
      type: "decimal(5,2)",
      comment: "Dead on Film popularity score (0-100, higher = more popular)",
    },
    dof_weight: {
      type: "decimal(5,2)",
      comment: "Cultural weight score (0-100) for actor popularity calculation",
    },
    dof_popularity_confidence: {
      type: "decimal(3,2)",
      comment: "Confidence in the popularity score (0-1 based on data sources available)",
    },
    dof_popularity_updated_at: {
      type: "timestamptz",
      comment: "When the popularity score was last calculated",
    },
  });

  // Index for sorting by popularity
  pgm.createIndex("movies", "dof_popularity", {
    name: "idx_movies_dof_popularity",
    where: "dof_popularity IS NOT NULL",
    method: "btree",
  });

  // Descending index for "most popular first" queries
  pgm.sql(`
    CREATE INDEX idx_movies_dof_popularity_desc
    ON movies (dof_popularity DESC NULLS LAST)
    WHERE dof_popularity IS NOT NULL
  `);

  // =========================================================================
  // SHOWS TABLE
  // =========================================================================

  pgm.addColumn("shows", {
    dof_popularity: {
      type: "decimal(5,2)",
      comment: "Dead on Film popularity score (0-100, higher = more popular)",
    },
    dof_weight: {
      type: "decimal(5,2)",
      comment: "Cultural weight score (0-100) for actor popularity calculation",
    },
    dof_popularity_confidence: {
      type: "decimal(3,2)",
      comment: "Confidence in the popularity score (0-1 based on data sources available)",
    },
    dof_popularity_updated_at: {
      type: "timestamptz",
      comment: "When the popularity score was last calculated",
    },
  });

  // Index for sorting by popularity
  pgm.createIndex("shows", "dof_popularity", {
    name: "idx_shows_dof_popularity",
    where: "dof_popularity IS NOT NULL",
    method: "btree",
  });

  // Descending index for "most popular first" queries
  pgm.sql(`
    CREATE INDEX idx_shows_dof_popularity_desc
    ON shows (dof_popularity DESC NULLS LAST)
    WHERE dof_popularity IS NOT NULL
  `);

  // =========================================================================
  // ACTORS TABLE
  // =========================================================================

  pgm.addColumn("actors", {
    dof_popularity: {
      type: "decimal(5,2)",
      comment: "Dead on Film popularity score (0-100) derived from filmography",
    },
    dof_popularity_confidence: {
      type: "decimal(3,2)",
      comment: "Confidence in the popularity score (0-1 based on appearance count)",
    },
    dof_popularity_updated_at: {
      type: "timestamptz",
      comment: "When the popularity score was last calculated",
    },
  });

  // Index for sorting by popularity
  pgm.createIndex("actors", "dof_popularity", {
    name: "idx_actors_dof_popularity",
    where: "dof_popularity IS NOT NULL",
    method: "btree",
  });

  // Descending index for "most popular first" queries (useful for prioritizing death enrichment)
  pgm.sql(`
    CREATE INDEX idx_actors_dof_popularity_desc
    ON actors (dof_popularity DESC NULLS LAST)
    WHERE dof_popularity IS NOT NULL
  `);

  // Partial index for deceased actors sorted by popularity (for death enrichment prioritization)
  pgm.sql(`
    CREATE INDEX idx_actors_deceased_by_dof_popularity
    ON actors (dof_popularity DESC NULLS LAST)
    WHERE deathday IS NOT NULL AND dof_popularity IS NOT NULL
  `);
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  // Drop indexes first
  pgm.dropIndex("actors", [], { name: "idx_actors_deceased_by_dof_popularity", ifExists: true });
  pgm.dropIndex("actors", [], { name: "idx_actors_dof_popularity_desc", ifExists: true });
  pgm.dropIndex("actors", [], { name: "idx_actors_dof_popularity", ifExists: true });

  pgm.dropIndex("shows", [], { name: "idx_shows_dof_popularity_desc", ifExists: true });
  pgm.dropIndex("shows", [], { name: "idx_shows_dof_popularity", ifExists: true });

  pgm.dropIndex("movies", [], { name: "idx_movies_dof_popularity_desc", ifExists: true });
  pgm.dropIndex("movies", [], { name: "idx_movies_dof_popularity", ifExists: true });

  // Drop columns
  pgm.dropColumn("actors", [
    "dof_popularity",
    "dof_popularity_confidence",
    "dof_popularity_updated_at",
  ]);

  pgm.dropColumn("shows", [
    "dof_popularity",
    "dof_weight",
    "dof_popularity_confidence",
    "dof_popularity_updated_at",
  ]);

  pgm.dropColumn("movies", [
    "dof_popularity",
    "dof_weight",
    "dof_popularity_confidence",
    "dof_popularity_updated_at",
  ]);
};
