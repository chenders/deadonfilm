#!/usr/bin/env tsx
/**
 * Backfill script to look up missing birthdays for deceased actors using Claude.
 *
 * Usage:
 *   npm run backfill:birthdays
 */

import "dotenv/config"
import { Command } from "commander"
import { getPool } from "../src/lib/db.js"
import { calculateYearsLost } from "../src/lib/mortality-stats.js"
import Anthropic from "@anthropic-ai/sdk"

const anthropic = new Anthropic()

async function lookupBirthday(name: string, deathday: string): Promise<string | null> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: `What is the birth date of the actor "${name}" who died on ${deathday}?

Reply with ONLY the date in YYYY-MM-DD format, or "unknown" if you cannot determine it with confidence.
Do not include any other text.`,
        },
      ],
    })

    const text =
      response.content[0].type === "text" ? response.content[0].text.trim().toLowerCase() : ""

    // Validate it looks like a date
    if (text === "unknown" || text.includes("unknown")) {
      return null
    }

    // Check if it matches YYYY-MM-DD format
    const dateMatch = text.match(/^\d{4}-\d{2}-\d{2}$/)
    if (dateMatch) {
      return dateMatch[0]
    }

    // Try to extract a date if Claude gave extra text
    const extractedDate = text.match(/\d{4}-\d{2}-\d{2}/)
    if (extractedDate) {
      return extractedDate[0]
    }

    return null
  } catch (error) {
    console.error(`    Claude API error: ${error}`)
    return null
  }
}

const program = new Command()
  .name("backfill-birthdays")
  .description("Look up missing birthdays for deceased actors using Claude")
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

  console.log("\nBackfilling missing birthdays for deceased actors...\n")

  const db = getPool()

  try {
    // Get all deceased persons missing birthday
    const result = await db.query<{
      tmdb_id: number
      name: string
      deathday: string
    }>(`
      SELECT tmdb_id, name, deathday::text
      FROM deceased_persons
      WHERE birthday IS NULL
      ORDER BY name
    `)

    console.log(`Found ${result.rows.length} actors missing birthday\n`)

    if (result.rows.length === 0) {
      console.log("Nothing to backfill. Done!")
      return
    }

    let updated = 0
    let notFound = 0

    for (let i = 0; i < result.rows.length; i++) {
      const person = result.rows[i]
      console.log(`  [${i + 1}/${result.rows.length}] ${person.name}...`)

      const birthday = await lookupBirthday(person.name, person.deathday)

      if (birthday) {
        // Calculate mortality stats with the new birthday (uses birth-year-specific life expectancy)
        const mortalityStats = await calculateYearsLost(birthday, person.deathday)

        await db.query(
          `UPDATE deceased_persons
           SET birthday = $2,
               age_at_death = $3,
               expected_lifespan = $4,
               years_lost = $5,
               updated_at = CURRENT_TIMESTAMP
           WHERE tmdb_id = $1`,
          [
            person.tmdb_id,
            birthday,
            mortalityStats?.ageAtDeath ?? null,
            mortalityStats?.expectedLifespan ?? null,
            mortalityStats?.yearsLost ?? null,
          ]
        )
        console.log(`    -> Found: ${birthday}`)
        if (mortalityStats) {
          console.log(
            `    -> Age ${mortalityStats.ageAtDeath}, lost ${mortalityStats.yearsLost} years`
          )
        }
        updated++
      } else {
        console.log(`    -> Not found`)
        notFound++
      }

      // Rate limit - Claude API has limits
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    console.log("\nSummary:")
    console.log(`  Updated: ${updated}`)
    console.log(`  Not found: ${notFound}`)
    console.log("\nDone!")
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  } finally {
    await db.end()
  }
}

program.parse()
