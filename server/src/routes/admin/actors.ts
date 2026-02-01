/**
 * Admin actor management endpoints.
 *
 * Provides diagnostic and management tools for actors.
 */

import { Request, Response, Router } from "express"
import { getPool } from "../../lib/db/pool.js"
import { logger } from "../../lib/logger.js"
import { getCached, CACHE_KEYS } from "../../lib/cache.js"
import { createActorSlug } from "../../lib/slug-utils.js"
import { logAdminAction } from "../../lib/admin-auth.js"

const router = Router()

// Fields that should NOT be editable via the admin editor
const NON_EDITABLE_FIELDS = new Set([
  // Computed fields
  "tmdb_popularity",
  "dof_popularity",
  "dof_popularity_confidence",
  "dof_popularity_updated_at",
  "is_obscure",
  "age_at_death",
  "expected_lifespan",
  "years_lost",
  // External IDs (managed by sync)
  "tmdb_id",
  "imdb_person_id",
  "tvmaze_person_id",
  "thetvdb_person_id",
  // System fields
  "id",
  "created_at",
  "updated_at",
  // Fetch tracking (managed by enrichment system)
  "details_fetch_attempts",
  "details_last_fetch_attempt",
  "details_fetch_error",
  "details_permanently_failed",
])

// Actor fields that are editable
const ACTOR_EDITABLE_FIELDS = [
  "name",
  "birthday",
  "deathday",
  "profile_path",
  "fallback_profile_url",
  "cause_of_death",
  "cause_of_death_source",
  "cause_of_death_details",
  "cause_of_death_details_source",
  "wikipedia_url",
  "violent_death",
  "birthday_precision",
  "deathday_precision",
  "cause_of_death_checked_at",
  "death_manner",
  "death_categories",
  "covid_related",
  "strange_death",
  "has_detailed_death_info",
  "deathday_confidence",
  "deathday_verification_source",
  "deathday_verified_at",
  "enriched_at",
  "enrichment_source",
  "enrichment_version",
]

// Circumstances fields that are editable
const CIRCUMSTANCES_EDITABLE_FIELDS = [
  "circumstances",
  "circumstances_confidence",
  "rumored_circumstances",
  "cause_confidence",
  "details_confidence",
  "birthday_confidence",
  "deathday_confidence",
  "location_of_death",
  "last_project",
  "career_status_at_death",
  "posthumous_releases",
  "related_celebrity_ids",
  "related_celebrities",
  "additional_context",
  "notable_factors",
  "sources",
  "related_deaths",
  "enriched_at",
  "enrichment_source",
  "enrichment_version",
  "entity_links",
]

// Uncertainty markers that indicate data quality issues
const UNCERTAINTY_MARKERS = [
  "possibly",
  "reportedly",
  "allegedly",
  "unconfirmed",
  "disputed",
  "uncertain",
  "rumored",
  "believed to",
  "thought to",
  "may have",
  "might have",
  "could have",
  "some sources",
  "conflicting reports",
]

interface ActorRow {
  id: number
  tmdb_id: number | null
  name: string
  birthday: string | null
  deathday: string | null
  profile_path: string | null
  fallback_profile_url: string | null
  tmdb_popularity: string | null
  cause_of_death: string | null
  cause_of_death_source: string | null
  cause_of_death_details: string | null
  cause_of_death_details_source: string | null
  wikipedia_url: string | null
  age_at_death: number | null
  expected_lifespan: string | null
  years_lost: string | null
  violent_death: boolean | null
  created_at: string
  updated_at: string
  is_obscure: boolean
  tvmaze_person_id: number | null
  thetvdb_person_id: number | null
  imdb_person_id: string | null
  birthday_precision: string | null
  deathday_precision: string | null
  cause_of_death_checked_at: string | null
  death_manner: string | null
  death_categories: string[] | null
  covid_related: boolean | null
  strange_death: boolean | null
  has_detailed_death_info: boolean | null
  deathday_confidence: string | null
  deathday_verification_source: string | null
  deathday_verified_at: string | null
  enriched_at: string | null
  enrichment_source: string | null
  enrichment_version: string | null
  details_fetch_attempts: number
  details_last_fetch_attempt: string | null
  details_fetch_error: string | null
  details_permanently_failed: boolean
  dof_popularity: string | null
  dof_popularity_confidence: string | null
  dof_popularity_updated_at: string | null
}

interface CircumstancesRow {
  id: number
  actor_id: number
  circumstances: string | null
  circumstances_confidence: string | null
  rumored_circumstances: string | null
  cause_confidence: string | null
  details_confidence: string | null
  birthday_confidence: string | null
  deathday_confidence: string | null
  location_of_death: string | null
  last_project: Record<string, unknown> | null
  career_status_at_death: string | null
  posthumous_releases: Record<string, unknown>[] | null
  related_celebrity_ids: number[] | null
  related_celebrities: Record<string, unknown>[] | null
  additional_context: string | null
  notable_factors: string[] | null
  sources: Record<string, unknown>[] | null
  raw_response: Record<string, unknown> | null
  created_at: string
  updated_at: string
  related_deaths: string | null
  enriched_at: string | null
  enrichment_source: string | null
  enrichment_version: string | null
  entity_links: Record<string, unknown> | null
}

interface DataQualityIssue {
  field: string
  issue: string
  severity: "warning" | "error"
}

/**
 * Detect data quality issues in actor data
 */
function detectDataQualityIssues(
  actor: ActorRow,
  circumstances: CircumstancesRow | null
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = []

  // Check for uncertainty markers in circumstances
  if (circumstances?.circumstances) {
    const lowerCircumstances = circumstances.circumstances.toLowerCase()
    for (const marker of UNCERTAINTY_MARKERS) {
      if (lowerCircumstances.includes(marker)) {
        issues.push({
          field: "circumstances",
          issue: `Contains uncertainty marker: "${marker}"`,
          severity: "warning",
        })
        break
      }
    }
  }

  // Check for low confidence fields
  if (actor.deathday_confidence === "unverified" || actor.deathday_confidence === "conflicting") {
    issues.push({
      field: "deathday",
      issue: `Death date confidence: ${actor.deathday_confidence}`,
      severity: actor.deathday_confidence === "conflicting" ? "error" : "warning",
    })
  }

  if (circumstances?.cause_confidence === "low") {
    issues.push({
      field: "cause_of_death",
      issue: "Low confidence on cause of death",
      severity: "warning",
    })
  }

  if (circumstances?.circumstances_confidence === "low") {
    issues.push({
      field: "circumstances",
      issue: "Low confidence on circumstances",
      severity: "warning",
    })
  }

  // Check for future death dates
  if (actor.deathday) {
    const deathDate = new Date(actor.deathday)
    if (deathDate > new Date()) {
      issues.push({
        field: "deathday",
        issue: "Death date is in the future",
        severity: "error",
      })
    }
  }

  // Check for death date before birth date
  if (actor.birthday && actor.deathday) {
    const birthDate = new Date(actor.birthday)
    const deathDate = new Date(actor.deathday)
    if (deathDate < birthDate) {
      issues.push({
        field: "deathday",
        issue: "Death date is before birth date",
        severity: "error",
      })
    }
  }

  // Check for missing enrichment data on deceased actors
  if (actor.deathday && !actor.cause_of_death && !circumstances?.circumstances) {
    issues.push({
      field: "cause_of_death",
      issue: "Deceased actor missing death details",
      severity: "warning",
    })
  }

  return issues
}

// ============================================================================
// GET /admin/api/actors/:id
// Get full actor data for editing
// ============================================================================

router.get("/:id(\\d+)", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()
    const actorId = parseInt(req.params.id, 10)

    if (isNaN(actorId)) {
      res.status(400).json({ error: { message: "Invalid actor ID" } })
      return
    }

    // Fetch actor data
    const actorResult = await pool.query<ActorRow>(`SELECT * FROM actors WHERE id = $1`, [actorId])

    if (actorResult.rows.length === 0) {
      res.status(404).json({ error: { message: "Actor not found" } })
      return
    }

    const actor = actorResult.rows[0]

    // Fetch circumstances data
    const circumstancesResult = await pool.query<CircumstancesRow>(
      `SELECT * FROM actor_death_circumstances WHERE actor_id = $1`,
      [actorId]
    )

    const circumstances = circumstancesResult.rows[0] || null

    // Detect data quality issues
    const dataQualityIssues = detectDataQualityIssues(actor, circumstances)

    // Get recent change history
    const historyResult = await pool.query<{
      field_name: string
      old_value: string | null
      new_value: string | null
      source: string
      created_at: string
    }>(
      `SELECT field_name, old_value, new_value, source, created_at
       FROM actor_death_info_history
       WHERE actor_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [actorId]
    )

    res.json({
      actor,
      circumstances,
      dataQualityIssues,
      recentHistory: historyResult.rows,
      editableFields: {
        actor: ACTOR_EDITABLE_FIELDS,
        circumstances: CIRCUMSTANCES_EDITABLE_FIELDS,
      },
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch actor for editing")
    res.status(500).json({ error: { message: "Failed to fetch actor data" } })
  }
})

// ============================================================================
// PATCH /admin/api/actors/:id
// Update actor fields with history tracking
// ============================================================================

interface UpdateActorBody {
  actor?: Record<string, unknown>
  circumstances?: Record<string, unknown>
}

router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const pool = getPool()
  const actorId = parseInt(req.params.id, 10)

  if (isNaN(actorId)) {
    res.status(400).json({ error: { message: "Invalid actor ID" } })
    return
  }

  const body = req.body as UpdateActorBody
  const { actor: actorUpdates, circumstances: circumstancesUpdates } = body

  if (!actorUpdates && !circumstancesUpdates) {
    res.status(400).json({ error: { message: "No updates provided" } })
    return
  }

  try {
    // Verify actor exists
    const existingActorResult = await pool.query<ActorRow>(`SELECT * FROM actors WHERE id = $1`, [
      actorId,
    ])

    if (existingActorResult.rows.length === 0) {
      res.status(404).json({ error: { message: "Actor not found" } })
      return
    }

    const existingActor = existingActorResult.rows[0]

    // Get existing circumstances
    const existingCircumstancesResult = await pool.query<CircumstancesRow>(
      `SELECT * FROM actor_death_circumstances WHERE actor_id = $1`,
      [actorId]
    )
    const existingCircumstances = existingCircumstancesResult.rows[0] || null

    // Validate that all fields being updated are editable
    const invalidActorFields: string[] = []
    const invalidCircumstancesFields: string[] = []

    if (actorUpdates) {
      for (const field of Object.keys(actorUpdates)) {
        if (NON_EDITABLE_FIELDS.has(field) || !ACTOR_EDITABLE_FIELDS.includes(field)) {
          invalidActorFields.push(field)
        }
      }
    }

    if (circumstancesUpdates) {
      for (const field of Object.keys(circumstancesUpdates)) {
        if (!CIRCUMSTANCES_EDITABLE_FIELDS.includes(field)) {
          invalidCircumstancesFields.push(field)
        }
      }
    }

    if (invalidActorFields.length > 0 || invalidCircumstancesFields.length > 0) {
      res.status(400).json({
        error: {
          message: "Cannot update non-editable fields",
          invalidFields: {
            actor: invalidActorFields,
            circumstances: invalidCircumstancesFields,
          },
        },
      })
      return
    }

    // Validate date fields
    const dateFields = ["birthday", "deathday"]
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    const invalidDates: { field: string; value: unknown; reason: string }[] = []

    if (actorUpdates) {
      for (const field of dateFields) {
        const value = actorUpdates[field]
        if (value !== undefined && value !== null) {
          if (typeof value !== "string" || !dateRegex.test(value)) {
            invalidDates.push({ field, value, reason: "Invalid format. Expected YYYY-MM-DD" })
          } else {
            const parsed = new Date(value)
            if (isNaN(parsed.getTime())) {
              invalidDates.push({ field, value, reason: "Invalid date" })
            } else if (field === "deathday" && parsed > new Date()) {
              invalidDates.push({ field, value, reason: "Death date cannot be in the future" })
            }
          }
        }
      }
    }

    if (invalidDates.length > 0) {
      res.status(400).json({
        error: {
          message: "Invalid date format",
          invalidDates,
        },
      })
      return
    }

    // Calculate changes before creating snapshot (to avoid unnecessary snapshots)
    const changes: { table: string; field: string; oldValue: unknown; newValue: unknown }[] = []

    // Check actor field changes
    if (actorUpdates && Object.keys(actorUpdates).length > 0) {
      for (const [field, value] of Object.entries(actorUpdates)) {
        const oldValue = existingActor[field as keyof ActorRow]
        if (JSON.stringify(oldValue) !== JSON.stringify(value)) {
          changes.push({ table: "actors", field, oldValue, newValue: value })
        }
      }
    }

    // Check circumstances field changes
    if (circumstancesUpdates && Object.keys(circumstancesUpdates).length > 0) {
      for (const [field, value] of Object.entries(circumstancesUpdates)) {
        const oldValue = existingCircumstances
          ? existingCircumstances[field as keyof CircumstancesRow]
          : null
        if (JSON.stringify(oldValue) !== JSON.stringify(value)) {
          changes.push({ table: "actor_death_circumstances", field, oldValue, newValue: value })
        }
      }
    }

    // If no actual changes, return early without creating snapshot
    if (changes.length === 0) {
      res.json({
        success: true,
        snapshotId: null,
        batchId: null,
        changes: [],
        actor: existingActor,
        circumstances: existingCircumstances,
      })
      return
    }

    // Wrap all database operations in a transaction for atomicity
    const client = await pool.connect()
    let snapshotId: number

    try {
      await client.query("BEGIN")

      // Create snapshot before making changes (only if there are actual changes)
      const batchId = `admin-edit-${Date.now()}`

      // Create snapshot using the transaction client
      const actorDataResult = await client.query(`SELECT * FROM actors WHERE id = $1`, [actorId])
      const circumstancesDataResult = await client.query(
        `SELECT * FROM actor_death_circumstances WHERE actor_id = $1`,
        [actorId]
      )

      const snapshotResult = await client.query<{ id: number }>(
        `INSERT INTO actor_snapshots (actor_id, actor_data, circumstances_data, trigger_source, trigger_details)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          actorId,
          actorDataResult.rows[0],
          circumstancesDataResult.rows[0] || null,
          "admin-manual-edit",
          {
            batchId,
            updatedFields: {
              actor: actorUpdates ? Object.keys(actorUpdates) : [],
              circumstances: circumstancesUpdates ? Object.keys(circumstancesUpdates) : [],
            },
          },
        ]
      )
      snapshotId = snapshotResult.rows[0].id

      // Update actor fields
      if (actorUpdates && Object.keys(actorUpdates).length > 0) {
        const setClauses: string[] = []
        const values: unknown[] = []
        let paramIndex = 1

        for (const [field, value] of Object.entries(actorUpdates)) {
          const oldValue = existingActor[field as keyof ActorRow]

          // Skip if value hasn't changed
          if (JSON.stringify(oldValue) === JSON.stringify(value)) {
            continue
          }

          setClauses.push(`${field} = $${paramIndex}`)
          values.push(value)
          paramIndex++

          // Record in history
          const oldStr =
            oldValue === null || oldValue === undefined
              ? null
              : typeof oldValue === "object"
                ? JSON.stringify(oldValue)
                : String(oldValue)
          const newStr =
            value === null || value === undefined
              ? null
              : typeof value === "object"
                ? JSON.stringify(value)
                : String(value)

          await client.query(
            `INSERT INTO actor_death_info_history (actor_id, field_name, old_value, new_value, source, batch_id)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [actorId, field, oldStr, newStr, "admin-manual-edit", batchId]
          )
        }

        if (setClauses.length > 0) {
          setClauses.push(`updated_at = NOW()`)
          values.push(actorId)
          await client.query(
            `UPDATE actors SET ${setClauses.join(", ")} WHERE id = $${paramIndex}`,
            values
          )
        }
      }

      // Update circumstances fields
      if (circumstancesUpdates && Object.keys(circumstancesUpdates).length > 0) {
        if (existingCircumstances) {
          // Update existing circumstances
          const setClauses: string[] = []
          const values: unknown[] = []
          let paramIndex = 1

          for (const [field, value] of Object.entries(circumstancesUpdates)) {
            const oldValue = existingCircumstances[field as keyof CircumstancesRow]

            // Skip if value hasn't changed
            if (JSON.stringify(oldValue) === JSON.stringify(value)) {
              continue
            }

            setClauses.push(`${field} = $${paramIndex}`)
            values.push(value)
            paramIndex++

            // Record in history
            const oldStr =
              oldValue === null || oldValue === undefined
                ? null
                : typeof oldValue === "object"
                  ? JSON.stringify(oldValue)
                  : String(oldValue)
            const newStr =
              value === null || value === undefined
                ? null
                : typeof value === "object"
                  ? JSON.stringify(value)
                  : String(value)

            await client.query(
              `INSERT INTO actor_death_info_history (actor_id, field_name, old_value, new_value, source, batch_id)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [actorId, `circumstances.${field}`, oldStr, newStr, "admin-manual-edit", batchId]
            )
          }

          if (setClauses.length > 0) {
            setClauses.push(`updated_at = NOW()`)
            values.push(actorId)
            await client.query(
              `UPDATE actor_death_circumstances SET ${setClauses.join(", ")} WHERE actor_id = $${paramIndex}`,
              values
            )
          }
        } else {
          // Create new circumstances record
          const fields = ["actor_id", ...Object.keys(circumstancesUpdates)]
          const values = [actorId, ...Object.values(circumstancesUpdates)]
          const placeholders = values.map((_, i) => `$${i + 1}`).join(", ")

          await client.query(
            `INSERT INTO actor_death_circumstances (${fields.join(", ")}) VALUES (${placeholders})`,
            values
          )

          // Record history for new circumstances
          for (const [field, value] of Object.entries(circumstancesUpdates)) {
            const newStr =
              value === null || value === undefined
                ? null
                : typeof value === "object"
                  ? JSON.stringify(value)
                  : String(value)

            await client.query(
              `INSERT INTO actor_death_info_history (actor_id, field_name, old_value, new_value, source, batch_id)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [actorId, `circumstances.${field}`, null, newStr, "admin-manual-edit", batchId]
            )
          }
        }
      }

      // Log to audit trail (inside transaction)
      await logAdminAction({
        action: "actor-edit",
        resourceType: "actor",
        resourceId: actorId,
        details: {
          snapshotId,
          batchId,
          changes,
        },
        ipAddress: req.ip || undefined,
        userAgent: req.get("user-agent") || undefined,
      })

      await client.query("COMMIT")

      logger.info(
        { actorId, snapshotId, changeCount: changes.length },
        "Actor updated via admin editor"
      )

      // Fetch updated data to return (outside transaction)
      const updatedActorResult = await pool.query<ActorRow>(`SELECT * FROM actors WHERE id = $1`, [
        actorId,
      ])
      const updatedCircumstancesResult = await pool.query<CircumstancesRow>(
        `SELECT * FROM actor_death_circumstances WHERE actor_id = $1`,
        [actorId]
      )

      res.json({
        success: true,
        snapshotId,
        batchId,
        changes,
        actor: updatedActorResult.rows[0],
        circumstances: updatedCircumstancesResult.rows[0] || null,
      })
    } catch (txError) {
      await client.query("ROLLBACK")
      throw txError
    } finally {
      client.release()
    }
  } catch (error) {
    logger.error({ error, actorId }, "Failed to update actor")
    res.status(500).json({ error: { message: "Failed to update actor" } })
  }
})

// ============================================================================
// GET /admin/api/actors/:id/diagnostic
// Get comprehensive diagnostic information for an actor
// ============================================================================

router.get("/:id/diagnostic", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()
    const idParam = parseInt(req.params.id, 10)

    if (isNaN(idParam)) {
      res.status(400).json({ error: { message: "Invalid actor ID" } })
      return
    }

    // Try to find actor by EITHER id or tmdb_id
    const actorResult = await pool.query<{
      id: number
      tmdb_id: number | null
      name: string
      deathday: string | null
      popularity: number | null
    }>(
      `SELECT id, tmdb_id, name, deathday, tmdb_popularity::float as popularity
       FROM actors
       WHERE id = $1 OR tmdb_id = $1
       LIMIT 2`,
      [idParam]
    )

    if (actorResult.rows.length === 0) {
      res.status(404).json({ error: { message: "Actor not found" } })
      return
    }

    // If multiple matches, prefer internal id match
    let actor = actorResult.rows[0]
    if (actorResult.rows.length === 2) {
      actor = actorResult.rows.find((a) => a.id === idParam) || actorResult.rows[0]
    }

    // Check for ID conflicts (another actor with tmdb_id = this actor's id, or vice versa)
    let idConflict: {
      hasConflict: boolean
      conflictingActor?: { id: number; name: string; popularity: number | null }
    } = { hasConflict: false }
    if (actorResult.rows.length === 2) {
      const conflicting = actorResult.rows.find((a) => a.id !== actor.id)
      if (conflicting) {
        idConflict = {
          hasConflict: true,
          conflictingActor: {
            id: conflicting.id,
            name: conflicting.name,
            popularity: conflicting.popularity,
          },
        }
      }
    }

    // Generate URLs
    const canonicalSlug = createActorSlug(actor.name, actor.id)
    const urls = {
      canonical: `/actor/${canonicalSlug}`,
      legacy:
        actor.tmdb_id && actor.tmdb_id !== actor.id
          ? `/actor/${createActorSlug(actor.name, actor.tmdb_id)}`
          : null,
    }

    // Check cache status
    const profileCacheKey = CACHE_KEYS.actor(actor.id).profile
    const deathCacheKey = CACHE_KEYS.actor(actor.id).death

    const [profileCached, deathCached] = await Promise.all([
      getCached(profileCacheKey),
      getCached(deathCacheKey),
    ])

    // TODO: Get TTL from Redis if cached
    // For now, just return whether it's cached
    const cache = {
      profile: {
        cached: !!profileCached,
        ttl: profileCached ? 86400 : null, // Placeholder - would need PTTL from Redis
      },
      death: {
        cached: !!deathCached,
        ttl: deathCached ? 86400 : null, // Placeholder
      },
    }

    // Get redirect statistics from page_visits table
    // This requires page_visits to track actor URLs
    // For now, return placeholder data
    const redirectStats: {
      last7Days: number
      last30Days: number
      topReferer: string | null
    } = {
      last7Days: 0,
      last30Days: 0,
      topReferer: null,
    }

    // If we have page_visits tracking, query it:
    try {
      const redirectQuery = await pool.query<{ count: number }>(
        `SELECT COUNT(*)::int as count
         FROM page_visits
         WHERE visited_path ~ '/actor/[a-z0-9-]+-\\d+/?$'
           AND is_internal_referral = true
           AND referrer_path ~ '/actor/[a-z0-9-]+-\\d+/?$'
           AND referrer_path != visited_path
           AND visited_at >= NOW() - INTERVAL '7 days'
           AND (
             visited_path LIKE '%' || $1 || '%'
             OR referrer_path LIKE '%' || $1 || '%'
           )`,
        [actor.id]
      )

      if (redirectQuery.rows.length > 0) {
        redirectStats.last7Days = redirectQuery.rows[0].count
      }

      const redirect30Query = await pool.query<{ count: number }>(
        `SELECT COUNT(*)::int as count
         FROM page_visits
         WHERE visited_path ~ '/actor/[a-z0-9-]+-\\d+/?$'
           AND is_internal_referral = true
           AND referrer_path ~ '/actor/[a-z0-9-]+-\\d+/?$'
           AND referrer_path != visited_path
           AND visited_at >= NOW() - INTERVAL '30 days'
           AND (
             visited_path LIKE '%' || $1 || '%'
             OR referrer_path LIKE '%' || $1 || '%'
           )`,
        [actor.id]
      )

      if (redirect30Query.rows.length > 0) {
        redirectStats.last30Days = redirect30Query.rows[0].count
      }

      // Get top referer
      const topRefererQuery = await pool.query<{ referer: string }>(
        `SELECT
           CASE
             WHEN referrer_path LIKE '%google%' THEN 'google.com'
             WHEN referrer_path LIKE '%bing%' THEN 'bing.com'
             WHEN referrer_path LIKE '%facebook%' THEN 'facebook.com'
             WHEN referrer_path LIKE '%twitter%' THEN 'twitter.com'
             ELSE 'other'
           END as referer
         FROM page_visits
         WHERE visited_path ~ '/actor/[a-z0-9-]+-\\d+/?$'
           AND is_internal_referral = true
           AND referrer_path ~ '/actor/[a-z0-9-]+-\\d+/?$'
           AND referrer_path != visited_path
           AND visited_at >= NOW() - INTERVAL '30 days'
           AND visited_path LIKE '%' || $1 || '%'
         GROUP BY referer
         ORDER BY COUNT(*) DESC
         LIMIT 1`,
        [actor.id]
      )

      if (topRefererQuery.rows.length > 0) {
        redirectStats.topReferer = topRefererQuery.rows[0].referer
      }
    } catch (redirectError) {
      // page_visits might not have required columns yet, ignore error
      logger.warn({ redirectError }, "Could not fetch redirect stats")
    }

    res.json({
      actor: {
        id: actor.id,
        tmdbId: actor.tmdb_id,
        name: actor.name,
        deathday: actor.deathday,
        popularity: actor.popularity,
      },
      idConflict,
      urls,
      cache,
      redirectStats,
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch actor diagnostic data")
    res.status(500).json({ error: { message: "Failed to fetch actor diagnostic data" } })
  }
})

export default router
