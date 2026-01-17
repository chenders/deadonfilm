/**
 * Failure handling and recovery utilities for Claude Batch API.
 */

import type { Pool } from "pg"
import { applyUpdate } from "./actor-updater.js"
import { stripMarkdownCodeFences, parseClaudeResponse } from "./response-parser.js"
import { createEmptyCheckpoint } from "./schemas.js"

export type FailureErrorType =
  | "json_parse"
  | "date_parse"
  | "validation"
  | "api_error"
  | "expired"
  | "unknown"

/**
 * Store a failed batch response for later reprocessing.
 * This allows us to fix parsing bugs and retry without re-running the batch.
 */
export async function storeFailure(
  db: Pool,
  batchId: string,
  actorId: number,
  customId: string,
  rawResponse: string,
  errorMessage: string,
  errorType: FailureErrorType
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

interface FailureRow {
  id: number
  batch_id: string
  actor_id: number
  custom_id: string
  raw_response: string
  error_type: string
}

interface ReprocessStats {
  total: number
  succeeded: number
  failed: number
}

/**
 * Reprocess failed responses from previous batch runs.
 * This is useful when parsing bugs have been fixed and we want to retry.
 */
export async function reprocessFailures(db: Pool, batchId?: string): Promise<ReprocessStats> {
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

  const result = await db.query<FailureRow>(query, batchId ? [batchId] : [])

  if (result.rows.length === 0) {
    console.log("No unprocessed failures found.")
    return { total: 0, succeeded: 0, failed: 0 }
  }

  console.log(`Found ${result.rows.length} unprocessed failures to retry...`)

  const stats: ReprocessStats = {
    total: result.rows.length,
    succeeded: 0,
    failed: 0,
  }

  const reprocessBatchId = `reprocess-${Date.now()}`

  for (const failure of result.rows) {
    const { id, batch_id: originalBatchId, actor_id: actorId, raw_response: rawResponse } = failure

    try {
      // Try to parse the raw response
      const jsonText = stripMarkdownCodeFences(rawResponse)
      const parsed = parseClaudeResponse(jsonText)

      // Create a minimal checkpoint for applyUpdate
      const checkpoint = createEmptyCheckpoint()
      checkpoint.batchId = originalBatchId

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

  return stats
}
