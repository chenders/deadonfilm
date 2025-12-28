#!/usr/bin/env tsx
/**
 * Refetch death details for actors who are missing them.
 * Uses the improved Claude prompt with validation to get better quality details.
 *
 * This script:
 * 1. Finds deceased actors with cause_of_death but no cause_of_death_details
 * 2. Queries Claude with the improved prompt
 * 3. Validates the response to reject irrelevant content
 * 4. Updates the database with acceptable details only
 *
 * Usage:
 *   npm run refetch:death-details              # Process all missing
 *   npm run refetch:death-details -- --limit 50    # Process up to 50
 *   npm run refetch:death-details -- --dry-run     # Preview without updating
 *   npm run refetch:death-details -- --popular     # Only popular actors first
 */

import "dotenv/config"
import { Command } from "commander"
import pg from "pg"
import { getCauseOfDeathFromClaude } from "../src/lib/claude.js"

const { Pool } = pg

interface ActorRecord {
  tmdb_id: number
  name: string
  birthday: Date | string | null
  deathday: Date | string
  cause_of_death: string
  popularity: number | null
}

interface RefetchOptions {
  limit?: number
  dryRun?: boolean
  popular?: boolean
  minPopularity?: number
}

const program = new Command()
  .name("refetch-death-details")
  .description("Refetch death details using the improved Claude prompt with validation")
  .option("-n, --dry-run", "Preview changes without updating the database")
  .option("-l, --limit <number>", "Maximum number of actors to process", parseInt)
  .option("-p, --popular", "Process popular actors first (popularity >= 5)")
  .option("--min-popularity <number>", "Minimum popularity threshold", parseFloat, 0)
  .action(async (options) => {
    await runRefetch(options)
  })

async function runRefetch(options: RefetchOptions): Promise<void> {
  const { limit, dryRun = false, popular = false, minPopularity = 0 } = options

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY environment variable is required")
    process.exit(1)
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  console.log("\n" + "=".repeat(70))
  console.log("REFETCH DEATH DETAILS")
  console.log("=".repeat(70))
  console.log(`Mode: ${dryRun ? "DRY RUN (no changes will be made)" : "LIVE"}`)
  if (limit) console.log(`Limit: ${limit} actors`)
  if (popular) console.log(`Filter: Popular actors only (popularity >= 5)`)
  if (minPopularity > 0) console.log(`Min popularity: ${minPopularity}`)
  console.log("=".repeat(70) + "\n")

  try {
    // Build query based on options
    let query = `
      SELECT tmdb_id, name, birthday, deathday, cause_of_death, popularity
      FROM actors
      WHERE deathday IS NOT NULL
        AND cause_of_death IS NOT NULL
        AND cause_of_death_details IS NULL
    `

    const params: (number | string)[] = []
    let paramIndex = 1

    if (popular || minPopularity > 0) {
      const threshold = popular ? 5 : minPopularity
      query += ` AND COALESCE(popularity, 0) >= $${paramIndex}`
      params.push(threshold)
      paramIndex++
    }

    query += ` ORDER BY COALESCE(popularity, 0) DESC`

    if (limit) {
      query += ` LIMIT $${paramIndex}`
      params.push(limit)
    }

    console.log("Finding actors missing death details...")
    const result = await pool.query<ActorRecord>(query, params)
    const actors = result.rows

    console.log(`Found ${actors.length} actors to process\n`)

    if (actors.length === 0) {
      console.log("No actors need updating. Done!")
      return
    }

    // Stats
    let processed = 0
    let updated = 0
    let rejected = 0
    let noDetails = 0
    let errors = 0

    for (let i = 0; i < actors.length; i++) {
      const actor = actors[i]
      const progress = `[${i + 1}/${actors.length}]`
      const popularityStr = actor.popularity
        ? ` (pop: ${parseFloat(String(actor.popularity)).toFixed(1)})`
        : ""

      console.log(`${progress} ${actor.name}${popularityStr}`)
      console.log(`  Current cause: ${actor.cause_of_death}`)

      try {
        // Extract birth year from birthday (handle Date object or string)
        let birthYear: number | null = null
        if (actor.birthday) {
          if (actor.birthday instanceof Date) {
            birthYear = actor.birthday.getFullYear()
          } else {
            birthYear = parseInt(String(actor.birthday).substring(0, 4), 10)
          }
        }

        let deathYear: number
        if (actor.deathday instanceof Date) {
          deathYear = actor.deathday.getFullYear()
        } else {
          deathYear = parseInt(String(actor.deathday).substring(0, 4), 10)
        }

        // Query Claude with the improved prompt
        const result = await getCauseOfDeathFromClaude(actor.name, birthYear, deathYear)

        if (result.details) {
          console.log(
            `  ✓ Got details: "${result.details.substring(0, 80)}${result.details.length > 80 ? "..." : ""}"`
          )

          if (!dryRun) {
            await pool.query(
              `UPDATE actors
               SET cause_of_death_details = $1,
                   cause_of_death_details_source = 'claude',
                   updated_at = CURRENT_TIMESTAMP
               WHERE tmdb_id = $2`,
              [result.details, actor.tmdb_id]
            )
          }
          updated++
        } else {
          // Check if Claude returned a cause but details were rejected by validation
          if (result.causeOfDeath) {
            console.log(`  ✗ Details rejected by validation (cause: ${result.causeOfDeath})`)
            rejected++
          } else {
            console.log(`  - No details available`)
            noDetails++
          }
        }

        processed++

        // Rate limiting - 200ms between requests
        await delay(200)
      } catch (error) {
        console.error(`  ✗ Error: ${error instanceof Error ? error.message : error}`)
        errors++
      }
    }

    // Summary
    console.log("\n" + "=".repeat(70))
    console.log("SUMMARY")
    console.log("=".repeat(70))
    console.log(`Total processed:     ${processed}`)
    console.log(`Successfully updated: ${updated} (${((updated / processed) * 100).toFixed(1)}%)`)
    console.log(`Rejected by validation: ${rejected}`)
    console.log(`No details available: ${noDetails}`)
    console.log(`Errors:              ${errors}`)

    if (dryRun) {
      console.log("\n(DRY RUN - no changes were made)")
    }

    console.log("=".repeat(70) + "\n")
  } finally {
    await pool.end()
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

program.parse()
