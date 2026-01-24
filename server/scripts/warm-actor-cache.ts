#!/usr/bin/env tsx
import { Command, InvalidArgumentError } from "commander"
import { getPool } from "../src/lib/db.js"
import { initRedis, closeRedis } from "../src/lib/redis.js"
import { getCached, setCached, CACHE_KEYS } from "../src/lib/cache.js"

/**
 * Cache warming script for actor profiles and death details
 *
 * Warms Redis cache for top actors to avoid cold cache after deployment.
 * Prioritizes actors by popularity to maximize cache hit rate.
 *
 * Usage:
 *   npm run cache:warm                    # Warm top 1000 actors
 *   npm run cache:warm -- --limit 500     # Warm top 500
 *   npm run cache:warm -- --deceased-only # Only deceased actors
 *   npm run cache:warm -- --dry-run       # Preview without caching
 */

function parsePositiveInt(value: string): number {
  const n = parseInt(value, 10)
  if (isNaN(n) || !Number.isInteger(n) || n <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return n
}

const program = new Command()
  .name("warm-actor-cache")
  .description("Pre-warm Redis cache for popular actors")
  .option("-l, --limit <number>", "Number of actors to warm", parsePositiveInt, 1000)
  .option("-d, --deceased-only", "Only warm deceased actors", false)
  .option("-n, --dry-run", "Preview without caching", false)
  .action(async (options: { limit: number; deceasedOnly: boolean; dryRun: boolean }) => {
    try {
      await warmActorCache(options)
      process.exit(0)
    } catch (error) {
      console.error("Fatal error:", error)
      process.exit(1)
    }
  })

interface ActorRow {
  id: number
  tmdb_id: number | null
  name: string
  birthday: string | null
  deathday: string | null
  profile_path: string | null
  popularity: number | null
  cause_of_death: string | null
  cause_of_death_source: string | null
  cause_of_death_details: string | null
  cause_of_death_details_source: string | null
  wikipedia_url: string | null
  age_at_death: number | null
  expected_lifespan: number | null
  years_lost: number | null
  death_manner: string | null
  death_categories: string[] | null
  strange_death: boolean | null
  deathday_confidence: string | null
  deathday_verification_source: string | null
}

async function warmActorCache(options: { limit: number; deceasedOnly: boolean; dryRun: boolean }) {
  console.log("\n🔥 Actor Cache Warming")
  console.log("=".repeat(60))
  if (options.dryRun) console.log("DRY RUN MODE - no cache writes")
  console.log(`Warming: ${options.deceasedOnly ? "Deceased actors only" : "All actors"}`)
  console.log(`Limit: ${options.limit}`)
  console.log()

  const pool = getPool()
  await initRedis()

  try {
    // Get top actors by popularity
    const query = `
      SELECT
        id, tmdb_id, name, birthday, deathday, profile_path, popularity,
        cause_of_death, cause_of_death_source, cause_of_death_details,
        cause_of_death_details_source, wikipedia_url, age_at_death,
        expected_lifespan, years_lost, death_manner, death_categories,
        strange_death, deathday_confidence, deathday_verification_source
      FROM actors
      ${options.deceasedOnly ? "WHERE deathday IS NOT NULL" : ""}
      ORDER BY popularity DESC NULLS LAST
      LIMIT $1
    `

    console.log("Fetching actors from database...")
    const { rows: actors } = await pool.query<ActorRow>(query, [options.limit])
    console.log(`  Found ${actors.length} actors`)

    if (actors.length === 0) {
      console.log("\nNo actors to warm. Exiting.")
      return
    }

    let cached = 0
    let skipped = 0
    let errors = 0

    console.log("\nWarming cache...")
    for (let i = 0; i < actors.length; i++) {
      const actor = actors[i]
      const progress = Math.round(((i + 1) / actors.length) * 100)

      try {
        // Check if already cached
        const profileKey = CACHE_KEYS.actor(actor.id).profile
        const existing = await getCached(profileKey)

        if (existing) {
          skipped++
          if (i % 100 === 0) {
            console.log(`  [${progress}%] Skipped ${actor.name} (already cached)`)
          }
          continue
        }

        if (!options.dryRun) {
          // Cache actor profile (24 hour TTL)
          await setCached(profileKey, actor, 86400)

          // If deceased, also cache death details (24 hour TTL)
          if (actor.deathday) {
            const deathKey = CACHE_KEYS.actor(actor.id).death
            const deathDetails = {
              causeOfDeath: actor.cause_of_death,
              causeOfDeathSource: actor.cause_of_death_source,
              causeOfDeathDetails: actor.cause_of_death_details,
              causeOfDeathDetailsSource: actor.cause_of_death_details_source,
              wikipediaUrl: actor.wikipedia_url,
              ageAtDeath: actor.age_at_death,
              yearsLost: actor.years_lost,
              deathManner: actor.death_manner,
              deathCategories: actor.death_categories || [],
              strangeDeath: actor.strange_death || false,
              deathdayConfidence: actor.deathday_confidence,
              deathdayVerificationSource: actor.deathday_verification_source,
            }
            await setCached(deathKey, deathDetails, 86400)
          }
        }

        cached++
        if (i % 100 === 0 || i === actors.length - 1) {
          console.log(`  [${progress}%] Cached ${actor.name}`)
        }
      } catch (error) {
        errors++
        console.error(`  ✗ Error caching ${actor.name}:`, error)
      }
    }

    console.log("\n" + "=".repeat(60))
    console.log("CACHE WARMING SUMMARY")
    console.log("=".repeat(60))
    console.log(`Total actors: ${actors.length.toLocaleString()}`)
    console.log(`Cached: ${cached.toLocaleString()}${options.dryRun ? " (dry run)" : ""}`)
    console.log(`Already cached (skipped): ${skipped.toLocaleString()}`)
    if (errors > 0) {
      console.log(`Errors: ${errors}`)
    }
    console.log("=".repeat(60))

    console.log("\nDone!")
  } finally {
    await closeRedis()
    await pool.end()
  }
}

// Only run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  program.parse()
}
