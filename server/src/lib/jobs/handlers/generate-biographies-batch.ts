/**
 * Batch Biography Generation Handler
 *
 * BullMQ job handler that generates biographies for multiple actors using
 * the Anthropic Message Batches API (50% cost discount).
 *
 * Three phases:
 * 1. Prefetch data: TMDB bios + Wikipedia intros
 * 2. Submit to Anthropic Batches API and poll until complete
 * 3. Process results and save to database
 */

import type { Job } from "bullmq"
import Anthropic from "@anthropic-ai/sdk"
import { getPool } from "../../db.js"
import { batchGetPersonDetails } from "../../tmdb.js"
import { batchFetchWikipediaIntros } from "../../biography/wikipedia-fetcher.js"
import {
  buildBiographyPrompt,
  parseResponse,
  determineSourceUrl,
  BATCH_PRICING,
  MODEL_ID,
  type ActorForBiography,
} from "../../biography/biography-generator.js"
import { invalidateActorCache } from "../../cache.js"
import { BaseJobHandler } from "./base.js"
import {
  JobType,
  QueueName,
  type JobResult,
  type GenerateBiographiesBatchPayload,
} from "../types.js"

// Minimum TMDB biography length to be considered substantial
const MIN_BIOGRAPHY_LENGTH = 50

// Polling interval for Anthropic batch status (30 seconds)
const BATCH_POLL_INTERVAL_MS = 30_000

// Maximum time to wait for batch completion (4 hours)
const BATCH_MAX_WAIT_MS = 4 * 60 * 60 * 1000

interface ActorRow {
  id: number
  tmdb_id: number
  name: string
  wikipedia_url: string | null
  imdb_person_id: string | null
}

interface BatchActorData {
  actor: ActorRow
  tmdbBio: string
  wikipediaBio: string | null
}

interface BatchSummary {
  total: number
  succeeded: number
  failed: number
  skippedNoContent: number
  totalCostUsd: number
  anthropicBatchId: string | null
}

/**
 * Calculate cost using batch pricing (50% discount).
 */
function calculateBatchCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens * BATCH_PRICING.input + outputTokens * BATCH_PRICING.output) / 1_000_000
}

export class GenerateBiographiesBatchHandler extends BaseJobHandler<
  GenerateBiographiesBatchPayload,
  BatchSummary
> {
  readonly jobType = JobType.GENERATE_BIOGRAPHIES_BATCH
  readonly queueName = QueueName.ENRICHMENT

  async process(job: Job<GenerateBiographiesBatchPayload>): Promise<JobResult<BatchSummary>> {
    const log = this.createLogger(job)
    const { actorIds, limit = 100, minPopularity = 0, allowRegeneration = false } = job.data

    log.info(
      { actorIds: actorIds?.length, limit, minPopularity, allowRegeneration },
      "Starting batch biography generation"
    )

    // ================================================================
    // Phase 1: Prefetch data
    // ================================================================
    await job.updateProgress({ phase: "prefetch", message: "Querying actors..." })

    const db = getPool()
    const actors = await this.queryActors(db, { actorIds, limit, minPopularity, allowRegeneration })

    if (actors.length === 0) {
      log.info("No actors to process")
      return {
        success: true,
        data: {
          total: 0,
          succeeded: 0,
          failed: 0,
          skippedNoContent: 0,
          totalCostUsd: 0,
          anthropicBatchId: null,
        },
      }
    }

    await job.updateProgress({
      phase: "prefetch",
      message: `Fetching TMDB and Wikipedia data for ${actors.length} actors...`,
    })

    // Fetch TMDB bios and Wikipedia intros in parallel
    const tmdbIds = actors.map((a) => a.tmdb_id)
    const wikiActors = actors
      .filter((a) => a.wikipedia_url)
      .map((a) => ({ id: a.id, wikipediaUrl: a.wikipedia_url! }))

    const [tmdbResults, wikiResults] = await Promise.all([
      batchGetPersonDetails(tmdbIds),
      wikiActors.length > 0 ? batchFetchWikipediaIntros(wikiActors) : new Map<number, string>(),
    ])

    // Build actor data, filter to those with substantial TMDB bios
    const actorDataList: BatchActorData[] = []
    let skippedNoContent = 0

    for (const actor of actors) {
      const tmdbPerson = tmdbResults.get(actor.tmdb_id)
      const tmdbBio = tmdbPerson?.biography || ""

      // Store raw TMDB bio regardless
      try {
        await db.query(`UPDATE actors SET biography_raw_tmdb = $1 WHERE id = $2`, [
          tmdbBio,
          actor.id,
        ])
      } catch (err) {
        log.warn({ err, actorId: actor.id }, "Failed to save raw TMDB bio")
      }

      if (tmdbBio.trim().length < MIN_BIOGRAPHY_LENGTH) {
        skippedNoContent++
        try {
          await db.query(
            `UPDATE actors SET biography = NULL, biography_source_model = NULL, biography_source_version = NULL, biography_has_content = false, biography_generated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [actor.id]
          )
        } catch (err) {
          log.warn({ err, actorId: actor.id }, "Failed to update no-content flag")
        }
        continue
      }

      actorDataList.push({
        actor,
        tmdbBio,
        wikipediaBio: wikiResults.get(actor.id) || null,
      })
    }

    await job.updateProgress({
      phase: "prefetch",
      message: `Fetched data for ${actorDataList.length} actors (${skippedNoContent} skipped - no content)`,
      actorsWithContent: actorDataList.length,
      skippedNoContent,
    })

    if (actorDataList.length === 0) {
      log.info("No actors with substantial TMDB bios")
      return {
        success: true,
        data: {
          total: actors.length,
          succeeded: 0,
          failed: 0,
          skippedNoContent,
          totalCostUsd: 0,
          anthropicBatchId: null,
        },
      }
    }

    // ================================================================
    // Phase 2: Submit to Anthropic Batches API
    // ================================================================
    const client = new Anthropic()

    const batchRequests = actorDataList.map((data) => ({
      custom_id: `actor-${data.actor.id}`,
      params: {
        model: MODEL_ID,
        max_tokens: 500 as const,
        messages: [
          {
            role: "user" as const,
            content: buildBiographyPrompt(
              data.actor.name,
              data.tmdbBio,
              data.wikipediaBio ?? undefined
            ),
          },
        ],
      },
    }))

    await job.updateProgress({
      phase: "submit",
      message: `Submitting batch of ${batchRequests.length} requests to Anthropic...`,
    })

    log.info({ requestCount: batchRequests.length }, "Submitting to Anthropic Batches API")

    const batch = await client.messages.batches.create({ requests: batchRequests })
    const batchId = batch.id

    log.info({ batchId }, "Anthropic batch created")

    await job.updateProgress({
      phase: "polling",
      message: `Batch ${batchId} submitted, polling for completion...`,
      anthropicBatchId: batchId,
      requestCounts: batch.request_counts,
    })

    // Poll until batch completes
    const startPollTime = Date.now()
    let currentBatch = batch

    while (currentBatch.processing_status !== "ended") {
      if (Date.now() - startPollTime > BATCH_MAX_WAIT_MS) {
        log.error({ batchId }, "Batch timed out waiting for completion")
        // Cancel the batch
        try {
          await client.messages.batches.cancel(batchId)
        } catch (cancelErr) {
          log.warn({ cancelErr, batchId }, "Failed to cancel timed-out batch")
        }
        throw new Error(`Anthropic batch ${batchId} timed out after ${BATCH_MAX_WAIT_MS / 1000}s`)
      }

      await this.delay(BATCH_POLL_INTERVAL_MS)

      currentBatch = await client.messages.batches.retrieve(batchId)

      await job.updateProgress({
        phase: "polling",
        message: `Batch ${batchId}: ${currentBatch.request_counts.succeeded} succeeded, ${currentBatch.request_counts.processing} processing`,
        anthropicBatchId: batchId,
        requestCounts: currentBatch.request_counts,
      })
    }

    log.info({ batchId, requestCounts: currentBatch.request_counts }, "Anthropic batch completed")

    // ================================================================
    // Phase 3: Process results
    // ================================================================
    await job.updateProgress({
      phase: "processing",
      message: "Processing batch results...",
      anthropicBatchId: batchId,
      requestCounts: currentBatch.request_counts,
    })

    // Build a lookup map from actor ID to actor data
    const actorDataMap = new Map<number, BatchActorData>()
    for (const data of actorDataList) {
      actorDataMap.set(data.actor.id, data)
    }

    let succeeded = 0
    let failed = 0
    let totalCostUsd = 0

    const resultsStream = await client.messages.batches.results(batchId)
    for await (const result of resultsStream) {
      const actorIdStr = result.custom_id.replace("actor-", "")
      const actorId = parseInt(actorIdStr, 10)
      const data = actorDataMap.get(actorId)

      if (!data) {
        log.warn({ customId: result.custom_id }, "Result for unknown actor")
        failed++
        continue
      }

      if (result.result.type !== "succeeded") {
        log.warn({ actorId, type: result.result.type }, "Batch request did not succeed")
        failed++
        continue
      }

      try {
        const message = result.result.message
        const responseText = message.content[0].type === "text" ? message.content[0].text : ""
        const { biography, hasSubstantiveContent } = parseResponse(responseText)

        const inputTokens = message.usage.input_tokens
        const outputTokens = message.usage.output_tokens
        const costUsd = calculateBatchCost(inputTokens, outputTokens)
        totalCostUsd += costUsd

        const actorForBio: ActorForBiography = {
          id: data.actor.id,
          name: data.actor.name,
          tmdbId: data.actor.tmdb_id,
          wikipediaUrl: data.actor.wikipedia_url,
          imdbId: data.actor.imdb_person_id,
        }

        const source = determineSourceUrl(actorForBio)

        await db.query(
          `UPDATE actors SET
            biography = $1,
            biography_source_url = $2,
            biography_source_type = $3,
            biography_generated_at = CURRENT_TIMESTAMP,
            biography_raw_tmdb = $4,
            biography_has_content = $5
          WHERE id = $6`,
          [
            biography,
            source?.url || null,
            source?.type || null,
            data.tmdbBio,
            hasSubstantiveContent,
            actorId,
          ]
        )

        // Best-effort cache invalidation
        try {
          await invalidateActorCache(actorId)
        } catch (cacheErr) {
          log.warn({ cacheErr, actorId }, "Failed to invalidate actor cache")
        }

        succeeded++
      } catch (processErr) {
        log.error({ processErr, actorId }, "Failed to process batch result")
        failed++
      }
    }

    const summary: BatchSummary = {
      total: actors.length,
      succeeded,
      failed,
      skippedNoContent,
      totalCostUsd,
      anthropicBatchId: batchId,
    }

    await job.updateProgress({
      phase: "completed",
      message: `Batch complete: ${succeeded} succeeded, ${failed} failed, ${skippedNoContent} skipped`,
      ...summary,
    })

    log.info(summary, "Batch biography generation completed")

    return { success: true, data: summary }
  }

  /**
   * Query actors from database based on job parameters.
   */
  private async queryActors(
    db: ReturnType<typeof getPool>,
    params: {
      actorIds?: number[]
      limit: number
      minPopularity: number
      allowRegeneration: boolean
    }
  ): Promise<ActorRow[]> {
    const { actorIds, limit, minPopularity, allowRegeneration } = params
    const safeLimit = Math.min(limit, 500)
    const biographyFilter = allowRegeneration ? "" : "AND biography IS NULL"

    if (actorIds && actorIds.length > 0) {
      const result = await db.query<ActorRow>(
        `SELECT id, tmdb_id, name, wikipedia_url, imdb_person_id
         FROM actors
         WHERE id = ANY($1::int[])
           AND tmdb_id IS NOT NULL
           ${biographyFilter}
         LIMIT $2`,
        [actorIds, safeLimit]
      )
      return result.rows
    }

    const queryParams: (number | string)[] = []
    let paramIndex = 1
    let popularityClause = ""

    if (minPopularity > 0) {
      popularityClause = `AND COALESCE(dof_popularity, 0) >= $${paramIndex++}`
      queryParams.push(minPopularity)
    }

    queryParams.push(safeLimit)

    const result = await db.query<ActorRow>(
      `SELECT id, tmdb_id, name, wikipedia_url, imdb_person_id
       FROM actors
       WHERE tmdb_id IS NOT NULL
         ${biographyFilter}
         ${popularityClause}
       ORDER BY COALESCE(dof_popularity, 0) DESC
       LIMIT $${paramIndex}`,
      queryParams
    )
    return result.rows
  }
}
