#!/usr/bin/env tsx
/**
 * Test the updated Claude cleanup prompt using CACHED source data.
 *
 * Retrieves raw source data from the cache (source_query_cache table)
 * and re-runs just the Claude cleanup step with the new prompt.
 *
 * Usage:
 *   npx tsx scripts/test-cleanup-prompt.ts
 *   npx tsx scripts/test-cleanup-prompt.ts --actor "Dick Cheney"
 */

import "dotenv/config"
import { Command } from "commander"
import { getPool } from "../src/lib/db.js"
import { getCachedQueriesForActor } from "../src/lib/death-sources/cache.js"
import { cleanupWithClaude } from "../src/lib/death-sources/claude-cleanup.js"
import type {
  ActorForEnrichment,
  RawSourceData,
  DataSourceType,
} from "../src/lib/death-sources/types.js"

interface Options {
  actor?: string
  limit: number
  showRaw: boolean
}

// Default test actors - ones that had obituary-style output
const DEFAULT_TEST_ACTORS = ["Dick Cheney", "William Hanna", "De'Angelo Wilson"]

const program = new Command()
  .name("test-cleanup-prompt")
  .description("Test updated Claude cleanup prompt using cached source data")
  .option("-a, --actor <name>", "Test a specific actor by name")
  .option("-l, --limit <n>", "Limit number of actors to test", parseInt, 3)
  .option("-r, --show-raw", "Show raw source data", false)
  .action(async (options: Options) => {
    await run(options)
  })

async function run(options: Options): Promise<void> {
  const pool = getPool()

  console.log("\n=== Testing Updated Claude Cleanup Prompt (from cache) ===\n")

  try {
    // Get actors to test
    const actorNames = options.actor ? [options.actor] : DEFAULT_TEST_ACTORS.slice(0, options.limit)

    for (const actorName of actorNames) {
      console.log(`\n${"=".repeat(70)}`)
      console.log(`Testing: ${actorName}`)
      console.log("=".repeat(70))

      // Get actor from database
      const actorResult = await pool.query<{
        id: number
        tmdb_id: number | null
        name: string
        birthday: string | null
        deathday: string | null
        cause_of_death: string | null
        cause_of_death_details: string | null
        dof_popularity: number | null
      }>(
        `SELECT id, tmdb_id, name, birthday, deathday, cause_of_death,
                cause_of_death_details, dof_popularity
         FROM actors
         WHERE name ILIKE $1 AND deathday IS NOT NULL
         LIMIT 1`,
        [`%${actorName}%`]
      )

      if (actorResult.rows.length === 0) {
        console.log(`  Actor not found: ${actorName}`)
        continue
      }

      const actor = actorResult.rows[0]
      console.log(`  Found: ${actor.name} (ID: ${actor.id})`)

      // Get current stored circumstances
      const currentResult = await pool.query<{ circumstances: unknown }>(
        `SELECT circumstances FROM actor_death_circumstances WHERE actor_id = $1`,
        [actor.id]
      )

      const currentCircumstances = currentResult.rows[0]?.circumstances
      const currentText =
        typeof currentCircumstances === "object" && currentCircumstances !== null
          ? (currentCircumstances as { official?: string }).official ||
            JSON.stringify(currentCircumstances)
          : String(currentCircumstances || "(none)")

      console.log("\n--- CURRENT (stored in DB) ---")
      console.log(currentText.substring(0, 800))
      if (currentText.length > 800) console.log("\n[...truncated...]")

      // Get cached source data
      console.log("\n  Loading cached source data...")
      const cachedQueries = await getCachedQueriesForActor(actor.id)

      if (cachedQueries.length === 0) {
        console.log("  No cached data found for this actor, skipping...")
        continue
      }

      console.log(`  Found ${cachedQueries.length} cached queries`)

      // Convert cached queries to RawSourceData format
      const rawSources: RawSourceData[] = cachedQueries
        .filter((q) => q.responseRaw && !q.errorMessage)
        .map((q) => {
          // Extract text from the cached response
          const response = q.responseRaw as Record<string, unknown>
          let text = ""

          // Handle different source types
          if (typeof response === "string") {
            text = response
          } else if (response?.text) {
            text = String(response.text)
          } else if (response?.content) {
            text = String(response.content)
          } else if (response?.extract) {
            text = String(response.extract)
          } else if (response?.biography) {
            text = String(response.biography)
          } else {
            text = JSON.stringify(response)
          }

          return {
            sourceName: q.sourceType,
            sourceType: q.sourceType as DataSourceType,
            text,
            confidence: 0.7, // Default confidence for cached data
            url: q.queryString,
          }
        })
        .filter((s) => s.text.length > 50) // Filter out empty/minimal responses

      if (rawSources.length === 0) {
        console.log("  No usable source data in cache, skipping...")
        continue
      }

      console.log(`  ${rawSources.length} sources with usable data`)

      // Show raw sources if requested
      if (options.showRaw) {
        console.log("\n--- RAW SOURCE DATA ---")
        for (const source of rawSources) {
          console.log(`\n[${source.sourceName}] (${source.text.length} chars)`)
          console.log("-".repeat(50))
          console.log(source.text.substring(0, 1500))
          if (source.text.length > 1500) console.log("\n[...truncated...]")
        }
      }

      // Run through new cleanup prompt
      console.log("  Running Claude cleanup with NEW prompt...")
      const actorForEnrichment: ActorForEnrichment = {
        id: actor.id,
        tmdbId: actor.tmdb_id,
        name: actor.name,
        birthday: actor.birthday,
        deathday: actor.deathday,
        causeOfDeath: actor.cause_of_death,
        causeOfDeathDetails: actor.cause_of_death_details,
        popularity: actor.dof_popularity,
      }

      const { cleaned, costUsd } = await cleanupWithClaude(actorForEnrichment, rawSources)

      console.log(`  Cost: $${costUsd.toFixed(4)}`)

      console.log("\n--- CLAUDE CLEANUP RESPONSE (full JSON) ---")
      console.log(JSON.stringify(cleaned, null, 2))

      // Brief comparison
      console.log("\n--- COMPARISON ---")
      console.log(`  Current circumstances length: ${currentText.length} chars`)
      console.log(`  New circumstances length: ${(cleaned.circumstances || "").length} chars`)
    }

    console.log("\n\n=== Test Complete ===\n")
    console.log("Review the output above to compare old vs new prompt results.")
    console.log("The new prompt should produce more factual, less obituary-like text.\n")
  } catch (error) {
    console.error("\nError:", error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

program.parse()
