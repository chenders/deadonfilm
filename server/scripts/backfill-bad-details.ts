#!/usr/bin/env tsx
/**
 * Backfill script to fix problematic death details entries.
 *
 * Identifies and re-queries entries with:
 * - "=" prefix (Wikipedia artifacts)
 * - Citation artifacts ({{cite...)
 * - Relationship/marriage info that's not relevant
 * - Redundant details that just restate the cause
 *
 * Usage:
 *   cd server && npx tsx scripts/backfill-bad-details.ts [--dry-run]
 */

import "dotenv/config"
import pg from "pg"
import { getCauseOfDeathFromClaude } from "../src/lib/claude.js"

const { Pool } = pg

interface BadEntry {
  tmdb_id: number
  name: string
  birthday: string | null
  deathday: string
  cause_of_death: string | null
  cause_of_death_details: string | null
  reason: string
}

function identifyBadDetails(cause: string | null, details: string | null): string | null {
  if (!details) return null

  const detailsLower = details.toLowerCase()
  const causeLower = (cause || "").toLowerCase()

  // Check for "=" prefix (Wikipedia artifact)
  if (details.startsWith("=")) {
    return "starts with ="
  }

  // Check for citation artifacts
  if (details.includes("{{cite") || details.includes("{{Cite")) {
    return "contains citation markup"
  }

  // Check for irrelevant relationship info
  const relationshipPatterns = [
    /\bcouple\b/i,
    /\bhusband\b.*\bdied\b/i,
    /\bwife\b.*\bdied\b/i,
    /\bmarried until\b/i,
    /\bremained married\b/i,
    /\bremained together\b/i,
    /\buntil (his|her) death\b/i,
    /\bmarriage.*ended\b/i,
    /\bdivorce\b/i,
    /\bfour children\b/i,
    /\btheir children\b/i,
    /\btogether until\b/i,
  ]

  // But exclude cases where spouse is the killer (Phil Hartman case)
  const isRelevantSpouseInfo =
    detailsLower.includes("shot by") ||
    detailsLower.includes("killed by") ||
    detailsLower.includes("murdered by")

  if (!isRelevantSpouseInfo) {
    for (const pattern of relationshipPatterns) {
      if (pattern.test(details)) {
        return `contains irrelevant relationship info: ${pattern}`
      }
    }
  }

  // Check for short useless details (just date/location statements)
  // e.g., "He died on November 2.", "She died in 2010."
  if (details.length < 40) {
    // Short details that are just death date/year statements
    if (/^(He|She) died (on|in) [^.]*\.?$/i.test(details)) {
      return "too short - just death date statement"
    }
  }

  // Check for redundant details (just restates cause + date/age)
  // Pattern: "[Name] died of/from [cause] on/in [date/year], at age/aged [number]"
  // eslint-disable-next-line security/detect-non-literal-regexp -- input is escaped with replace()
  const redundantPattern = new RegExp(
    `died (of|from) ${causeLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    "i"
  )

  if (redundantPattern.test(detailsLower)) {
    // Check if there's additional meaningful content beyond the basic death statement
    // Remove the basic death statement and see what's left
    const withoutBasic = details
      .replace(/.*died (of|from) [^.]+\./i, "")
      .replace(/at (the )?age (of )?\d+/gi, "")
      .replace(/aged \d+/gi, "")
      .replace(/on [A-Z][a-z]+ \d+, \d{4}/g, "")
      .replace(/in \d{4}/g, "")
      .replace(/[,.]?\s*$/g, "")
      .trim()

    // If nothing meaningful remains, it's redundant
    if (withoutBasic.length < 20) {
      return "redundant - just restates cause with date/age"
    }
  }

  return null
}

async function main() {
  const dryRun = process.argv.includes("--dry-run")

  if (dryRun) {
    console.log("DRY RUN MODE - no changes will be made\n")
  }

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
    // Get all entries with details
    const result = await pool.query(`
      SELECT tmdb_id, name, birthday, deathday, cause_of_death, cause_of_death_details
      FROM deceased_persons
      WHERE cause_of_death_details IS NOT NULL
      ORDER BY name
    `)

    console.log(`Checking ${result.rows.length} entries with details...\n`)

    const badEntries: BadEntry[] = []

    for (const row of result.rows) {
      const reason = identifyBadDetails(row.cause_of_death, row.cause_of_death_details)
      if (reason) {
        badEntries.push({
          ...row,
          reason,
        })
      }
    }

    console.log(`Found ${badEntries.length} problematic entries:\n`)

    for (const entry of badEntries) {
      console.log(`- ${entry.name}: ${entry.reason}`)
      console.log(`  Current: "${entry.cause_of_death_details?.substring(0, 80)}..."`)
    }

    if (badEntries.length === 0) {
      console.log("No problematic entries found!")
      return
    }

    if (dryRun) {
      console.log("\nDry run complete. Run without --dry-run to fix these entries.")
      return
    }

    console.log(`\nRe-querying ${badEntries.length} entries with improved prompt...\n`)

    let updated = 0
    let cleared = 0

    for (let i = 0; i < badEntries.length; i++) {
      const entry = badEntries[i]
      const birthYear = entry.birthday ? new Date(entry.birthday).getFullYear() : null
      const deathYear = new Date(entry.deathday).getFullYear()

      console.log(`[${i + 1}/${badEntries.length}] ${entry.name}...`)

      const claudeResult = await getCauseOfDeathFromClaude(entry.name, birthYear, deathYear)

      if (claudeResult.details !== null) {
        // Got new details - update
        await pool.query(
          `UPDATE deceased_persons
           SET cause_of_death = COALESCE($1, cause_of_death),
               cause_of_death_details = $2,
               updated_at = NOW()
           WHERE tmdb_id = $3`,
          [claudeResult.causeOfDeath, claudeResult.details, entry.tmdb_id]
        )
        console.log(`  Updated: "${claudeResult.details?.substring(0, 60)}..."`)
        updated++
      } else {
        // No details - clear the bad details
        await pool.query(
          `UPDATE deceased_persons
           SET cause_of_death_details = NULL,
               updated_at = NOW()
           WHERE tmdb_id = $1`,
          [entry.tmdb_id]
        )
        console.log(`  Cleared (no meaningful details available)`)
        cleared++
      }

      // Rate limit
      await new Promise((r) => setTimeout(r, 300))
    }

    console.log(`\nDone!`)
    console.log(`- Updated with new details: ${updated}`)
    console.log(`- Cleared (no meaningful details): ${cleared}`)
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})
