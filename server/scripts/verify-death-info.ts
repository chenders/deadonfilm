#!/usr/bin/env tsx
/**
 * Two-pass verification of death information for deceased actors.
 *
 * Pass 1: Verify cause of death using Claude (Sonnet by default)
 * Pass 2: Fetch death details using verified cause
 *
 * This script re-runs discovery for all deceased actors to get more accurate
 * cause of death and details using the improved two-pass approach.
 *
 * The script automatically saves progress to a checkpoint file and resumes
 * from where it left off if interrupted. Use --fresh to start over.
 *
 * Usage:
 *   npm run verify:death-info                    # Process all actors (resumes if interrupted)
 *   npm run verify:death-info -- --limit 50      # Process up to 50
 *   npm run verify:death-info -- --dry-run       # Preview without updating
 *   npm run verify:death-info -- --popular       # Only popular actors first
 *   npm run verify:death-info -- --pass1-only    # Only verify causes
 *   npm run verify:death-info -- --pass2-only    # Only fetch details
 *   npm run verify:death-info -- --fresh         # Start fresh (ignore checkpoint)
 */

import "dotenv/config"
import { Command } from "commander"
import pg from "pg"
import fs from "fs"
import path from "path"
import { verifyCauseOfDeath, getDeathDetails, type ClaudeModel } from "../src/lib/claude.js"

// Checkpoint file to track progress
const CHECKPOINT_FILE = path.join(process.cwd(), ".verify-death-info-checkpoint.json")

interface Checkpoint {
  processedIds: number[]
  startedAt: string
  lastUpdated: string
  stats: {
    processed: number
    causesUpdated: number
    causesUnchanged: number
    detailsUpdated: number
    detailsCleared: number
    noChange: number
    errors: number
  }
}

function loadCheckpoint(): Checkpoint | null {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      const data = fs.readFileSync(CHECKPOINT_FILE, "utf-8")
      return JSON.parse(data) as Checkpoint
    }
  } catch (error) {
    console.warn("Warning: Could not load checkpoint file:", error)
  }
  return null
}

function saveCheckpoint(checkpoint: Checkpoint): void {
  try {
    checkpoint.lastUpdated = new Date().toISOString()
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2))
  } catch (error) {
    console.error("Warning: Could not save checkpoint:", error)
  }
}

function deleteCheckpoint(): void {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      fs.unlinkSync(CHECKPOINT_FILE)
    }
  } catch (error) {
    console.warn("Warning: Could not delete checkpoint file:", error)
  }
}

const { Pool } = pg

interface ActorRecord {
  tmdb_id: number
  name: string
  birthday: Date | string | null
  deathday: Date | string
  cause_of_death: string | null
  cause_of_death_source: string | null
  cause_of_death_details: string | null
  popularity: number | null
}

interface VerifyOptions {
  limit?: number
  dryRun?: boolean
  popular?: boolean
  minPopularity?: number
  pass1Only?: boolean
  pass2Only?: boolean
  model?: ClaudeModel
  fresh?: boolean
}

interface DiscrepancyRecord {
  tmdbId: number
  name: string
  storedCause: string | null
  claudeCause: string | null
  confidence: string | null
  reasoning: string | null
}

const program = new Command()
  .name("verify-death-info")
  .description("Two-pass verification of death information using Claude")
  .option("-n, --dry-run", "Preview changes without updating the database")
  .option("-l, --limit <number>", "Maximum number of actors to process", parseInt)
  .option("-p, --popular", "Process popular actors first (popularity >= 5)")
  .option("--min-popularity <number>", "Minimum popularity threshold", parseFloat, 0)
  .option("--pass1-only", "Only verify causes (Pass 1), skip details")
  .option("--pass2-only", "Only fetch details (Pass 2), skip cause verification")
  .option("-m, --model <model>", "Claude model to use (sonnet or haiku)", "sonnet")
  .option("--fresh", "Start fresh, ignoring any saved checkpoint")
  .action(async (options) => {
    const model = options.model as ClaudeModel
    if (model !== "sonnet" && model !== "haiku") {
      console.error("Error: --model must be 'sonnet' or 'haiku'")
      process.exit(1)
    }
    await runVerification({ ...options, model })
  })

async function runVerification(options: VerifyOptions): Promise<void> {
  const {
    limit,
    dryRun = false,
    popular = false,
    minPopularity = 0,
    pass1Only = false,
    pass2Only = false,
    model = "sonnet",
    fresh = false,
  } = options

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY environment variable is required")
    process.exit(1)
  }

  // Load or create checkpoint
  let checkpoint: Checkpoint
  const existingCheckpoint = fresh ? null : loadCheckpoint()

  if (existingCheckpoint && !dryRun) {
    checkpoint = existingCheckpoint
    console.log("\n" + "=".repeat(70))
    console.log("RESUMING FROM CHECKPOINT")
    console.log("=".repeat(70))
    console.log(`Started: ${checkpoint.startedAt}`)
    console.log(`Last updated: ${checkpoint.lastUpdated}`)
    console.log(`Already processed: ${checkpoint.processedIds.length} actors`)
    console.log(`Use --fresh to start over`)
    console.log("=".repeat(70) + "\n")
  } else {
    checkpoint = {
      processedIds: [],
      startedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      stats: {
        processed: 0,
        causesUpdated: 0,
        causesUnchanged: 0,
        detailsUpdated: 0,
        detailsCleared: 0,
        noChange: 0,
        errors: 0,
      },
    }
    if (fresh) {
      deleteCheckpoint()
    }
  }

  const processedSet = new Set(checkpoint.processedIds)

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  console.log("\n" + "=".repeat(70))
  console.log("VERIFY DEATH INFORMATION - TWO-PASS VERIFICATION")
  console.log("=".repeat(70))
  console.log(`Mode: ${dryRun ? "DRY RUN (no changes will be made)" : "LIVE"}`)
  console.log(`Model: ${model}`)
  if (pass1Only) console.log("Pass: 1 only (cause verification)")
  else if (pass2Only) console.log("Pass: 2 only (details fetching)")
  else console.log("Pass: Both (cause + details)")
  if (limit) console.log(`Limit: ${limit} actors`)
  if (popular) console.log("Filter: Popular actors only (popularity >= 5)")
  if (minPopularity > 0) console.log(`Min popularity: ${minPopularity}`)
  console.log("=".repeat(70) + "\n")

  try {
    // Build query based on options
    // INTENTIONAL: Building SQL with parameterized queries. The WHERE clause conditions
    // are static strings, and all dynamic values use $N parameters.
    let query = `
      SELECT tmdb_id, name, birthday, deathday, cause_of_death, cause_of_death_source,
             cause_of_death_details, popularity
      FROM actors
      WHERE deathday IS NOT NULL
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

    console.log("Finding deceased actors to verify...")
    const result = await pool.query<ActorRecord>(query, params)
    const actors = result.rows

    // Filter out already-processed actors
    const actorsToProcess = actors.filter((a) => !processedSet.has(a.tmdb_id))

    console.log(`Found ${actors.length} actors total`)
    if (processedSet.size > 0) {
      console.log(`Skipping ${actors.length - actorsToProcess.length} already processed`)
    }
    console.log(`Processing ${actorsToProcess.length} actors\n`)

    if (actorsToProcess.length === 0) {
      console.log("All actors already processed. Done!")
      deleteCheckpoint()
      return
    }

    // Stats - use checkpoint stats if resuming
    let {
      processed,
      causesUpdated,
      causesUnchanged,
      detailsUpdated,
      detailsCleared,
      noChange,
      errors,
    } = checkpoint.stats

    const discrepancies: DiscrepancyRecord[] = []

    for (let i = 0; i < actorsToProcess.length; i++) {
      const actor = actorsToProcess[i]
      const totalProgress = processedSet.size + i + 1
      const progress = `[${totalProgress}/${actors.length}]`
      const popularityStr = actor.popularity
        ? ` (pop: ${parseFloat(String(actor.popularity)).toFixed(1)})`
        : ""

      console.log(`${progress} ${actor.name}${popularityStr}`)
      console.log(`  Stored cause: ${actor.cause_of_death || "(none)"}`)

      try {
        // Extract years from dates
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

        let verifiedCause: string | null = actor.cause_of_death
        let causeChanged = false

        // Pass 1: Verify cause of death
        if (!pass2Only) {
          const verification = await verifyCauseOfDeath(
            actor.name,
            birthYear,
            deathYear,
            actor.cause_of_death,
            model
          )

          if (verification.claudeCause) {
            const storedLower = (actor.cause_of_death || "").toLowerCase().trim()
            const claudeLower = verification.claudeCause.toLowerCase().trim()

            // Check if causes differ meaningfully
            if (
              storedLower !== claudeLower &&
              !storedLower.includes(claudeLower) &&
              !claudeLower.includes(storedLower)
            ) {
              console.log(
                `  ✓ Claude cause: "${verification.claudeCause}" (${verification.confidence})`
              )
              console.log(`    → Discrepancy detected`)

              discrepancies.push({
                tmdbId: actor.tmdb_id,
                name: actor.name,
                storedCause: actor.cause_of_death,
                claudeCause: verification.claudeCause,
                confidence: verification.confidence,
                reasoning: verification.reasoning,
              })

              // Update if Claude has high/medium confidence
              if (verification.confidence === "high" || verification.confidence === "medium") {
                verifiedCause = verification.claudeCause
                causeChanged = true

                if (!dryRun) {
                  await pool.query(
                    `UPDATE actors
                     SET cause_of_death = $1,
                         cause_of_death_source = 'claude',
                         updated_at = CURRENT_TIMESTAMP
                     WHERE tmdb_id = $2`,
                    [verification.claudeCause, actor.tmdb_id]
                  )
                }
                causesUpdated++
                console.log(`  → Cause updated to: "${verification.claudeCause}"`)
              } else {
                console.log(`  → Low confidence, keeping stored cause`)
                causesUnchanged++
              }
            } else {
              console.log(
                `  ✓ Cause confirmed: "${verification.claudeCause}" (${verification.confidence})`
              )
              verifiedCause = verification.claudeCause
              causesUnchanged++
            }
          } else {
            console.log(`  - Claude returned no cause`)
            causesUnchanged++
          }
        }

        // Pass 2: Fetch details
        if (!pass1Only && verifiedCause) {
          const details = await getDeathDetails(
            actor.name,
            birthYear,
            deathYear,
            verifiedCause,
            model
          )

          if (details) {
            const existingDetails = actor.cause_of_death_details
            if (details !== existingDetails) {
              console.log(
                `  ✓ Got details: "${details.substring(0, 70)}${details.length > 70 ? "..." : ""}"`
              )

              if (!dryRun) {
                await pool.query(
                  `UPDATE actors
                   SET cause_of_death_details = $1,
                       cause_of_death_details_source = 'claude',
                       updated_at = CURRENT_TIMESTAMP
                   WHERE tmdb_id = $2`,
                  [details, actor.tmdb_id]
                )
              }
              detailsUpdated++
            } else {
              console.log(`  - Details unchanged`)
              noChange++
            }
          } else {
            // Clear details if we now have a verified cause but no details
            if (actor.cause_of_death_details && causeChanged) {
              console.log(`  - Clearing old details (cause changed)`)
              if (!dryRun) {
                await pool.query(
                  `UPDATE actors
                   SET cause_of_death_details = NULL,
                       cause_of_death_details_source = NULL,
                       updated_at = CURRENT_TIMESTAMP
                   WHERE tmdb_id = $1`,
                  [actor.tmdb_id]
                )
              }
              detailsCleared++
            } else {
              console.log(`  - No additional details available`)
              noChange++
            }
          }
        }

        processed++

        // Save checkpoint after each successful actor (not in dry-run mode)
        if (!dryRun) {
          checkpoint.processedIds.push(actor.tmdb_id)
          checkpoint.stats = {
            processed,
            causesUpdated,
            causesUnchanged,
            detailsUpdated,
            detailsCleared,
            noChange,
            errors,
          }
          saveCheckpoint(checkpoint)
        }

        // Note: Rate limiting is handled by the centralized rate limiter in claude.ts
      } catch (error) {
        console.error(`  ✗ Error: ${error instanceof Error ? error.message : error}`)
        if (error instanceof Error && error.stack) {
          console.error(error.stack)
        }
        errors++

        // Save checkpoint before exiting so we can resume
        if (!dryRun) {
          checkpoint.stats = {
            processed,
            causesUpdated,
            causesUnchanged,
            detailsUpdated,
            detailsCleared,
            noChange,
            errors,
          }
          saveCheckpoint(checkpoint)
          console.log(
            `\nCheckpoint saved. Run again to resume from actor #${checkpoint.processedIds.length + 1}`
          )
        }

        // Exit on first error to prevent data corruption
        throw error
      }
    }

    // Summary
    console.log("\n" + "=".repeat(70))
    console.log("SUMMARY")
    console.log("=".repeat(70))
    console.log(`Total processed:      ${processed}`)
    console.log(`Causes updated:       ${causesUpdated}`)
    console.log(`Causes unchanged:     ${causesUnchanged}`)
    console.log(`Details updated:      ${detailsUpdated}`)
    console.log(`Details cleared:      ${detailsCleared}`)
    console.log(`No change:            ${noChange}`)
    console.log(`Errors:               ${errors}`)

    if (discrepancies.length > 0) {
      console.log(`\nDiscrepancies found:  ${discrepancies.length}`)
      console.log("\n--- DISCREPANCY REPORT ---")
      for (const d of discrepancies) {
        console.log(`\n${d.name} (TMDB ${d.tmdbId})`)
        console.log(`  Stored: ${d.storedCause || "(none)"}`)
        console.log(`  Claude: ${d.claudeCause} (${d.confidence})`)
        if (d.reasoning) {
          console.log(`  Reason: ${d.reasoning}`)
        }
      }
    }

    if (dryRun) {
      console.log("\n(DRY RUN - no changes were made)")
    } else {
      // All done - remove checkpoint file
      deleteCheckpoint()
      console.log("\nAll actors processed successfully. Checkpoint cleared.")
    }

    console.log("=".repeat(70) + "\n")
  } finally {
    await pool.end()
  }
}

program.parse()
