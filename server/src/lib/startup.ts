/**
 * Server startup initialization.
 * Ensures database is properly set up before the server starts serving requests.
 */
import { runner } from "node-pg-migrate"
import { getPool } from "./db.js"
import { readFileSync, existsSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { createStartupLogger } from "./logger.js"

const log = createStartupLogger()

const __dirname = dirname(fileURLToPath(import.meta.url))

interface ActuarialEntry {
  age: number
  qx: number
  lx: number
  ex: number
}

interface ActuarialData {
  source: string
  notes: string
  male: ActuarialEntry[]
  female: ActuarialEntry[]
}

/**
 * Find the migrations directory, handling both development and production paths.
 */
function findMigrationsDir(): string {
  // In development: server/src/lib/startup.ts -> server/migrations
  // In production: server/dist/lib/startup.js -> server/migrations
  const possiblePaths = [
    join(__dirname, "..", "..", "migrations"), // from src/lib or dist/lib
    join(__dirname, "..", "..", "..", "migrations"), // fallback
  ]

  for (const path of possiblePaths) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- paths are hardcoded relative to __dirname
    if (existsSync(path)) {
      return path
    }
  }

  // Default to first path even if it doesn't exist (will error later with useful message)
  return possiblePaths[0]
}

/**
 * Find the data directory, handling both development and production paths.
 */
function findDataDir(): string {
  const possiblePaths = [
    join(__dirname, "..", "..", "data"), // from src/lib or dist/lib
    join(__dirname, "..", "..", "..", "data"), // fallback
  ]

  for (const path of possiblePaths) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- paths are hardcoded relative to __dirname
    if (existsSync(path)) {
      return path
    }
  }

  return possiblePaths[0]
}

/**
 * Run database migrations using node-pg-migrate programmatically.
 */
async function runMigrations(): Promise<void> {
  log.info("Running database migrations...")

  const migrationsDir = findMigrationsDir()
  log.info({ migrationsDir }, "Migrations directory")

  try {
    await runner({
      databaseUrl: process.env.DATABASE_URL!,
      dir: migrationsDir,
      direction: "up",
      migrationsTable: "pgmigrations",
      log: (msg) => log.debug({ migration: msg }, "Migration progress"),
    })
    log.info("Migrations complete")
  } catch (error) {
    // Check if it's a "no migrations" scenario
    const errorMsg = String(error)
    if (errorMsg.includes("No migrations to run")) {
      log.info("No pending migrations")
      return
    }
    throw error
  }
}

/**
 * Check if actuarial tables need seeding and seed them if empty.
 * Uses batch inserts for efficiency.
 */
async function seedActuarialDataIfNeeded(): Promise<void> {
  const db = getPool()

  // Check if actuarial data exists
  const result = await db.query("SELECT COUNT(*) as count FROM actuarial_life_tables")
  const count = parseInt(result.rows[0].count, 10)

  if (count > 0) {
    log.info({ count }, "Actuarial data already seeded")
    return
  }

  log.info("Seeding actuarial life tables...")

  // Load actuarial data from JSON file
  const dataDir = findDataDir()
  const dataPath = join(dataDir, "actuarial-life-tables.json")
  log.info({ dataPath }, "Loading actuarial data")

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is constructed from hardcoded values
  const rawData = readFileSync(dataPath, "utf-8")
  const data: ActuarialData = JSON.parse(rawData)

  // Birth year matches the SSA 2022 period life table data source.
  // This is a period life table reflecting mortality rates observed in 2022.
  // Update this value if the actuarial-life-tables.json data is updated.
  const birthYear = 2022

  // Collect all values for batch insert
  const allValues: (number | string)[] = []
  const placeholders: string[] = []
  let paramIndex = 1

  // Helper to add an entry
  const addEntry = (age: number, gender: string, qx: number, ex: number, lx: number) => {
    allValues.push(birthYear, age, gender, qx, ex, lx)
    placeholders.push(
      `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5})`
    )
    paramIndex += 6
  }

  // Add male data
  for (const entry of data.male) {
    addEntry(entry.age, "male", entry.qx, entry.ex, entry.lx)
  }

  // Add female data
  for (const entry of data.female) {
    addEntry(entry.age, "female", entry.qx, entry.ex, entry.lx)
  }

  // Add combined (average) data
  for (let i = 0; i < data.male.length; i++) {
    const male = data.male[i]
    const female = data.female[i]
    if (male && female && male.age === female.age) {
      addEntry(
        male.age,
        "combined",
        (male.qx + female.qx) / 2,
        (male.ex + female.ex) / 2,
        Math.round((male.lx + female.lx) / 2)
      )
    }
  }

  // Execute single batch insert
  const insertQuery = `
    INSERT INTO actuarial_life_tables
    (birth_year, age, gender, death_probability, life_expectancy, survivors_per_100k)
    VALUES ${placeholders.join(", ")}
  `

  await db.query(insertQuery, allValues)
  log.info({ entriesInserted: placeholders.length }, "Inserted actuarial entries in single batch")

  log.info("Actuarial data seeding complete")
}

/**
 * Initialize the database on server startup.
 * Runs migrations and seeds required data.
 */
export async function initializeDatabase(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    log.warn("DATABASE_URL not set - skipping database initialization")
    return
  }

  try {
    // Run migrations first
    await runMigrations()

    // Seed actuarial data if needed
    await seedActuarialDataIfNeeded()

    log.info("Database initialization complete")
  } catch (error) {
    log.error({ error }, "Database initialization failed")
    throw error
  }
}
