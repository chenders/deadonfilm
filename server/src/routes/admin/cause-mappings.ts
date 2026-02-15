/**
 * Admin cause mappings management endpoints.
 *
 * Provides tools to manage cause-of-death manner classifications
 * and normalizations.
 */

import { Request, Response, Router } from "express"
import { getPool } from "../../lib/db/pool.js"
import { logger } from "../../lib/logger.js"

const router = Router()

// ============================================================================
// Manner Mappings
// ============================================================================

/**
 * GET /admin/api/cause-mappings/manner
 * List all manner mappings with actor counts.
 */
router.get("/manner", async (req: Request, res: Response) => {
  try {
    const { search, manner } = req.query
    const db = getPool()

    const conditions: string[] = []
    const params: string[] = []
    let paramIndex = 1

    if (search && typeof search === "string") {
      conditions.push(`cmm.normalized_cause ILIKE $${paramIndex}`)
      params.push(`%${search}%`)
      paramIndex++
    }

    if (manner && typeof manner === "string") {
      conditions.push(`cmm.manner = $${paramIndex}`)
      params.push(manner)
      paramIndex++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

    const result = await db.query<{
      normalized_cause: string
      manner: string
      source: string
      created_at: string
      actor_count: string
    }>(
      `SELECT
         cmm.normalized_cause,
         cmm.manner,
         cmm.source,
         cmm.created_at::text,
         COALESCE(counts.actor_count, 0) as actor_count
       FROM cause_manner_mappings cmm
       LEFT JOIN (
         SELECT COALESCE(n.normalized_cause, a.cause_of_death) as normalized_cause,
                COUNT(*) as actor_count
         FROM actors a
         LEFT JOIN cause_of_death_normalizations n ON a.cause_of_death = n.original_cause
         WHERE a.cause_of_death IS NOT NULL
         GROUP BY COALESCE(n.normalized_cause, a.cause_of_death)
       ) counts ON counts.normalized_cause = cmm.normalized_cause
       ${whereClause}
       ORDER BY actor_count DESC, cmm.normalized_cause`,
      params
    )

    // Get overall counts (independent of filters) for stats bar
    const countsResult = await db.query<{ mapped: string; unmapped: string }>(`
      SELECT
        (SELECT COUNT(*) FROM cause_manner_mappings) as mapped,
        (SELECT COUNT(DISTINCT COALESCE(n.normalized_cause, a.cause_of_death))
         FROM actors a
         LEFT JOIN cause_of_death_normalizations n ON a.cause_of_death = n.original_cause
         LEFT JOIN cause_manner_mappings cmm ON COALESCE(n.normalized_cause, a.cause_of_death) = cmm.normalized_cause
         WHERE a.cause_of_death IS NOT NULL
           AND a.cause_of_death != ''
           AND cmm.normalized_cause IS NULL) as unmapped
    `)

    res.json({
      mappings: result.rows.map((r) => ({
        normalizedCause: r.normalized_cause,
        manner: r.manner,
        source: r.source,
        createdAt: r.created_at,
        actorCount: parseInt(r.actor_count, 10),
      })),
      totalMapped: parseInt(countsResult.rows[0].mapped, 10),
      totalUnmapped: parseInt(countsResult.rows[0].unmapped, 10),
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch manner mappings")
    res.status(500).json({ error: { message: "Failed to fetch manner mappings" } })
  }
})

/**
 * PUT /admin/api/cause-mappings/manner/:cause
 * Update manner for a normalized cause.
 */
router.put("/manner/:cause", async (req: Request, res: Response) => {
  try {
    const cause = req.params.cause
    const { manner } = req.body

    const validManners = ["natural", "accident", "suicide", "homicide", "undetermined"]
    if (!manner || !validManners.includes(manner)) {
      res.status(400).json({
        error: { message: `Invalid manner. Must be one of: ${validManners.join(", ")}` },
      })
      return
    }

    const db = getPool()

    const result = await db.query(
      `INSERT INTO cause_manner_mappings (normalized_cause, manner, source)
       VALUES ($1, $2, 'manual')
       ON CONFLICT (normalized_cause) DO UPDATE SET manner = $2, source = 'manual'
       RETURNING *`,
      [cause, manner]
    )

    logger.info({ cause, manner }, "Updated manner mapping")
    res.json({ success: true, mapping: result.rows[0] })
  } catch (error) {
    logger.error({ error }, "Failed to update manner mapping")
    res.status(500).json({ error: { message: "Failed to update manner mapping" } })
  }
})

// ============================================================================
// Normalizations
// ============================================================================

/**
 * GET /admin/api/cause-mappings/normalizations
 * List all normalizations with actor counts.
 */
router.get("/normalizations", async (req: Request, res: Response) => {
  try {
    const { search } = req.query
    const db = getPool()

    const conditions: string[] = []
    const params: string[] = []
    let paramIndex = 1

    if (search && typeof search === "string") {
      conditions.push(
        `(n.original_cause ILIKE $${paramIndex} OR n.normalized_cause ILIKE $${paramIndex})`
      )
      params.push(`%${search}%`)
      paramIndex++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

    const result = await db.query<{
      original_cause: string
      normalized_cause: string
      actor_count: string
    }>(
      `SELECT
         n.original_cause,
         n.normalized_cause,
         COALESCE(counts.actor_count, 0) as actor_count
       FROM cause_of_death_normalizations n
       LEFT JOIN (
         SELECT cause_of_death, COUNT(*) as actor_count
         FROM actors
         WHERE cause_of_death IS NOT NULL
         GROUP BY cause_of_death
       ) counts ON counts.cause_of_death = n.original_cause
       ${whereClause}
       ORDER BY actor_count DESC, n.original_cause`,
      params
    )

    res.json({
      normalizations: result.rows.map((r) => ({
        originalCause: r.original_cause,
        normalizedCause: r.normalized_cause,
        actorCount: parseInt(r.actor_count, 10),
      })),
      total: result.rows.length,
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch normalizations")
    res.status(500).json({ error: { message: "Failed to fetch normalizations" } })
  }
})

/**
 * PUT /admin/api/cause-mappings/normalizations/:cause
 * Update normalized_cause for an original cause.
 */
router.put("/normalizations/:cause", async (req: Request, res: Response) => {
  try {
    const originalCause = req.params.cause
    const { normalizedCause } = req.body

    if (typeof normalizedCause !== "string" || !normalizedCause.trim()) {
      res
        .status(400)
        .json({ error: { message: "normalizedCause is required and cannot be empty" } })
      return
    }

    const db = getPool()

    const result = await db.query(
      `UPDATE cause_of_death_normalizations
       SET normalized_cause = $2
       WHERE original_cause = $1
       RETURNING *`,
      [originalCause, normalizedCause]
    )

    if (result.rows.length === 0) {
      res.status(404).json({ error: { message: "Normalization not found" } })
      return
    }

    logger.info({ originalCause, normalizedCause }, "Updated cause normalization")
    res.json({ success: true, normalization: result.rows[0] })
  } catch (error) {
    logger.error({ error }, "Failed to update normalization")
    res.status(500).json({ error: { message: "Failed to update normalization" } })
  }
})

// ============================================================================
// Category Preview
// ============================================================================

/**
 * GET /admin/api/cause-mappings/preview
 * Preview category assignments showing current vs proposed (with manner).
 */
router.get("/preview", async (req: Request, res: Response) => {
  try {
    const { changesOnly } = req.query
    const db = getPool()

    // Build category CASE for text-only (current) and manner-aware (proposed)
    const { buildCategoryCaseStatement } = await import("../../lib/cause-categories.js")
    const currentCase = buildCategoryCaseStatement()
    const proposedCase = buildCategoryCaseStatement("cmm.manner")

    const result = await db.query<{
      normalized_cause: string
      manner: string | null
      current_category: string
      proposed_category: string
      actor_count: string
    }>(
      `SELECT
         COALESCE(n.normalized_cause, a.cause_of_death) as normalized_cause,
         cmm.manner,
         ${currentCase} as current_category,
         ${proposedCase} as proposed_category,
         COUNT(*) as actor_count
       FROM actors a
       LEFT JOIN cause_of_death_normalizations n ON a.cause_of_death = n.original_cause
       LEFT JOIN cause_manner_mappings cmm ON COALESCE(n.normalized_cause, a.cause_of_death) = cmm.normalized_cause
       WHERE a.deathday IS NOT NULL
         AND a.cause_of_death IS NOT NULL
         AND a.is_obscure = false
       GROUP BY COALESCE(n.normalized_cause, a.cause_of_death), cmm.manner, current_category, proposed_category
       ORDER BY actor_count DESC`
    )

    let entries = result.rows.map((r) => ({
      normalizedCause: r.normalized_cause,
      manner: r.manner,
      currentCategory: r.current_category,
      proposedCategory: r.proposed_category,
      actorCount: parseInt(r.actor_count, 10),
      changed: r.current_category !== r.proposed_category,
    }))

    if (changesOnly === "true") {
      entries = entries.filter((e) => e.changed)
    }

    // Summary stats
    const changedEntries = entries.filter((e) => e.changed)
    const totalActorsAffected = changedEntries.reduce((sum, e) => sum + e.actorCount, 0)

    // Movement summary (from → to)
    const movements: Record<string, number> = {}
    for (const entry of changedEntries) {
      const key = `${entry.currentCategory} → ${entry.proposedCategory}`
      movements[key] = (movements[key] || 0) + entry.actorCount
    }

    res.json({
      entries,
      summary: {
        totalCauses: result.rows.length,
        changedCauses: changedEntries.length,
        totalActorsAffected,
        movements,
      },
    })
  } catch (error) {
    logger.error({ error }, "Failed to generate category preview")
    res.status(500).json({ error: { message: "Failed to generate category preview" } })
  }
})

export default router
