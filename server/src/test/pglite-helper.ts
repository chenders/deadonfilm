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
    TRUNCATE actor_show_appearances CASCADE;
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
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Actor show appearances table (junction table only)
    CREATE TABLE IF NOT EXISTS actor_show_appearances (
      id SERIAL PRIMARY KEY,
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
    cast_count?: number
    deceased_count?: number
    living_count?: number
    expected_deaths?: number
    mortality_surprise_score?: number
  }
): Promise<void> {
  await testDb.query(
    `
    INSERT INTO shows (tmdb_id, name, popularity, cast_count, deceased_count, living_count, expected_deaths, mortality_surprise_score)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (tmdb_id) DO UPDATE SET
      name = EXCLUDED.name,
      popularity = EXCLUDED.popularity,
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
    INSERT INTO actor_show_appearances (actor_tmdb_id, show_tmdb_id, season_number, episode_number, character_name, appearance_type, billing_order)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (actor_tmdb_id, show_tmdb_id, season_number, episode_number) DO UPDATE SET
      character_name = EXCLUDED.character_name,
      appearance_type = EXCLUDED.appearance_type,
      billing_order = EXCLUDED.billing_order
  `,
    [
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
  }
): Promise<void> {
  await testDb.query(
    `
    INSERT INTO actors (tmdb_id, name, deathday, birthday)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (tmdb_id) DO UPDATE SET
      name = EXCLUDED.name,
      deathday = EXCLUDED.deathday,
      birthday = EXCLUDED.birthday
  `,
    [actor.tmdb_id, actor.name, actor.deathday ?? null, actor.birthday ?? null]
  )
}

// Backwards compatibility alias
export const insertDeceasedPerson = insertActor
