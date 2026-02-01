#!/usr/bin/env tsx
/**
 * Find actors where Claude expressed uncertainty about their death.
 * These are data quality issues where the actor may not actually be dead,
 * or Claude couldn't verify the death information.
 */

import "dotenv/config"
import { getPool, resetPool } from "../src/lib/db.js"

export const UNCERTAINTY_PATTERNS = [
  "cannot verify",
  "cannot confirm",
  "may contain incorrect",
  "beyond my knowledge",
  "still alive",
  "was alive",
  "have not died",
  "has not died",
  "haven't died",
  "hasn't died",
  "no confirmed",
  "not confirmed",
  "unable to confirm",
  "unable to verify",
  "incorrect information",
  "may be incorrect",
  "appears to be alive",
  "is still alive",
  "reportedly alive",
]

export async function findUncertainDeaths(): Promise<void> {
  const db = getPool()

  try {
    // Build a regex pattern for all uncertainty phrases
    const pattern = UNCERTAINTY_PATTERNS.join("|")

    // Query actors with uncertainty in their death circumstances
    const result = await db.query<{
      actor_id: number
      name: string
      tmdb_id: number | null
      deathday: string
      circumstances: string | null
      rumored_circumstances: string | null
      additional_context: string | null
      raw_response: string | null
    }>(
      `SELECT
         a.id as actor_id,
         a.name,
         a.tmdb_id,
         a.deathday,
         adc.circumstances,
         adc.rumored_circumstances,
         adc.additional_context,
         adc.raw_response::text
       FROM actors a
       JOIN actor_death_circumstances adc ON a.id = adc.actor_id
       WHERE
         adc.circumstances ~* $1
         OR adc.rumored_circumstances ~* $1
         OR adc.additional_context ~* $1
         OR adc.raw_response::text ~* $1
       ORDER BY a.dof_popularity DESC NULLS LAST`,
      [pattern]
    )

    console.log(`\nFound ${result.rows.length} actors with uncertain death data:\n`)

    for (const row of result.rows) {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      console.log(`Actor: ${row.name} (ID: ${row.actor_id}, TMDB: ${row.tmdb_id})`)
      console.log(`Recorded deathday: ${row.deathday}`)

      if (row.circumstances) {
        const matchedPhrases = UNCERTAINTY_PATTERNS.filter((p) =>
          row.circumstances!.toLowerCase().includes(p.toLowerCase())
        )
        if (matchedPhrases.length > 0) {
          console.log(`\nCircumstances contains: ${matchedPhrases.join(", ")}`)
          console.log(`Excerpt: ${row.circumstances.substring(0, 300)}...`)
        }
      }

      if (row.rumored_circumstances) {
        const matchedPhrases = UNCERTAINTY_PATTERNS.filter((p) =>
          row.rumored_circumstances!.toLowerCase().includes(p.toLowerCase())
        )
        if (matchedPhrases.length > 0) {
          console.log(`\nRumored circumstances contains: ${matchedPhrases.join(", ")}`)
          console.log(`Excerpt: ${row.rumored_circumstances.substring(0, 300)}...`)
        }
      }

      if (row.additional_context) {
        const matchedPhrases = UNCERTAINTY_PATTERNS.filter((p) =>
          row.additional_context!.toLowerCase().includes(p.toLowerCase())
        )
        if (matchedPhrases.length > 0) {
          console.log(`\nAdditional context contains: ${matchedPhrases.join(", ")}`)
          console.log(`Excerpt: ${row.additional_context.substring(0, 300)}...`)
        }
      }

      console.log("")
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    console.log(`SUMMARY: ${result.rows.length} actors need review`)
    console.log(`\nThese actors should be verified and potentially have their`)
    console.log(`death records removed if they are not actually deceased.`)
  } finally {
    await resetPool()
  }
}

// Only run when executed directly (not when imported by tests)
if (process.env.VITEST !== "true") {
  findUncertainDeaths().catch(console.error)
}
