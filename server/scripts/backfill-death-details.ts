#!/usr/bin/env tsx
/**
 * One-time script to backfill cause_of_death_details and source tracking for existing records.
 *
 * This script:
 * 1. Finds all deceased persons with a cause_of_death but no cause_of_death_details
 * 2. Re-queries Claude/Wikipedia to get the detailed explanation
 * 3. Updates the records with the details and source information
 *
 * Usage:
 *   npm run backfill:death-details
 */

import "dotenv/config"
import { Command } from "commander"
import pg from "pg"
// Note: Rate limiting is handled by the centralized rate limiter in claude.ts
import { getCauseOfDeath } from "../src/lib/wikidata.js"

const { Pool } = pg

interface RecordToUpdate {
  tmdb_id: number
  name: string
  birthday: string | null
  deathday: string
  cause_of_death: string
  cause_of_death_source: string | null
  wikipedia_url: string | null
}

const program = new Command()
  .name("backfill-death-details")
  .description("Backfill cause_of_death_details and source tracking for existing records")
  .action(async () => {
    await runBackfill()
  })

async function runBackfill() {
  // Check required environment variables
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY environment variable is required")
    process.exit(1)
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  try {
    // Find records that have cause_of_death but no details
    console.log("Finding records missing cause_of_death_details...\n")

    const result = await pool.query<RecordToUpdate>(`
      SELECT tmdb_id, name, birthday, deathday, cause_of_death, cause_of_death_source, wikipedia_url
      FROM actors
      WHERE deathday IS NOT NULL
        AND cause_of_death IS NOT NULL
        AND cause_of_death_details IS NULL
      ORDER BY name
    `)

    const records = result.rows
    console.log(`Found ${records.length} records to update\n`)

    if (records.length === 0) {
      console.log("No records need updating. Done!")
      return
    }

    let updated = 0
    let failed = 0
    let fromClaude = 0
    let fromWikipedia = 0

    for (let i = 0; i < records.length; i++) {
      const record = records[i]
      console.log(`[${i + 1}/${records.length}] ${record.name}...`)

      try {
        const { causeOfDeathSource, causeOfDeathDetails, causeOfDeathDetailsSource, wikipediaUrl } =
          await getCauseOfDeath(record.name, record.birthday, record.deathday)

        // Build update query dynamically based on what we got
        const updates: string[] = []
        const values: (string | number | null)[] = [record.tmdb_id]
        let paramIndex = 2

        // Update cause_of_death_source if we don't have one
        if (!record.cause_of_death_source && causeOfDeathSource) {
          updates.push(`cause_of_death_source = $${paramIndex}`)
          values.push(causeOfDeathSource)
          paramIndex++
        }

        // Update details if we got them
        if (causeOfDeathDetails) {
          updates.push(`cause_of_death_details = $${paramIndex}`)
          values.push(causeOfDeathDetails)
          paramIndex++

          updates.push(`cause_of_death_details_source = $${paramIndex}`)
          values.push(causeOfDeathDetailsSource)
          paramIndex++

          if (causeOfDeathDetailsSource === "claude") fromClaude++
          else if (causeOfDeathDetailsSource === "wikipedia") fromWikipedia++
        }

        // Update wikipedia_url if we got one and didn't have one
        if (!record.wikipedia_url && wikipediaUrl) {
          updates.push(`wikipedia_url = $${paramIndex}`)
          values.push(wikipediaUrl)
          paramIndex++
        }

        if (updates.length > 0) {
          updates.push("updated_at = CURRENT_TIMESTAMP")
          await pool.query(`UPDATE actors SET ${updates.join(", ")} WHERE tmdb_id = $1`, values)
          console.log(
            `  -> Updated (details: ${causeOfDeathDetailsSource || "none"}, cause: ${causeOfDeathSource || record.cause_of_death_source || "unknown"})`
          )
          if (causeOfDeathDetails) updated++
        } else {
          console.log(`  -> No updates needed`)
        }

        // Note: Rate limiting is handled by the centralized rate limiter in claude.ts
      } catch (error) {
        console.error(`  -> Error: ${error}`)
        failed++
      }
    }

    console.log("\n--- Summary ---")
    console.log(`Total records processed: ${records.length}`)
    console.log(`Records with details added: ${updated}`)
    console.log(`  - From Claude: ${fromClaude}`)
    console.log(`  - From Wikipedia: ${fromWikipedia}`)
    console.log(`Failed: ${failed}`)
    console.log(`No details available: ${records.length - updated - failed}`)
  } finally {
    await pool.end()
  }
}

program.parse()
