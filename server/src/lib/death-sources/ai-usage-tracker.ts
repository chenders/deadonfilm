/**
 * AI Usage Tracker for death enrichment.
 *
 * Tracks AI model usage and quality metrics for data-driven model selection.
 * Records each AI call with token counts, costs, latency, and quality outcomes.
 *
 * This enables:
 * - Cost analysis by model and operation
 * - Quality comparison between models
 * - Latency benchmarking
 * - Data-driven model selection decisions
 */

import type { Pool } from "pg"

/**
 * Types of AI helper operations.
 */
export type AIOperation = "link_selection" | "content_extraction" | "cleanup"

/**
 * Quality rating for AI results.
 * Set downstream after validation/human review.
 */
export type ResultQuality = "high" | "medium" | "low" | null

/**
 * Record of a single AI usage event.
 */
export interface AIUsageRecord {
  id?: number
  actorId: number
  model: string
  operation: AIOperation
  inputTokens: number
  outputTokens: number
  costUsd: number
  latencyMs: number
  // Quality metrics (set by downstream validation)
  resultQuality: ResultQuality
  circumstancesLength: number | null
  notableFactorsCount: number | null
  hasLocation: boolean
  createdAt?: Date
}

/**
 * Aggregated AI usage statistics.
 */
export interface AIUsageStats {
  totalCalls: number
  totalCostUsd: number
  avgLatencyMs: number
  avgInputTokens: number
  avgOutputTokens: number
  qualityBreakdown: Record<string, number>
}

/**
 * Record an AI helper usage event.
 *
 * @param db - Database pool
 * @param record - Usage record to store
 */
export async function recordAIUsage(
  db: Pool,
  record: Omit<AIUsageRecord, "id" | "createdAt">
): Promise<void> {
  await db.query(
    `INSERT INTO ai_helper_usage (
      actor_id,
      model,
      operation,
      input_tokens,
      output_tokens,
      cost_usd,
      latency_ms,
      result_quality,
      circumstances_length,
      notable_factors_count,
      has_location
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      record.actorId,
      record.model,
      record.operation,
      record.inputTokens,
      record.outputTokens,
      record.costUsd,
      record.latencyMs,
      record.resultQuality,
      record.circumstancesLength,
      record.notableFactorsCount,
      record.hasLocation,
    ]
  )
}

/**
 * Update result quality for a specific usage record.
 * Used after downstream validation determines quality.
 *
 * @param db - Database pool
 * @param id - Usage record ID
 * @param quality - Quality rating
 * @param metrics - Optional quality metrics
 */
export async function updateUsageQuality(
  db: Pool,
  id: number,
  quality: ResultQuality,
  metrics?: {
    circumstancesLength?: number
    notableFactorsCount?: number
    hasLocation?: boolean
  }
): Promise<void> {
  const updates: string[] = ["result_quality = $2"]
  const params: (number | string | boolean | null)[] = [id, quality]
  let paramIndex = 3

  if (metrics?.circumstancesLength !== undefined) {
    updates.push(`circumstances_length = $${paramIndex++}`)
    params.push(metrics.circumstancesLength)
  }
  if (metrics?.notableFactorsCount !== undefined) {
    updates.push(`notable_factors_count = $${paramIndex++}`)
    params.push(metrics.notableFactorsCount)
  }
  if (metrics?.hasLocation !== undefined) {
    updates.push(`has_location = $${paramIndex++}`)
    params.push(metrics.hasLocation)
  }

  await db.query(`UPDATE ai_helper_usage SET ${updates.join(", ")} WHERE id = $1`, params)
}

/**
 * Get aggregated AI usage statistics.
 *
 * @param db - Database pool
 * @param filters - Optional filters for statistics
 * @returns Aggregated statistics
 */
export async function getAIUsageStats(
  db: Pool,
  filters?: {
    model?: string
    operation?: AIOperation
    since?: Date
  }
): Promise<AIUsageStats> {
  const conditions: string[] = []
  const params: (string | Date)[] = []
  let paramIndex = 1

  if (filters?.model) {
    conditions.push(`model = $${paramIndex++}`)
    params.push(filters.model)
  }
  if (filters?.operation) {
    conditions.push(`operation = $${paramIndex++}`)
    params.push(filters.operation)
  }
  if (filters?.since) {
    conditions.push(`created_at >= $${paramIndex++}`)
    params.push(filters.since)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

  const result = await db.query<{
    total_calls: string
    total_cost_usd: string
    avg_latency_ms: string
    avg_input_tokens: string
    avg_output_tokens: string
  }>(
    `SELECT
      COUNT(*)::text as total_calls,
      COALESCE(SUM(cost_usd), 0)::text as total_cost_usd,
      COALESCE(AVG(latency_ms), 0)::text as avg_latency_ms,
      COALESCE(AVG(input_tokens), 0)::text as avg_input_tokens,
      COALESCE(AVG(output_tokens), 0)::text as avg_output_tokens
    FROM ai_helper_usage
    ${whereClause}`,
    params
  )

  // Get quality breakdown
  const qualityResult = await db.query<{
    result_quality: string | null
    count: string
  }>(
    `SELECT
      COALESCE(result_quality, 'unrated') as result_quality,
      COUNT(*)::text as count
    FROM ai_helper_usage
    ${whereClause}
    GROUP BY result_quality`,
    params
  )

  const qualityBreakdown: Record<string, number> = {}
  for (const row of qualityResult.rows) {
    qualityBreakdown[row.result_quality || "unrated"] = parseInt(row.count, 10)
  }

  const row = result.rows[0]
  return {
    totalCalls: parseInt(row.total_calls, 10),
    totalCostUsd: parseFloat(row.total_cost_usd),
    avgLatencyMs: parseFloat(row.avg_latency_ms),
    avgInputTokens: parseFloat(row.avg_input_tokens),
    avgOutputTokens: parseFloat(row.avg_output_tokens),
    qualityBreakdown,
  }
}

/**
 * Get AI usage grouped by model for comparison.
 *
 * @param db - Database pool
 * @param since - Only include records after this date
 * @returns Usage stats per model
 */
export async function getAIUsageByModel(
  db: Pool,
  since?: Date
): Promise<
  Map<
    string,
    {
      calls: number
      totalCost: number
      avgLatency: number
      avgQuality: number | null
    }
  >
> {
  const params: Date[] = []
  let whereClause = ""

  if (since) {
    whereClause = "WHERE created_at >= $1"
    params.push(since)
  }

  const result = await db.query<{
    model: string
    calls: string
    total_cost: string
    avg_latency: string
    high_quality_count: string
    rated_count: string
  }>(
    `SELECT
      model,
      COUNT(*)::text as calls,
      SUM(cost_usd)::text as total_cost,
      AVG(latency_ms)::text as avg_latency,
      COUNT(*) FILTER (WHERE result_quality = 'high')::text as high_quality_count,
      COUNT(*) FILTER (WHERE result_quality IS NOT NULL)::text as rated_count
    FROM ai_helper_usage
    ${whereClause}
    GROUP BY model
    ORDER BY SUM(cost_usd) DESC`,
    params
  )

  const stats = new Map<
    string,
    {
      calls: number
      totalCost: number
      avgLatency: number
      avgQuality: number | null
    }
  >()

  for (const row of result.rows) {
    const ratedCount = parseInt(row.rated_count, 10)
    const highCount = parseInt(row.high_quality_count, 10)

    stats.set(row.model, {
      calls: parseInt(row.calls, 10),
      totalCost: parseFloat(row.total_cost),
      avgLatency: parseFloat(row.avg_latency),
      avgQuality: ratedCount > 0 ? highCount / ratedCount : null,
    })
  }

  return stats
}

/**
 * Check if the ai_helper_usage table exists.
 * Returns false if the migration hasn't been run yet.
 */
export async function aiUsageTableExists(db: Pool): Promise<boolean> {
  const result = await db.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_name = 'ai_helper_usage'
    )`
  )
  return result.rows[0]?.exists ?? false
}
