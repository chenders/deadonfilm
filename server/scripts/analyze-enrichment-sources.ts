#!/usr/bin/env tsx
/**
 * Analyze enrichment source effectiveness across death and biography pipelines.
 *
 * Produces reports on:
 * 1. Per-source hit rates (attempts, successes, cost)
 * 2. Marginal source value (first-to-succeed, exclusive wins)
 * 3. Early stopping distribution (how many sources tried per actor)
 * 4. Source redundancy matrix (pairwise co-success rates)
 * 5. Coverage gaps (zero/single-source actors, breakdown by decade)
 *
 * Usage:
 *   cd server && npx tsx scripts/analyze-enrichment-sources.ts [options]
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { getPool, resetPool } from "../src/lib/db.js"

type SystemType = "death" | "bio" | "both"
type FormatType = "table" | "json"

interface Options {
  system: SystemType
  runId?: number
  top: number
  since?: string
  format: FormatType
}

interface HitRateRow {
  source: string
  attempts: number
  successes: number
  success_rate: number
  total_cost: number
  cost_per_success: number
}

interface MarginalValueRow {
  source: string
  successes: number
  first_to_succeed: number
  exclusive_wins: number
  wins: number
  win_rate: number
}

interface EarlyStoppingRow {
  sources_tried: number
  actor_count: number
}

interface CoverageGapRow {
  decade: string
  total_actors: number
  zero_sources: number
  single_source: number
  multi_source: number
}

interface RedundancyPair {
  source_a: string
  source_b: string
  both_success: number
  a_success: number
  co_success_rate: number
}

interface SystemReport {
  system: string
  actorCount: number
  runCount: number
  hitRates: HitRateRow[]
  marginalValue: MarginalValueRow[]
  earlyStopping: EarlyStoppingRow[]
  coverageGaps: {
    zeroSources: number
    singleSource: number
    totalActors: number
    byDecade: CoverageGapRow[]
  }
  redundancyMatrix: RedundancyPair[]
}

function parsePositiveInt(value: string): number {
  const n = parseInt(value, 10)
  if (isNaN(n) || !Number.isInteger(n) || n <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return n
}

function validateDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new InvalidArgumentError("Must be YYYY-MM-DD format")
  }
  return value
}

// ─── SQL Query Builders ─────────────────────────────────────────────

function buildRunFilter(
  tableAlias: string,
  runTable: string,
  opts: Options
): { joins: string; where: string; params: unknown[] } {
  const joins: string[] = []
  const conditions: string[] = []
  const params: unknown[] = []
  let paramIndex = 1

  joins.push(`JOIN ${runTable} er ON ${tableAlias}.run_id = er.id`)

  if (opts.runId) {
    conditions.push(`${tableAlias}.run_id = $${paramIndex++}`)
    params.push(opts.runId)
  }
  if (opts.since) {
    conditions.push(`er.started_at >= $${paramIndex++}`)
    params.push(opts.since)
  }

  return {
    joins: joins.join("\n"),
    where: conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "",
    params,
  }
}

// ─── Death Enrichment Queries ───────────────────────────────────────

async function getDeathHitRates(opts: Options): Promise<HitRateRow[]> {
  const db = getPool()
  const filter = buildRunFilter("era", "enrichment_runs", opts)

  const result = await db.query<{
    source: string
    attempts: string
    successes: string
    success_rate: string
    total_cost: string
    cost_per_success: string
  }>(
    `
    WITH source_attempts AS (
      SELECT
        s.elem->>'source' AS source,
        (s.elem->>'success')::boolean AS success,
        COALESCE((s.elem->>'costUsd')::numeric, 0) AS cost
      FROM enrichment_run_actors era
      ${filter.joins}
      CROSS JOIN LATERAL jsonb_array_elements(era.sources_attempted)
        AS s(elem)
      WHERE era.sources_attempted IS NOT NULL
        AND jsonb_array_length(era.sources_attempted) > 0
        ${filter.where}
    )
    SELECT
      source,
      COUNT(*)::int AS attempts,
      COUNT(*) FILTER (WHERE success)::int AS successes,
      ROUND(
        (COUNT(*) FILTER (WHERE success)::numeric / NULLIF(COUNT(*), 0)) * 100, 1
      )::float AS success_rate,
      ROUND(SUM(cost)::numeric, 4)::float AS total_cost,
      ROUND(
        (SUM(cost) FILTER (WHERE success) / NULLIF(COUNT(*) FILTER (WHERE success), 0))::numeric, 4
      )::float AS cost_per_success
    FROM source_attempts
    WHERE source IS NOT NULL
    GROUP BY source
    ORDER BY attempts DESC
    `,
    filter.params
  )

  return result.rows.map((r) => ({
    source: r.source,
    attempts: parseInt(String(r.attempts), 10),
    successes: parseInt(String(r.successes), 10),
    success_rate: parseFloat(String(r.success_rate ?? "0")),
    total_cost: parseFloat(String(r.total_cost ?? "0")),
    cost_per_success: parseFloat(String(r.cost_per_success ?? "0")),
  }))
}

async function getDeathMarginalValue(opts: Options): Promise<MarginalValueRow[]> {
  const db = getPool()
  const filter = buildRunFilter("era", "enrichment_runs", opts)

  const result = await db.query<{
    source: string
    successes: string
    first_to_succeed: string
    exclusive_wins: string
    wins: string
    win_rate: string
  }>(
    `
    WITH ordered_attempts AS (
      SELECT
        era.actor_id,
        era.winning_source,
        s.ordinality,
        s.elem->>'source' AS source,
        (s.elem->>'success')::boolean AS success
      FROM enrichment_run_actors era
      ${filter.joins}
      CROSS JOIN LATERAL jsonb_array_elements(era.sources_attempted)
        WITH ORDINALITY AS s(elem, ordinality)
      WHERE era.sources_attempted IS NOT NULL
        AND jsonb_array_length(era.sources_attempted) > 0
        ${filter.where}
    ),
    first_success AS (
      SELECT actor_id, MIN(ordinality) AS first_pos
      FROM ordered_attempts
      WHERE success
      GROUP BY actor_id
    ),
    success_counts AS (
      SELECT actor_id, COUNT(*) AS num_successes
      FROM ordered_attempts
      WHERE success
      GROUP BY actor_id
    )
    SELECT
      oa.source,
      COUNT(DISTINCT oa.actor_id) FILTER (WHERE oa.success)::int AS successes,
      COUNT(DISTINCT oa.actor_id) FILTER (
        WHERE oa.success AND oa.ordinality = fs.first_pos
      )::int AS first_to_succeed,
      COUNT(DISTINCT oa.actor_id) FILTER (
        WHERE oa.source = oa.winning_source AND sc.num_successes = 1
      )::int AS exclusive_wins,
      COUNT(DISTINCT oa.actor_id) FILTER (
        WHERE oa.source = oa.winning_source
      )::int AS wins,
      ROUND(
        (COUNT(DISTINCT oa.actor_id) FILTER (WHERE oa.source = oa.winning_source)::numeric
         / NULLIF(COUNT(DISTINCT oa.actor_id), 0)) * 100, 1
      )::float AS win_rate
    FROM ordered_attempts oa
    LEFT JOIN first_success fs USING (actor_id)
    LEFT JOIN success_counts sc USING (actor_id)
    WHERE oa.source IS NOT NULL
    GROUP BY oa.source
    ORDER BY successes DESC
    `,
    filter.params
  )

  return result.rows.map((r) => ({
    source: r.source,
    successes: parseInt(String(r.successes), 10),
    first_to_succeed: parseInt(String(r.first_to_succeed), 10),
    exclusive_wins: parseInt(String(r.exclusive_wins), 10),
    wins: parseInt(String(r.wins), 10),
    win_rate: parseFloat(String(r.win_rate ?? "0")),
  }))
}

async function getDeathEarlyStopping(opts: Options): Promise<EarlyStoppingRow[]> {
  const db = getPool()
  const filter = buildRunFilter("era", "enrichment_runs", opts)

  const result = await db.query<{ sources_tried: string; actor_count: string }>(
    `
    SELECT
      jsonb_array_length(era.sources_attempted) AS sources_tried,
      COUNT(*)::int AS actor_count
    FROM enrichment_run_actors era
    ${filter.joins}
    WHERE era.sources_attempted IS NOT NULL
      AND jsonb_array_length(era.sources_attempted) > 0
      ${filter.where}
    GROUP BY 1
    ORDER BY 1
    `,
    filter.params
  )

  return result.rows.map((r) => ({
    sources_tried: parseInt(String(r.sources_tried), 10),
    actor_count: parseInt(String(r.actor_count), 10),
  }))
}

async function getDeathCoverageGaps(opts: Options): Promise<CoverageGapRow[]> {
  const db = getPool()
  const filter = buildRunFilter("era", "enrichment_runs", opts)

  const result = await db.query<{
    decade: string
    total_actors: string
    zero_sources: string
    single_source: string
    multi_source: string
  }>(
    `
    WITH actor_source_counts AS (
      SELECT
        era.actor_id,
        a.deathday,
        COUNT(*) FILTER (
          WHERE (s.elem->>'success')::boolean
        ) AS num_successes
      FROM enrichment_run_actors era
      ${filter.joins}
      JOIN actors a ON era.actor_id = a.id
      CROSS JOIN LATERAL jsonb_array_elements(era.sources_attempted)
        AS s(elem)
      WHERE era.sources_attempted IS NOT NULL
        AND jsonb_array_length(era.sources_attempted) > 0
        ${filter.where}
      GROUP BY era.actor_id, a.deathday
    )
    SELECT
      COALESCE(
        (EXTRACT(DECADE FROM deathday) * 10)::int::text || 's',
        'Unknown'
      ) AS decade,
      COUNT(*)::int AS total_actors,
      COUNT(*) FILTER (WHERE num_successes = 0)::int AS zero_sources,
      COUNT(*) FILTER (WHERE num_successes = 1)::int AS single_source,
      COUNT(*) FILTER (WHERE num_successes >= 2)::int AS multi_source
    FROM actor_source_counts
    GROUP BY 1
    ORDER BY 1
    `,
    filter.params
  )

  return result.rows.map((r) => ({
    decade: r.decade,
    total_actors: parseInt(String(r.total_actors), 10),
    zero_sources: parseInt(String(r.zero_sources), 10),
    single_source: parseInt(String(r.single_source), 10),
    multi_source: parseInt(String(r.multi_source), 10),
  }))
}

async function getDeathRedundancy(opts: Options, topN: number): Promise<RedundancyPair[]> {
  const db = getPool()
  const filter = buildRunFilter("era", "enrichment_runs", opts)
  const topNParam = filter.params.length + 1

  const result = await db.query<{
    source_a: string
    source_b: string
    both_success: string
    a_success: string
    co_success_rate: string
  }>(
    `
    WITH successful_sources AS (
      SELECT DISTINCT
        era.actor_id,
        s.elem->>'source' AS source
      FROM enrichment_run_actors era
      ${filter.joins}
      CROSS JOIN LATERAL jsonb_array_elements(era.sources_attempted)
        AS s(elem)
      WHERE era.sources_attempted IS NOT NULL
        AND jsonb_array_length(era.sources_attempted) > 0
        AND (s.elem->>'success')::boolean
        ${filter.where}
    ),
    top_sources AS (
      SELECT source, COUNT(*) AS cnt
      FROM successful_sources
      GROUP BY source
      ORDER BY cnt DESC
      LIMIT $${topNParam}
    )
    SELECT
      a.source AS source_a,
      b.source AS source_b,
      COUNT(*)::int AS both_success,
      ts_a.cnt::int AS a_success,
      ROUND(
        (COUNT(*)::numeric / ts_a.cnt) * 100, 1
      )::float AS co_success_rate
    FROM successful_sources a
    JOIN successful_sources b
      ON a.actor_id = b.actor_id AND a.source < b.source
    JOIN top_sources ts_a ON a.source = ts_a.source
    JOIN top_sources ts_b ON b.source = ts_b.source
    GROUP BY a.source, b.source, ts_a.cnt
    ORDER BY co_success_rate DESC
    `,
    [...filter.params, topN]
  )

  return result.rows.map((r) => ({
    source_a: r.source_a,
    source_b: r.source_b,
    both_success: parseInt(String(r.both_success), 10),
    a_success: parseInt(String(r.a_success), 10),
    co_success_rate: parseFloat(String(r.co_success_rate ?? "0")),
  }))
}

async function getDeathSummary(opts: Options): Promise<{ actors: number; runs: number }> {
  const db = getPool()
  const params: unknown[] = []
  const conditions: string[] = []
  let paramIndex = 1

  if (opts.runId) {
    conditions.push(`era.run_id = $${paramIndex++}`)
    params.push(opts.runId)
  }
  if (opts.since) {
    conditions.push(`er.started_at >= $${paramIndex++}`)
    params.push(opts.since)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

  const result = await db.query<{ actors: string; runs: string }>(
    `
    SELECT
      COUNT(DISTINCT era.actor_id)::int AS actors,
      COUNT(DISTINCT era.run_id)::int AS runs
    FROM enrichment_run_actors era
    JOIN enrichment_runs er ON era.run_id = er.id
    ${whereClause}
    `,
    params
  )

  const row = result.rows[0]
  return {
    actors: parseInt(row?.actors ?? "0", 10),
    runs: parseInt(row?.runs ?? "0", 10),
  }
}

// ─── Biography Enrichment Queries ───────────────────────────────────
// Bio uses the same structure but different table names and no winning_source column.

async function getBioHitRates(opts: Options): Promise<HitRateRow[]> {
  const db = getPool()
  const filter = buildRunFilter("bra", "bio_enrichment_runs", opts)

  const result = await db.query<{
    source: string
    attempts: string
    successes: string
    success_rate: string
    total_cost: string
    cost_per_success: string
  }>(
    `
    WITH source_attempts AS (
      SELECT
        s.elem->>'source' AS source,
        (s.elem->>'success')::boolean AS success,
        COALESCE((s.elem->>'costUsd')::numeric, 0) AS cost
      FROM bio_enrichment_run_actors bra
      ${filter.joins}
      CROSS JOIN LATERAL jsonb_array_elements(bra.sources_attempted)
        AS s(elem)
      WHERE bra.sources_attempted IS NOT NULL
        AND jsonb_array_length(bra.sources_attempted) > 0
        ${filter.where}
    )
    SELECT
      source,
      COUNT(*)::int AS attempts,
      COUNT(*) FILTER (WHERE success)::int AS successes,
      ROUND(
        (COUNT(*) FILTER (WHERE success)::numeric / NULLIF(COUNT(*), 0)) * 100, 1
      )::float AS success_rate,
      ROUND(SUM(cost)::numeric, 4)::float AS total_cost,
      ROUND(
        (SUM(cost) FILTER (WHERE success) / NULLIF(COUNT(*) FILTER (WHERE success), 0))::numeric, 4
      )::float AS cost_per_success
    FROM source_attempts
    WHERE source IS NOT NULL
    GROUP BY source
    ORDER BY attempts DESC
    `,
    filter.params
  )

  return result.rows.map((r) => ({
    source: r.source,
    attempts: parseInt(String(r.attempts), 10),
    successes: parseInt(String(r.successes), 10),
    success_rate: parseFloat(String(r.success_rate ?? "0")),
    total_cost: parseFloat(String(r.total_cost ?? "0")),
    cost_per_success: parseFloat(String(r.cost_per_success ?? "0")),
  }))
}

async function getBioMarginalValue(opts: Options): Promise<MarginalValueRow[]> {
  const db = getPool()
  const filter = buildRunFilter("bra", "bio_enrichment_runs", opts)

  // Bio enrichment has no winning_source column — use the source with highest
  // confidence as a proxy for "winner".
  const result = await db.query<{
    source: string
    successes: string
    first_to_succeed: string
    exclusive_wins: string
    wins: string
    win_rate: string
  }>(
    `
    WITH ordered_attempts AS (
      SELECT
        bra.actor_id,
        s.ordinality,
        s.elem->>'source' AS source,
        (s.elem->>'success')::boolean AS success,
        COALESCE((s.elem->>'confidence')::numeric, 0) AS confidence
      FROM bio_enrichment_run_actors bra
      ${filter.joins}
      CROSS JOIN LATERAL jsonb_array_elements(bra.sources_attempted)
        WITH ORDINALITY AS s(elem, ordinality)
      WHERE bra.sources_attempted IS NOT NULL
        AND jsonb_array_length(bra.sources_attempted) > 0
        ${filter.where}
    ),
    first_success AS (
      SELECT actor_id, MIN(ordinality) AS first_pos
      FROM ordered_attempts
      WHERE success
      GROUP BY actor_id
    ),
    best_source AS (
      SELECT DISTINCT ON (actor_id) actor_id, source AS best
      FROM ordered_attempts
      WHERE success
      ORDER BY actor_id, confidence DESC, ordinality ASC
    ),
    success_counts AS (
      SELECT actor_id, COUNT(*) AS num_successes
      FROM ordered_attempts
      WHERE success
      GROUP BY actor_id
    )
    SELECT
      oa.source,
      COUNT(DISTINCT oa.actor_id) FILTER (WHERE oa.success)::int AS successes,
      COUNT(DISTINCT oa.actor_id) FILTER (
        WHERE oa.success AND oa.ordinality = fs.first_pos
      )::int AS first_to_succeed,
      COUNT(DISTINCT oa.actor_id) FILTER (
        WHERE oa.source = bs.best AND sc.num_successes = 1
      )::int AS exclusive_wins,
      COUNT(DISTINCT oa.actor_id) FILTER (
        WHERE oa.source = bs.best
      )::int AS wins,
      ROUND(
        (COUNT(DISTINCT oa.actor_id) FILTER (WHERE oa.source = bs.best)::numeric
         / NULLIF(COUNT(DISTINCT oa.actor_id), 0)) * 100, 1
      )::float AS win_rate
    FROM ordered_attempts oa
    LEFT JOIN first_success fs USING (actor_id)
    LEFT JOIN best_source bs USING (actor_id)
    LEFT JOIN success_counts sc USING (actor_id)
    WHERE oa.source IS NOT NULL
    GROUP BY oa.source
    ORDER BY successes DESC
    `,
    filter.params
  )

  return result.rows.map((r) => ({
    source: r.source,
    successes: parseInt(String(r.successes), 10),
    first_to_succeed: parseInt(String(r.first_to_succeed), 10),
    exclusive_wins: parseInt(String(r.exclusive_wins), 10),
    wins: parseInt(String(r.wins), 10),
    win_rate: parseFloat(String(r.win_rate ?? "0")),
  }))
}

async function getBioEarlyStopping(opts: Options): Promise<EarlyStoppingRow[]> {
  const db = getPool()
  const filter = buildRunFilter("bra", "bio_enrichment_runs", opts)

  const result = await db.query<{ sources_tried: string; actor_count: string }>(
    `
    SELECT
      jsonb_array_length(bra.sources_attempted) AS sources_tried,
      COUNT(*)::int AS actor_count
    FROM bio_enrichment_run_actors bra
    ${filter.joins}
    WHERE bra.sources_attempted IS NOT NULL
      AND jsonb_array_length(bra.sources_attempted) > 0
      ${filter.where}
    GROUP BY 1
    ORDER BY 1
    `,
    filter.params
  )

  return result.rows.map((r) => ({
    sources_tried: parseInt(String(r.sources_tried), 10),
    actor_count: parseInt(String(r.actor_count), 10),
  }))
}

async function getBioCoverageGaps(opts: Options): Promise<CoverageGapRow[]> {
  const db = getPool()
  const filter = buildRunFilter("bra", "bio_enrichment_runs", opts)

  const result = await db.query<{
    decade: string
    total_actors: string
    zero_sources: string
    single_source: string
    multi_source: string
  }>(
    `
    WITH actor_source_counts AS (
      SELECT
        bra.actor_id,
        a.deathday,
        COUNT(*) FILTER (
          WHERE (s.elem->>'success')::boolean
        ) AS num_successes
      FROM bio_enrichment_run_actors bra
      ${filter.joins}
      JOIN actors a ON bra.actor_id = a.id
      CROSS JOIN LATERAL jsonb_array_elements(bra.sources_attempted)
        AS s(elem)
      WHERE bra.sources_attempted IS NOT NULL
        AND jsonb_array_length(bra.sources_attempted) > 0
        ${filter.where}
      GROUP BY bra.actor_id, a.deathday
    )
    SELECT
      COALESCE(
        (EXTRACT(DECADE FROM deathday) * 10)::int::text || 's',
        'Unknown'
      ) AS decade,
      COUNT(*)::int AS total_actors,
      COUNT(*) FILTER (WHERE num_successes = 0)::int AS zero_sources,
      COUNT(*) FILTER (WHERE num_successes = 1)::int AS single_source,
      COUNT(*) FILTER (WHERE num_successes >= 2)::int AS multi_source
    FROM actor_source_counts
    GROUP BY 1
    ORDER BY 1
    `,
    filter.params
  )

  return result.rows.map((r) => ({
    decade: r.decade,
    total_actors: parseInt(String(r.total_actors), 10),
    zero_sources: parseInt(String(r.zero_sources), 10),
    single_source: parseInt(String(r.single_source), 10),
    multi_source: parseInt(String(r.multi_source), 10),
  }))
}

async function getBioRedundancy(opts: Options, topN: number): Promise<RedundancyPair[]> {
  const db = getPool()
  const filter = buildRunFilter("bra", "bio_enrichment_runs", opts)
  const topNParam = filter.params.length + 1

  const result = await db.query<{
    source_a: string
    source_b: string
    both_success: string
    a_success: string
    co_success_rate: string
  }>(
    `
    WITH successful_sources AS (
      SELECT DISTINCT
        bra.actor_id,
        s.elem->>'source' AS source
      FROM bio_enrichment_run_actors bra
      ${filter.joins}
      CROSS JOIN LATERAL jsonb_array_elements(bra.sources_attempted)
        AS s(elem)
      WHERE bra.sources_attempted IS NOT NULL
        AND jsonb_array_length(bra.sources_attempted) > 0
        AND (s.elem->>'success')::boolean
        ${filter.where}
    ),
    top_sources AS (
      SELECT source, COUNT(*) AS cnt
      FROM successful_sources
      GROUP BY source
      ORDER BY cnt DESC
      LIMIT $${topNParam}
    )
    SELECT
      a.source AS source_a,
      b.source AS source_b,
      COUNT(*)::int AS both_success,
      ts_a.cnt::int AS a_success,
      ROUND(
        (COUNT(*)::numeric / ts_a.cnt) * 100, 1
      )::float AS co_success_rate
    FROM successful_sources a
    JOIN successful_sources b
      ON a.actor_id = b.actor_id AND a.source < b.source
    JOIN top_sources ts_a ON a.source = ts_a.source
    JOIN top_sources ts_b ON b.source = ts_b.source
    GROUP BY a.source, b.source, ts_a.cnt
    ORDER BY co_success_rate DESC
    `,
    [...filter.params, topN]
  )

  return result.rows.map((r) => ({
    source_a: r.source_a,
    source_b: r.source_b,
    both_success: parseInt(String(r.both_success), 10),
    a_success: parseInt(String(r.a_success), 10),
    co_success_rate: parseFloat(String(r.co_success_rate ?? "0")),
  }))
}

async function getBioSummary(opts: Options): Promise<{ actors: number; runs: number }> {
  const db = getPool()
  const params: unknown[] = []
  const conditions: string[] = []
  let paramIndex = 1

  if (opts.runId) {
    conditions.push(`bra.run_id = $${paramIndex++}`)
    params.push(opts.runId)
  }
  if (opts.since) {
    conditions.push(`er.started_at >= $${paramIndex++}`)
    params.push(opts.since)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

  const result = await db.query<{ actors: string; runs: string }>(
    `
    SELECT
      COUNT(DISTINCT bra.actor_id)::int AS actors,
      COUNT(DISTINCT bra.run_id)::int AS runs
    FROM bio_enrichment_run_actors bra
    JOIN bio_enrichment_runs er ON bra.run_id = er.id
    ${whereClause}
    `,
    params
  )

  const row = result.rows[0]
  return {
    actors: parseInt(row?.actors ?? "0", 10),
    runs: parseInt(row?.runs ?? "0", 10),
  }
}

// ─── Report Assembly ────────────────────────────────────────────────

async function buildReport(system: "death" | "bio", opts: Options): Promise<SystemReport> {
  const isDeath = system === "death"
  const label = isDeath ? "Death" : "Biography"

  const summary = isDeath ? await getDeathSummary(opts) : await getBioSummary(opts)

  if (summary.actors === 0) {
    console.log(`\n  No ${label.toLowerCase()} enrichment data found.\n`)
    return {
      system: label,
      actorCount: 0,
      runCount: 0,
      hitRates: [],
      marginalValue: [],
      earlyStopping: [],
      coverageGaps: { zeroSources: 0, singleSource: 0, totalActors: 0, byDecade: [] },
      redundancyMatrix: [],
    }
  }

  const [hitRates, marginalValue, earlyStopping, coverageByDecade, redundancyMatrix] =
    await Promise.all([
      isDeath ? getDeathHitRates(opts) : getBioHitRates(opts),
      isDeath ? getDeathMarginalValue(opts) : getBioMarginalValue(opts),
      isDeath ? getDeathEarlyStopping(opts) : getBioEarlyStopping(opts),
      isDeath ? getDeathCoverageGaps(opts) : getBioCoverageGaps(opts),
      isDeath ? getDeathRedundancy(opts, opts.top) : getBioRedundancy(opts, opts.top),
    ])

  const totalActors = coverageByDecade.reduce((s, r) => s + r.total_actors, 0)
  const zeroSources = coverageByDecade.reduce((s, r) => s + r.zero_sources, 0)
  const singleSource = coverageByDecade.reduce((s, r) => s + r.single_source, 0)

  return {
    system: label,
    actorCount: summary.actors,
    runCount: summary.runs,
    hitRates,
    marginalValue,
    earlyStopping,
    coverageGaps: {
      zeroSources,
      singleSource,
      totalActors,
      byDecade: coverageByDecade,
    },
    redundancyMatrix,
  }
}

// ─── Table Formatting ───────────────────────────────────────────────

function pad(str: string | null | undefined, len: number): string {
  const s = str ?? "(unknown)"
  return s.length >= len ? s.slice(0, len) : s + " ".repeat(len - s.length)
}

function padLeft(str: string | null | undefined, len: number): string {
  const s = str ?? ""
  return s.length >= len ? s.slice(0, len) : " ".repeat(len - s.length) + s
}

function pct(n: number, total: number): string {
  if (total === 0) return "0.0%"
  return ((n / total) * 100).toFixed(1) + "%"
}

function formatCost(n: number): string {
  if (n === 0) return "$0.000"
  return "$" + n.toFixed(4)
}

function printReport(report: SystemReport): void {
  const { system, actorCount, runCount } = report

  console.log(
    `\n${"=".repeat(60)}\n  ${system.toUpperCase()} ENRICHMENT SOURCE ANALYSIS\n  ${actorCount.toLocaleString()} actors across ${runCount.toLocaleString()} runs\n${"=".repeat(60)}`
  )

  // 1. Hit Rates
  console.log(`\n-- Source Hit Rates ${"─".repeat(41)}`)
  console.log(
    `${pad("Source", 24)} ${padLeft("Attempts", 10)} ${padLeft("Successes", 10)} ${padLeft("Rate", 8)} ${padLeft("Cost/Succ", 12)}`
  )
  for (const r of report.hitRates) {
    console.log(
      `${pad(r.source, 24)} ${padLeft(r.attempts.toLocaleString(), 10)} ${padLeft(r.successes.toLocaleString(), 10)} ${padLeft(r.success_rate.toFixed(1) + "%", 8)} ${padLeft(formatCost(r.cost_per_success), 12)}`
    )
  }

  // 2. Marginal Value
  console.log(`\n-- Marginal Value ${"─".repeat(42)}`)
  console.log(
    `${pad("Source", 24)} ${padLeft("Successes", 10)} ${padLeft("1st-Win", 10)} ${padLeft("Exclusive", 10)} ${padLeft("WinRate", 10)}`
  )
  for (const r of report.marginalValue) {
    if (r.successes === 0) continue
    console.log(
      `${pad(r.source, 24)} ${padLeft(r.successes.toLocaleString(), 10)} ${padLeft(r.first_to_succeed.toLocaleString(), 10)} ${padLeft(r.exclusive_wins.toLocaleString(), 10)} ${padLeft(r.win_rate.toFixed(1) + "%", 10)}`
    )
  }

  // 3. Early Stopping
  console.log(`\n-- Early Stopping ${"─".repeat(42)}`)
  const totalActorsES = report.earlyStopping.reduce((s, r) => s + r.actor_count, 0)
  let cumulative = 0
  console.log(`${pad("Sources Tried", 16)} ${padLeft("Actors", 10)} ${padLeft("Cumulative%", 14)}`)
  for (const r of report.earlyStopping) {
    cumulative += r.actor_count
    console.log(
      `${pad(String(r.sources_tried), 16)} ${padLeft(r.actor_count.toLocaleString(), 10)} ${padLeft(pct(cumulative, totalActorsES), 14)}`
    )
  }

  // 4. Coverage Gaps
  const { coverageGaps } = report
  console.log(`\n-- Coverage Gaps ${"─".repeat(43)}`)
  console.log(
    `  Zero successes:       ${coverageGaps.zeroSources.toLocaleString()} (${pct(coverageGaps.zeroSources, coverageGaps.totalActors)})`
  )
  console.log(
    `  Single source only:   ${coverageGaps.singleSource.toLocaleString()} (${pct(coverageGaps.singleSource, coverageGaps.totalActors)})`
  )

  if (coverageGaps.byDecade.length > 0) {
    console.log(
      `\n  ${pad("Decade", 10)} ${padLeft("Total", 8)} ${padLeft("Zero", 8)} ${padLeft("Single", 8)} ${padLeft("Multi", 8)}`
    )
    for (const d of coverageGaps.byDecade) {
      console.log(
        `  ${pad(d.decade, 10)} ${padLeft(d.total_actors.toLocaleString(), 8)} ${padLeft(d.zero_sources.toLocaleString(), 8)} ${padLeft(d.single_source.toLocaleString(), 8)} ${padLeft(d.multi_source.toLocaleString(), 8)}`
      )
    }
  }

  // 5. Redundancy Matrix
  if (report.redundancyMatrix.length > 0) {
    console.log(`\n-- Source Redundancy (top pairs) ${"─".repeat(28)}`)
    console.log(
      `${pad("Source A", 20)} ${pad("Source B", 20)} ${padLeft("Both", 8)} ${padLeft("A-Only", 8)} ${padLeft("Co-Rate", 10)}`
    )
    for (const r of report.redundancyMatrix.slice(0, 20)) {
      console.log(
        `${pad(r.source_a, 20)} ${pad(r.source_b, 20)} ${padLeft(r.both_success.toLocaleString(), 8)} ${padLeft(r.a_success.toLocaleString(), 8)} ${padLeft(r.co_success_rate.toFixed(1) + "%", 10)}`
      )
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────

async function run(opts: Options): Promise<void> {
  try {
    const reports: SystemReport[] = []

    if (opts.system === "death" || opts.system === "both") {
      reports.push(await buildReport("death", opts))
    }
    if (opts.system === "bio" || opts.system === "both") {
      reports.push(await buildReport("bio", opts))
    }

    if (opts.format === "json") {
      console.log(JSON.stringify(reports, null, 2))
    } else {
      for (const report of reports) {
        printReport(report)
      }
      console.log("")
    }
  } catch (error) {
    console.error("Fatal error:", error)
    process.exitCode = 1
  } finally {
    await resetPool()
  }
}

const program = new Command()
  .name("analyze-enrichment-sources")
  .description("Analyze enrichment source effectiveness across death and biography pipelines")
  .option("-s, --system <type>", "Which system to analyze: death, bio, or both", "both")
  .option("-r, --run-id <id>", "Analyze a specific run only", parsePositiveInt)
  .option("-t, --top <n>", "Top N sources for redundancy matrix", parsePositiveInt, 10)
  .option("--since <date>", "Only runs after this date (YYYY-MM-DD)", validateDate)
  .option("-f, --format <type>", "Output format: table or json", "table")
  .action(async (opts: Options) => {
    if (!["death", "bio", "both"].includes(opts.system)) {
      console.error(`Invalid system: ${opts.system}. Use death, bio, or both.`)
      process.exitCode = 1
      return
    }
    if (!["table", "json"].includes(opts.format)) {
      console.error(`Invalid format: ${opts.format}. Use table or json.`)
      process.exitCode = 1
      return
    }
    await run(opts)
  })

program.parse()
