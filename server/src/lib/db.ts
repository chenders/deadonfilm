import pg from 'pg'

const { Pool } = pg

let pool: pg.Pool | null = null

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set')
    }
    pool = new Pool({ connectionString })
  }
  return pool
}

export async function initDatabase(): Promise<void> {
  const db = getPool()

  // Create tables if they don't exist
  await db.query(`
    CREATE TABLE IF NOT EXISTS deceased_persons (
      tmdb_id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      birthday DATE,
      deathday DATE NOT NULL,
      cause_of_death TEXT,
      wikipedia_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Index for faster lookups
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_deceased_persons_tmdb_id
    ON deceased_persons(tmdb_id)
  `)

  console.log('Database initialized')
}

export interface DeceasedPersonRecord {
  tmdb_id: number
  name: string
  birthday: string | null
  deathday: string
  cause_of_death: string | null
  wikipedia_url: string | null
}

// Get a deceased person by TMDB ID
export async function getDeceasedPerson(tmdbId: number): Promise<DeceasedPersonRecord | null> {
  const db = getPool()
  const result = await db.query<DeceasedPersonRecord>(
    'SELECT * FROM deceased_persons WHERE tmdb_id = $1',
    [tmdbId]
  )
  return result.rows[0] || null
}

// Get multiple deceased persons by TMDB IDs
export async function getDeceasedPersons(
  tmdbIds: number[]
): Promise<Map<number, DeceasedPersonRecord>> {
  if (tmdbIds.length === 0) return new Map()

  const db = getPool()
  const placeholders = tmdbIds.map((_, i) => `$${i + 1}`).join(', ')
  const result = await db.query<DeceasedPersonRecord>(
    `SELECT * FROM deceased_persons WHERE tmdb_id IN (${placeholders})`,
    tmdbIds
  )

  const map = new Map<number, DeceasedPersonRecord>()
  for (const row of result.rows) {
    map.set(row.tmdb_id, row)
  }
  return map
}

// Insert or update a deceased person
export async function upsertDeceasedPerson(person: DeceasedPersonRecord): Promise<void> {
  const db = getPool()
  await db.query(
    `INSERT INTO deceased_persons (tmdb_id, name, birthday, deathday, cause_of_death, wikipedia_url, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
     ON CONFLICT (tmdb_id) DO UPDATE SET
       name = EXCLUDED.name,
       birthday = EXCLUDED.birthday,
       deathday = EXCLUDED.deathday,
       cause_of_death = COALESCE(EXCLUDED.cause_of_death, deceased_persons.cause_of_death),
       wikipedia_url = COALESCE(EXCLUDED.wikipedia_url, deceased_persons.wikipedia_url),
       updated_at = CURRENT_TIMESTAMP`,
    [
      person.tmdb_id,
      person.name,
      person.birthday,
      person.deathday,
      person.cause_of_death,
      person.wikipedia_url,
    ]
  )
}

// Batch insert/update deceased persons
export async function batchUpsertDeceasedPersons(persons: DeceasedPersonRecord[]): Promise<void> {
  if (persons.length === 0) return

  const db = getPool()

  // Use a transaction for batch insert
  const client = await db.connect()
  try {
    await client.query('BEGIN')

    for (const person of persons) {
      await client.query(
        `INSERT INTO deceased_persons (tmdb_id, name, birthday, deathday, cause_of_death, wikipedia_url, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
         ON CONFLICT (tmdb_id) DO UPDATE SET
           name = EXCLUDED.name,
           birthday = EXCLUDED.birthday,
           deathday = EXCLUDED.deathday,
           cause_of_death = COALESCE(EXCLUDED.cause_of_death, deceased_persons.cause_of_death),
           wikipedia_url = COALESCE(EXCLUDED.wikipedia_url, deceased_persons.wikipedia_url),
           updated_at = CURRENT_TIMESTAMP`,
        [
          person.tmdb_id,
          person.name,
          person.birthday,
          person.deathday,
          person.cause_of_death,
          person.wikipedia_url,
        ]
      )
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

// Update just the cause of death and wikipedia URL for an existing person
export async function updateDeathInfo(
  tmdbId: number,
  causeOfDeath: string | null,
  wikipediaUrl: string | null
): Promise<void> {
  const db = getPool()
  await db.query(
    `UPDATE deceased_persons
     SET cause_of_death = COALESCE($2, cause_of_death),
         wikipedia_url = COALESCE($3, wikipedia_url),
         updated_at = CURRENT_TIMESTAMP
     WHERE tmdb_id = $1`,
    [tmdbId, causeOfDeath, wikipediaUrl]
  )
}

// Get deceased persons who died on a specific month/day (for "On This Day" feature)
export async function getDeceasedByMonthDay(
  month: number,
  day: number
): Promise<DeceasedPersonRecord[]> {
  const db = getPool()
  const result = await db.query<DeceasedPersonRecord>(
    `SELECT * FROM deceased_persons
     WHERE EXTRACT(MONTH FROM deathday) = $1
       AND EXTRACT(DAY FROM deathday) = $2
     ORDER BY deathday DESC`,
    [month, day]
  )
  return result.rows
}
