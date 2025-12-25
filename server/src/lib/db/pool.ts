/**
 * Database connection pool management.
 * Provides connection pooling with automatic retry on connection errors.
 */

import pg from "pg"

const { Pool } = pg

let pool: pg.Pool | null = null

/**
 * Creates a new database pool with connection recovery settings.
 * Configures idle timeout, connection timeout, and error handling
 * to gracefully recover from connection terminations (common with
 * serverless databases like Neon).
 */
function createPool(): pg.Pool {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set")
  }

  const newPool = new Pool({
    connectionString,
    // Connection pool settings for resilience
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 10000, // Fail connection attempts after 10 seconds
  })

  // Handle pool-level errors (e.g., unexpected disconnections)
  // This prevents unhandled errors from crashing the process
  newPool.on("error", (err: Error) => {
    console.error("Unexpected database pool error:", err.message)
    // Don't exit - let the pool recover naturally
    // The pool will create new connections as needed
  })

  // Set SSD-optimized PostgreSQL settings for each new connection
  // Neon uses SSDs but has conservative default settings for spinning disks
  newPool.on("connect", async (client) => {
    try {
      // random_page_cost: Lower for SSDs (1.1 vs default 4.0) - random I/O is nearly as fast as sequential
      // effective_io_concurrency: Higher for SSDs (200 vs default 1) - more parallel I/O operations
      await client.query("SET random_page_cost = 1.1; SET effective_io_concurrency = 200")
    } catch (err) {
      // Non-fatal - log but don't fail connection
      console.warn("Failed to set SSD-optimized settings:", err)
    }
  })

  return newPool
}

export function getPool(): pg.Pool {
  if (!pool) {
    pool = createPool()
  }
  return pool
}

/**
 * Reset the pool connection. Call this if you need to force
 * reconnection after a catastrophic failure.
 */
export async function resetPool(): Promise<void> {
  if (pool) {
    try {
      await pool.end()
    } catch (err) {
      console.error("Error closing pool:", err)
    }
    pool = null
  }
}

/**
 * Check if an error is a connection-related error that should be retried.
 */
function isConnectionError(err: unknown): boolean {
  if (err instanceof Error) {
    const message = err.message.toLowerCase()
    return (
      message.includes("connection terminated") ||
      message.includes("connection refused") ||
      message.includes("connection reset") ||
      message.includes("econnreset") ||
      message.includes("econnrefused") ||
      message.includes("etimedout") ||
      message.includes("socket hang up") ||
      message.includes("network error")
    )
  }
  return false
}

/**
 * Execute a query with automatic retry on connection errors.
 * Retries up to 3 times with exponential backoff (100ms, 200ms, 400ms).
 */
export async function queryWithRetry<T>(
  queryFn: (pool: pg.Pool) => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const db = getPool()
      return await queryFn(db)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))

      if (isConnectionError(err) && attempt < maxRetries - 1) {
        // Exponential backoff: 100ms, 200ms, 400ms
        const delay = 100 * Math.pow(2, attempt)
        console.warn(
          `Database connection error (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms:`,
          lastError.message
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }

      throw lastError
    }
  }

  // This shouldn't be reached, but TypeScript needs it
  throw lastError ?? new Error("Query failed after retries")
}

/**
 * @deprecated Use initializeDatabase from startup.ts instead.
 * This function is kept for backward compatibility.
 */
export async function initDatabase(): Promise<void> {
  const db = getPool()

  // Create actors table if it doesn't exist
  await db.query(`
    CREATE TABLE IF NOT EXISTS actors (
      tmdb_id INTEGER PRIMARY KEY,
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Index for faster lookups
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_actors_tmdb_id
    ON actors(tmdb_id)
  `)

  console.log("Database initialized")
}
