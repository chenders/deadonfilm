/**
 * Admin A/B testing endpoints.
 *
 * Provides access to A/B test results for source requirement experiments.
 */

import { Request, Response, Router } from "express"
import { getPool } from "../../lib/db/pool.js"
import { logger } from "../../lib/logger.js"

const router = Router()

interface ABTestComparison {
  actorId: number
  actorName: string
  withSources: {
    circumstances: string | null
    rumoredCircumstances: string | null
    sources: string[]
    resolvedSources: Array<{ originalUrl: string; finalUrl: string; sourceName: string }> | null
    costUsd: number
  } | null
  withoutSources: {
    circumstances: string | null
    rumoredCircumstances: string | null
    sources: string[]
    resolvedSources: Array<{ originalUrl: string; finalUrl: string; sourceName: string }> | null
    costUsd: number
  } | null
  createdAt: string
}

// ============================================================================
// GET /admin/api/ab-tests/source-requirement
// Get all A/B test results comparing source requirement variants
// ============================================================================

router.get("/source-requirement", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()

    // Query all A/B test results for source requirement test, grouped by actor
    const query = `
      SELECT
        id,
        actor_id,
        actor_name,
        version,
        circumstances,
        rumored_circumstances,
        sources,
        resolved_sources,
        cost_usd,
        created_at
      FROM enrichment_ab_tests
      WHERE test_type = 'source_requirement'
      ORDER BY actor_id, version
    `

    const result = await pool.query<{
      id: number
      actor_id: number
      actor_name: string
      version: "with_sources" | "without_sources"
      circumstances: string | null
      rumored_circumstances: string | null
      sources: string | string[]
      resolved_sources:
        | string
        | Array<{ originalUrl: string; finalUrl: string; sourceName: string }>
        | null
      cost_usd: string
      created_at: Date
    }>(query)

    // Group results by actor for comparison
    const comparisons = new Map<number, ABTestComparison>()

    for (const row of result.rows) {
      const actorId = row.actor_id
      const version = row.version

      if (!comparisons.has(actorId)) {
        comparisons.set(actorId, {
          actorId,
          actorName: row.actor_name,
          withSources: null,
          withoutSources: null,
          createdAt: row.created_at.toISOString(),
        })
      }

      const comparison = comparisons.get(actorId)!
      const testData = {
        circumstances: row.circumstances,
        rumoredCircumstances: row.rumored_circumstances,
        sources: (() => {
          try {
            const parsed = typeof row.sources === "string" ? JSON.parse(row.sources) : row.sources
            return Array.isArray(parsed) ? parsed : []
          } catch {
            return []
          }
        })(),
        resolvedSources: (() => {
          if (!row.resolved_sources) return null
          try {
            const parsed =
              typeof row.resolved_sources === "string"
                ? JSON.parse(row.resolved_sources)
                : row.resolved_sources
            return Array.isArray(parsed) ? parsed : null
          } catch {
            return null
          }
        })(),
        costUsd: parseFloat(row.cost_usd),
      }

      if (version === "with_sources") {
        comparison.withSources = testData
      } else {
        comparison.withoutSources = testData
      }

      // Update createdAt to the latest test date
      if (new Date(row.created_at) > new Date(comparison.createdAt)) {
        comparison.createdAt = row.created_at.toISOString()
      }
    }

    // Convert map to array
    const comparisonsArray = Array.from(comparisons.values())

    // Calculate summary statistics
    const totalTests = comparisonsArray.length
    const completeTests = comparisonsArray.filter((c) => c.withSources && c.withoutSources).length
    const totalCost = comparisonsArray.reduce((sum, c) => {
      const withCost = c.withSources?.costUsd || 0
      const withoutCost = c.withoutSources?.costUsd || 0
      return sum + withCost + withoutCost
    }, 0)

    // Count how many tests found data with vs without sources
    const withSourcesFoundData = comparisonsArray.filter((c) => c.withSources?.circumstances).length
    const withoutSourcesFoundData = comparisonsArray.filter(
      (c) => c.withoutSources?.circumstances
    ).length

    res.json({
      summary: {
        totalTests,
        completeTests,
        totalCost: totalCost.toFixed(4),
        withSourcesFoundData,
        withoutSourcesFoundData,
        dataLossPercentage:
          withoutSourcesFoundData > 0
            ? (
                ((withoutSourcesFoundData - withSourcesFoundData) / withoutSourcesFoundData) *
                100
              ).toFixed(1)
            : "0.0",
      },
      comparisons: comparisonsArray,
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch A/B test results")
    res.status(500).json({ error: { message: "Failed to fetch A/B test results" } })
  }
})

// ============================================================================
// GET /admin/api/ab-tests/source-requirement/:actorId
// Get detailed A/B test comparison for a specific actor
// ============================================================================

router.get("/source-requirement/:actorId", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()
    const actorId = parseInt(req.params.actorId, 10)

    if (isNaN(actorId)) {
      res.status(400).json({ error: { message: "Invalid actor ID" } })
      return
    }

    const query = `
      SELECT
        id,
        actor_id,
        actor_name,
        version,
        circumstances,
        rumored_circumstances,
        sources,
        resolved_sources,
        cost_usd,
        created_at
      FROM enrichment_ab_tests
      WHERE actor_id = $1
        AND test_type = 'source_requirement'
      ORDER BY version
    `

    const result = await pool.query<{
      id: number
      actor_id: number
      actor_name: string
      version: "with_sources" | "without_sources"
      circumstances: string | null
      rumored_circumstances: string | null
      sources: string | string[]
      resolved_sources:
        | string
        | Array<{ originalUrl: string; finalUrl: string; sourceName: string }>
        | null
      cost_usd: string
      created_at: Date
    }>(query, [actorId])

    if (result.rows.length === 0) {
      res.status(404).json({ error: { message: "A/B test not found for this actor" } })
      return
    }

    const comparison: ABTestComparison = {
      actorId,
      actorName: result.rows[0].actor_name,
      withSources: null,
      withoutSources: null,
      createdAt: result.rows[0].created_at.toISOString(),
    }

    for (const row of result.rows) {
      const testData = {
        circumstances: row.circumstances,
        rumoredCircumstances: row.rumored_circumstances,
        sources: (() => {
          try {
            const parsed = typeof row.sources === "string" ? JSON.parse(row.sources) : row.sources
            return Array.isArray(parsed) ? parsed : []
          } catch {
            return []
          }
        })(),
        resolvedSources: (() => {
          if (!row.resolved_sources) return null
          try {
            const parsed =
              typeof row.resolved_sources === "string"
                ? JSON.parse(row.resolved_sources)
                : row.resolved_sources
            return Array.isArray(parsed) ? parsed : null
          } catch {
            return null
          }
        })(),
        costUsd: parseFloat(row.cost_usd),
      }

      if (row.version === "with_sources") {
        comparison.withSources = testData
      } else {
        comparison.withoutSources = testData
      }
    }

    res.json(comparison)
  } catch (error) {
    logger.error({ error }, "Failed to fetch A/B test detail")
    res.status(500).json({ error: { message: "Failed to fetch A/B test detail" } })
  }
})

// ============================================================================
// GET /admin/api/ab-tests/provider-comparison
// Get all A/B test results comparing different AI providers
// ============================================================================

router.get("/provider-comparison", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()

    // Query all A/B test results for provider comparison test, grouped by actor
    const query = `
      SELECT
        id,
        actor_id,
        actor_name,
        version,
        circumstances,
        rumored_circumstances,
        sources,
        resolved_sources,
        cost_usd,
        created_at
      FROM enrichment_ab_tests
      WHERE test_type = 'provider_comparison'
      ORDER BY actor_id, version
    `

    const result = await pool.query<{
      id: number
      actor_id: number
      actor_name: string
      version: string
      circumstances: string | null
      rumored_circumstances: string | null
      sources: string | string[]
      resolved_sources:
        | string
        | Array<{ originalUrl: string; finalUrl: string; sourceName: string }>
        | null
      cost_usd: string
      created_at: Date
    }>(query)

    // Group results by actor for comparison
    const comparisons = new Map<
      number,
      {
        actorId: number
        actorName: string
        providers: Record<string, unknown>
        createdAt: string
      }
    >()

    for (const row of result.rows) {
      const actorId = row.actor_id

      if (!comparisons.has(actorId)) {
        comparisons.set(actorId, {
          actorId,
          actorName: row.actor_name,
          providers: {},
          createdAt: row.created_at.toISOString(),
        })
      }

      const comparison = comparisons.get(actorId)!
      const testData = {
        circumstances: row.circumstances,
        rumoredCircumstances: row.rumored_circumstances,
        sources: (() => {
          try {
            const parsed = typeof row.sources === "string" ? JSON.parse(row.sources) : row.sources
            return Array.isArray(parsed) ? parsed : []
          } catch {
            return []
          }
        })(),
        resolvedSources: (() => {
          if (!row.resolved_sources) return null
          try {
            const parsed =
              typeof row.resolved_sources === "string"
                ? JSON.parse(row.resolved_sources)
                : row.resolved_sources
            return Array.isArray(parsed) ? parsed : null
          } catch {
            return null
          }
        })(),
        costUsd: parseFloat(row.cost_usd),
      }

      comparison.providers[row.version] = testData

      // Update createdAt to the latest test date
      if (new Date(row.created_at) > new Date(comparison.createdAt)) {
        comparison.createdAt = row.created_at.toISOString()
      }
    }

    // Convert map to array
    const comparisonsArray = Array.from(comparisons.values())

    // Calculate summary statistics
    const totalTests = comparisonsArray.length
    const providerStats: Record<
      string,
      { foundData: number; totalTests: number; totalCost: number }
    > = {}

    // Get all unique providers
    const allProviders = new Set<string>()
    comparisonsArray.forEach((c) => {
      Object.keys(c.providers).forEach((p) => allProviders.add(p))
    })

    // Initialize stats for each provider
    allProviders.forEach((provider) => {
      providerStats[provider] = { foundData: 0, totalTests: 0, totalCost: 0 }
    })

    // Calculate stats
    comparisonsArray.forEach((c) => {
      Object.entries(c.providers).forEach(([provider, data]) => {
        const providerData = data as { circumstances?: string; costUsd: number }
        providerStats[provider].totalTests++
        if (providerData.circumstances) {
          providerStats[provider].foundData++
        }
        providerStats[provider].totalCost += providerData.costUsd
      })
    })

    const totalCost = Object.values(providerStats).reduce((sum, stats) => sum + stats.totalCost, 0)

    res.json({
      summary: {
        totalTests,
        totalCost: totalCost.toFixed(4),
        providerStats,
      },
      comparisons: comparisonsArray,
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch provider comparison A/B test results")
    res
      .status(500)
      .json({ error: { message: "Failed to fetch provider comparison A/B test results" } })
  }
})

// ============================================================================
// GET /admin/api/ab-tests/comprehensive
// Get all comprehensive test runs
// ============================================================================

router.get("/comprehensive", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()

    const result = await pool.query<{
      id: number
      test_name: string
      status: string
      total_actors: number
      completed_actors: number
      total_variants: number
      completed_variants: number
      providers: string[]
      strategies: string[]
      total_cost_usd: string
      inferences: unknown[]
      actor_criteria: unknown
      started_at: Date
      completed_at: Date | null
    }>(`
      SELECT *
      FROM ab_test_runs
      ORDER BY created_at DESC
    `)

    res.json({
      runs: result.rows.map((row) => ({
        id: row.id,
        testName: row.test_name,
        status: row.status,
        totalActors: row.total_actors,
        completedActors: row.completed_actors,
        totalVariants: row.total_variants,
        completedVariants: row.completed_variants,
        providers: row.providers,
        strategies: row.strategies,
        totalCost: parseFloat(row.total_cost_usd),
        inferences: row.inferences,
        actorCriteria: row.actor_criteria,
        startedAt: row.started_at.toISOString(),
        completedAt: row.completed_at?.toISOString() || null,
      })),
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch comprehensive test runs")
    res.status(500).json({ error: { message: "Failed to fetch comprehensive test runs" } })
  }
})

// ============================================================================
// GET /admin/api/ab-tests/comprehensive/:runId
// Get detailed results for a specific comprehensive test run
// ============================================================================

router.get("/comprehensive/:runId", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()
    const runId = parseInt(req.params.runId, 10)

    if (isNaN(runId)) {
      res.status(400).json({ error: { message: "Invalid run ID" } })
      return
    }

    // Get run metadata
    const runResult = await pool.query<{
      id: number
      test_name: string
      status: string
      total_actors: number
      completed_actors: number
      total_variants: number
      completed_variants: number
      providers: string[]
      strategies: string[]
      total_cost_usd: string
      inferences: unknown[]
      actor_criteria: unknown
      started_at: Date
      completed_at: Date | null
    }>(
      `
      SELECT *
      FROM ab_test_runs
      WHERE id = $1
    `,
      [runId]
    )

    if (runResult.rows.length === 0) {
      res.status(404).json({ error: { message: "Test run not found" } })
      return
    }

    const run = runResult.rows[0]

    // Get all results for this run
    const resultsQuery = await pool.query<{
      id: number
      actor_id: number
      actor_name: string
      provider: string
      strategy: string
      what_we_know: string | null
      alternative_accounts: string | null
      additional_context: string | null
      sources: unknown
      resolved_sources: unknown
      cost_usd: string
      response_time_ms: number | null
      created_at: Date
    }>(
      `
      SELECT
        id,
        actor_id,
        actor_name,
        provider,
        strategy,
        what_we_know,
        alternative_accounts,
        additional_context,
        sources,
        resolved_sources,
        cost_usd,
        response_time_ms,
        created_at
      FROM ab_test_comprehensive_results
      WHERE run_id = $1
      ORDER BY actor_id, provider, strategy
    `,
      [runId]
    )

    // Group results by actor
    const actorResults = new Map<
      number,
      {
        actorId: number
        actorName: string
        variants: Record<string, unknown>
      }
    >()

    for (const row of resultsQuery.rows) {
      if (!actorResults.has(row.actor_id)) {
        actorResults.set(row.actor_id, {
          actorId: row.actor_id,
          actorName: row.actor_name,
          variants: {},
        })
      }

      const actor = actorResults.get(row.actor_id)!
      const variantKey = `${row.provider}::${row.strategy}`

      actor.variants[variantKey] = {
        provider: row.provider,
        strategy: row.strategy,
        whatWeKnow: row.what_we_know,
        alternativeAccounts: row.alternative_accounts,
        additionalContext: row.additional_context,
        sources: row.sources,
        resolvedSources: row.resolved_sources,
        costUsd: parseFloat(row.cost_usd),
        responseTimeMs: row.response_time_ms,
        createdAt: row.created_at.toISOString(),
      }
    }

    res.json({
      run: {
        id: run.id,
        testName: run.test_name,
        status: run.status,
        totalActors: run.total_actors,
        completedActors: run.completed_actors,
        totalVariants: run.total_variants,
        completedVariants: run.completed_variants,
        providers: run.providers,
        strategies: run.strategies,
        totalCost: parseFloat(run.total_cost_usd),
        inferences: run.inferences,
        actorCriteria: run.actor_criteria,
        startedAt: run.started_at.toISOString(),
        completedAt: run.completed_at?.toISOString() || null,
      },
      results: Array.from(actorResults.values()),
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch comprehensive test run details")
    res.status(500).json({ error: { message: "Failed to fetch comprehensive test run details" } })
  }
})

export default router
