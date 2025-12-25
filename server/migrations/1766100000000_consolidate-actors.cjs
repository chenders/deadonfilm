/**
 * Migration: Consolidate actor data into unified `actors` table
 *
 * This migration:
 * 1. Creates new `actors` table (consolidates deceased_persons + living actors)
 * 2. Creates new `actor_movie_appearances` table (simplified junction)
 * 3. Creates new `actor_show_appearances` table (simplified junction)
 * 4. Migrates data from old tables
 * 5. Drops old tables (deceased_persons, actor_appearances, show_actor_appearances)
 *
 * Benefits:
 * - Single source of truth for actor data
 * - No duplicated metadata (birthday, profile_path, popularity)
 * - Cleaner queries with simple JOINs
 * - is_deceased derived from deathday IS NOT NULL
 */

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // ============================================================
  // STEP 1: Create new `actors` table
  // ============================================================
  pgm.createTable("actors", {
    id: "id",
    tmdb_id: { type: "integer", notNull: true, unique: true },
    name: { type: "text", notNull: true },
    birthday: { type: "date" },
    deathday: { type: "date" },
    profile_path: { type: "text" },
    popularity: { type: "decimal(10,3)" },

    // Death-related fields (null for living actors)
    cause_of_death: { type: "text" },
    cause_of_death_source: { type: "text" },
    cause_of_death_details: { type: "text" },
    cause_of_death_details_source: { type: "text" },
    wikipedia_url: { type: "text" },
    age_at_death: { type: "integer" },
    expected_lifespan: { type: "decimal(5,2)" },
    years_lost: { type: "decimal(5,2)" },
    violent_death: { type: "boolean" },

    // Timestamps
    created_at: { type: "timestamp", default: pgm.func("NOW()") },
    updated_at: { type: "timestamp", default: pgm.func("NOW()") },
  })

  // Add computed is_obscure column
  pgm.sql(`
    ALTER TABLE actors ADD COLUMN is_obscure BOOLEAN GENERATED ALWAYS AS (
      profile_path IS NULL OR COALESCE(popularity, 0) < 5.0
    ) STORED
  `)

  // Indexes for actors table
  pgm.createIndex("actors", "tmdb_id", { name: "idx_actors_tmdb_id" })
  pgm.createIndex("actors", "deathday", {
    name: "idx_actors_deathday",
    where: "deathday IS NOT NULL",
  })
  pgm.sql(`
    CREATE INDEX idx_actors_deathday_month_day ON actors (
      EXTRACT(MONTH FROM deathday),
      EXTRACT(DAY FROM deathday)
    ) WHERE deathday IS NOT NULL
  `)
  pgm.createIndex("actors", "deathday", {
    name: "idx_actors_not_obscure",
    where: "NOT is_obscure AND deathday IS NOT NULL",
    method: "btree",
  })
  pgm.createIndex("actors", "birthday", {
    name: "idx_actors_living_with_birthday",
    where: "birthday IS NOT NULL AND deathday IS NULL",
  })
  pgm.createIndex("actors", "violent_death", {
    name: "idx_actors_violent_death",
    where: "violent_death = true",
  })
  pgm.createIndex("actors", "years_lost", { name: "idx_actors_years_lost" })
  pgm.createIndex("actors", "age_at_death", { name: "idx_actors_age_at_death" })

  // ============================================================
  // STEP 2: Create new `actor_movie_appearances` table
  // ============================================================
  pgm.createTable("actor_movie_appearances", {
    id: "id",
    actor_tmdb_id: { type: "integer", notNull: true },
    movie_tmdb_id: { type: "integer", notNull: true },
    character_name: { type: "text" },
    billing_order: { type: "integer" },
    age_at_filming: { type: "integer" },
  })

  pgm.addConstraint("actor_movie_appearances", "ama_unique", {
    unique: ["actor_tmdb_id", "movie_tmdb_id"],
  })

  pgm.addConstraint("actor_movie_appearances", "ama_movie_fk", {
    foreignKeys: {
      columns: "movie_tmdb_id",
      references: "movies(tmdb_id)",
      onDelete: "CASCADE",
    },
  })

  pgm.createIndex("actor_movie_appearances", "actor_tmdb_id", {
    name: "idx_ama_actor_tmdb_id",
  })
  pgm.createIndex("actor_movie_appearances", "movie_tmdb_id", {
    name: "idx_ama_movie_tmdb_id",
  })

  // ============================================================
  // STEP 3: Create new `actor_show_appearances` table
  // ============================================================
  pgm.createTable("actor_show_appearances", {
    id: "id",
    actor_tmdb_id: { type: "integer", notNull: true },
    show_tmdb_id: { type: "integer", notNull: true },
    season_number: { type: "integer", notNull: true },
    episode_number: { type: "integer", notNull: true },
    character_name: { type: "text" },
    appearance_type: { type: "text", notNull: true },
    billing_order: { type: "integer" },
    age_at_filming: { type: "integer" },
  })

  pgm.addConstraint("actor_show_appearances", "asa_unique", {
    unique: ["actor_tmdb_id", "show_tmdb_id", "season_number", "episode_number"],
  })

  pgm.addConstraint("actor_show_appearances", "asa_show_fk", {
    foreignKeys: {
      columns: "show_tmdb_id",
      references: "shows(tmdb_id)",
      onDelete: "CASCADE",
    },
  })

  pgm.createIndex("actor_show_appearances", "actor_tmdb_id", {
    name: "idx_asa_actor_tmdb_id",
  })
  pgm.createIndex("actor_show_appearances", "show_tmdb_id", {
    name: "idx_asa_show_tmdb_id",
  })
  pgm.createIndex(
    "actor_show_appearances",
    ["show_tmdb_id", "season_number", "episode_number"],
    { name: "idx_asa_episode" }
  )

  // ============================================================
  // STEP 4: Migrate data
  // ============================================================

  // 4a. Populate actors from deceased_persons (authoritative death info)
  pgm.sql(`
    INSERT INTO actors (
      tmdb_id, name, birthday, deathday,
      cause_of_death, cause_of_death_source, cause_of_death_details, cause_of_death_details_source,
      wikipedia_url, age_at_death, expected_lifespan, years_lost, violent_death,
      profile_path, popularity, created_at, updated_at
    )
    SELECT
      tmdb_id, name, birthday, deathday,
      cause_of_death, cause_of_death_source, cause_of_death_details, cause_of_death_details_source,
      wikipedia_url, age_at_death, expected_lifespan, years_lost, violent_death,
      profile_path, popularity, COALESCE(created_at, NOW()), COALESCE(updated_at, NOW())
    FROM deceased_persons
  `)

  // 4b. Add living actors from actor_appearances that aren't in deceased_persons
  pgm.sql(`
    INSERT INTO actors (tmdb_id, name, birthday, profile_path, popularity, created_at, updated_at)
    SELECT DISTINCT ON (aa.actor_tmdb_id)
      aa.actor_tmdb_id,
      aa.actor_name,
      aa.birthday,
      aa.profile_path,
      aa.popularity,
      NOW(),
      NOW()
    FROM actor_appearances aa
    WHERE NOT EXISTS (SELECT 1 FROM actors a WHERE a.tmdb_id = aa.actor_tmdb_id)
    ORDER BY aa.actor_tmdb_id, aa.popularity DESC NULLS LAST
  `)

  // 4c. Add actors from show_actor_appearances that aren't yet in actors
  pgm.sql(`
    INSERT INTO actors (tmdb_id, name, created_at, updated_at)
    SELECT DISTINCT ON (saa.actor_tmdb_id)
      saa.actor_tmdb_id,
      saa.actor_name,
      NOW(),
      NOW()
    FROM show_actor_appearances saa
    WHERE NOT EXISTS (SELECT 1 FROM actors a WHERE a.tmdb_id = saa.actor_tmdb_id)
    ORDER BY saa.actor_tmdb_id
  `)

  // 4d. Populate actor_movie_appearances from actor_appearances
  pgm.sql(`
    INSERT INTO actor_movie_appearances (actor_tmdb_id, movie_tmdb_id, character_name, billing_order, age_at_filming)
    SELECT actor_tmdb_id, movie_tmdb_id, character_name, billing_order, age_at_filming
    FROM actor_appearances
  `)

  // 4e. Populate actor_show_appearances from show_actor_appearances
  pgm.sql(`
    INSERT INTO actor_show_appearances (
      actor_tmdb_id, show_tmdb_id, season_number, episode_number,
      character_name, appearance_type, billing_order, age_at_filming
    )
    SELECT
      actor_tmdb_id, show_tmdb_id, season_number, episode_number,
      character_name, appearance_type, billing_order, age_at_filming
    FROM show_actor_appearances
  `)

  // ============================================================
  // STEP 5: Drop old tables
  // ============================================================
  pgm.dropTable("actor_appearances", { cascade: true })
  pgm.dropTable("show_actor_appearances", { cascade: true })
  pgm.dropTable("deceased_persons", { cascade: true })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  // ============================================================
  // Recreate old tables
  // ============================================================

  // Recreate deceased_persons
  pgm.createTable("deceased_persons", {
    id: "id",
    tmdb_id: { type: "integer", notNull: true, unique: true },
    name: { type: "text", notNull: true },
    birthday: { type: "date" },
    deathday: { type: "date", notNull: true },
    cause_of_death: { type: "text" },
    cause_of_death_source: { type: "text" },
    cause_of_death_details: { type: "text" },
    cause_of_death_details_source: { type: "text" },
    wikipedia_url: { type: "text" },
    profile_path: { type: "text" },
    age_at_death: { type: "integer" },
    expected_lifespan: { type: "decimal(5,2)" },
    years_lost: { type: "decimal(5,2)" },
    popularity: { type: "decimal(10,3)" },
    violent_death: { type: "boolean" },
    created_at: { type: "timestamp", default: pgm.func("NOW()") },
    updated_at: { type: "timestamp", default: pgm.func("NOW()") },
  })

  pgm.sql(`
    ALTER TABLE deceased_persons ADD COLUMN is_obscure BOOLEAN GENERATED ALWAYS AS (
      profile_path IS NULL OR COALESCE(popularity, 0) < 5.0
    ) STORED
  `)

  // Recreate actor_appearances
  pgm.createTable("actor_appearances", {
    id: "id",
    actor_tmdb_id: { type: "integer", notNull: true },
    movie_tmdb_id: { type: "integer", notNull: true },
    actor_name: { type: "text", notNull: true },
    character_name: { type: "text" },
    billing_order: { type: "integer" },
    age_at_filming: { type: "integer" },
    is_deceased: { type: "boolean", default: false },
    birthday: { type: "date" },
    profile_path: { type: "text" },
    popularity: { type: "decimal(10,3)" },
  })

  pgm.addConstraint("actor_appearances", "actor_appearances_unique", {
    unique: ["actor_tmdb_id", "movie_tmdb_id"],
  })

  pgm.addConstraint("actor_appearances", "actor_appearances_movie_fk", {
    foreignKeys: {
      columns: "movie_tmdb_id",
      references: "movies(tmdb_id)",
      onDelete: "CASCADE",
    },
  })

  // Recreate show_actor_appearances
  pgm.createTable("show_actor_appearances", {
    id: "id",
    actor_tmdb_id: { type: "integer", notNull: true },
    show_tmdb_id: { type: "integer", notNull: true },
    season_number: { type: "integer", notNull: true },
    episode_number: { type: "integer", notNull: true },
    actor_name: { type: "text", notNull: true },
    character_name: { type: "text" },
    appearance_type: { type: "text", notNull: true },
    billing_order: { type: "integer" },
    age_at_filming: { type: "integer" },
    is_deceased: { type: "boolean", default: false },
  })

  pgm.addConstraint("show_actor_appearances", "show_actor_appearances_unique", {
    unique: ["actor_tmdb_id", "show_tmdb_id", "season_number", "episode_number"],
  })

  pgm.addConstraint("show_actor_appearances", "show_actor_appearances_show_fk", {
    foreignKeys: {
      columns: "show_tmdb_id",
      references: "shows(tmdb_id)",
      onDelete: "CASCADE",
    },
  })

  // Restore data from actors table
  pgm.sql(`
    INSERT INTO deceased_persons (
      tmdb_id, name, birthday, deathday,
      cause_of_death, cause_of_death_source, cause_of_death_details, cause_of_death_details_source,
      wikipedia_url, age_at_death, expected_lifespan, years_lost, violent_death,
      profile_path, popularity, created_at, updated_at
    )
    SELECT
      tmdb_id, name, birthday, deathday,
      cause_of_death, cause_of_death_source, cause_of_death_details, cause_of_death_details_source,
      wikipedia_url, age_at_death, expected_lifespan, years_lost, violent_death,
      profile_path, popularity, created_at, updated_at
    FROM actors
    WHERE deathday IS NOT NULL
  `)

  // Restore actor_appearances
  pgm.sql(`
    INSERT INTO actor_appearances (
      actor_tmdb_id, movie_tmdb_id, actor_name, character_name, billing_order, age_at_filming,
      is_deceased, birthday, profile_path, popularity
    )
    SELECT
      ama.actor_tmdb_id, ama.movie_tmdb_id, a.name, ama.character_name, ama.billing_order, ama.age_at_filming,
      a.deathday IS NOT NULL, a.birthday, a.profile_path, a.popularity
    FROM actor_movie_appearances ama
    JOIN actors a ON ama.actor_tmdb_id = a.tmdb_id
  `)

  // Restore show_actor_appearances
  pgm.sql(`
    INSERT INTO show_actor_appearances (
      actor_tmdb_id, show_tmdb_id, season_number, episode_number,
      actor_name, character_name, appearance_type, billing_order, age_at_filming, is_deceased
    )
    SELECT
      asa.actor_tmdb_id, asa.show_tmdb_id, asa.season_number, asa.episode_number,
      a.name, asa.character_name, asa.appearance_type, asa.billing_order, asa.age_at_filming,
      a.deathday IS NOT NULL
    FROM actor_show_appearances asa
    JOIN actors a ON asa.actor_tmdb_id = a.tmdb_id
  `)

  // Recreate indexes for old tables
  pgm.createIndex("deceased_persons", "tmdb_id")
  pgm.createIndex("actor_appearances", "actor_tmdb_id")
  pgm.createIndex("actor_appearances", "movie_tmdb_id")
  pgm.createIndex("actor_appearances", "is_deceased")
  pgm.createIndex("show_actor_appearances", "actor_tmdb_id", {
    name: "idx_show_appearances_actor",
  })
  pgm.createIndex("show_actor_appearances", "show_tmdb_id", {
    name: "idx_show_appearances_show",
  })
  pgm.createIndex("show_actor_appearances", "is_deceased")

  // Drop new tables
  pgm.dropTable("actor_show_appearances", { cascade: true })
  pgm.dropTable("actor_movie_appearances", { cascade: true })
  pgm.dropTable("actors", { cascade: true })
}
