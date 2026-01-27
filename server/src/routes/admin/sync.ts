/**
 * Admin TMDB sync management endpoints.
 *
 * Provides tools to monitor and trigger TMDB sync operations.
 */

import { Request, Response, Router } from "express"
import { getPool } from "../../lib/db/pool.js"
import { logger } from "../../lib/logger.js"
import { acquireLock, releaseLock, getLockHolder } from "../../lib/redis.js"
import { runSync, type SyncOptions, type SyncResult } from "../../../scripts/sync-tmdb-changes.js"

const router = Router()

// Redis lock name for TMDB sync operations
const SYNC_LOCK_NAME = "sync:tmdb"
// Lock TTL: 30 minutes (sync operations can take a while, but not forever)
const SYNC_LOCK_TTL_MS = 30 * 60 * 1000

// ============================================================================
// GET /admin/api/sync/status
// Get current sync status and last sync info
// ============================================================================

router.get("/status", async (_req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()

    // Get last completed sync
    const lastSyncResult = await pool.query<{
      id: number
      sync_type: string
      completed_at: string
      items_checked: number
      items_updated: number
      new_deaths_found: number
      status: string
    }>(`
      SELECT id, sync_type, completed_at, items_checked, items_updated, new_deaths_found, status
      FROM sync_history
      WHERE status = 'completed'
      ORDER BY completed_at DESC
      LIMIT 1
    `)

    const lastSync = lastSyncResult.rows[0] || null

    // Check if there's a running sync
    const runningResult = await pool.query<{ id: number; sync_type: string; started_at: string }>(`
      SELECT id, sync_type, started_at
      FROM sync_history
      WHERE status = 'running'
      ORDER BY started_at DESC
      LIMIT 1
    `)

    const runningSyncRecord = runningResult.rows[0] || null

    res.json({
      lastSync: lastSync
        ? {
            type: lastSync.sync_type,
            completedAt: lastSync.completed_at,
            itemsChecked: lastSync.items_checked,
            itemsUpdated: lastSync.items_updated,
            newDeathsFound: lastSync.new_deaths_found,
          }
        : null,
      isRunning: runningSyncRecord !== null,
      currentSyncId: runningSyncRecord?.id || null,
      currentSyncStartedAt: runningSyncRecord?.started_at || null,
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch sync status")
    res.status(500).json({ error: { message: "Failed to fetch sync status" } })
  }
})

// ============================================================================
// GET /admin/api/sync/history
// Get recent sync history
// ============================================================================

interface SyncHistoryQuery {
  limit?: string
}

router.get("/history", async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit = "20" } = req.query as SyncHistoryQuery
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20))

    const pool = getPool()

    const result = await pool.query<{
      id: number
      sync_type: string
      started_at: string
      completed_at: string | null
      status: string
      items_checked: number
      items_updated: number
      new_deaths_found: number
      error_message: string | null
      parameters: Record<string, unknown> | null
      triggered_by: string | null
    }>(
      `
      SELECT id, sync_type, started_at, completed_at, status,
             items_checked, items_updated, new_deaths_found,
             error_message, parameters, triggered_by
      FROM sync_history
      ORDER BY started_at DESC
      LIMIT $1
    `,
      [limitNum]
    )

    res.json({
      history: result.rows.map((row) => ({
        id: row.id,
        syncType: row.sync_type,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        status: row.status,
        itemsChecked: row.items_checked,
        itemsUpdated: row.items_updated,
        newDeathsFound: row.new_deaths_found,
        errorMessage: row.error_message,
        parameters: row.parameters,
        triggeredBy: row.triggered_by,
      })),
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch sync history")
    res.status(500).json({ error: { message: "Failed to fetch sync history" } })
  }
})

// ============================================================================
// POST /admin/api/sync/tmdb
// Trigger a TMDB sync operation
// ============================================================================

interface TriggerSyncRequest {
  days?: number
  types?: ("people" | "movies" | "shows")[]
  dryRun?: boolean
}

router.post("/tmdb", async (req: Request, res: Response): Promise<void> => {
  let syncId: number | null = null
  let lockAcquired = false

  try {
    const { days = 1, types, dryRun = false } = req.body as TriggerSyncRequest

    // Check if there's already a running sync using Redis distributed lock
    const currentLockHolder = await getLockHolder(SYNC_LOCK_NAME)
    if (currentLockHolder !== null) {
      res.status(409).json({
        error: { message: "A sync operation is already running" },
        currentSyncId: parseInt(currentLockHolder, 10) || null,
      })
      return
    }

    const pool = getPool()

    // Determine sync type string
    let syncType: string
    const peopleOnly = types?.length === 1 && types[0] === "people"
    const moviesOnly = types?.length === 1 && types[0] === "movies"
    const showsOnly = types?.length === 1 && types[0] === "shows"

    if (peopleOnly) syncType = "tmdb-people"
    else if (moviesOnly) syncType = "tmdb-movies"
    else if (showsOnly) syncType = "tmdb-shows"
    else syncType = "tmdb-all"

    // Create sync history record
    const insertResult = await pool.query<{ id: number }>(
      `
      INSERT INTO sync_history (sync_type, status, parameters, triggered_by)
      VALUES ($1, 'running', $2, 'admin')
      RETURNING id
    `,
      [syncType, JSON.stringify({ days, types, dryRun })]
    )

    syncId = insertResult.rows[0].id

    // Acquire distributed lock with sync ID as the value
    lockAcquired = await acquireLock(SYNC_LOCK_NAME, String(syncId), SYNC_LOCK_TTL_MS)
    if (!lockAcquired) {
      // Another process acquired the lock between our check and acquire
      // Mark this sync as failed since we can't run it
      await pool.query(
        `UPDATE sync_history SET status = 'failed', completed_at = NOW(),
         error_message = 'Lock acquisition failed - another sync started concurrently'
         WHERE id = $1`,
        [syncId]
      )
      res.status(409).json({
        error: {
          message: "A sync operation is already running (lock acquired by another process)",
        },
      })
      return
    }

    logger.info({ syncId, syncType, days, dryRun }, "TMDB sync triggered via admin")

    // Return immediately - sync will run in background
    res.json({
      syncId,
      message: dryRun ? "Sync preview started" : "Sync started",
      syncType,
      days,
      dryRun,
    })

    // Run sync in background
    const syncOptions: SyncOptions = {
      days,
      dryRun,
      peopleOnly,
      moviesOnly,
      showsOnly,
      quiet: true, // Suppress console output since we're running in background
    }

    // Capture syncId for the async closure
    const currentSyncId = syncId

    runSync(syncOptions)
      .then(async (result: SyncResult) => {
        // Update sync history with results
        await pool.query(
          `
          UPDATE sync_history SET
            completed_at = NOW(),
            status = 'completed',
            items_checked = $1,
            items_updated = $2,
            new_deaths_found = $3
          WHERE id = $4
        `,
          [
            result.peopleChecked + result.moviesChecked + result.showsChecked,
            result.moviesUpdated + result.newEpisodesFound,
            result.newDeathsFound,
            currentSyncId,
          ]
        )
        logger.info({ syncId: currentSyncId, result }, "TMDB sync completed")
      })
      .catch(async (error) => {
        // Update sync history with error
        await pool.query(
          `
          UPDATE sync_history SET
            completed_at = NOW(),
            status = 'failed',
            error_message = $1
          WHERE id = $2
        `,
          [error instanceof Error ? error.message : String(error), currentSyncId]
        )
        logger.error({ syncId: currentSyncId, error }, "TMDB sync failed")
      })
      .finally(async () => {
        // Release the distributed lock
        await releaseLock(SYNC_LOCK_NAME, String(currentSyncId))
      })
  } catch (error) {
    // Release lock if we acquired it and encountered an error before starting sync
    if (lockAcquired && syncId !== null) {
      await releaseLock(SYNC_LOCK_NAME, String(syncId))
    }
    logger.error({ error }, "Failed to trigger TMDB sync")
    res.status(500).json({ error: { message: "Failed to trigger TMDB sync" } })
  }
})

// ============================================================================
// GET /admin/api/sync/:id
// Get status of a specific sync operation
// ============================================================================

router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const syncId = parseInt(req.params.id, 10)

    if (isNaN(syncId)) {
      res.status(400).json({ error: { message: "Invalid sync ID" } })
      return
    }

    const pool = getPool()

    const result = await pool.query<{
      id: number
      sync_type: string
      started_at: string
      completed_at: string | null
      status: string
      items_checked: number
      items_updated: number
      new_deaths_found: number
      error_message: string | null
      parameters: Record<string, unknown> | null
      triggered_by: string | null
    }>(
      `
      SELECT id, sync_type, started_at, completed_at, status,
             items_checked, items_updated, new_deaths_found,
             error_message, parameters, triggered_by
      FROM sync_history
      WHERE id = $1
    `,
      [syncId]
    )

    if (result.rows.length === 0) {
      res.status(404).json({ error: { message: "Sync not found" } })
      return
    }

    const row = result.rows[0]

    res.json({
      id: row.id,
      syncType: row.sync_type,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      status: row.status,
      itemsChecked: row.items_checked,
      itemsUpdated: row.items_updated,
      newDeathsFound: row.new_deaths_found,
      errorMessage: row.error_message,
      parameters: row.parameters,
      triggeredBy: row.triggered_by,
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch sync details")
    res.status(500).json({ error: { message: "Failed to fetch sync details" } })
  }
})

export default router
