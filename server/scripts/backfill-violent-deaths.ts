#!/usr/bin/env tsx
/**
 * Backfill script to classify violent deaths in the deceased_persons table.
 *
 * This script:
 * 1. Finds all deceased persons with NULL violent_death
 * 2. Uses pattern matching for definite violent deaths
 * 3. Uses Claude API for ambiguous cases
 * 4. Updates the violent_death boolean column
 *
 * Usage:
 *   npm run backfill:violent-deaths              # Process all NULL records
 *   npm run backfill:violent-deaths -- --dry-run # Preview without updating
 *   npm run backfill:violent-deaths -- --all     # Recalculate all records
 */

import "dotenv/config"
import { Command } from "commander"
import pg from "pg"
import Anthropic from "@anthropic-ai/sdk"

const { Pool } = pg

// Definite violent death patterns - no Claude verification needed
const DEFINITE_VIOLENT_PATTERNS = [
  // Homicide
  "murder",
  "murdered",
  "homicide",
  "manslaughter",
  "killed",
  "slain",
  "assassinated",
  "assassination",
  // Suicide
  "suicide",
  "self-inflicted",
  "took own life",
  "took his own life",
  "took her own life",
  // Firearms
  "shot",
  "shooting",
  "gunshot",
  "gun violence",
  "firearm",
  // Stabbing
  "stabbed",
  "stabbing",
  "knife wound",
  "knife attack",
  // Strangulation
  "strangled",
  "strangulation",
  "asphyxiated",
  "asphyxiation",
  // Physical assault
  "beaten",
  "bludgeoned",
  "assault",
  "beaten to death",
  // Execution
  "executed",
  "execution",
  "death penalty",
  "electric chair",
  "lethal injection",
  "hanged",
  "hanging",
  // Lynching
  "lynched",
  "lynching",
  // Terrorism
  "terrorist attack",
  "terrorism",
  "bombing",
  "bomb",
]

// Ambiguous patterns - need Claude verification
const AMBIGUOUS_PATTERNS = [
  "overdose",
  "drug overdose",
  "drowned",
  "drowning",
  "fall",
  "fell",
  "explosion",
  "accidental",
]

interface DeceasedPerson {
  tmdb_id: number
  name: string
  cause_of_death: string | null
  cause_of_death_details: string | null
}

function matchesPatterns(text: string | null, patterns: string[]): boolean {
  if (!text) return false
  const lower = text.toLowerCase()
  return patterns.some((pattern) => lower.includes(pattern.toLowerCase()))
}

async function askClaudeIfViolent(
  anthropic: Anthropic,
  name: string,
  causeOfDeath: string | null,
  details: string | null
): Promise<boolean | null> {
  const prompt = `Is this death "violent"? A violent death includes: homicide, suicide, execution, death by weapons, or physical assault.

Actor: ${name}
Cause of death: ${causeOfDeath || "unknown"}
Details: ${details || "none"}

Reply ONLY with one word: "yes", "no", or "unknown"
Do not include any other text.`

  try {
    const message = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 10,
      messages: [{ role: "user", content: prompt }],
    })

    const response =
      message.content[0].type === "text" ? message.content[0].text.trim().toLowerCase() : ""

    if (response === "yes") return true
    if (response === "no") return false
    return null // unknown
  } catch (error) {
    console.error(`  Claude error: ${error}`)
    return null
  }
}

const program = new Command()
  .name("backfill-violent-deaths")
  .description("Classify violent deaths in deceased_persons table")
  .option("-n, --dry-run", "Preview changes without updating database")
  .option("-a, --all", "Recalculate all records, not just NULLs")
  .action(async (options: { dryRun?: boolean; all?: boolean }) => {
    await runBackfill(options)
  })

async function runBackfill(options: { dryRun?: boolean; all?: boolean }) {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY environment variable is required")
    process.exit(1)
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const anthropic = new Anthropic()

  try {
    // Find records to process
    const whereClause = options.all
      ? "WHERE deathday IS NOT NULL"
      : "WHERE deathday IS NOT NULL AND violent_death IS NULL"
    const result = await pool.query<DeceasedPerson>(`
      SELECT tmdb_id, name, cause_of_death, cause_of_death_details
      FROM actors
      ${whereClause}
      ORDER BY name
    `)

    const records = result.rows
    console.log(`Found ${records.length} records to process${options.dryRun ? " (dry run)" : ""}\n`)

    if (records.length === 0) {
      console.log("No records need processing. Done!")
      return
    }

    let definiteViolent = 0
    let definiteNotViolent = 0
    let claudeViolent = 0
    let claudeNotViolent = 0
    let claudeUnknown = 0
    let skipped = 0

    for (let i = 0; i < records.length; i++) {
      const record = records[i]
      const combined = `${record.cause_of_death || ""} ${record.cause_of_death_details || ""}`

      process.stdout.write(`[${i + 1}/${records.length}] ${record.name}... `)

      // Check definite violent patterns
      if (matchesPatterns(combined, DEFINITE_VIOLENT_PATTERNS)) {
        console.log("VIOLENT (pattern match)")
        if (!options.dryRun) {
          await pool.query(
            "UPDATE actors SET violent_death = true, updated_at = NOW() WHERE tmdb_id = $1",
            [record.tmdb_id]
          )
        }
        definiteViolent++
        continue
      }

      // Check ambiguous patterns - need Claude
      if (matchesPatterns(combined, AMBIGUOUS_PATTERNS)) {
        const isViolent = await askClaudeIfViolent(
          anthropic,
          record.name,
          record.cause_of_death,
          record.cause_of_death_details
        )

        if (isViolent === true) {
          console.log("VIOLENT (Claude)")
          if (!options.dryRun) {
            await pool.query(
              "UPDATE actors SET violent_death = true, updated_at = NOW() WHERE tmdb_id = $1",
              [record.tmdb_id]
            )
          }
          claudeViolent++
        } else if (isViolent === false) {
          console.log("NOT violent (Claude)")
          if (!options.dryRun) {
            await pool.query(
              "UPDATE actors SET violent_death = false, updated_at = NOW() WHERE tmdb_id = $1",
              [record.tmdb_id]
            )
          }
          claudeNotViolent++
        } else {
          console.log("UNKNOWN (Claude)")
          claudeUnknown++
        }

        // Rate limit Claude calls
        await delay(200)
        continue
      }

      // No cause of death info or doesn't match any patterns
      if (!record.cause_of_death && !record.cause_of_death_details) {
        console.log("skipped (no data)")
        skipped++
        continue
      }

      // Has data but doesn't match violent patterns
      console.log("NOT violent")
      if (!options.dryRun) {
        await pool.query(
          "UPDATE actors SET violent_death = false, updated_at = NOW() WHERE tmdb_id = $1",
          [record.tmdb_id]
        )
      }
      definiteNotViolent++
    }

    console.log("\n--- Summary ---")
    console.log(`Total processed: ${records.length}`)
    console.log(`Violent deaths: ${definiteViolent + claudeViolent}`)
    console.log(`  - Pattern match: ${definiteViolent}`)
    console.log(`  - Claude verified: ${claudeViolent}`)
    console.log(`Non-violent deaths: ${definiteNotViolent + claudeNotViolent}`)
    console.log(`  - Pattern match: ${definiteNotViolent}`)
    console.log(`  - Claude verified: ${claudeNotViolent}`)
    console.log(`Unknown (Claude): ${claudeUnknown}`)
    console.log(`Skipped (no data): ${skipped}`)

    if (options.dryRun) {
      console.log("\nDry run complete - no changes made")
    }
  } finally {
    await pool.end()
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

program.parse()
