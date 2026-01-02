#!/usr/bin/env tsx
/**
 * Backfill cause of death information using Claude Opus 4.5 Batch API.
 *
 * This script uses the Message Batches API for 50% cost savings and handles:
 * - Actors missing cause_of_death
 * - Actors missing cause_of_death_details
 * - Date corrections (birthday, deathday)
 *
 * The script operates in three modes:
 * - submit: Create and submit a new batch
 * - status: Check status of a running batch
 * - process: Process results from a completed batch
 *
 * Checkpoint support ensures you can resume if the script is interrupted.
 *
 * Usage:
 *   npm run backfill:cause-of-death-batch -- submit [options]
 *   npm run backfill:cause-of-death-batch -- status --batch-id <id>
 *   npm run backfill:cause-of-death-batch -- process --batch-id <id>
 *
 * Options:
 *   --limit <n>        Limit number of actors to process
 *   --dry-run          Preview without submitting batch
 *   --fresh            Start fresh (ignore checkpoint)
 *   --batch-id <id>    Batch ID for status/process commands
 *
 * Examples:
 *   npm run backfill:cause-of-death-batch -- submit --limit 100 --dry-run
 *   npm run backfill:cause-of-death-batch -- submit
 *   npm run backfill:cause-of-death-batch -- status --batch-id msgbatch_xxx
 *   npm run backfill:cause-of-death-batch -- process --batch-id msgbatch_xxx
 */

import "dotenv/config"
import path from "path"
import Anthropic from "@anthropic-ai/sdk"
import { Command, InvalidArgumentError } from "commander"
import { getPool, resetPool } from "../src/lib/db.js"
import {
  loadCheckpoint as loadCheckpointGeneric,
  saveCheckpoint as saveCheckpointGeneric,
  deleteCheckpoint as deleteCheckpointGeneric,
} from "../src/lib/checkpoint-utils.js"
import { initNewRelic, recordCustomEvent } from "../src/lib/newrelic.js"

// Initialize New Relic for monitoring
initNewRelic()

// Checkpoint file to track progress
const CHECKPOINT_FILE = path.join(process.cwd(), ".backfill-cause-of-death-batch-checkpoint.json")

const MODEL_ID = "claude-opus-4-5-20251101"
const SOURCE_NAME = "claude-opus-4.5-batch"

export interface Checkpoint {
  batchId: string | null
  processedActorIds: number[]
  startedAt: string
  lastUpdated: string
  stats: {
    submitted: number
    succeeded: number
    errored: number
    expired: number
    updatedCause: number
    updatedDetails: number
    updatedBirthday: number
    updatedDeathday: number
  }
}

interface ActorToProcess {
  id: number
  tmdb_id: number
  name: string
  birthday: string | null
  deathday: string
  cause_of_death: string | null
  cause_of_death_details: string | null
}

interface ClaudeResponse {
  cause: string | null
  details: string | null
  corrections: {
    birthYear?: number
    deathYear?: number
    deathDate?: string
  } | null
}

export function loadCheckpoint(filePath: string = CHECKPOINT_FILE): Checkpoint | null {
  return loadCheckpointGeneric<Checkpoint>(filePath)
}

export function saveCheckpoint(checkpoint: Checkpoint, filePath: string = CHECKPOINT_FILE): void {
  saveCheckpointGeneric(filePath, checkpoint, (cp) => {
    cp.lastUpdated = new Date().toISOString()
  })
}

export function deleteCheckpoint(filePath: string = CHECKPOINT_FILE): void {
  deleteCheckpointGeneric(filePath)
}

export function parsePositiveInt(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  const parsed = parseInt(value, 10)
  if (parsed <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return parsed
}

function getBirthYear(birthday: string | null): number | null {
  if (!birthday) return null
  const date = new Date(birthday)
  return date.getFullYear()
}

function getDeathYear(deathday: string): number {
  const date = new Date(deathday)
  return date.getFullYear()
}

function buildPrompt(actor: ActorToProcess): string {
  const birthYear = getBirthYear(actor.birthday)
  const deathYear = getDeathYear(actor.deathday)
  const birthInfo = birthYear ? `born ${birthYear}, ` : ""

  return `What was the cause of death for ${actor.name} (${birthInfo}died ${deathYear})?

Return JSON with these fields:
- cause: specific medical cause (e.g., "heart failure", "pancreatic cancer") or null if unknown
- details: 1-2 sentences of medical context about their death, or null if no additional info
- corrections: object with corrected birthYear, deathYear, or deathDate (YYYY-MM-DD) if our data is wrong, or null

Rules:
- Be specific (e.g., "pancreatic cancer" not "cancer")
- Details = medical circumstances only (duration of illness, complications, etc.)
- No family/career/tribute info in details
- Only include corrections if you're confident our dates are wrong

Respond with valid JSON only.`
}

function createBatchRequest(
  actor: ActorToProcess
): Anthropic.Messages.Batches.BatchCreateParams.Request {
  return {
    custom_id: `actor-${actor.id}`,
    params: {
      model: MODEL_ID,
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: buildPrompt(actor),
        },
      ],
    },
  }
}

async function submitBatch(options: {
  limit?: number
  dryRun?: boolean
  fresh?: boolean
}): Promise<void> {
  const { limit, dryRun, fresh } = options

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  if (!process.env.ANTHROPIC_API_KEY && !dryRun) {
    console.error("ANTHROPIC_API_KEY environment variable is required")
    process.exit(1)
  }

  const db = getPool()

  // Load or create checkpoint
  let checkpoint: Checkpoint | null = null
  if (!fresh && !dryRun) {
    checkpoint = loadCheckpoint()
    if (checkpoint?.batchId) {
      console.log(`\nExisting batch in progress: ${checkpoint.batchId}`)
      console.log("Use 'status' or 'process' commands to check/process it")
      console.log("Or use --fresh to start a new batch")
      await resetPool()
      return
    }
  }

  if (!checkpoint) {
    checkpoint = {
      batchId: null,
      processedActorIds: [],
      startedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      stats: {
        submitted: 0,
        succeeded: 0,
        errored: 0,
        expired: 0,
        updatedCause: 0,
        updatedDetails: 0,
        updatedBirthday: 0,
        updatedDeathday: 0,
      },
    }
  }

  console.log(`\nQuerying actors missing cause of death info...`)

  // Query actors missing cause_of_death OR cause_of_death_details
  let query = `
    SELECT id, tmdb_id, name, birthday, deathday, cause_of_death, cause_of_death_details
    FROM actors
    WHERE deathday IS NOT NULL
      AND (cause_of_death IS NULL OR cause_of_death_details IS NULL)
    ORDER BY popularity DESC NULLS LAST
  `

  const params: number[] = []
  if (limit) {
    params.push(limit)
    query += ` LIMIT $${params.length}`
  }

  const result = await db.query<ActorToProcess>(query, params)
  const actors = result.rows

  // Filter out already processed actors
  const processedSet = new Set(checkpoint.processedActorIds)
  const actorsToProcess = actors.filter((a) => !processedSet.has(a.id))

  console.log(`Found ${actors.length} actors needing updates`)
  if (actors.length !== actorsToProcess.length) {
    console.log(`Skipping ${actors.length - actorsToProcess.length} already processed`)
  }
  console.log(`Will submit ${actorsToProcess.length} actors to batch${dryRun ? " (DRY RUN)" : ""}`)

  if (actorsToProcess.length === 0) {
    console.log("\nNo actors to process. Done!")
    await resetPool()
    return
  }

  // Build batch requests
  const requests = actorsToProcess.map((actor) => createBatchRequest(actor))

  if (dryRun) {
    console.log("\n--- Sample requests (first 3) ---")
    for (const req of requests.slice(0, 3)) {
      console.log(`\nCustom ID: ${req.custom_id}`)
      console.log(`Prompt: ${(req.params.messages[0].content as string).substring(0, 200)}...`)
    }

    // Estimate cost
    const avgInputTokens = 100 // Rough estimate per request
    const avgOutputTokens = 150
    const inputCost = (actorsToProcess.length * avgInputTokens * 2.5) / 1_000_000
    const outputCost = (actorsToProcess.length * avgOutputTokens * 12.5) / 1_000_000
    console.log(`\n--- Cost Estimate (Opus 4.5 Batch) ---`)
    console.log(
      `Input: ~${(actorsToProcess.length * avgInputTokens).toLocaleString()} tokens = $${inputCost.toFixed(2)}`
    )
    console.log(
      `Output: ~${(actorsToProcess.length * avgOutputTokens).toLocaleString()} tokens = $${outputCost.toFixed(2)}`
    )
    console.log(`Total: ~$${(inputCost + outputCost).toFixed(2)}`)

    await resetPool()
    return
  }

  // Submit batch to Anthropic
  console.log("\nSubmitting batch to Anthropic...")
  const anthropic = new Anthropic()

  try {
    const batch = await anthropic.messages.batches.create({
      requests,
    })

    console.log(`\nBatch created successfully!`)
    console.log(`Batch ID: ${batch.id}`)
    console.log(`Status: ${batch.processing_status}`)
    console.log(`Requests: ${batch.request_counts.processing} processing`)

    // Record batch submission event
    recordCustomEvent("CauseOfDeathBatchSubmitted", {
      batchId: batch.id,
      actorCount: actorsToProcess.length,
      model: MODEL_ID,
    })

    // Save checkpoint with batch ID
    checkpoint.batchId = batch.id
    checkpoint.stats.submitted = actorsToProcess.length
    saveCheckpoint(checkpoint)

    console.log(`\nCheckpoint saved. Use these commands to check progress:`)
    console.log(`  npm run backfill:cause-of-death-batch -- status --batch-id ${batch.id}`)
    console.log(`  npm run backfill:cause-of-death-batch -- process --batch-id ${batch.id}`)
  } catch (error) {
    recordCustomEvent("CauseOfDeathBatchError", {
      operation: "submit",
      error: error instanceof Error ? error.message : "Unknown error",
    })
    console.error("Error submitting batch:", error)
    process.exit(1)
  }

  await resetPool()
}

async function checkStatus(batchId: string): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY environment variable is required")
    process.exit(1)
  }

  const anthropic = new Anthropic()

  try {
    const batch = await anthropic.messages.batches.retrieve(batchId)

    console.log(`\nBatch Status: ${batchId}`)
    console.log(`Processing Status: ${batch.processing_status}`)
    console.log(`\nRequest Counts:`)
    console.log(`  Processing: ${batch.request_counts.processing}`)
    console.log(`  Succeeded: ${batch.request_counts.succeeded}`)
    console.log(`  Errored: ${batch.request_counts.errored}`)
    console.log(`  Canceled: ${batch.request_counts.canceled}`)
    console.log(`  Expired: ${batch.request_counts.expired}`)
    console.log(`\nCreated: ${batch.created_at}`)
    console.log(`Expires: ${batch.expires_at}`)
    if (batch.ended_at) {
      console.log(`Ended: ${batch.ended_at}`)
    }
    if (batch.results_url) {
      console.log(`\nResults available! Run:`)
      console.log(`  npm run backfill:cause-of-death-batch -- process --batch-id ${batchId}`)
    }
  } catch (error) {
    console.error("Error checking batch status:", error)
    process.exit(1)
  }
}

async function processResults(batchId: string, dryRun: boolean = false): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY environment variable is required")
    process.exit(1)
  }

  if (!process.env.DATABASE_URL && !dryRun) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  const anthropic = new Anthropic()
  const db = dryRun ? null : getPool()

  // Load checkpoint
  let checkpoint = loadCheckpoint()
  if (!checkpoint) {
    checkpoint = {
      batchId,
      processedActorIds: [],
      startedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      stats: {
        submitted: 0,
        succeeded: 0,
        errored: 0,
        expired: 0,
        updatedCause: 0,
        updatedDetails: 0,
        updatedBirthday: 0,
        updatedDeathday: 0,
      },
    }
  }

  const processedSet = new Set(checkpoint.processedActorIds)

  console.log(`\nProcessing results for batch: ${batchId}${dryRun ? " (DRY RUN)" : ""}`)
  if (processedSet.size > 0) {
    console.log(`Resuming... ${processedSet.size} already processed`)
  }

  try {
    // Check batch status first
    const batch = await anthropic.messages.batches.retrieve(batchId)
    if (batch.processing_status !== "ended") {
      console.log(`\nBatch is still ${batch.processing_status}. Please wait for it to complete.`)
      return
    }

    console.log(
      `\nBatch completed. Processing ${batch.request_counts.succeeded} succeeded results...`
    )

    let processed = 0
    let skipped = 0

    // Stream results
    for await (const result of await anthropic.messages.batches.results(batchId)) {
      const customId = result.custom_id
      const actorId = parseInt(customId.replace("actor-", ""), 10)

      // Skip if already processed
      if (processedSet.has(actorId)) {
        skipped++
        continue
      }

      processed++

      if (result.result.type === "succeeded") {
        checkpoint.stats.succeeded++

        // Parse the response
        const message = result.result.message
        const responseText = message.content[0].type === "text" ? message.content[0].text : ""

        try {
          // Strip markdown code fences if present (Claude sometimes wraps JSON in ```json ... ```)
          let jsonText = responseText.trim()
          if (jsonText.startsWith("```")) {
            // Extract content between code fences, ignoring any text after closing fence
            const match = jsonText.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```/)
            if (match) {
              jsonText = match[1].trim()
            } else {
              // Fallback: just strip opening fence if no closing fence found
              jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, "").trim()
            }
          }

          const parsed = JSON.parse(jsonText) as ClaudeResponse

          if (dryRun) {
            console.log(`\n[${processed}] Actor ${actorId}:`)
            console.log(`  Cause: ${parsed.cause || "(none)"}`)
            console.log(`  Details: ${parsed.details?.substring(0, 60) || "(none)"}...`)
            if (parsed.corrections) {
              console.log(`  Corrections: ${JSON.stringify(parsed.corrections)}`)
            }
          } else if (db) {
            await applyUpdate(db, actorId, parsed, batchId, checkpoint)
          }
        } catch (error) {
          console.error(`Failed to parse response for actor ${actorId}:`, responseText, error)
          checkpoint.stats.errored++
        }
      } else if (result.result.type === "errored") {
        checkpoint.stats.errored++
        console.error(`Error for actor ${actorId}:`, result.result.error)
      } else if (result.result.type === "expired") {
        checkpoint.stats.expired++
        console.log(`Request expired for actor ${actorId}`)
      }

      // Mark as processed and save checkpoint
      checkpoint.processedActorIds.push(actorId)
      if (!dryRun && processed % 100 === 0) {
        saveCheckpoint(checkpoint)
        console.log(`Processed ${processed} results...`)
      }
    }

    // Final save
    if (!dryRun) {
      saveCheckpoint(checkpoint)
    }

    console.log(`\n--- Summary ---`)
    console.log(`Processed: ${processed}`)
    console.log(`Skipped (already done): ${skipped}`)
    console.log(`Succeeded: ${checkpoint.stats.succeeded}`)
    console.log(`Errored: ${checkpoint.stats.errored}`)
    console.log(`Expired: ${checkpoint.stats.expired}`)
    console.log(`\nUpdates applied:`)
    console.log(`  Cause of death: ${checkpoint.stats.updatedCause}`)
    console.log(`  Details: ${checkpoint.stats.updatedDetails}`)
    console.log(`  Birthday corrections: ${checkpoint.stats.updatedBirthday}`)
    console.log(`  Deathday corrections: ${checkpoint.stats.updatedDeathday}`)

    // Record batch processing completion
    if (!dryRun) {
      recordCustomEvent("CauseOfDeathBatchProcessed", {
        batchId,
        processed,
        succeeded: checkpoint.stats.succeeded,
        errored: checkpoint.stats.errored,
        expired: checkpoint.stats.expired,
        updatedCause: checkpoint.stats.updatedCause,
        updatedDetails: checkpoint.stats.updatedDetails,
        updatedBirthday: checkpoint.stats.updatedBirthday,
        updatedDeathday: checkpoint.stats.updatedDeathday,
      })
    }

    // Clean up checkpoint if fully processed
    if (!dryRun && checkpoint.stats.errored === 0 && checkpoint.stats.expired === 0) {
      console.log("\nAll results processed successfully. Cleaning up checkpoint.")
      deleteCheckpoint()
    }
  } catch (error) {
    recordCustomEvent("CauseOfDeathBatchError", {
      operation: "process",
      batchId,
      error: error instanceof Error ? error.message : "Unknown error",
    })
    console.error("Error processing results:", error)
    process.exit(1)
  }

  if (db) {
    await resetPool()
  }
}

async function applyUpdate(
  db: ReturnType<typeof getPool>,
  actorId: number,
  parsed: ClaudeResponse,
  batchId: string,
  checkpoint: Checkpoint
): Promise<void> {
  // Get current actor data
  const actorResult = await db.query<ActorToProcess>(
    "SELECT id, name, birthday, deathday, cause_of_death, cause_of_death_details FROM actors WHERE id = $1",
    [actorId]
  )

  if (actorResult.rows.length === 0) {
    console.error(`Actor ${actorId} not found in database`)
    return
  }

  const actor = actorResult.rows[0]
  const updates: string[] = []
  const values: (string | number | null)[] = []
  const historyEntries: Array<{
    field: string
    oldValue: string | null
    newValue: string | null
  }> = []

  let paramIndex = 1

  // Update cause_of_death if we have a new one and actor doesn't have one
  if (parsed.cause && !actor.cause_of_death) {
    updates.push(`cause_of_death = $${paramIndex++}`)
    values.push(parsed.cause)
    updates.push(`cause_of_death_source = $${paramIndex++}`)
    values.push(SOURCE_NAME)
    historyEntries.push({
      field: "cause_of_death",
      oldValue: actor.cause_of_death,
      newValue: parsed.cause,
    })
    checkpoint.stats.updatedCause++
  }

  // Update details if we have new ones and actor doesn't have them
  if (parsed.details && !actor.cause_of_death_details) {
    updates.push(`cause_of_death_details = $${paramIndex++}`)
    values.push(parsed.details)
    updates.push(`cause_of_death_details_source = $${paramIndex++}`)
    values.push(SOURCE_NAME)
    historyEntries.push({
      field: "cause_of_death_details",
      oldValue: actor.cause_of_death_details,
      newValue: parsed.details,
    })
    checkpoint.stats.updatedDetails++
  }

  // Handle date corrections
  if (parsed.corrections) {
    // Birthday correction
    if (parsed.corrections.birthYear) {
      // Parse year directly from YYYY-MM-DD string to avoid timezone issues
      const currentBirthYear = actor.birthday ? parseInt(actor.birthday.split("-")[0], 10) : null
      if (currentBirthYear !== parsed.corrections.birthYear) {
        // Create a new birthday with corrected year, keeping month/day if available
        let newBirthday: string
        if (actor.birthday) {
          // Replace year in YYYY-MM-DD string directly to avoid timezone issues
          const [, month, day] = actor.birthday.split("-")
          newBirthday = `${parsed.corrections.birthYear}-${month}-${day}`
        } else {
          newBirthday = `${parsed.corrections.birthYear}-01-01`
        }
        updates.push(`birthday = $${paramIndex++}`)
        values.push(newBirthday)
        historyEntries.push({
          field: "birthday",
          oldValue: actor.birthday,
          newValue: newBirthday,
        })
        checkpoint.stats.updatedBirthday++
      }
    }

    // Deathday correction
    if (parsed.corrections.deathDate || parsed.corrections.deathYear) {
      let newDeathday: string
      if (parsed.corrections.deathDate) {
        newDeathday = parsed.corrections.deathDate
      } else if (parsed.corrections.deathYear) {
        // Parse year directly from YYYY-MM-DD string to avoid timezone issues
        const currentDeathYear = parseInt(actor.deathday.split("-")[0], 10)
        if (currentDeathYear !== parsed.corrections.deathYear) {
          // Replace year in YYYY-MM-DD string directly to avoid timezone issues
          const [, month, day] = actor.deathday.split("-")
          newDeathday = `${parsed.corrections.deathYear}-${month}-${day}`
        } else {
          newDeathday = actor.deathday
        }
      } else {
        newDeathday = actor.deathday
      }

      if (newDeathday !== actor.deathday) {
        updates.push(`deathday = $${paramIndex++}`)
        values.push(newDeathday)
        historyEntries.push({
          field: "deathday",
          oldValue: actor.deathday,
          newValue: newDeathday,
        })
        checkpoint.stats.updatedDeathday++
      }
    }
  }

  // Apply updates if any
  if (updates.length > 0) {
    updates.push(`updated_at = NOW()`)
    values.push(actorId)

    await db.query(`UPDATE actors SET ${updates.join(", ")} WHERE id = $${paramIndex}`, values)

    // Record history
    for (const entry of historyEntries) {
      await db.query(
        `INSERT INTO actor_death_info_history
         (actor_id, field_name, old_value, new_value, source, batch_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [actorId, entry.field, entry.oldValue, entry.newValue, SOURCE_NAME, batchId]
      )
    }
  }
}

// CLI setup
const program = new Command()
  .name("backfill-cause-of-death-batch")
  .description("Backfill cause of death info using Claude Opus 4.5 Batch API")

program
  .command("submit")
  .description("Create and submit a new batch")
  .option("-l, --limit <number>", "Limit number of actors to process", parsePositiveInt)
  .option("-n, --dry-run", "Preview without submitting batch")
  .option("--fresh", "Start fresh (ignore checkpoint)")
  .action(async (options) => {
    await submitBatch(options)
  })

program
  .command("status")
  .description("Check status of a batch")
  .requiredOption("-b, --batch-id <id>", "Batch ID to check")
  .action(async (options) => {
    await checkStatus(options.batchId)
  })

program
  .command("process")
  .description("Process results from a completed batch")
  .requiredOption("-b, --batch-id <id>", "Batch ID to process")
  .option("-n, --dry-run", "Preview without writing to database")
  .action(async (options) => {
    await processResults(options.batchId, options.dryRun)
  })

// Only run when executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  program.parse()
}
