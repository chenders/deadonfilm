/**
 * Admin data quality management endpoints.
 *
 * Provides tools to identify and fix data quality issues:
 * - Future/invalid death dates
 * - Uncertain death information
 * - Enrichment data reset
 */

import { Request, Response, Router } from "express"
import { getPool } from "../../lib/db/pool.js"
import { logger } from "../../lib/logger.js"
import { invalidateActorCache, rebuildDeathCaches } from "../../lib/cache.js"

const router = Router()

// Patterns that indicate uncertainty in death information
// Using word boundaries (\y in PostgreSQL) to prevent false positives
// e.g., "alive" won't match "survived" but will match "is alive"
const UNCERTAINTY_PATTERNS = [
  "\\ycannot verify\\y",
  "\\ycannot confirm\\y",
  "\\ymay contain incorrect\\y",
  "\\ybeyond my knowledge\\y",
  "\\ystill alive\\y",
  "\\ywas alive\\y",
  "\\yhave not died\\y",
  "\\yhas not died\\y",
  "\\yhaven't died\\y",
  "\\yhasn't died\\y",
  "\\yno confirmed\\y",
  "\\ynot confirmed\\y",
  "\\yunable to confirm\\y",
  "\\yunable to verify\\y",
  "\\yincorrect information\\y",
  "\\ymay be incorrect\\y",
  "\\yappears to be alive\\y",
  "\\yis still alive\\y",
  "\\yreportedly alive\\y",
]

// ============================================================================
// GET /admin/api/data-quality/overview
// Get overview statistics for data quality issues
// ============================================================================

router.get("/overview", async (_req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()

    // Count actors with future death dates or death before birth
    const futureDeathsResult = await pool.query<{ count: number }>(`
      SELECT COUNT(*)::int as count
      FROM actors
      WHERE deathday IS NOT NULL
        AND (
          deathday > CURRENT_DATE
          OR (birthday IS NOT NULL AND deathday < birthday)
        )
    `)

    // Count actors with uncertain death information
    const pattern = UNCERTAINTY_PATTERNS.join("|")
    const uncertainDeathsResult = await pool.query<{ count: number }>(
      `
      SELECT COUNT(DISTINCT a.id)::int as count
      FROM actors a
      JOIN actor_death_circumstances adc ON a.id = adc.actor_id
      WHERE
        adc.circumstances ~* $1
        OR adc.rumored_circumstances ~* $1
        OR adc.additional_context ~* $1
        OR adc.raw_response::text ~* $1
    `,
      [pattern]
    )

    // Count actors with enrichment data that can be reset
    const pendingResetResult = await pool.query<{ count: number }>(`
      SELECT COUNT(DISTINCT a.id)::int as count
      FROM actors a
      INNER JOIN actor_death_info_history h ON h.actor_id = a.id
      WHERE a.has_detailed_death_info IS NOT NULL
    `)

    res.json({
      futureDeathsCount: futureDeathsResult.rows[0]?.count ?? 0,
      uncertainDeathsCount: uncertainDeathsResult.rows[0]?.count ?? 0,
      pendingResetCount: pendingResetResult.rows[0]?.count ?? 0,
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch data quality overview")
    res.status(500).json({ error: { message: "Failed to fetch data quality overview" } })
  }
})

// ============================================================================
// GET /admin/api/data-quality/future-deaths
// Get actors with future or invalid death dates
// ============================================================================

interface FutureDeathsQuery {
  page?: string
  pageSize?: string
}

router.get("/future-deaths", async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = "1", pageSize = "50" } = req.query as FutureDeathsQuery
    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 50))
    const offset = (pageNum - 1) * limit

    const pool = getPool()

    // Get total count
    const countResult = await pool.query<{ count: number }>(`
      SELECT COUNT(*)::int as count
      FROM actors
      WHERE deathday IS NOT NULL
        AND (
          deathday > CURRENT_DATE
          OR (birthday IS NOT NULL AND deathday < birthday)
        )
    `)
    const total = countResult.rows[0]?.count ?? 0

    // Get paginated actors
    const result = await pool.query<{
      id: number
      name: string
      tmdb_id: number | null
      deathday: string
      birthday: string | null
      popularity: number | null
      issue_type: string
    }>(
      `
      SELECT
        id,
        name,
        tmdb_id,
        deathday,
        birthday,
        tmdb_popularity::float as popularity,
        CASE
          WHEN deathday > CURRENT_DATE THEN 'future_date'
          WHEN birthday IS NOT NULL AND deathday < birthday THEN 'before_birth'
          ELSE 'unknown'
        END as issue_type
      FROM actors
      WHERE deathday IS NOT NULL
        AND (
          deathday > CURRENT_DATE
          OR (birthday IS NOT NULL AND deathday < birthday)
        )
      ORDER BY
        CASE WHEN deathday > CURRENT_DATE THEN 0 ELSE 1 END,
        deathday DESC
      LIMIT $1 OFFSET $2
    `,
      [limit, offset]
    )

    res.json({
      total,
      page: pageNum,
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
      actors: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        tmdbId: row.tmdb_id,
        deathDate: row.deathday,
        birthDate: row.birthday,
        popularity: row.popularity,
        issueType: row.issue_type,
      })),
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch future deaths")
    res.status(500).json({ error: { message: "Failed to fetch future deaths" } })
  }
})

// ============================================================================
// POST /admin/api/data-quality/cleanup-future-deaths
// Clean up actors with future or invalid death dates
// ============================================================================

interface CleanupFutureDeathsRequest {
  dryRun?: boolean
  actorIds?: number[]
}

router.post("/cleanup-future-deaths", async (req: Request, res: Response): Promise<void> => {
  try {
    const { dryRun = false, actorIds } = req.body as CleanupFutureDeathsRequest
    const pool = getPool()
    const startTime = Date.now()

    // Build query based on whether specific actor IDs are provided
    let query: string
    let params: (number | number[])[] = []

    if (actorIds && actorIds.length > 0) {
      // Validate that provided IDs actually have issues
      query = `
        SELECT id, name
        FROM actors
        WHERE id = ANY($1)
          AND deathday IS NOT NULL
          AND (
            deathday > CURRENT_DATE
            OR (birthday IS NOT NULL AND deathday < birthday)
          )
      `
      params = [actorIds]
    } else {
      // Get all actors with issues
      query = `
        SELECT id, name
        FROM actors
        WHERE deathday IS NOT NULL
          AND (
            deathday > CURRENT_DATE
            OR (birthday IS NOT NULL AND deathday < birthday)
          )
      `
    }

    const affectedResult = await pool.query<{ id: number; name: string }>(query, params)
    const affectedActors = affectedResult.rows

    if (dryRun) {
      res.json({
        dryRun: true,
        wouldClean: affectedActors.length,
        actorIds: affectedActors.map((a) => a.id),
        actors: affectedActors.map((a) => ({ id: a.id, name: a.name })),
        duration: Date.now() - startTime,
      })
      return
    }

    if (affectedActors.length === 0) {
      res.json({
        cleaned: 0,
        actorIds: [],
        duration: Date.now() - startTime,
      })
      return
    }

    const idsToClean = affectedActors.map((a) => a.id)

    // Clear death-related fields
    const updateResult = await pool.query(
      `
      UPDATE actors SET
        deathday = NULL,
        cause_of_death = NULL,
        cause_of_death_details = NULL,
        cause_of_death_source = NULL,
        years_lost = NULL,
        age_at_death = NULL,
        updated_at = NOW()
      WHERE id = ANY($1)
    `,
      [idsToClean]
    )

    // Invalidate caches for affected actors
    for (const actorId of idsToClean) {
      try {
        await invalidateActorCache(actorId)
      } catch (err) {
        logger.warn({ err, actorId }, "Failed to invalidate actor cache")
      }
    }

    // Rebuild death caches
    try {
      await rebuildDeathCaches()
    } catch (err) {
      logger.warn({ err }, "Failed to rebuild death caches")
    }

    logger.info({ count: updateResult.rowCount, actorIds: idsToClean }, "Cleaned future death data")

    res.json({
      cleaned: updateResult.rowCount ?? 0,
      actorIds: idsToClean,
      duration: Date.now() - startTime,
    })
  } catch (error) {
    logger.error({ error }, "Failed to cleanup future deaths")
    res.status(500).json({ error: { message: "Failed to cleanup future deaths" } })
  }
})

// ============================================================================
// GET /admin/api/data-quality/uncertain-deaths
// Get actors with uncertain death information
// ============================================================================

interface UncertainDeathsQuery {
  page?: string
  pageSize?: string
}

router.get("/uncertain-deaths", async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = "1", pageSize = "50" } = req.query as UncertainDeathsQuery
    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 50))
    const offset = (pageNum - 1) * limit

    const pool = getPool()
    const pattern = UNCERTAINTY_PATTERNS.join("|")

    // Get total count
    const countResult = await pool.query<{ count: number }>(
      `
      SELECT COUNT(DISTINCT a.id)::int as count
      FROM actors a
      JOIN actor_death_circumstances adc ON a.id = adc.actor_id
      WHERE
        adc.circumstances ~* $1
        OR adc.rumored_circumstances ~* $1
        OR adc.additional_context ~* $1
        OR adc.raw_response::text ~* $1
    `,
      [pattern]
    )
    const total = countResult.rows[0]?.count ?? 0

    // Get paginated actors
    const result = await pool.query<{
      id: number
      name: string
      tmdb_id: number | null
      deathday: string
      popularity: number | null
      circumstances: string | null
    }>(
      `
      SELECT DISTINCT ON (a.id)
        a.id,
        a.name,
        a.tmdb_id,
        a.deathday,
        a.dof_popularity::float as popularity,
        adc.circumstances
      FROM actors a
      JOIN actor_death_circumstances adc ON a.id = adc.actor_id
      WHERE
        adc.circumstances ~* $1
        OR adc.rumored_circumstances ~* $1
        OR adc.additional_context ~* $1
        OR adc.raw_response::text ~* $1
      ORDER BY a.id, a.dof_popularity DESC NULLS LAST
      LIMIT $2 OFFSET $3
    `,
      [pattern, limit, offset]
    )

    res.json({
      total,
      page: pageNum,
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
      actors: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        tmdbId: row.tmdb_id,
        deathDate: row.deathday,
        popularity: row.popularity,
        circumstancesExcerpt: row.circumstances?.substring(0, 200) || null,
      })),
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch uncertain deaths")
    res.status(500).json({ error: { message: "Failed to fetch uncertain deaths" } })
  }
})

// ============================================================================
// POST /admin/api/data-quality/reset-enrichment
// Reset enrichment data for an actor so they can be re-processed
// ============================================================================

interface ResetEnrichmentRequest {
  actorId?: number
  tmdbId?: number
  dryRun?: boolean
}

router.post("/reset-enrichment", async (req: Request, res: Response): Promise<void> => {
  try {
    const { actorId, tmdbId, dryRun = false } = req.body as ResetEnrichmentRequest

    if (!actorId && !tmdbId) {
      res.status(400).json({ error: { message: "Either actorId or tmdbId is required" } })
      return
    }

    const pool = getPool()

    // Find the actor
    let findQuery: string
    let findParams: (number | undefined)[]

    if (actorId) {
      findQuery = `
        SELECT
          a.id,
          a.name,
          a.tmdb_id,
          a.has_detailed_death_info,
          COALESCE(COUNT(h.id), 0)::integer as history_count
        FROM actors a
        LEFT JOIN actor_death_info_history h ON h.actor_id = a.id
        WHERE a.id = $1
        GROUP BY a.id, a.name, a.tmdb_id, a.has_detailed_death_info
      `
      findParams = [actorId]
    } else {
      findQuery = `
        SELECT
          a.id,
          a.name,
          a.tmdb_id,
          a.has_detailed_death_info,
          COALESCE(COUNT(h.id), 0)::integer as history_count
        FROM actors a
        LEFT JOIN actor_death_info_history h ON h.actor_id = a.id
        WHERE a.tmdb_id = $1
        GROUP BY a.id, a.name, a.tmdb_id, a.has_detailed_death_info
      `
      findParams = [tmdbId]
    }

    const findResult = await pool.query<{
      id: number
      name: string
      tmdb_id: number | null
      has_detailed_death_info: boolean | null
      history_count: number
    }>(findQuery, findParams)

    if (findResult.rows.length === 0) {
      res.status(404).json({ error: { message: "Actor not found" } })
      return
    }

    const actor = findResult.rows[0]

    if (dryRun) {
      res.json({
        dryRun: true,
        actor: {
          id: actor.id,
          name: actor.name,
          tmdbId: actor.tmdb_id,
          hasDetailedDeathInfo: actor.has_detailed_death_info,
          historyCount: actor.history_count,
        },
        wouldReset: {
          actorFields: true,
          historyEntries: actor.history_count,
          circumstancesRecord: true,
        },
      })
      return
    }

    // Execute reset in a transaction
    const client = await pool.connect()
    try {
      await client.query("BEGIN")

      // 1. Reset actor fields
      await client.query(
        `
        UPDATE actors SET
          has_detailed_death_info = NULL,
          enriched_at = NULL,
          enrichment_source = NULL,
          enrichment_version = NULL
        WHERE id = $1
      `,
        [actor.id]
      )

      // 2. Delete history entries
      const historyResult = await client.query(
        "DELETE FROM actor_death_info_history WHERE actor_id = $1",
        [actor.id]
      )

      // 3. Delete circumstances record
      const circumstancesResult = await client.query(
        "DELETE FROM actor_death_circumstances WHERE actor_id = $1",
        [actor.id]
      )

      await client.query("COMMIT")

      // Invalidate cache
      try {
        await invalidateActorCache(actor.id)
      } catch (err) {
        logger.warn({ err, actorId: actor.id }, "Failed to invalidate actor cache")
      }

      logger.info(
        {
          actorId: actor.id,
          name: actor.name,
          historyDeleted: historyResult.rowCount,
          circumstancesDeleted: circumstancesResult.rowCount,
        },
        "Reset enrichment data for actor"
      )

      res.json({
        reset: true,
        actorId: actor.id,
        name: actor.name,
        historyDeleted: historyResult.rowCount ?? 0,
        circumstancesDeleted: circumstancesResult.rowCount ?? 0,
      })
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    logger.error({ error }, "Failed to reset enrichment data")
    res.status(500).json({ error: { message: "Failed to reset enrichment data" } })
  }
})

export default router
