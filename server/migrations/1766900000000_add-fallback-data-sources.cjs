/**
 * Migration: Add fallback data sources support (TVmaze + TheTVDB)
 *
 * This migration enables fetching episode and cast data from alternative sources
 * when TMDB lacks data (common for older soap operas like General Hospital).
 *
 * Changes:
 * 1. Add external IDs to shows table (tvmaze_id, thetvdb_id)
 * 2. Add data source tracking to episodes table
 * 3. Make actors.tmdb_id nullable (for non-TMDB actors)
 * 4. Switch appearance tables from actor_tmdb_id to actor_id (internal FK)
 * 5. Add external person IDs to actors table (tvmaze_person_id, thetvdb_person_id)
 */

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // ============================================================
  // STEP 1: Add external IDs to shows table
  // ============================================================
  pgm.addColumn("shows", {
    tvmaze_id: { type: "integer" },
    thetvdb_id: { type: "integer" },
  })

  pgm.createIndex("shows", "tvmaze_id", {
    name: "idx_shows_tvmaze_id",
    where: "tvmaze_id IS NOT NULL",
  })
  pgm.createIndex("shows", "thetvdb_id", {
    name: "idx_shows_thetvdb_id",
    where: "thetvdb_id IS NOT NULL",
  })

  // ============================================================
  // STEP 2: Add data source tracking to episodes table
  // ============================================================
  pgm.addColumn("episodes", {
    episode_data_source: { type: "text", default: "tmdb" },
    cast_data_source: { type: "text", default: "tmdb" },
    tvmaze_episode_id: { type: "integer" },
    thetvdb_episode_id: { type: "integer" },
  })

  // ============================================================
  // STEP 3: Make actors.tmdb_id nullable
  // ============================================================
  // First drop the unique constraint, make nullable, then recreate unique
  // The constraint name comes from pgm.createTable with unique: true
  pgm.sql(`ALTER TABLE actors DROP CONSTRAINT IF EXISTS actors_tmdb_id_key`)
  pgm.alterColumn("actors", "tmdb_id", { notNull: false })
  // Recreate unique constraint that allows NULL
  pgm.sql(
    `CREATE UNIQUE INDEX idx_actors_tmdb_id_unique ON actors(tmdb_id) WHERE tmdb_id IS NOT NULL`
  )

  // ============================================================
  // STEP 4: Add actor_id to appearance tables
  // ============================================================

  // First, delete orphaned appearances that reference actors not in the actors table.
  // These are data integrity issues from past seeding scripts that didn't properly
  // ensure actors existed before creating appearances.
  pgm.sql(`
    DELETE FROM actor_movie_appearances ama
    WHERE NOT EXISTS (
      SELECT 1 FROM actors a WHERE a.tmdb_id = ama.actor_tmdb_id
    )
  `)
  pgm.sql(`
    DELETE FROM actor_show_appearances asa
    WHERE NOT EXISTS (
      SELECT 1 FROM actors a WHERE a.tmdb_id = asa.actor_tmdb_id
    )
  `)

  pgm.addColumn("actor_movie_appearances", {
    actor_id: { type: "integer" },
  })
  pgm.addColumn("actor_show_appearances", {
    actor_id: { type: "integer" },
  })

  // Populate actor_id from existing actor_tmdb_id
  pgm.sql(`
    UPDATE actor_movie_appearances ama
    SET actor_id = a.id
    FROM actors a
    WHERE a.tmdb_id = ama.actor_tmdb_id
  `)

  pgm.sql(`
    UPDATE actor_show_appearances asa
    SET actor_id = a.id
    FROM actors a
    WHERE a.tmdb_id = asa.actor_tmdb_id
  `)

  // Make actor_id NOT NULL (all rows should have been populated)
  pgm.alterColumn("actor_movie_appearances", "actor_id", { notNull: true })
  pgm.alterColumn("actor_show_appearances", "actor_id", { notNull: true })

  // Add foreign key constraints
  pgm.addConstraint("actor_movie_appearances", "ama_actor_fk", {
    foreignKeys: {
      columns: "actor_id",
      references: "actors(id)",
      onDelete: "CASCADE",
    },
  })
  pgm.addConstraint("actor_show_appearances", "asa_actor_fk", {
    foreignKeys: {
      columns: "actor_id",
      references: "actors(id)",
      onDelete: "CASCADE",
    },
  })

  // Drop old unique constraints
  pgm.dropConstraint("actor_movie_appearances", "ama_unique")
  pgm.dropConstraint("actor_show_appearances", "asa_unique")

  // Create new unique constraints using actor_id
  pgm.addConstraint("actor_movie_appearances", "ama_unique", {
    unique: ["actor_id", "movie_tmdb_id"],
  })
  pgm.addConstraint("actor_show_appearances", "asa_unique", {
    unique: ["actor_id", "show_tmdb_id", "season_number", "episode_number"],
  })

  // Drop old indexes and create new ones
  pgm.dropIndex("actor_movie_appearances", "actor_tmdb_id", {
    name: "idx_ama_actor_tmdb_id",
  })
  pgm.dropIndex("actor_show_appearances", "actor_tmdb_id", {
    name: "idx_asa_actor_tmdb_id",
  })

  pgm.createIndex("actor_movie_appearances", "actor_id", {
    name: "idx_ama_actor_id",
  })
  pgm.createIndex("actor_show_appearances", "actor_id", {
    name: "idx_asa_actor_id",
  })

  // Drop old actor_tmdb_id columns
  pgm.dropColumn("actor_movie_appearances", "actor_tmdb_id")
  pgm.dropColumn("actor_show_appearances", "actor_tmdb_id")

  // ============================================================
  // STEP 5: Add external person IDs to actors table
  // ============================================================
  pgm.addColumn("actors", {
    tvmaze_person_id: { type: "integer" },
    thetvdb_person_id: { type: "integer" },
  })

  pgm.createIndex("actors", "tvmaze_person_id", {
    name: "idx_actors_tvmaze_person_id",
    where: "tvmaze_person_id IS NOT NULL",
  })
  pgm.createIndex("actors", "thetvdb_person_id", {
    name: "idx_actors_thetvdb_person_id",
    where: "thetvdb_person_id IS NOT NULL",
  })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  // ============================================================
  // STEP 0: Clean up non-TMDB data before schema rollback
  // ============================================================
  // Delete appearances for non-TMDB actors (they can't be represented in old schema)
  pgm.sql(`
    DELETE FROM actor_movie_appearances ama
    USING actors a
    WHERE a.id = ama.actor_id AND a.tmdb_id IS NULL
  `)
  pgm.sql(`
    DELETE FROM actor_show_appearances asa
    USING actors a
    WHERE a.id = asa.actor_id AND a.tmdb_id IS NULL
  `)
  // Delete non-TMDB actors themselves
  pgm.sql(`DELETE FROM actors WHERE tmdb_id IS NULL`)

  // ============================================================
  // STEP 5 ROLLBACK: Remove external person IDs from actors
  // ============================================================
  pgm.dropIndex("actors", "tvmaze_person_id", {
    name: "idx_actors_tvmaze_person_id",
  })
  pgm.dropIndex("actors", "thetvdb_person_id", {
    name: "idx_actors_thetvdb_person_id",
  })
  pgm.dropColumn("actors", "tvmaze_person_id")
  pgm.dropColumn("actors", "thetvdb_person_id")

  // ============================================================
  // STEP 4 ROLLBACK: Restore actor_tmdb_id columns
  // ============================================================
  pgm.addColumn("actor_movie_appearances", {
    actor_tmdb_id: { type: "integer" },
  })
  pgm.addColumn("actor_show_appearances", {
    actor_tmdb_id: { type: "integer" },
  })

  // Populate actor_tmdb_id from actor_id
  pgm.sql(`
    UPDATE actor_movie_appearances ama
    SET actor_tmdb_id = a.tmdb_id
    FROM actors a
    WHERE a.id = ama.actor_id
  `)

  pgm.sql(`
    UPDATE actor_show_appearances asa
    SET actor_tmdb_id = a.tmdb_id
    FROM actors a
    WHERE a.id = asa.actor_id
  `)

  // Make actor_tmdb_id NOT NULL (safe now that non-TMDB actors have been removed)
  pgm.alterColumn("actor_movie_appearances", "actor_tmdb_id", { notNull: true })
  pgm.alterColumn("actor_show_appearances", "actor_tmdb_id", { notNull: true })

  // Drop new constraints
  pgm.dropConstraint("actor_movie_appearances", "ama_actor_fk")
  pgm.dropConstraint("actor_show_appearances", "asa_actor_fk")
  pgm.dropConstraint("actor_movie_appearances", "ama_unique")
  pgm.dropConstraint("actor_show_appearances", "asa_unique")

  // Recreate old unique constraints
  pgm.addConstraint("actor_movie_appearances", "ama_unique", {
    unique: ["actor_tmdb_id", "movie_tmdb_id"],
  })
  pgm.addConstraint("actor_show_appearances", "asa_unique", {
    unique: [
      "actor_tmdb_id",
      "show_tmdb_id",
      "season_number",
      "episode_number",
    ],
  })

  // Drop new indexes and create old ones
  pgm.dropIndex("actor_movie_appearances", "actor_id", {
    name: "idx_ama_actor_id",
  })
  pgm.dropIndex("actor_show_appearances", "actor_id", {
    name: "idx_asa_actor_id",
  })

  pgm.createIndex("actor_movie_appearances", "actor_tmdb_id", {
    name: "idx_ama_actor_tmdb_id",
  })
  pgm.createIndex("actor_show_appearances", "actor_tmdb_id", {
    name: "idx_asa_actor_tmdb_id",
  })

  // Drop actor_id columns
  pgm.dropColumn("actor_movie_appearances", "actor_id")
  pgm.dropColumn("actor_show_appearances", "actor_id")

  // ============================================================
  // STEP 3 ROLLBACK: Make actors.tmdb_id NOT NULL again
  // ============================================================
  pgm.dropIndex("actors", "tmdb_id", { name: "idx_actors_tmdb_id_unique" })
  pgm.alterColumn("actors", "tmdb_id", { notNull: true })
  pgm.addConstraint("actors", "actors_tmdb_id_key", {
    unique: ["tmdb_id"],
  })

  // ============================================================
  // STEP 2 ROLLBACK: Remove data source columns from episodes
  // ============================================================
  pgm.dropColumn("episodes", "episode_data_source")
  pgm.dropColumn("episodes", "cast_data_source")
  pgm.dropColumn("episodes", "tvmaze_episode_id")
  pgm.dropColumn("episodes", "thetvdb_episode_id")

  // ============================================================
  // STEP 1 ROLLBACK: Remove external IDs from shows
  // ============================================================
  pgm.dropIndex("shows", "tvmaze_id", { name: "idx_shows_tvmaze_id" })
  pgm.dropIndex("shows", "thetvdb_id", { name: "idx_shows_thetvdb_id" })
  pgm.dropColumn("shows", "tvmaze_id")
  pgm.dropColumn("shows", "thetvdb_id")
}
