/**
 * Core batch operations for Claude Batch API.
 * Includes submitBatch, checkStatus, and processResults.
 */

import Anthropic from "@anthropic-ai/sdk"
import type { Pool } from "pg"
import {
  loadCheckpoint as loadCheckpointGeneric,
  saveCheckpoint as saveCheckpointGeneric,
  deleteCheckpoint as deleteCheckpointGeneric,
} from "../checkpoint-utils.js"
import { recordCustomEvent } from "../newrelic.js"
import { rebuildDeathCaches } from "../cache.js"
import { MODEL_ID, DEFAULT_CHECKPOINT_FILE } from "./constants.js"
import { createBatchRequest } from "./prompt-builder.js"
import { parseClaudeResponse, stripMarkdownCodeFences, repairJson } from "./response-parser.js"
import { applyUpdate } from "./actor-updater.js"
import { storeFailure } from "./failure-recovery.js"
import {
  createEmptyCheckpoint,
  type Checkpoint,
  type ActorToProcess,
  type ClaudeResponse,
} from "./schemas.js"

// Re-export checkpoint utilities with default file path
export function loadCheckpoint(filePath: string = DEFAULT_CHECKPOINT_FILE): Checkpoint | null {
  return loadCheckpointGeneric<Checkpoint>(filePath)
}

export function saveCheckpoint(
  checkpoint: Checkpoint,
  filePath: string = DEFAULT_CHECKPOINT_FILE
): void {
  saveCheckpointGeneric(filePath, checkpoint, (cp) => {
    cp.lastUpdated = new Date().toISOString()
  })
}

export function deleteCheckpoint(filePath: string = DEFAULT_CHECKPOINT_FILE): void {
  deleteCheckpointGeneric(filePath)
}

export interface SubmitBatchOptions {
  limit?: number
  dryRun?: boolean
  fresh?: boolean
  tmdbId?: number
  missingDetailsFlag?: boolean
}

/**
 * Build the SQL query for actors to process.
 * Exported for testing.
 */
export function buildActorQuery(options: SubmitBatchOptions): {
  query: string
  params: (number | null)[]
} {
  const { limit, tmdbId, missingDetailsFlag } = options
  const params: (number | null)[] = []
  let query: string

  if (tmdbId) {
    // Target a specific actor by TMDB ID (re-process even if they have data)
    params.push(tmdbId)
    query = `
      SELECT id, tmdb_id, name, birthday, deathday, cause_of_death, cause_of_death_details
      FROM actors
      WHERE tmdb_id = $1
        AND deathday IS NOT NULL
    `
  } else if (missingDetailsFlag) {
    // Re-process actors who have cause/details but missing has_detailed_death_info flag
    query = `
      SELECT id, tmdb_id, name, birthday, deathday, cause_of_death, cause_of_death_details
      FROM actors
      WHERE deathday IS NOT NULL
        AND cause_of_death IS NOT NULL
        AND cause_of_death_details IS NOT NULL
        AND has_detailed_death_info IS NULL
      ORDER BY popularity DESC NULLS LAST
    `

    if (limit) {
      params.push(limit)
      query += ` LIMIT $${params.length}`
    }
  } else {
    // Default: query actors missing cause_of_death OR cause_of_death_details
    query = `
      SELECT id, tmdb_id, name, birthday, deathday, cause_of_death, cause_of_death_details
      FROM actors
      WHERE deathday IS NOT NULL
        AND (cause_of_death IS NULL OR cause_of_death_details IS NULL)
      ORDER BY popularity DESC NULLS LAST
    `

    if (limit) {
      params.push(limit)
      query += ` LIMIT $${params.length}`
    }
  }

  return { query, params }
}

/**
 * Submit a batch of actors to the Claude Batch API.
 */
export async function submitBatch(
  db: Pool,
  options: SubmitBatchOptions
): Promise<{ batchId: string | null; submitted: number }> {
  const { dryRun, fresh, tmdbId, missingDetailsFlag } = options

  // Load or create checkpoint
  let checkpoint: Checkpoint | null = null
  if (!fresh && !dryRun) {
    checkpoint = loadCheckpoint()
    if (checkpoint?.batchId) {
      console.log(`\nExisting batch in progress: ${checkpoint.batchId}`)
      console.log("Use 'status' or 'process' commands to check/process it")
      console.log("Or use --fresh to start a new batch")
      return { batchId: checkpoint.batchId, submitted: 0 }
    }
  }

  if (!checkpoint) {
    checkpoint = createEmptyCheckpoint()
  }

  // Log query type
  if (tmdbId) {
    console.log(`\nQuerying actor with TMDB ID ${tmdbId}...`)
  } else if (missingDetailsFlag) {
    console.log(`\nQuerying actors with cause of death but missing has_detailed_death_info flag...`)
  } else {
    console.log(`\nQuerying actors missing cause of death info...`)
  }

  // Query actors to process
  const { query, params } = buildActorQuery(options)
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
    return { batchId: null, submitted: 0 }
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

    return { batchId: null, submitted: actorsToProcess.length }
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

    return { batchId: batch.id, submitted: actorsToProcess.length }
  } catch (error) {
    recordCustomEvent("CauseOfDeathBatchError", {
      operation: "submit",
      error: error instanceof Error ? error.message : "Unknown error",
    })
    throw error
  }
}

/**
 * Check the status of a batch.
 */
export async function checkBatchStatus(
  batchId: string
): Promise<Anthropic.Messages.Batches.MessageBatch> {
  const anthropic = new Anthropic()
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

  return batch
}

/**
 * Process results from a completed batch.
 */
export async function processResults(
  db: Pool | null,
  batchId: string,
  dryRun: boolean = false
): Promise<Checkpoint> {
  const anthropic = new Anthropic()

  // Load checkpoint
  let checkpoint = loadCheckpoint()
  if (!checkpoint) {
    checkpoint = createEmptyCheckpoint()
    checkpoint.batchId = batchId
  }

  const processedSet = new Set(checkpoint.processedActorIds)

  console.log(`\nProcessing results for batch: ${batchId}${dryRun ? " (DRY RUN)" : ""}`)
  if (processedSet.size > 0) {
    console.log(`Resuming... ${processedSet.size} already processed`)
  }

  // Check batch status first
  const batch = await anthropic.messages.batches.retrieve(batchId)
  if (batch.processing_status !== "ended") {
    console.log(`\nBatch is still ${batch.processing_status}. Please wait for it to complete.`)
    return checkpoint
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
        // parseClaudeResponse handles markdown stripping, jsonrepair, and Zod validation
        let parsed: ClaudeResponse
        try {
          parsed = parseClaudeResponse(responseText)
        } catch (parseError) {
          // parseClaudeResponse failed (jsonrepair + Zod validation)
          // Try legacy repairJson as a last resort for edge cases jsonrepair misses
          const jsonText = stripMarkdownCodeFences(responseText)
          const repairedJson = repairJson(jsonText)
          try {
            parsed = JSON.parse(repairedJson) as ClaudeResponse
            console.log(`  [Repaired JSON for actor ${actorId} using legacy repair]`)
          } catch {
            const errorMsg = parseError instanceof Error ? parseError.message : "JSON parse error"
            console.error(`JSON parse error for actor ${actorId}: ${errorMsg}`)
            if (db) {
              await storeFailure(
                db,
                batchId,
                actorId,
                customId,
                responseText,
                errorMsg,
                "json_parse"
              )
            }
            checkpoint.stats.errored++
            continue
          }
        }

        if (dryRun) {
          console.log(`\n[${processed}] Actor ${actorId}:`)
          console.log(`  Cause: ${parsed.cause || "(none)"} (${parsed.cause_confidence || "?"})`)
          console.log(`  Manner: ${parsed.manner || "(none)"}`)
          console.log(`  Categories: ${parsed.categories?.join(", ") || "(none)"}`)
          console.log(`  Details: ${parsed.details?.substring(0, 80) || "(none)"}...`)
          console.log(`  Circumstances: ${parsed.circumstances?.substring(0, 80) || "(none)"}...`)
          if (parsed.rumored_circumstances) {
            console.log(`  Rumored: ${parsed.rumored_circumstances.substring(0, 60)}...`)
          }
          if (parsed.strange_death) {
            console.log(`  Strange death: YES`)
          }
          if (parsed.notable_factors && parsed.notable_factors.length > 0) {
            console.log(`  Notable factors: ${parsed.notable_factors.join(", ")}`)
          }
          if (parsed.corrections) {
            console.log(`  Corrections: ${JSON.stringify(parsed.corrections)}`)
          }
        } else if (db) {
          try {
            await applyUpdate(db, actorId, parsed, batchId, checkpoint, responseText)
          } catch (updateError) {
            const errorMsg = updateError instanceof Error ? updateError.message : "Update error"
            console.error(`Update error for actor ${actorId}: ${errorMsg}`)
            await storeFailure(db, batchId, actorId, customId, responseText, errorMsg, "date_parse")
            checkpoint.stats.errored++
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error"
        console.error(`Unexpected error for actor ${actorId}: ${errorMsg}`)
        if (db) {
          await storeFailure(db, batchId, actorId, customId, responseText, errorMsg, "unknown")
        }
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
  console.log(`  Death manner: ${checkpoint.stats.updatedManner}`)
  console.log(`  Death categories: ${checkpoint.stats.updatedCategories}`)
  console.log(`  Circumstances: ${checkpoint.stats.updatedCircumstances}`)
  console.log(`  Circumstances records: ${checkpoint.stats.createdCircumstancesRecord}`)
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
      updatedManner: checkpoint.stats.updatedManner,
      updatedCategories: checkpoint.stats.updatedCategories,
      updatedCircumstances: checkpoint.stats.updatedCircumstances,
      createdCircumstancesRecord: checkpoint.stats.createdCircumstancesRecord,
      updatedBirthday: checkpoint.stats.updatedBirthday,
      updatedDeathday: checkpoint.stats.updatedDeathday,
    })

    // Rebuild death caches so lists reflect updated cause_of_death data
    if (checkpoint.stats.updatedCause > 0 || checkpoint.stats.updatedDetails > 0) {
      await rebuildDeathCaches()
      console.log("\nRebuilt death caches")
    }
  }

  // Clean up checkpoint if fully processed
  if (!dryRun && checkpoint.stats.errored === 0 && checkpoint.stats.expired === 0) {
    console.log("\nAll results processed successfully. Cleaning up checkpoint.")
    deleteCheckpoint()
  }

  return checkpoint
}
