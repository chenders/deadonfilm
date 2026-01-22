/**
 * Database queries for admin enrichment monitoring.
 *
 * Provides read-only access to enrichment run data for the admin dashboard.
 */

import { Pool } from "pg"

// ============================================================================
// Types
// ============================================================================

export interface EnrichmentRunSummary {
  id: number
  started_at: string
  completed_at: string | null
  duration_ms: number | null
  actors_queried: number
  actors_processed: number
  actors_enriched: number
  actors_with_death_page: number
  fill_rate: string | null
  total_cost_usd: string
  exit_reason: string | null
  error_count: number
}

export interface EnrichmentRunDetails extends EnrichmentRunSummary {
  cost_by_source: Record<string, number>
  source_hit_rates: Record<string, number>
  sources_attempted: string[]
  config: Record<string, unknown>
  links_followed: number
  pages_fetched: number
  ai_link_selections: number
  ai_content_extractions: number
  errors: Array<{ message: string; count: number }>
  script_name: string | null
  script_version: string | null
  hostname: string | null
}

export interface EnrichmentRunActor {
  actor_id: number
  actor_name: string
  actor_tmdb_id: number | null
  was_enriched: boolean
  created_death_page: boolean
  confidence: string | null
  sources_attempted: string[]
  winning_source: string | null
  processing_time_ms: number | null
  cost_usd: string
  links_followed: number
  pages_fetched: number
  error: string | null
}

export interface SourcePerformanceStats {
  source: string
  total_attempts: number
  successful_attempts: number
  success_rate: number
  total_cost_usd: number
  average_cost_usd: number
  total_processing_time_ms: number
  average_processing_time_ms: number
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface EnrichmentRunFilters {
  startDate?: string
  endDate?: string
  minCost?: number
  maxCost?: number
  exitReason?: string
  hasErrors?: boolean
}

// ============================================================================
// Enrichment Runs Queries
// ============================================================================

/**
 * Get paginated list of enrichment runs with optional filters.
 */
export async function getEnrichmentRuns(
  pool: Pool,
  page: number,
  pageSize: number,
  filters: EnrichmentRunFilters = {}
): Promise<PaginatedResult<EnrichmentRunSummary>> {
  const offset = (page - 1) * pageSize
  const conditions: string[] = []
  const params: unknown[] = []
  let paramIndex = 1

  // Apply filters
  if (filters.startDate) {
    conditions.push(`started_at >= $${paramIndex}`)
    params.push(filters.startDate)
    paramIndex++
  }

  if (filters.endDate) {
    conditions.push(`started_at <= $${paramIndex}`)
    params.push(filters.endDate)
    paramIndex++
  }

  if (filters.minCost !== undefined) {
    conditions.push(`total_cost_usd >= $${paramIndex}`)
    params.push(filters.minCost)
    paramIndex++
  }

  if (filters.maxCost !== undefined) {
    conditions.push(`total_cost_usd <= $${paramIndex}`)
    params.push(filters.maxCost)
    paramIndex++
  }

  if (filters.exitReason) {
    conditions.push(`exit_reason = $${paramIndex}`)
    params.push(filters.exitReason)
    paramIndex++
  }

  if (filters.hasErrors !== undefined) {
    if (filters.hasErrors) {
      conditions.push("error_count > 0")
    } else {
      conditions.push("error_count = 0")
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

  // Get total count
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM enrichment_runs ${whereClause}`,
    params
  )
  const total = parseInt(countResult.rows[0].count, 10)

  // Get paginated results
  const dataParams = [...params, pageSize, offset]
  const dataResult = await pool.query<EnrichmentRunSummary>(
    `
    SELECT
      id,
      started_at,
      completed_at,
      duration_ms,
      actors_queried,
      actors_processed,
      actors_enriched,
      actors_with_death_page,
      fill_rate::text,
      total_cost_usd::text,
      exit_reason,
      error_count
    FROM enrichment_runs
    ${whereClause}
    ORDER BY started_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `,
    dataParams
  )

  return {
    items: dataResult.rows,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

/**
 * Get detailed information about a single enrichment run.
 */
export async function getEnrichmentRunDetails(
  pool: Pool,
  runId: number
): Promise<EnrichmentRunDetails | null> {
  const result = await pool.query<EnrichmentRunDetails>(
    `
    SELECT
      id,
      started_at,
      completed_at,
      duration_ms,
      actors_queried,
      actors_processed,
      actors_enriched,
      actors_with_death_page,
      fill_rate::text,
      total_cost_usd::text,
      cost_by_source,
      source_hit_rates,
      sources_attempted,
      config,
      links_followed,
      pages_fetched,
      ai_link_selections,
      ai_content_extractions,
      error_count,
      errors,
      exit_reason,
      script_name,
      script_version,
      hostname
    FROM enrichment_runs
    WHERE id = $1
    `,
    [runId]
  )

  return result.rows[0] || null
}

/**
 * Get per-actor results for an enrichment run.
 */
export async function getEnrichmentRunActors(
  pool: Pool,
  runId: number,
  page: number,
  pageSize: number
): Promise<PaginatedResult<EnrichmentRunActor>> {
  const offset = (page - 1) * pageSize

  // Get total count
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM enrichment_run_actors WHERE run_id = $1`,
    [runId]
  )
  const total = parseInt(countResult.rows[0].count, 10)

  // Get paginated results
  const dataResult = await pool.query<EnrichmentRunActor>(
    `
    SELECT
      era.actor_id,
      a.name AS actor_name,
      a.tmdb_id AS actor_tmdb_id,
      era.was_enriched,
      era.created_death_page,
      era.confidence::text,
      era.sources_attempted,
      era.winning_source,
      era.processing_time_ms,
      era.cost_usd::text,
      era.links_followed,
      era.pages_fetched,
      era.error
    FROM enrichment_run_actors era
    JOIN actors a ON a.id = era.actor_id
    WHERE era.run_id = $1
    ORDER BY era.cost_usd DESC, era.processing_time_ms DESC
    LIMIT $2 OFFSET $3
    `,
    [runId, pageSize, offset]
  )

  return {
    items: dataResult.rows,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

// ============================================================================
// Source Performance Queries
// ============================================================================

/**
 * Get aggregated performance statistics for all death sources.
 * Analyzes data across all enrichment runs.
 */
export async function getSourcePerformanceStats(
  pool: Pool,
  startDate?: string,
  endDate?: string
): Promise<SourcePerformanceStats[]> {
  const conditions: string[] = []
  const params: unknown[] = []
  let paramIndex = 1

  if (startDate) {
    conditions.push(`er.started_at >= $${paramIndex}`)
    params.push(startDate)
    paramIndex++
  }

  if (endDate) {
    conditions.push(`er.started_at <= $${paramIndex}`)
    params.push(endDate)
    paramIndex++
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

  // This query extracts sources from jsonb array and aggregates statistics
  const result = await pool.query<SourcePerformanceStats>(
    `
    WITH source_attempts AS (
      SELECT
        jsonb_array_elements_text(era.sources_attempted) AS source,
        era.winning_source,
        era.cost_usd,
        era.processing_time_ms
      FROM enrichment_run_actors era
      JOIN enrichment_runs er ON era.run_id = er.id
      ${whereClause}
    )
    SELECT
      source,
      COUNT(*)::int AS total_attempts,
      COUNT(*) FILTER (WHERE source = winning_source)::int AS successful_attempts,
      ROUND(
        (COUNT(*) FILTER (WHERE source = winning_source)::decimal / COUNT(*)) * 100,
        2
      )::float AS success_rate,
      COALESCE(SUM(cost_usd), 0)::float AS total_cost_usd,
      COALESCE(AVG(cost_usd), 0)::float AS average_cost_usd,
      COALESCE(SUM(processing_time_ms), 0)::bigint AS total_processing_time_ms,
      COALESCE(AVG(processing_time_ms), 0)::int AS average_processing_time_ms
    FROM source_attempts
    GROUP BY source
    ORDER BY total_attempts DESC, success_rate DESC
    `,
    params
  )

  return result.rows
}

/**
 * Get source performance statistics for a specific enrichment run.
 */
export async function getRunSourcePerformanceStats(
  pool: Pool,
  runId: number
): Promise<SourcePerformanceStats[]> {
  const result = await pool.query<SourcePerformanceStats>(
    `
    WITH source_attempts AS (
      SELECT
        jsonb_array_elements_text(era.sources_attempted) AS source,
        era.winning_source,
        era.cost_usd,
        era.processing_time_ms
      FROM enrichment_run_actors era
      WHERE era.run_id = $1
    )
    SELECT
      source,
      COUNT(*)::int AS total_attempts,
      COUNT(*) FILTER (WHERE source = winning_source)::int AS successful_attempts,
      ROUND(
        (COUNT(*) FILTER (WHERE source = winning_source)::decimal / COUNT(*)) * 100,
        2
      )::float AS success_rate,
      COALESCE(SUM(cost_usd), 0)::float AS total_cost_usd,
      COALESCE(AVG(cost_usd), 0)::float AS average_cost_usd,
      COALESCE(SUM(processing_time_ms), 0)::bigint AS total_processing_time_ms,
      COALESCE(AVG(processing_time_ms), 0)::int AS average_processing_time_ms
    FROM source_attempts
    GROUP BY source
    ORDER BY total_attempts DESC, success_rate DESC
    `,
    [runId]
  )

  return result.rows
}

// ============================================================================
// Stage 5: Review Workflow Queries
// ============================================================================

/**
 * Enrichment pending review with confidence scores
 */
export interface EnrichmentPendingReview {
  enrichment_run_actor_id: number
  run_id: number
  run_started_at: string
  actor_id: number
  actor_name: string
  actor_tmdb_id: number | null
  deathday: string | null
  cause_of_death: string | null
  cause_of_death_details: string | null
  review_status: string
  circumstances_confidence: string | null
  cause_confidence: string | null
  details_confidence: string | null
  deathday_confidence: string | null
  overall_confidence: string | null
  winning_source: string | null
  cost_usd: string
}

/**
 * Detailed enrichment data for review
 */
export interface EnrichmentReviewDetail {
  // Enrichment run actor metadata
  enrichment_run_actor_id: number
  run_id: number
  actor_id: number
  actor_name: string
  actor_tmdb_id: number | null
  was_enriched: boolean
  confidence: string | null
  sources_attempted: string[]
  winning_source: string | null
  processing_time_ms: number | null
  cost_usd: string

  // Staging data
  staging_id: number | null
  review_status: string | null
  deathday: string | null
  cause_of_death: string | null
  cause_of_death_source: string | null
  cause_of_death_details: string | null
  cause_of_death_details_source: string | null
  wikipedia_url: string | null
  age_at_death: number | null
  expected_lifespan: string | null
  years_lost: string | null
  violent_death: boolean | null
  has_detailed_death_info: boolean | null

  // Death circumstances staging
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
  posthumous_releases: Array<Record<string, unknown>> | null
  related_celebrity_ids: number[] | null
  related_celebrities: Array<Record<string, unknown>> | null
  notable_factors: string[] | null
  additional_context: string | null
  sources: Record<string, unknown> | null
  raw_response: Record<string, unknown> | null

  // Current production data (for comparison)
  prod_deathday: string | null
  prod_cause_of_death: string | null
  prod_cause_of_death_details: string | null
  prod_has_detailed_death_info: boolean
}

export interface PendingReviewFilters {
  runId?: number
  minConfidence?: number
  causeConfidence?: "high" | "medium" | "low" | "disputed"
  page?: number
  pageSize?: number
}

/**
 * Get list of enrichments pending review with filtering
 */
export async function getPendingEnrichments(
  pool: Pool,
  filters: PendingReviewFilters = {}
): Promise<PaginatedResult<EnrichmentPendingReview>> {
  const { runId, minConfidence, causeConfidence, page = 1, pageSize = 50 } = filters
  const offset = (page - 1) * pageSize

  const conditions: string[] = ["er.review_status IN ('pending_review', 'in_review')"]
  const params: unknown[] = []
  let paramIndex = 1

  if (runId) {
    conditions.push(`er.id = $${paramIndex}`)
    params.push(runId)
    paramIndex++
  }

  if (minConfidence !== undefined) {
    conditions.push(`era.confidence >= $${paramIndex}`)
    params.push(minConfidence)
    paramIndex++
  }

  if (causeConfidence) {
    conditions.push(`adcs.cause_confidence = $${paramIndex}`)
    params.push(causeConfidence)
    paramIndex++
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

  // Get total count
  const countResult = await pool.query<{ count: string }>(
    `
    SELECT COUNT(*)::text AS count
    FROM enrichment_run_actors era
    JOIN enrichment_runs er ON er.id = era.run_id
    JOIN actor_enrichment_staging aes ON aes.enrichment_run_actor_id = era.id
    LEFT JOIN actor_death_circumstances_staging adcs ON adcs.actor_enrichment_staging_id = aes.id
    ${whereClause}
      AND aes.review_status = 'pending'
      AND era.was_enriched = true
    `,
    params
  )
  const total = parseInt(countResult.rows[0].count, 10)

  // Get paginated results
  params.push(pageSize)
  params.push(offset)

  const dataResult = await pool.query<EnrichmentPendingReview>(
    `
    SELECT
      era.id as enrichment_run_actor_id,
      era.run_id,
      er.started_at as run_started_at,
      era.actor_id,
      a.name as actor_name,
      a.tmdb_id as actor_tmdb_id,
      aes.deathday,
      aes.cause_of_death,
      aes.cause_of_death_details,
      aes.review_status,
      adcs.circumstances_confidence,
      adcs.cause_confidence,
      adcs.details_confidence,
      adcs.deathday_confidence,
      era.confidence::text as overall_confidence,
      era.winning_source,
      era.cost_usd::text
    FROM enrichment_run_actors era
    JOIN enrichment_runs er ON er.id = era.run_id
    JOIN actors a ON a.id = era.actor_id
    LEFT JOIN actor_enrichment_staging aes ON aes.enrichment_run_actor_id = era.id
    LEFT JOIN actor_death_circumstances_staging adcs ON adcs.actor_enrichment_staging_id = aes.id
    ${whereClause}
      AND aes.review_status = 'pending'
      AND era.was_enriched = true
    ORDER BY er.started_at DESC, era.id ASC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `,
    params
  )

  return {
    items: dataResult.rows,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

/**
 * Get detailed data for a single enrichment for review
 */
export async function getEnrichmentReviewDetail(
  pool: Pool,
  enrichmentRunActorId: number
): Promise<EnrichmentReviewDetail | null> {
  const result = await pool.query<EnrichmentReviewDetail>(
    `
    SELECT
      -- Enrichment run actor metadata
      era.id as enrichment_run_actor_id,
      era.run_id,
      era.actor_id,
      a.name as actor_name,
      a.tmdb_id as actor_tmdb_id,
      era.was_enriched,
      era.confidence::text,
      era.sources_attempted,
      era.winning_source,
      era.processing_time_ms,
      era.cost_usd::text,

      -- Staging data
      aes.id as staging_id,
      aes.review_status,
      aes.deathday,
      aes.cause_of_death,
      aes.cause_of_death_source,
      aes.cause_of_death_details,
      aes.cause_of_death_details_source,
      aes.wikipedia_url,
      aes.age_at_death,
      aes.expected_lifespan::text,
      aes.years_lost::text,
      aes.violent_death,
      aes.has_detailed_death_info,

      -- Death circumstances staging
      adcs.circumstances,
      adcs.circumstances_confidence,
      adcs.rumored_circumstances,
      adcs.cause_confidence,
      adcs.details_confidence,
      adcs.birthday_confidence,
      adcs.deathday_confidence,
      adcs.location_of_death,
      adcs.last_project,
      adcs.career_status_at_death,
      adcs.posthumous_releases,
      adcs.related_celebrity_ids,
      adcs.related_celebrities,
      adcs.notable_factors,
      adcs.additional_context,
      adcs.sources,
      adcs.raw_response,

      -- Current production data (for comparison)
      a.deathday as prod_deathday,
      a.cause_of_death as prod_cause_of_death,
      a.cause_of_death_details as prod_cause_of_death_details,
      a.has_detailed_death_info as prod_has_detailed_death_info
    FROM enrichment_run_actors era
    JOIN actors a ON a.id = era.actor_id
    LEFT JOIN actor_enrichment_staging aes ON aes.enrichment_run_actor_id = era.id
    LEFT JOIN actor_death_circumstances_staging adcs ON adcs.actor_enrichment_staging_id = aes.id
    WHERE era.id = $1
    `,
    [enrichmentRunActorId]
  )

  return result.rows[0] || null
}

/**
 * Approve an enrichment (marks for commit, doesn't commit yet)
 */
export async function approveEnrichment(
  pool: Pool,
  enrichmentRunActorId: number,
  adminUser: string,
  notes?: string
): Promise<void> {
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    // Update staging status
    await client.query(
      `UPDATE actor_enrichment_staging
       SET review_status = 'approved'
       WHERE enrichment_run_actor_id = $1`,
      [enrichmentRunActorId]
    )

    // Insert decision record
    await client.query(
      `INSERT INTO enrichment_review_decisions (
        enrichment_run_actor_id,
        decision,
        admin_user,
        admin_notes
      ) VALUES ($1, $2, $3, $4)`,
      [enrichmentRunActorId, "approved", adminUser, notes || null]
    )

    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

/**
 * Reject an enrichment
 */
export async function rejectEnrichment(
  pool: Pool,
  enrichmentRunActorId: number,
  adminUser: string,
  reason: "low_confidence" | "incorrect_data" | "duplicate" | "no_death_info" | "other",
  details?: string
): Promise<void> {
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    // Update staging status
    await client.query(
      `UPDATE actor_enrichment_staging
       SET review_status = 'rejected'
       WHERE enrichment_run_actor_id = $1`,
      [enrichmentRunActorId]
    )

    // Insert decision record
    await client.query(
      `INSERT INTO enrichment_review_decisions (
        enrichment_run_actor_id,
        decision,
        admin_user,
        rejection_reason,
        rejection_details
      ) VALUES ($1, $2, $3, $4, $5)`,
      [enrichmentRunActorId, "rejected", adminUser, reason, details || null]
    )

    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

/**
 * Edit an enrichment before approval
 */
export async function editEnrichment(
  pool: Pool,
  enrichmentRunActorId: number,
  adminUser: string,
  edits: Partial<Omit<EnrichmentReviewDetail, "enrichment_run_actor_id" | "run_id" | "actor_id">>,
  notes?: string
): Promise<void> {
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    // Get original values for audit trail
    const originalResult = await client.query(
      `SELECT aes.*, adcs.*
       FROM actor_enrichment_staging aes
       LEFT JOIN actor_death_circumstances_staging adcs ON adcs.actor_enrichment_staging_id = aes.id
       WHERE aes.enrichment_run_actor_id = $1`,
      [enrichmentRunActorId]
    )

    const original = originalResult.rows[0]

    // Update staging tables with edits
    const stagingUpdates: string[] = []
    const stagingParams: unknown[] = []
    let stagingParamIndex = 1

    // Build dynamic UPDATE statement for actor_enrichment_staging
    const stagingFields = [
      "deathday",
      "cause_of_death",
      "cause_of_death_source",
      "cause_of_death_details",
      "cause_of_death_details_source",
      "wikipedia_url",
      "age_at_death",
      "expected_lifespan",
      "years_lost",
      "violent_death",
      "has_detailed_death_info",
    ]

    for (const field of stagingFields) {
      if (edits[field as keyof typeof edits] !== undefined) {
        stagingUpdates.push(`${field} = $${stagingParamIndex}`)
        stagingParams.push(edits[field as keyof typeof edits])
        stagingParamIndex++
      }
    }

    if (stagingUpdates.length > 0) {
      stagingParams.push(enrichmentRunActorId)
      await client.query(
        `UPDATE actor_enrichment_staging
         SET ${stagingUpdates.join(", ")}, review_status = 'edited'
         WHERE enrichment_run_actor_id = $${stagingParamIndex}`,
        stagingParams
      )
    }

    // Update actor_death_circumstances_staging if needed
    const circumstancesUpdates: string[] = []
    const circumstancesParams: unknown[] = []
    let circumstancesParamIndex = 1

    const circumstancesFields = [
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
      "notable_factors",
      "additional_context",
    ]

    for (const field of circumstancesFields) {
      if (edits[field as keyof typeof edits] !== undefined) {
        circumstancesUpdates.push(`${field} = $${circumstancesParamIndex}`)
        circumstancesParams.push(edits[field as keyof typeof edits])
        circumstancesParamIndex++
      }
    }

    if (circumstancesUpdates.length > 0 && original.id) {
      circumstancesParams.push(original.id)
      await client.query(
        `UPDATE actor_death_circumstances_staging
         SET ${circumstancesUpdates.join(", ")}
         WHERE actor_enrichment_staging_id = $${circumstancesParamIndex}`,
        circumstancesParams
      )
    }

    // Insert decision record
    await client.query(
      `INSERT INTO enrichment_review_decisions (
        enrichment_run_actor_id,
        decision,
        admin_user,
        admin_notes,
        original_values,
        edited_values
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        enrichmentRunActorId,
        "manually_edited",
        adminUser,
        notes || null,
        JSON.stringify(original),
        JSON.stringify(edits),
      ]
    )

    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

/**
 * Commit all approved enrichments for a run to production tables.
 * Copies data from staging to actors and actor_death_circumstances,
 * invalidates caches, and marks run as committed.
 *
 * @returns Object with committedCount indicating how many enrichments were committed
 */
export async function commitEnrichmentRun(
  pool: Pool,
  runId: number,
  adminUser: string,
  notes?: string
): Promise<{ committedCount: number }> {
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    // Get all approved enrichments for this run
    const approvedResult = await client.query<{
      id: number
      actor_id: number
      actor_tmdb_id: number | null
      actor_name: string
      enrichment_run_actor_id: number
      deathday: string | null
      cause_of_death: string | null
      cause_of_death_source: string | null
      cause_of_death_details: string | null
      cause_of_death_details_source: string | null
      wikipedia_url: string | null
      age_at_death: number | null
      expected_lifespan: number | null
      years_lost: number | null
      violent_death: boolean | null
      has_detailed_death_info: boolean | null
    }>(
      `SELECT
         aes.id,
         aes.actor_id,
         a.tmdb_id as actor_tmdb_id,
         a.name as actor_name,
         aes.enrichment_run_actor_id,
         aes.deathday,
         aes.cause_of_death,
         aes.cause_of_death_source,
         aes.cause_of_death_details,
         aes.cause_of_death_details_source,
         aes.wikipedia_url,
         aes.age_at_death,
         aes.expected_lifespan,
         aes.years_lost,
         aes.violent_death,
         aes.has_detailed_death_info
       FROM actor_enrichment_staging aes
       JOIN enrichment_run_actors era ON era.id = aes.enrichment_run_actor_id
       JOIN actors a ON a.id = aes.actor_id
       WHERE era.run_id = $1
         AND aes.review_status = 'approved'`,
      [runId]
    )

    if (approvedResult.rows.length === 0) {
      await client.query("ROLLBACK")
      return { committedCount: 0 }
    }

    const approvedStagingIds = approvedResult.rows.map((r) => r.id)
    const actorTmdbIds: number[] = []

    // For each approved enrichment, copy to production
    for (const staging of approvedResult.rows) {
      // Get circumstances data from staging
      const circumstancesResult = await client.query(
        `SELECT * FROM actor_death_circumstances_staging
         WHERE actor_enrichment_staging_id = $1`,
        [staging.id]
      )

      const circumstances = circumstancesResult.rows[0]

      // Insert/update actor_death_circumstances
      await client.query(
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
          notable_factors,
          additional_context,
          sources,
          raw_response,
          enriched_at,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW(), NOW())
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
          notable_factors = COALESCE(EXCLUDED.notable_factors, actor_death_circumstances.notable_factors),
          additional_context = COALESCE(EXCLUDED.additional_context, actor_death_circumstances.additional_context),
          sources = COALESCE(EXCLUDED.sources, actor_death_circumstances.sources),
          raw_response = COALESCE(EXCLUDED.raw_response, actor_death_circumstances.raw_response),
          enriched_at = NOW(),
          updated_at = NOW()`,
        [
          staging.actor_id,
          circumstances?.circumstances,
          circumstances?.circumstances_confidence,
          circumstances?.rumored_circumstances,
          circumstances?.cause_confidence,
          circumstances?.details_confidence,
          circumstances?.birthday_confidence,
          circumstances?.deathday_confidence,
          circumstances?.location_of_death,
          circumstances?.last_project,
          circumstances?.career_status_at_death,
          circumstances?.posthumous_releases,
          circumstances?.related_celebrity_ids,
          circumstances?.related_celebrities,
          circumstances?.notable_factors,
          circumstances?.additional_context,
          circumstances?.sources,
          circumstances?.raw_response,
        ]
      )

      // Update has_detailed_death_info flag if needed
      if (staging.has_detailed_death_info) {
        await client.query(`UPDATE actors SET has_detailed_death_info = true WHERE id = $1`, [
          staging.actor_id,
        ])
      }

      // Track TMDB IDs for cache invalidation
      if (staging.actor_tmdb_id) {
        actorTmdbIds.push(staging.actor_tmdb_id)
      }
    }

    // Mark all approved staging records as committed
    await client.query(
      `UPDATE actor_enrichment_staging
       SET review_status = 'committed'
       WHERE id = ANY($1)`,
      [approvedStagingIds]
    )

    // Update review decisions with committed_at timestamp
    await client.query(
      `UPDATE enrichment_review_decisions erd
       SET committed_at = NOW()
       FROM actor_enrichment_staging aes
       WHERE erd.enrichment_run_actor_id = aes.enrichment_run_actor_id
         AND aes.id = ANY($1)
         AND erd.decision IN ('approved', 'manually_edited')`,
      [approvedStagingIds]
    )

    // Mark enrichment run as committed
    await client.query(
      `UPDATE enrichment_runs
       SET review_status = 'committed',
           reviewed_by = $2,
           reviewed_at = NOW(),
           review_notes = $3
       WHERE id = $1`,
      [runId, adminUser, notes || null]
    )

    await client.query("COMMIT")

    // After commit, invalidate caches for all updated actors
    // Import cache invalidation dynamically to avoid circular dependency
    const { invalidateActorCache } = await import("../cache.js")
    for (const tmdbId of actorTmdbIds) {
      await invalidateActorCache(tmdbId)
    }

    return { committedCount: approvedResult.rows.length }
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}
