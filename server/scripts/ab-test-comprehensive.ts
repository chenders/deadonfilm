#!/usr/bin/env tsx
/**
 * Comprehensive A/B Test: Provider × Source Strategy Comparison
 *
 * Tests 6 variants per actor:
 * - Gemini Pro with sources required
 * - Gemini Pro with "reliable" sources required
 * - Gemini Pro with no source requirement
 * - Perplexity with sources required
 * - Perplexity with "reliable" sources required
 * - Perplexity with no source requirement
 *
 * Measures quality on 3 key fields:
 * - "What We Know" (circumstances)
 * - "Alternative Accounts" (rumored_circumstances)
 * - "Additional Context" (additionalContext)
 *
 * Uses max_tokens=8192 to ensure no truncation bias.
 *
 * Usage:
 *   npm run ab-test:comprehensive -- --count 100
 */

import "dotenv/config"
import { Pool } from "pg"
import { Command } from "commander"
import { GeminiProSource } from "../src/lib/death-sources/ai-providers/gemini.js"
import { PerplexitySource } from "../src/lib/death-sources/ai-providers/perplexity.js"
import { setIgnoreCache } from "../src/lib/death-sources/base-source.js"
import type { ActorForEnrichment } from "../src/lib/death-sources/types.js"

interface ActorRow {
  id: number
  tmdb_id: number | null
  name: string
  birthday: string | null
  deathday: string | null
  popularity: number
}

const STRATEGIES = ["require_sources", "require_reliable_sources", "no_sources"] as const

interface TestRun {
  id: number
  testName: string
  totalActors: number
  totalVariants: number
}

/**
 * Find actors matching criteria:
 * - Top 40% by popularity
 * - Appeared in top 25% most popular movies/shows
 * - Max 2-3 actors per movie/show (ranked by actor popularity)
 */
async function findEligibleActors(pool: Pool, count: number): Promise<ActorRow[]> {
  const result = await pool.query<ActorRow>(
    `
    WITH actor_popularity_percentile AS (
      SELECT
        PERCENTILE_CONT(0.6) WITHIN GROUP (ORDER BY popularity) as p40_threshold
      FROM actors
      WHERE deathday IS NOT NULL
    ),
    movie_popularity_percentile AS (
      SELECT PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY popularity) as p25_threshold
      FROM movies
    ),
    show_popularity_percentile AS (
      SELECT PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY popularity) as p25_threshold
      FROM shows
    ),
    popular_content AS (
      SELECT DISTINCT m.id as content_id, 'movie' as content_type, m.popularity
      FROM movies m, movie_popularity_percentile mpp
      WHERE m.popularity >= mpp.p25_threshold
      UNION ALL
      SELECT DISTINCT s.id as content_id, 'show' as content_type, s.popularity
      FROM shows s, show_popularity_percentile spp
      WHERE s.popularity >= spp.p25_threshold
    ),
    actor_content_appearances AS (
      SELECT
        a.id,
        a.tmdb_id,
        a.name,
        a.birthday,
        a.deathday,
        a.popularity,
        pc.content_id,
        pc.content_type,
        pc.popularity as content_popularity,
        ROW_NUMBER() OVER (
          PARTITION BY pc.content_id, pc.content_type
          ORDER BY a.popularity DESC
        ) as actor_rank_in_content
      FROM actors a
      JOIN actor_popularity_percentile app ON a.popularity >= app.p40_threshold
      LEFT JOIN actor_movie_appearances ama ON a.id = ama.actor_id
      LEFT JOIN actor_show_appearances asa ON a.id = asa.actor_id
      JOIN popular_content pc ON
        (pc.content_type = 'movie' AND pc.content_id = ama.movie_id) OR
        (pc.content_type = 'show' AND pc.content_id = asa.show_id)
      WHERE a.deathday IS NOT NULL
        AND a.id NOT IN (
          SELECT DISTINCT actor_id FROM ab_test_comprehensive_results
        )
    )
    SELECT DISTINCT
      id,
      tmdb_id,
      name,
      birthday,
      deathday,
      popularity
    FROM actor_content_appearances
    WHERE actor_rank_in_content <= 3
    ORDER BY popularity DESC
    LIMIT $1
  `,
    [count]
  )

  return result.rows
}

/**
 * Create a new test run
 */
async function createTestRun(
  pool: Pool,
  actors: ActorRow[],
  providers: string[],
  strategies: string[]
): Promise<TestRun> {
  const result = await pool.query<{ id: number }>(
    `
    INSERT INTO ab_test_runs (
      test_name,
      total_actors,
      total_variants,
      providers,
      strategies,
      actor_criteria
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
  `,
    [
      `Comprehensive Test - ${new Date().toISOString().split("T")[0]}`,
      actors.length,
      actors.length * providers.length * strategies.length,
      providers,
      strategies,
      {
        popularity: "top 40%",
        content_popularity: "top 25%",
        max_actors_per_content: 3,
      },
    ]
  )

  return {
    id: result.rows[0].id,
    testName: `Comprehensive Test`,
    totalActors: actors.length,
    totalVariants: actors.length * providers.length * strategies.length,
  }
}

/**
 * Add inference to test run
 */
async function addInference(pool: Pool, runId: number, message: string, data?: unknown) {
  await pool.query(
    `
    UPDATE ab_test_runs
    SET inferences = inferences || $1::jsonb
    WHERE id = $2
  `,
    [
      JSON.stringify({
        timestamp: new Date().toISOString(),
        message,
        data,
      }),
      runId,
    ]
  )
  console.log(`\n[INFERENCE] ${message}`)
  if (data) {
    console.log(JSON.stringify(data, null, 2))
  }
}

/**
 * Update test run progress
 */
async function updateProgress(
  pool: Pool,
  runId: number,
  completedActors: number,
  completedVariants: number,
  totalCost: number
) {
  await pool.query(
    `
    UPDATE ab_test_runs
    SET
      completed_actors = $1,
      completed_variants = $2,
      total_cost_usd = $3
    WHERE id = $4
  `,
    [completedActors, completedVariants, totalCost, runId]
  )
}

/**
 * Run comprehensive test
 */
async function runComprehensiveTest(count: number) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  try {
    setIgnoreCache(true)

    console.log("\n" + "=".repeat(80))
    console.log("COMPREHENSIVE A/B TEST: Provider × Source Strategy")
    console.log("=".repeat(80))

    // Find eligible actors
    console.log(`\nFinding ${count} eligible actors...`)
    const actors = await findEligibleActors(pool, count)

    if (actors.length === 0) {
      console.log("No eligible actors found matching criteria")
      return
    }

    console.log(`Found ${actors.length} actors`)
    console.log(`Testing 6 variants per actor = ${actors.length * 6} total tests`)

    // Create test run
    const testRun = await createTestRun(pool, actors, ["gemini_pro", "perplexity"], [...STRATEGIES])
    console.log(`\nCreated test run ID: ${testRun.id}`)
    console.log(
      `Track progress at: http://localhost:5173/admin/ab-tests/comprehensive/${testRun.id}\n`
    )

    // Initialize providers with max_tokens=8192
    const gemini = new GeminiProSource()
    const perplexity = new PerplexitySource()

    let totalCost = 0
    let completedActors = 0
    let completedVariants = 0
    const variantResults: Record<string, { found: number; total: number; cost: number }> = {}

    // Initialize stats
    for (const provider of ["gemini_pro", "perplexity"]) {
      for (const strategy of STRATEGIES) {
        const key = `${provider}_${strategy}`
        variantResults[key] = { found: 0, total: 0, cost: 0 }
      }
    }

    // Test each actor with all 6 variants
    for (const actor of actors) {
      console.log(`\n${"=".repeat(80)}`)
      console.log(`Testing: ${actor.name} (${completedActors + 1}/${actors.length})`)
      console.log("=".repeat(80))

      const actorData: ActorForEnrichment = {
        id: actor.id,
        tmdbId: actor.tmdb_id,
        name: actor.name,
        birthday: actor.birthday,
        deathday: actor.deathday,
        causeOfDeath: null,
        causeOfDeathDetails: null,
        popularity: actor.popularity,
      }

      // Test all strategies for both providers
      for (const provider of ["gemini_pro", "perplexity"]) {
        const source = provider === "gemini_pro" ? gemini : perplexity

        for (const strategy of STRATEGIES) {
          const startTime = Date.now()

          // Configure source based on strategy
          if (strategy === "require_sources") {
            source.setRequireSources(true)
            source.setRequireReliableSources(false)
          } else if (strategy === "require_reliable_sources") {
            source.setRequireSources(true)
            source.setRequireReliableSources(true)
          } else {
            source.setRequireSources(false)
            source.setRequireReliableSources(false)
          }

          console.log(`  ${provider} / ${strategy}...`)

          const result = await source.lookup(actorData)
          const responseTime = Date.now() - startTime

          const whatWeKnow = result.data?.circumstances || null
          const alternativeAccounts = result.data?.rumoredCircumstances || null
          const additionalContext = result.data?.additionalContext || null

          const sources =
            ((result.source.rawData as unknown as { parsed?: { sources?: string[] } })?.parsed
              ?.sources as string[]) || []
          const resolvedSources =
            ((result.source.rawData as unknown as { resolvedSources?: unknown[] })
              ?.resolvedSources as unknown[]) || []
          const cost = result.source.costUsd || 0

          // Store result
          await pool.query(
            `
            INSERT INTO ab_test_comprehensive_results (
              run_id,
              actor_id,
              actor_name,
              provider,
              strategy,
              what_we_know,
              alternative_accounts,
              additional_context,
              sources,
              resolved_sources,
              raw_response,
              cost_usd,
              response_time_ms
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          `,
            [
              testRun.id,
              actor.id,
              actor.name,
              provider,
              strategy,
              whatWeKnow,
              alternativeAccounts,
              additionalContext,
              JSON.stringify(sources),
              JSON.stringify(resolvedSources),
              JSON.stringify(result.source.rawData),
              cost,
              responseTime,
            ]
          )

          const key = `${provider}_${strategy}`
          variantResults[key].total++
          variantResults[key].cost += cost
          if (whatWeKnow || alternativeAccounts || additionalContext) {
            variantResults[key].found++
          }

          totalCost += cost
          completedVariants++

          const hasData = whatWeKnow || alternativeAccounts || additionalContext
          console.log(
            `    ${hasData ? "✓" : "✗"} Data: ${hasData ? "Found" : "None"} | Sources: ${sources.length} | Cost: $${cost.toFixed(4)} | Time: ${responseTime}ms`
          )
        }
      }

      completedActors++
      await updateProgress(pool, testRun.id, completedActors, completedVariants, totalCost)

      // Add inferences every 10 actors
      if (completedActors % 10 === 0) {
        const inference = analyzeProgress(variantResults, completedActors, actors.length)
        await addInference(pool, testRun.id, inference.message, inference.data)
      }
    }

    // Final analysis
    console.log("\n" + "=".repeat(80))
    console.log("TEST COMPLETE")
    console.log("=".repeat(80))

    const finalAnalysis = analyzeFinalResults(variantResults, totalCost, actors.length)
    await addInference(pool, testRun.id, finalAnalysis.message, finalAnalysis.data)

    // Mark test as completed
    await pool.query(
      `
      UPDATE ab_test_runs
      SET status = 'completed', completed_at = NOW()
      WHERE id = $1
    `,
      [testRun.id]
    )

    console.log(`\nTotal cost: $${totalCost.toFixed(4)}`)
    console.log(
      `\nView full results at: http://localhost:5173/admin/ab-tests/comprehensive/${testRun.id}`
    )

    await pool.end()
  } catch (error) {
    console.error("\nError:", error)
    await pool.end()
    process.exit(1)
  } finally {
    setIgnoreCache(false)
  }
}

/**
 * Analyze progress and generate inference
 */
function analyzeProgress(
  results: Record<string, { found: number; total: number; cost: number }>,
  completed: number,
  total: number
) {
  const successRates = Object.entries(results).map(([key, data]) => ({
    variant: key,
    successRate: data.total > 0 ? (data.found / data.total) * 100 : 0,
    avgCost: data.total > 0 ? data.cost / data.total : 0,
  }))

  successRates.sort((a, b) => b.successRate - a.successRate)

  return {
    message: `Progress update after ${completed}/${total} actors`,
    data: {
      topPerformers: successRates.slice(0, 3),
      lowestPerformers: successRates.slice(-3),
    },
  }
}

/**
 * Analyze final results and generate recommendations
 */
function analyzeFinalResults(
  results: Record<string, { found: number; total: number; cost: number }>,
  totalCost: number,
  totalActors: number
) {
  const rankings = Object.entries(results).map(([key, data]) => ({
    variant: key,
    successRate: (data.found / data.total) * 100,
    avgCost: data.cost / data.total,
    totalFound: data.found,
    totalTests: data.total,
  }))

  rankings.sort((a, b) => {
    // Sort by success rate first, then by cost (lower is better)
    if (Math.abs(a.successRate - b.successRate) > 5) {
      return b.successRate - a.successRate
    }
    return a.avgCost - b.avgCost
  })

  return {
    message: "Test complete - final recommendations",
    data: {
      totalCost,
      totalActors,
      totalVariants: totalActors * 6,
      rankings,
      recommendation: {
        primary: rankings[0].variant,
        secondary: rankings[1].variant,
        fallback: rankings[2].variant,
        reasoning: `${rankings[0].variant} had ${rankings[0].successRate.toFixed(1)}% success rate at $${rankings[0].avgCost.toFixed(4)} per test`,
      },
    },
  }
}

// CLI setup
const program = new Command()
  .name("ab-test-comprehensive")
  .description("Comprehensive A/B test comparing providers and source strategies")
  .option("-c, --count <n>", "Number of actors to test", "100")
  .action(async (options) => {
    const count = parseInt(options.count, 10)
    if (isNaN(count) || count <= 0) {
      console.error("Invalid count")
      process.exit(1)
    }
    await runComprehensiveTest(count)
  })

program.parse()
