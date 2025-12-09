/**
 * Server startup initialization.
 * Ensures database is properly set up before the server starts serving requests.
 */
import { exec } from "child_process"
import { promisify } from "util"
import { getPool } from "./db.js"
import { readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const execAsync = promisify(exec)
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
 * Run database migrations using node-pg-migrate.
 */
async function runMigrations(): Promise<void> {
  console.log("Running database migrations...")

  try {
    const { stdout, stderr } = await execAsync("npm run migrate:up", {
      cwd: join(__dirname, "..", ".."),
      env: { ...process.env },
    })

    if (stdout) console.log(stdout)
    if (stderr && !stderr.includes("No migrations to run")) {
      console.error("Migration stderr:", stderr)
    }

    console.log("Migrations complete")
  } catch (error) {
    // If migrations fail due to "no migrations to run", that's fine
    const err = error as { stdout?: string; stderr?: string }
    if (
      err.stdout?.includes("No migrations to run") ||
      err.stderr?.includes("No migrations to run")
    ) {
      console.log("No pending migrations")
      return
    }
    throw error
  }
}

/**
 * Check if actuarial tables need seeding and seed them if empty.
 */
async function seedActuarialDataIfNeeded(): Promise<void> {
  const db = getPool()

  // Check if actuarial data exists
  const result = await db.query("SELECT COUNT(*) as count FROM actuarial_life_tables")
  const count = parseInt(result.rows[0].count, 10)

  if (count > 0) {
    console.log(`Actuarial data already seeded (${count} entries)`)
    return
  }

  console.log("Seeding actuarial life tables...")

  // Load actuarial data from JSON file
  const dataPath = join(__dirname, "..", "..", "data", "actuarial-life-tables.json")
  const rawData = readFileSync(dataPath, "utf-8")
  const data: ActuarialData = JSON.parse(rawData)

  // Use 2022 as the birth year for this period life table
  const birthYear = 2022

  const insertQuery = `
    INSERT INTO actuarial_life_tables
    (birth_year, age, gender, death_probability, life_expectancy, survivors_per_100k)
    VALUES ($1, $2, $3, $4, $5, $6)
  `

  // Insert male data
  for (const entry of data.male) {
    await db.query(insertQuery, [birthYear, entry.age, "male", entry.qx, entry.ex, entry.lx])
  }
  console.log(`  Inserted ${data.male.length} male entries`)

  // Insert female data
  for (const entry of data.female) {
    await db.query(insertQuery, [birthYear, entry.age, "female", entry.qx, entry.ex, entry.lx])
  }
  console.log(`  Inserted ${data.female.length} female entries`)

  // Insert combined (average) data
  for (let i = 0; i < data.male.length; i++) {
    const male = data.male[i]
    const female = data.female[i]
    if (male && female && male.age === female.age) {
      await db.query(insertQuery, [
        birthYear,
        male.age,
        "combined",
        (male.qx + female.qx) / 2,
        (male.ex + female.ex) / 2,
        Math.round((male.lx + female.lx) / 2),
      ])
    }
  }
  console.log(`  Inserted ${data.male.length} combined entries`)

  console.log("Actuarial data seeding complete")
}

/**
 * Initialize the database on server startup.
 * Runs migrations and seeds required data.
 */
export async function initializeDatabase(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.log("DATABASE_URL not set - skipping database initialization")
    return
  }

  try {
    // Run migrations first
    await runMigrations()

    // Seed actuarial data if needed
    await seedActuarialDataIfNeeded()

    console.log("Database initialization complete")
  } catch (error) {
    console.error("Database initialization failed:", error)
    throw error
  }
}
