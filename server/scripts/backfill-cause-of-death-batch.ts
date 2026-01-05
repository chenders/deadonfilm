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
    updatedManner: number
    updatedCategories: number
    updatedCircumstances: number
    createdCircumstancesRecord: number
  }
}

interface ActorToProcess {
  id: number
  tmdb_id: number
  name: string
  // PostgreSQL returns Date objects for date columns, but they might also be strings
  // if the data comes from a different source or is normalized elsewhere
  birthday: Date | string | null
  deathday: Date | string // Deceased actors always have a deathday
  cause_of_death: string | null
  cause_of_death_details: string | null
}

interface SourceEntry {
  url: string | null
  archive_url: string | null
  description: string
}

interface ProjectInfo {
  title: string
  year: number | null
  tmdb_id: number | null
  imdb_id: string | null
  type: "movie" | "show" | "documentary" | "unknown"
}

interface RelatedCelebrity {
  name: string
  tmdb_id: number | null
  relationship: string
}

type ConfidenceLevel = "high" | "medium" | "low" | "disputed"
type DeathManner = "natural" | "accident" | "suicide" | "homicide" | "undetermined" | "pending"
type CareerStatus = "active" | "semi-retired" | "retired" | "hiatus" | "unknown"

interface ClaudeResponse {
  // Core death info
  cause: string | null
  cause_confidence: ConfidenceLevel | null
  details: string | null
  details_confidence: ConfidenceLevel | null

  // Categorization
  manner: DeathManner | null
  categories: string[] | null
  covid_related: boolean | null
  strange_death: boolean | null

  // Circumstances
  circumstances: string | null
  circumstances_confidence: ConfidenceLevel | null
  rumored_circumstances: string | null
  notable_factors: string[] | null

  // Date confidence
  birthday_confidence: ConfidenceLevel | null
  deathday_confidence: ConfidenceLevel | null

  // Career context
  location_of_death: string | null
  last_project: ProjectInfo | null
  career_status_at_death: CareerStatus | null
  posthumous_releases: ProjectInfo[] | null

  // Related celebrities
  related_celebrities: RelatedCelebrity[] | null

  // Sources (per-field)
  sources: {
    cause?: SourceEntry[]
    birthday?: SourceEntry[]
    deathday?: SourceEntry[]
    circumstances?: SourceEntry[]
    rumored?: SourceEntry[]
  } | null

  // Additional context
  additional_context: string | null

  // Date corrections (legacy support)
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

/**
 * Store a failed batch response for later reprocessing.
 * This allows us to fix parsing bugs and retry without re-running the batch.
 */
export async function storeFailure(
  db: ReturnType<typeof getPool>,
  batchId: string,
  actorId: number,
  customId: string,
  rawResponse: string,
  errorMessage: string,
  errorType: "json_parse" | "date_parse" | "validation" | "api_error" | "expired" | "unknown"
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO batch_response_failures
       (batch_id, actor_id, custom_id, raw_response, error_message, error_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [batchId, actorId, customId, rawResponse, errorMessage, errorType]
    )
  } catch (err) {
    // Log but don't fail - storing the failure shouldn't prevent processing
    console.error(`Failed to store failure record for actor ${actorId}:`, err)
  }
}

/**
 * Strips markdown code fences from JSON text.
 * Claude sometimes wraps JSON responses in ```json ... ```
 */
export function stripMarkdownCodeFences(text: string): string {
  let jsonText = text.trim()
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
  return jsonText
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

/**
 * Safely normalizes a date value to YYYY-MM-DD string format.
 * Handles:
 * - Date objects (from PostgreSQL)
 * - Strings in YYYY-MM-DD format
 * - Strings that are just a year (YYYY) -> converts to YYYY-01-01
 * - null/undefined values
 *
 * @param value - Date object, string, null, or undefined
 * @returns YYYY-MM-DD string or null if invalid/empty
 */
export function normalizeDateToString(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null
  }

  // Handle Date objects from PostgreSQL
  if (value instanceof Date) {
    if (isNaN(value.getTime())) {
      return null // Invalid date
    }
    // Use UTC methods to avoid timezone shifts
    const year = value.getUTCFullYear()
    const month = String(value.getUTCMonth() + 1).padStart(2, "0")
    const day = String(value.getUTCDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }

  // Handle strings
  const str = String(value).trim()
  if (!str) {
    return null
  }

  // Already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str
  }

  // Year-only format (YYYY) - validate reasonable year range
  if (/^\d{4}$/.test(str)) {
    const year = Number(str)
    if (year < 1800 || year > 2100) {
      return null
    }
    return `${str}-01-01`
  }

  // Year-month format (YYYY-MM) - validate month range
  if (/^\d{4}-\d{2}$/.test(str)) {
    const monthNum = Number(str.slice(5, 7))
    if (monthNum < 1 || monthNum > 12) {
      return null
    }
    return `${str}-01`
  }

  // Try parsing as a date string and normalizing
  const parsed = new Date(str)
  if (!isNaN(parsed.getTime())) {
    const year = parsed.getUTCFullYear()
    const month = String(parsed.getUTCMonth() + 1).padStart(2, "0")
    const day = String(parsed.getUTCDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }

  return null
}

/**
 * Safely extracts year from a date value.
 * @returns Year as number, or null if invalid/empty
 */
export function getYearFromDate(value: Date | string | null | undefined): number | null {
  const normalized = normalizeDateToString(value)
  if (!normalized) {
    return null
  }
  const year = parseInt(normalized.split("-")[0], 10)
  return isNaN(year) ? null : year
}

/**
 * Safely extracts month and day from a date value.
 * Handles partial dates (year-only, year+month).
 *
 * @returns Object with month and day (nullable if partial date), or null if invalid input
 *
 * Examples:
 * - Date object "1945-06-15" → { month: "06", day: "15" }
 * - "1945-06-15" → { month: "06", day: "15" }
 * - "1945-06" → { month: "06", day: null }
 * - "1945" → { month: null, day: null }
 * - null → null
 */
export function getMonthDayFromDate(
  value: Date | string | null | undefined
): { month: string | null; day: string | null } | null {
  if (value === null || value === undefined) {
    return null
  }

  // Handle Date objects - always have full precision
  if (value instanceof Date) {
    if (isNaN(value.getTime())) {
      return null
    }
    const month = String(value.getUTCMonth() + 1).padStart(2, "0")
    const day = String(value.getUTCDate()).padStart(2, "0")
    return { month, day }
  }

  // Handle strings - check for partial formats
  const str = String(value).trim()
  if (!str) {
    return null
  }

  // Year-only format (YYYY)
  if (/^\d{4}$/.test(str)) {
    return { month: null, day: null }
  }

  // Year-month format (YYYY-MM)
  if (/^\d{4}-\d{2}$/.test(str)) {
    return { month: str.split("-")[1], day: null }
  }

  // Full date format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const parts = str.split("-")
    return { month: parts[1], day: parts[2] }
  }

  // Try parsing as a date string
  const parsed = new Date(str)
  if (!isNaN(parsed.getTime())) {
    const month = String(parsed.getUTCMonth() + 1).padStart(2, "0")
    const day = String(parsed.getUTCDate()).padStart(2, "0")
    return { month, day }
  }

  return null
}

function getBirthYear(birthday: Date | string | null | undefined): number | null {
  return getYearFromDate(birthday)
}

function getDeathYear(deathday: Date | string | null | undefined): number | null {
  return getYearFromDate(deathday)
}

function buildPrompt(actor: ActorToProcess): string {
  const birthYear = getBirthYear(actor.birthday)
  const deathYear = getDeathYear(actor.deathday)
  const birthInfo = birthYear ? `born ${birthYear}, ` : ""

  return `Research the death of ${actor.name} (${birthInfo}died ${deathYear}), an actor/entertainer.

Return a JSON object with these fields:

**Core Death Info:**
- cause: specific medical cause (e.g., "pancreatic cancer", "heart failure", "drowning") or null if unknown
- cause_confidence: "high" | "medium" | "low" | "disputed" - how well-documented is the cause
- details: 2-4 sentences of medical/circumstantial context about their death, or null
- details_confidence: confidence level for details

**Categorization:**
- manner: "natural" | "accident" | "suicide" | "homicide" | "undetermined" | "pending" - medical examiner classification
- categories: array of contributing factors, e.g. ["cancer"], ["heart_disease", "diabetes"], ["vehicle_accident", "fire"], ["overdose"]
- covid_related: true/false if COVID was a factor
- strange_death: true if death was unusual/notable beyond cause (dramatic circumstances, suspicious, controversial)

**Circumstances:**
- circumstances: Detailed narrative of how death occurred (official account). Be thorough - location, timeline, who was present, how discovered, hospital/hospice care, etc.
- circumstances_confidence: confidence level for circumstances
- rumored_circumstances: Any alternative accounts, rumors, disputed information, or theories that differ from official account. Include industry cover-up allegations if any. Null if none.
- notable_factors: array of tags like ["vehicle_crash", "fire", "drowning", "public_incident", "substance_involvement", "celebrity_involvement", "controversial", "possible_coverup", "reopened_investigation", "on_set", "workplace"]

**Date Confidence:**
- birthday_confidence: how confident is the birth date
- deathday_confidence: how confident is the death date

**Career Context:**
- location_of_death: city/state/country where they died
- last_project: {"title": "...", "year": 2022, "tmdb_id": 123, "imdb_id": "tt123", "type": "movie|show"} - their last released work (prefer tmdb_id, include imdb_id as fallback)
- career_status_at_death: "active" | "semi-retired" | "retired" | "hiatus" | "unknown"
- posthumous_releases: array of projects released after death, same format as last_project

**Related Celebrities:**
- related_celebrities: array of celebrities involved in or connected to their death. Format: [{"name": "...", "tmdb_id": 123, "relationship": "description of connection to death"}]. Include ex-partners who spoke publicly, people present at death, co-stars from fatal incidents, etc.

**Sources:**
- sources: object with arrays of sources per field. Format: {"cause": [{"url": "...", "archive_url": "web.archive.org/...", "description": "..."}], "birthday": [...], "deathday": [...], "circumstances": [...], "rumored": [...]}
  - Include archive.org URLs when available
  - Include official sources (medical examiner, coroner, death certificate)
  - Include news sources with dates

**Additional:**
- additional_context: Any notable background that provides context (career significance, historical importance, impact of death). Null if standard death.
- corrections: {"birthYear": 1945, "deathYear": 2020, "deathDate": "2020-03-15"} if our dates are wrong, else null

**Confidence Levels:**
- high: Official records, medical examiner, multiple reliable sources
- medium: Reliable news sources, family statements, consistent reports
- low: Single source, tabloid, unverified
- disputed: Conflicting official accounts, contested, ongoing investigation

Respond with valid JSON only. Be thorough in circumstances and details - capture as much information as possible.`
}

function createBatchRequest(
  actor: ActorToProcess
): Anthropic.Messages.Batches.BatchCreateParams.Request {
  return {
    custom_id: `actor-${actor.id}`,
    params: {
      model: MODEL_ID,
      max_tokens: 2000, // Increased for comprehensive death info response
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
        updatedManner: 0,
        updatedCategories: 0,
        updatedCircumstances: 0,
        createdCircumstancesRecord: 0,
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
        updatedManner: 0,
        updatedCategories: 0,
        updatedCircumstances: 0,
        createdCircumstancesRecord: 0,
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
          const jsonText = stripMarkdownCodeFences(responseText)

          let parsed: ClaudeResponse
          try {
            parsed = JSON.parse(jsonText) as ClaudeResponse
          } catch (jsonError) {
            const errorMsg = jsonError instanceof Error ? jsonError.message : "JSON parse error"
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
              await storeFailure(
                db,
                batchId,
                actorId,
                customId,
                responseText,
                errorMsg,
                "date_parse"
              )
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
  checkpoint: Checkpoint,
  rawResponse?: string
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const values: any[] = []
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

  // Update death_manner if provided
  if (parsed.manner) {
    updates.push(`death_manner = $${paramIndex++}`)
    values.push(parsed.manner)
    checkpoint.stats.updatedManner++
  }

  // Update death_categories if provided
  if (parsed.categories && parsed.categories.length > 0) {
    updates.push(`death_categories = $${paramIndex++}`)
    values.push(parsed.categories)
    checkpoint.stats.updatedCategories++
  }

  // Update covid_related if provided
  if (parsed.covid_related !== null && parsed.covid_related !== undefined) {
    updates.push(`covid_related = $${paramIndex++}`)
    values.push(parsed.covid_related)
  }

  // Update strange_death if provided
  if (parsed.strange_death !== null && parsed.strange_death !== undefined) {
    updates.push(`strange_death = $${paramIndex++}`)
    values.push(parsed.strange_death)
  }

  // Determine if actor has detailed death info (for dedicated death page)
  const hasDetailedDeathInfo =
    parsed.strange_death === true ||
    parsed.circumstances_confidence === "disputed" ||
    (parsed.notable_factors && parsed.notable_factors.length > 0) ||
    (parsed.rumored_circumstances !== null && parsed.rumored_circumstances !== "") ||
    (parsed.related_celebrities && parsed.related_celebrities.length > 0)

  if (hasDetailedDeathInfo) {
    updates.push(`has_detailed_death_info = $${paramIndex++}`)
    values.push(true)
  }

  // Handle date corrections
  if (parsed.corrections) {
    // Birthday correction
    if (parsed.corrections.birthYear) {
      const currentBirthYear = getYearFromDate(actor.birthday)
      if (currentBirthYear !== parsed.corrections.birthYear) {
        // Create a new birthday with corrected year, keeping month/day if available
        let newBirthday: string
        const monthDay = getMonthDayFromDate(actor.birthday)
        if (monthDay && monthDay.month && monthDay.day) {
          newBirthday = `${parsed.corrections.birthYear}-${monthDay.month}-${monthDay.day}`
        } else if (monthDay && monthDay.month) {
          // Year+month only - preserve month, default day to 01
          newBirthday = `${parsed.corrections.birthYear}-${monthDay.month}-01`
        } else {
          // Year only or no existing date - default to 01-01
          newBirthday = `${parsed.corrections.birthYear}-01-01`
        }
        updates.push(`birthday = $${paramIndex++}`)
        values.push(newBirthday)
        historyEntries.push({
          field: "birthday",
          oldValue: normalizeDateToString(actor.birthday),
          newValue: newBirthday,
        })
        checkpoint.stats.updatedBirthday++
      }
    }

    // Deathday correction
    if (parsed.corrections.deathDate || parsed.corrections.deathYear) {
      const normalizedOldDeathday = normalizeDateToString(actor.deathday)
      let newDeathday: string
      if (parsed.corrections.deathDate) {
        newDeathday = parsed.corrections.deathDate
      } else if (parsed.corrections.deathYear) {
        const currentDeathYear = getYearFromDate(actor.deathday)
        if (currentDeathYear !== parsed.corrections.deathYear) {
          // Create new deathday with corrected year, keeping month/day if available
          const monthDay = getMonthDayFromDate(actor.deathday)
          if (monthDay && monthDay.month && monthDay.day) {
            newDeathday = `${parsed.corrections.deathYear}-${monthDay.month}-${monthDay.day}`
          } else if (monthDay && monthDay.month) {
            newDeathday = `${parsed.corrections.deathYear}-${monthDay.month}-01`
          } else {
            newDeathday = `${parsed.corrections.deathYear}-01-01`
          }
        } else {
          newDeathday = normalizedOldDeathday || `${parsed.corrections.deathYear}-01-01`
        }
      } else {
        newDeathday = normalizedOldDeathday || ""
      }

      if (newDeathday && newDeathday !== normalizedOldDeathday) {
        updates.push(`deathday = $${paramIndex++}`)
        values.push(newDeathday)
        historyEntries.push({
          field: "deathday",
          oldValue: normalizedOldDeathday,
          newValue: newDeathday,
        })
        checkpoint.stats.updatedDeathday++
      }
    }
  }

  // Apply actor table updates if any
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

  // Create/update actor_death_circumstances record if we have detailed info
  const hasCircumstancesData =
    parsed.circumstances ||
    parsed.rumored_circumstances ||
    parsed.location_of_death ||
    parsed.last_project ||
    parsed.posthumous_releases ||
    parsed.related_celebrities ||
    parsed.notable_factors ||
    parsed.sources ||
    parsed.additional_context ||
    rawResponse

  if (hasCircumstancesData) {
    // Extract tmdb_ids from related_celebrities for the indexed array column
    const relatedCelebrityIds = parsed.related_celebrities
      ?.map((c) => c.tmdb_id)
      .filter((id): id is number => id !== undefined && id !== null)

    await db.query(
      `INSERT INTO actor_death_circumstances (
        actor_id,
        circumstances,
        circumstances_confidence,
        rumored_circumstances,
        cause_confidence,
        details_confidence,
        birthday_confidence,
        deathday_confidence,
        location_of_death,
        last_project,
        career_status_at_death,
        posthumous_releases,
        related_celebrity_ids,
        related_celebrities,
        additional_context,
        notable_factors,
        sources,
        raw_response,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW())
      ON CONFLICT (actor_id) DO UPDATE SET
        circumstances = COALESCE(EXCLUDED.circumstances, actor_death_circumstances.circumstances),
        circumstances_confidence = COALESCE(EXCLUDED.circumstances_confidence, actor_death_circumstances.circumstances_confidence),
        rumored_circumstances = COALESCE(EXCLUDED.rumored_circumstances, actor_death_circumstances.rumored_circumstances),
        cause_confidence = COALESCE(EXCLUDED.cause_confidence, actor_death_circumstances.cause_confidence),
        details_confidence = COALESCE(EXCLUDED.details_confidence, actor_death_circumstances.details_confidence),
        birthday_confidence = COALESCE(EXCLUDED.birthday_confidence, actor_death_circumstances.birthday_confidence),
        deathday_confidence = COALESCE(EXCLUDED.deathday_confidence, actor_death_circumstances.deathday_confidence),
        location_of_death = COALESCE(EXCLUDED.location_of_death, actor_death_circumstances.location_of_death),
        last_project = COALESCE(EXCLUDED.last_project, actor_death_circumstances.last_project),
        career_status_at_death = COALESCE(EXCLUDED.career_status_at_death, actor_death_circumstances.career_status_at_death),
        posthumous_releases = COALESCE(EXCLUDED.posthumous_releases, actor_death_circumstances.posthumous_releases),
        related_celebrity_ids = COALESCE(EXCLUDED.related_celebrity_ids, actor_death_circumstances.related_celebrity_ids),
        related_celebrities = COALESCE(EXCLUDED.related_celebrities, actor_death_circumstances.related_celebrities),
        additional_context = COALESCE(EXCLUDED.additional_context, actor_death_circumstances.additional_context),
        notable_factors = COALESCE(EXCLUDED.notable_factors, actor_death_circumstances.notable_factors),
        sources = COALESCE(EXCLUDED.sources, actor_death_circumstances.sources),
        raw_response = COALESCE(EXCLUDED.raw_response, actor_death_circumstances.raw_response),
        updated_at = NOW()`,
      [
        actorId,
        parsed.circumstances,
        parsed.circumstances_confidence,
        parsed.rumored_circumstances,
        parsed.cause_confidence,
        parsed.details_confidence,
        parsed.birthday_confidence,
        parsed.deathday_confidence,
        parsed.location_of_death,
        parsed.last_project ? JSON.stringify(parsed.last_project) : null,
        parsed.career_status_at_death,
        parsed.posthumous_releases ? JSON.stringify(parsed.posthumous_releases) : null,
        relatedCelebrityIds && relatedCelebrityIds.length > 0 ? relatedCelebrityIds : null,
        parsed.related_celebrities ? JSON.stringify(parsed.related_celebrities) : null,
        parsed.additional_context,
        parsed.notable_factors,
        parsed.sources ? JSON.stringify(parsed.sources) : null,
        rawResponse
          ? JSON.stringify({ response: rawResponse, parsed_at: new Date().toISOString() })
          : null,
      ]
    )

    if (parsed.circumstances) {
      checkpoint.stats.updatedCircumstances++
    }
    checkpoint.stats.createdCircumstancesRecord++
  }
}

/**
 * Reprocess failed responses from previous batch runs.
 * This is useful when parsing bugs have been fixed and we want to retry.
 */
async function reprocessFailures(batchId?: string): Promise<void> {
  const db = getPool()

  try {
    // Get unprocessed failures
    const query = batchId
      ? `SELECT id, batch_id, actor_id, custom_id, raw_response, error_type
         FROM batch_response_failures
         WHERE reprocessed_at IS NULL AND batch_id = $1
         ORDER BY created_at`
      : `SELECT id, batch_id, actor_id, custom_id, raw_response, error_type
         FROM batch_response_failures
         WHERE reprocessed_at IS NULL
         ORDER BY created_at`

    const result = await db.query<{
      id: number
      batch_id: string
      actor_id: number
      custom_id: string
      raw_response: string
      error_type: string
    }>(query, batchId ? [batchId] : [])

    if (result.rows.length === 0) {
      console.log("No unprocessed failures found.")
      return
    }

    console.log(`Found ${result.rows.length} unprocessed failures to retry...`)

    const stats = {
      total: result.rows.length,
      succeeded: 0,
      failed: 0,
    }

    const reprocessBatchId = `reprocess-${Date.now()}`

    for (const failure of result.rows) {
      const {
        id,
        batch_id: originalBatchId,
        actor_id: actorId,
        raw_response: rawResponse,
      } = failure

      try {
        // Try to parse the raw response
        const jsonText = stripMarkdownCodeFences(rawResponse)
        const parsed = JSON.parse(jsonText) as ClaudeResponse

        // Create a minimal checkpoint for applyUpdate
        const checkpoint: Checkpoint = {
          batchId: originalBatchId,
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
            updatedManner: 0,
            updatedCategories: 0,
            updatedCircumstances: 0,
            createdCircumstancesRecord: 0,
            updatedBirthday: 0,
            updatedDeathday: 0,
          },
        }

        // Apply the update
        await applyUpdate(db, actorId, parsed, originalBatchId, checkpoint, rawResponse)

        // Mark as reprocessed
        await db.query(
          `UPDATE batch_response_failures
           SET reprocessed_at = NOW(), reprocessed_batch_id = $1
           WHERE id = $2`,
          [reprocessBatchId, id]
        )

        stats.succeeded++
        console.log(`✓ Actor ${actorId}: Successfully reprocessed`)
      } catch (error) {
        stats.failed++
        const errorMsg = error instanceof Error ? error.message : "Unknown error"
        console.error(`✗ Actor ${actorId}: ${errorMsg}`)
      }
    }

    console.log("\nReprocessing complete:")
    console.log(`  Total:     ${stats.total}`)
    console.log(`  Succeeded: ${stats.succeeded}`)
    console.log(`  Failed:    ${stats.failed}`)
  } finally {
    await db.end()
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

program
  .command("reprocess")
  .description("Retry parsing failed responses after code fixes")
  .option("-b, --batch-id <id>", "Only reprocess failures from specific batch")
  .action(async (options) => {
    await reprocessFailures(options.batchId)
  })

// Only run when executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  program.parse()
}
