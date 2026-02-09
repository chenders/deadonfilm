/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // ========================================================================
  // Actor Popularity History
  // ========================================================================
  pgm.createTable("actor_popularity_history", {
    id: "id",
    actor_id: {
      type: "integer",
      notNull: true,
      references: "actors",
      onDelete: "CASCADE",
    },
    dof_popularity: {
      type: "decimal(5,2)",
      notNull: true,
    },
    dof_popularity_confidence: {
      type: "decimal(3,2)",
    },
    algorithm_version: {
      type: "varchar(20)",
      notNull: true,
    },
    run_id: {
      type: "integer",
      references: "cronjob_runs",
      onDelete: "SET NULL",
    },
    snapshot_date: {
      type: "date",
      notNull: true,
      default: pgm.func("CURRENT_DATE"),
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
  })

  pgm.createIndex("actor_popularity_history", ["actor_id", { name: "snapshot_date", sort: "DESC" }], {
    name: "idx_actor_pop_hist_entity_date",
  })
  pgm.createIndex("actor_popularity_history", ["algorithm_version", "snapshot_date"], {
    name: "idx_actor_pop_hist_version_date",
  })
  pgm.createIndex("actor_popularity_history", ["run_id"], {
    name: "idx_actor_pop_hist_run_id",
    where: "run_id IS NOT NULL",
  })
  pgm.createIndex("actor_popularity_history", ["actor_id", "snapshot_date", "algorithm_version"], {
    name: "uq_actor_pop_hist_entity_date_version",
    unique: true,
  })

  // ========================================================================
  // Movie Popularity History
  // ========================================================================
  pgm.createTable("movie_popularity_history", {
    id: "id",
    movie_id: {
      type: "integer",
      notNull: true,
      references: "movies",
      onDelete: "CASCADE",
    },
    dof_popularity: {
      type: "decimal(5,2)",
      notNull: true,
    },
    dof_weight: {
      type: "decimal(5,2)",
    },
    dof_popularity_confidence: {
      type: "decimal(3,2)",
    },
    algorithm_version: {
      type: "varchar(20)",
      notNull: true,
    },
    run_id: {
      type: "integer",
      references: "cronjob_runs",
      onDelete: "SET NULL",
    },
    snapshot_date: {
      type: "date",
      notNull: true,
      default: pgm.func("CURRENT_DATE"),
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
  })

  pgm.createIndex("movie_popularity_history", ["movie_id", { name: "snapshot_date", sort: "DESC" }], {
    name: "idx_movie_pop_hist_entity_date",
  })
  pgm.createIndex("movie_popularity_history", ["algorithm_version", "snapshot_date"], {
    name: "idx_movie_pop_hist_version_date",
  })
  pgm.createIndex("movie_popularity_history", ["run_id"], {
    name: "idx_movie_pop_hist_run_id",
    where: "run_id IS NOT NULL",
  })
  pgm.createIndex("movie_popularity_history", ["movie_id", "snapshot_date", "algorithm_version"], {
    name: "uq_movie_pop_hist_entity_date_version",
    unique: true,
  })

  // ========================================================================
  // Show Popularity History
  // ========================================================================
  pgm.createTable("show_popularity_history", {
    id: "id",
    show_id: {
      type: "integer",
      notNull: true,
      references: "shows",
      onDelete: "CASCADE",
    },
    dof_popularity: {
      type: "decimal(5,2)",
      notNull: true,
    },
    dof_weight: {
      type: "decimal(5,2)",
    },
    dof_popularity_confidence: {
      type: "decimal(3,2)",
    },
    algorithm_version: {
      type: "varchar(20)",
      notNull: true,
    },
    run_id: {
      type: "integer",
      references: "cronjob_runs",
      onDelete: "SET NULL",
    },
    snapshot_date: {
      type: "date",
      notNull: true,
      default: pgm.func("CURRENT_DATE"),
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
  })

  pgm.createIndex("show_popularity_history", ["show_id", { name: "snapshot_date", sort: "DESC" }], {
    name: "idx_show_pop_hist_entity_date",
  })
  pgm.createIndex("show_popularity_history", ["algorithm_version", "snapshot_date"], {
    name: "idx_show_pop_hist_version_date",
  })
  pgm.createIndex("show_popularity_history", ["run_id"], {
    name: "idx_show_pop_hist_run_id",
    where: "run_id IS NOT NULL",
  })
  pgm.createIndex("show_popularity_history", ["show_id", "snapshot_date", "algorithm_version"], {
    name: "uq_show_pop_hist_entity_date_version",
    unique: true,
  })

  // ========================================================================
  // Baseline capture: snapshot current scores as v1.0
  // ========================================================================
  pgm.sql(`
    INSERT INTO actor_popularity_history (actor_id, dof_popularity, dof_popularity_confidence, algorithm_version, snapshot_date)
    SELECT id, dof_popularity, dof_popularity_confidence, '1.0', CURRENT_DATE
    FROM actors
    WHERE dof_popularity IS NOT NULL
  `)

  pgm.sql(`
    INSERT INTO movie_popularity_history (movie_id, dof_popularity, dof_weight, dof_popularity_confidence, algorithm_version, snapshot_date)
    SELECT id, dof_popularity, dof_weight, dof_popularity_confidence, '1.0', CURRENT_DATE
    FROM movies
    WHERE dof_popularity IS NOT NULL
  `)

  pgm.sql(`
    INSERT INTO show_popularity_history (show_id, dof_popularity, dof_weight, dof_popularity_confidence, algorithm_version, snapshot_date)
    SELECT id, dof_popularity, dof_weight, dof_popularity_confidence, '1.0', CURRENT_DATE
    FROM shows
    WHERE dof_popularity IS NOT NULL
  `)
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable("show_popularity_history")
  pgm.dropTable("movie_popularity_history")
  pgm.dropTable("actor_popularity_history")
}
