/**
 * PGlite test helper for SQL validation testing.
 *
 * This module provides an in-memory PostgreSQL database for testing SQL queries
 * without needing a real database connection. It catches SQL syntax errors like
 * GROUP BY issues that mocked tests would miss.
 */

import { PGlite } from "@electric-sql/pglite"

let db: PGlite | null = null

/**
 * Get or create the shared PGlite instance
 */
export async function getTestDb(): Promise<PGlite> {
  if (!db) {
    db = new PGlite()
    await initializeSchema(db)
  }
  return db
}

/**
 * Close the PGlite instance
 */
export async function closeTestDb(): Promise<void> {
  if (db) {
    await db.close()
    db = null
  }
}

/**
 * Reset database tables (truncate all data)
 */
export async function resetTestDb(): Promise<void> {
  const testDb = await getTestDb()
  await testDb.exec(`
    TRUNCATE shows CASCADE;
    TRUNCATE movies CASCADE;
    TRUNCATE actor_show_appearances CASCADE;
    TRUNCATE actor_movie_appearances CASCADE;
    TRUNCATE actors CASCADE;
  `)
}

/**
 * Initialize the database schema with tables needed for testing
 */
async function initializeSchema(testDb: PGlite): Promise<void> {
  await testDb.exec(`
    -- Shows table (simplified for testing)
    CREATE TABLE IF NOT EXISTS shows (
      id SERIAL PRIMARY KEY,
      tmdb_id INTEGER UNIQUE NOT NULL,
      name TEXT NOT NULL,
      first_air_date DATE,
      last_air_date DATE,
      poster_path TEXT,
      backdrop_path TEXT,
      genres TEXT[],
      status TEXT,
      number_of_seasons INTEGER,
      number_of_episodes INTEGER,
      popularity DECIMAL(10,3),
      vote_average DECIMAL(3,1),
      original_language TEXT,
      origin_country TEXT[],
      cast_count INTEGER,
      deceased_count INTEGER,
      living_count INTEGER,
      expected_deaths DECIMAL(5,2),
      mortality_surprise_score DECIMAL(6,3),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Actors table (unified for living and deceased)
    CREATE TABLE IF NOT EXISTS actors (
      id SERIAL PRIMARY KEY,
      tmdb_id INTEGER UNIQUE NOT NULL,
      name TEXT NOT NULL,
      birthday DATE,
      deathday DATE,
      profile_path TEXT,
      popularity DECIMAL(10,3),
      cause_of_death TEXT,
      cause_of_death_source TEXT,
      cause_of_death_details TEXT,
      cause_of_death_details_source TEXT,
      wikipedia_url TEXT,
      age_at_death INTEGER,
      expected_lifespan DECIMAL(5,2),
      years_lost DECIMAL(5,2),
      violent_death BOOLEAN,
      is_obscure BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Actor death circumstances table
    CREATE TABLE IF NOT EXISTS actor_death_circumstances (
      id SERIAL PRIMARY KEY,
      actor_id INTEGER NOT NULL UNIQUE,
      circumstances TEXT,
      notable_factors TEXT,
      enriched_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Actor show appearances table (junction table only)
    CREATE TABLE IF NOT EXISTS actor_show_appearances (
      id SERIAL PRIMARY KEY,
      actor_id INTEGER,
      actor_tmdb_id INTEGER NOT NULL,
      show_tmdb_id INTEGER NOT NULL,
      season_number INTEGER NOT NULL DEFAULT 1,
      episode_number INTEGER NOT NULL DEFAULT 1,
      character_name TEXT,
      appearance_type TEXT NOT NULL DEFAULT 'regular',
      billing_order INTEGER,
      age_at_filming INTEGER,
      UNIQUE(actor_tmdb_id, show_tmdb_id, season_number, episode_number)
    );

    -- Create indexes for foreign key lookups
    CREATE INDEX IF NOT EXISTS idx_asa_show_tmdb_id ON actor_show_appearances(show_tmdb_id);
    CREATE INDEX IF NOT EXISTS idx_asa_actor_tmdb_id ON actor_show_appearances(actor_tmdb_id);

    -- Movies table (simplified for testing)
    CREATE TABLE IF NOT EXISTS movies (
      id SERIAL PRIMARY KEY,
      tmdb_id INTEGER UNIQUE NOT NULL,
      title TEXT NOT NULL,
      release_date DATE,
      release_year INTEGER,
      poster_path TEXT,
      backdrop_path TEXT,
      genres TEXT[],
      popularity DECIMAL(10,3),
      vote_average DECIMAL(3,1),
      original_language TEXT,
      production_countries TEXT[],
      cast_count INTEGER,
      deceased_count INTEGER,
      living_count INTEGER,
      expected_deaths DECIMAL(5,2),
      mortality_surprise_score DECIMAL(6,3),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Actor movie appearances table (junction table)
    CREATE TABLE IF NOT EXISTS actor_movie_appearances (
      id SERIAL PRIMARY KEY,
      actor_id INTEGER NOT NULL,
      actor_tmdb_id INTEGER,
      movie_tmdb_id INTEGER NOT NULL,
      character_name TEXT,
      billing_order INTEGER,
      age_at_filming INTEGER
    );

    -- Create indexes for foreign key lookups
    CREATE INDEX IF NOT EXISTS idx_ama_movie_tmdb_id ON actor_movie_appearances(movie_tmdb_id);
    CREATE INDEX IF NOT EXISTS idx_ama_actor_id ON actor_movie_appearances(actor_id);
    CREATE INDEX IF NOT EXISTS idx_movies_production_countries ON movies USING gin(production_countries);
    CREATE INDEX IF NOT EXISTS idx_shows_origin_country ON shows USING gin(origin_country);
  `)
}

/**
 * Insert test show data
 */
export async function insertShow(
  testDb: PGlite,
  show: {
    tmdb_id: number
    name: string
    popularity?: number
    origin_country?: string[]
    cast_count?: number
    deceased_count?: number
    living_count?: number
    expected_deaths?: number
    mortality_surprise_score?: number
  }
): Promise<void> {
  await testDb.query(
    `
    INSERT INTO shows (tmdb_id, name, popularity, origin_country, cast_count, deceased_count, living_count, expected_deaths, mortality_surprise_score)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (tmdb_id) DO UPDATE SET
      name = EXCLUDED.name,
      popularity = EXCLUDED.popularity,
      origin_country = EXCLUDED.origin_country,
      cast_count = EXCLUDED.cast_count,
      deceased_count = EXCLUDED.deceased_count,
      living_count = EXCLUDED.living_count,
      expected_deaths = EXCLUDED.expected_deaths,
      mortality_surprise_score = EXCLUDED.mortality_surprise_score
  `,
    [
      show.tmdb_id,
      show.name,
      show.popularity ?? null,
      show.origin_country ?? null,
      show.cast_count ?? null,
      show.deceased_count ?? null,
      show.living_count ?? null,
      show.expected_deaths ?? null,
      show.mortality_surprise_score ?? null,
    ]
  )
}

/**
 * Insert test show actor appearance data
 */
export async function insertShowActorAppearance(
  testDb: PGlite,
  appearance: {
    actor_id?: number
    actor_tmdb_id: number
    show_tmdb_id: number
    season_number?: number
    episode_number?: number
    character_name?: string
    appearance_type?: string
    billing_order?: number
  }
): Promise<void> {
  await testDb.query(
    `
    INSERT INTO actor_show_appearances (actor_id, actor_tmdb_id, show_tmdb_id, season_number, episode_number, character_name, appearance_type, billing_order)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (actor_tmdb_id, show_tmdb_id, season_number, episode_number) DO UPDATE SET
      actor_id = EXCLUDED.actor_id,
      character_name = EXCLUDED.character_name,
      appearance_type = EXCLUDED.appearance_type,
      billing_order = EXCLUDED.billing_order
  `,
    [
      appearance.actor_id ?? null,
      appearance.actor_tmdb_id,
      appearance.show_tmdb_id,
      appearance.season_number ?? 1,
      appearance.episode_number ?? 1,
      appearance.character_name ?? null,
      appearance.appearance_type ?? "regular",
      appearance.billing_order ?? null,
    ]
  )
}

/**
 * Insert test actor data
 */
export async function insertActor(
  testDb: PGlite,
  actor: {
    tmdb_id: number
    name: string
    deathday?: string | null
    birthday?: string | null
    cause_of_death?: string | null
    cause_of_death_details?: string | null
    is_obscure?: boolean
  }
): Promise<void> {
  await testDb.query(
    `
    INSERT INTO actors (tmdb_id, name, deathday, birthday, cause_of_death, cause_of_death_details, is_obscure)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (tmdb_id) DO UPDATE SET
      name = EXCLUDED.name,
      deathday = EXCLUDED.deathday,
      birthday = EXCLUDED.birthday,
      cause_of_death = EXCLUDED.cause_of_death,
      cause_of_death_details = EXCLUDED.cause_of_death_details,
      is_obscure = EXCLUDED.is_obscure
  `,
    [
      actor.tmdb_id,
      actor.name,
      actor.deathday ?? null,
      actor.birthday ?? null,
      actor.cause_of_death ?? null,
      actor.cause_of_death_details ?? null,
      actor.is_obscure ?? false,
    ]
  )
}

// Backwards compatibility alias
export const insertDeceasedPerson = insertActor

/**
 * Insert test movie data
 */
export async function insertMovie(
  testDb: PGlite,
  movie: {
    tmdb_id: number
    title: string
    popularity?: number
    original_language?: string | null
    production_countries?: string[] | null
  }
): Promise<void> {
  await testDb.query(
    `
    INSERT INTO movies (tmdb_id, title, popularity, original_language, production_countries)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (tmdb_id) DO UPDATE SET
      title = EXCLUDED.title,
      popularity = EXCLUDED.popularity,
      original_language = EXCLUDED.original_language,
      production_countries = EXCLUDED.production_countries
  `,
    [
      movie.tmdb_id,
      movie.title,
      movie.popularity ?? null,
      movie.original_language ?? null,
      movie.production_countries ?? null,
    ]
  )
}

/**
 * Insert test movie actor appearance data
 */
export async function insertMovieActorAppearance(
  testDb: PGlite,
  appearance: {
    actor_id: number
    movie_tmdb_id: number
    character_name?: string | null
    billing_order?: number | null
    appearance_type?: "regular" | "self" | "archive"
  }
): Promise<void> {
  await testDb.query(
    `
    INSERT INTO actor_movie_appearances (actor_id, movie_tmdb_id, character_name, billing_order, appearance_type)
    VALUES ($1, $2, $3, $4, $5)
  `,
    [
      appearance.actor_id,
      appearance.movie_tmdb_id,
      appearance.character_name ?? null,
      appearance.billing_order ?? null,
      appearance.appearance_type ?? "regular",
    ]
  )
}
