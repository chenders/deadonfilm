#!/usr/bin/env tsx
/**
 * A/B Test Script for Source Requirement
 *
 * This script compares AI enrichment results with and without the source URL requirement
 * to help determine if requiring sources is worth the potential data loss trade-off.
 *
 * For each actor:
 * 1. Runs Gemini Pro WITH source requirement (current prompt)
 * 2. Runs Gemini Pro WITHOUT source requirement (old prompt)
 * 3. Stores both results in enrichment_ab_tests table for comparison
 * 4. Tracks cost and stops when budget exceeded
 *
 * Uses Gemini Pro exclusively because:
 * - It has search grounding for URLs
 * - Consistent model for fair comparison
 * - Lower cost than GPT-4 (~$0.002/query)
 *
 * Usage:
 *   npm run ab-test:sources -- [options]
 *
 * Options:
 *   -c, --count <n>         Number of actors to test (default: 10)
 *   -b, --budget <usd>      Budget limit in USD (default: 10)
 *   -y, --yes               Skip confirmation prompt
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { Pool } from "pg"
import { GeminiProSource } from "../src/lib/death-sources/ai-providers/gemini.js"
import type { ActorForEnrichment } from "../src/lib/death-sources/types.js"

function parsePositiveNumber(value: string): number {
  const n = parseFloat(value)
  if (isNaN(n) || n <= 0) {
    throw new InvalidArgumentError("Must be positive number")
  }
  return n
}

async function waitForConfirmation(skip: boolean): Promise<boolean> {
  if (skip) return true

  console.log("\nPress Enter to continue or Ctrl+C to cancel...")
  return new Promise((resolve) => {
    process.stdin.once("data", () => {
      resolve(true)
    })
  })
}

interface ABTestResult {
  actorId: number
  actorName: string
  version: "with_sources" | "without_sources"
  circumstances: string | null
  rumoredCircumstances: string | null
  sources: string[]
  resolvedSources: Array<{ originalUrl: string; finalUrl: string; sourceName: string }> | null
  costUsd: number
}

interface RawDataResponse {
  parsed?: {
    sources?: string[]
  }
  resolvedSources?: Array<{ originalUrl: string; finalUrl: string; sourceName: string }>
}

async function runABTest(options: {
  count: number
  budget: number
  yes: boolean
  actorId?: number
}) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  })

  try {
    console.log("A/B Test: Source Requirement")
    console.log("=".repeat(60))
    console.log(`Actors to test: ${options.count}`)
    console.log(`Budget limit: $${options.budget.toFixed(2)}`)
    console.log(`Using: Gemini Pro with search grounding`)
    console.log("=".repeat(60))

    // Check if Gemini is available
    const gemini = new GeminiProSource()
    if (!gemini.isAvailable()) {
      console.error("\n❌ Gemini Pro is not available. Please set GOOGLE_AI_API_KEY environment variable.")
      process.exit(1)
    }

    // Find actors without detailed death info to test
    let actorQuery: string
    let queryParams: (number | undefined)[]

    if (options.actorId) {
      // Test specific actor by ID
      actorQuery = `
        SELECT a.id, a.tmdb_id, a.name, a.birthday, a.deathday
        FROM actors a
        WHERE a.id = $1 AND a.deathday IS NOT NULL
      `
      queryParams = [options.actorId]
    } else {
      // Find random actors without detailed death info
      actorQuery = `
        SELECT a.id, a.tmdb_id, a.name, a.birthday, a.deathday
        FROM actors a
        WHERE a.deathday IS NOT NULL
          AND a.has_detailed_death_info = false
          AND NOT EXISTS (
            SELECT 1 FROM enrichment_ab_tests WHERE actor_id = a.id
          )
        ORDER BY RANDOM()
        LIMIT $1
      `
      queryParams = [options.count]
    }

    const actorResult = await pool.query<ActorForEnrichment>(actorQuery, queryParams)
    const actors = actorResult.rows

    if (actors.length === 0) {
      console.log("\nNo actors found for testing. All actors may already be tested.")
      return
    }

    console.log(`\nFound ${actors.length} actors for testing\n`)

    if (!options.yes) {
      console.log("Sample actors:")
      for (const actor of actors.slice(0, 5)) {
        const deathYear = actor.deathday ? new Date(actor.deathday).getFullYear() : "unknown"
        console.log(`  - ${actor.name} (died ${deathYear})`)
      }
      if (actors.length > 5) {
        console.log(`  ... and ${actors.length - 5} more`)
      }
      console.log()

      const confirmed = await waitForConfirmation(options.yes)
      if (!confirmed) {
        console.log("Cancelled by user")
        return
      }
    }

    let totalCost = 0
    let testsRun = 0

    for (let i = 0; i < actors.length; i++) {
      const actor = actors[i]
      console.log(`\n[${i + 1}/${actors.length}] Testing ${actor.name}`)
      console.log(`  Budget used: $${totalCost.toFixed(4)} / $${options.budget.toFixed(2)}`)

      if (totalCost >= options.budget) {
        console.log(`\n  Budget limit reached! Stopping tests.`)
        break
      }

      const results: ABTestResult[] = []

      // Test 1: WITH source requirement (requireSources = true)
      console.log("  Running WITH source requirement...")
      try {
        gemini.setRequireSources(true)
        const lookupResult = await gemini.lookup(actor)

        if (!lookupResult.success || !lookupResult.data?.circumstances) {
          console.log(`    No death info found (with sources)`)
        } else {
          const rawData = lookupResult.source.rawData as RawDataResponse | undefined
          const sources = rawData?.parsed?.sources || []
          const resolvedSources = rawData?.resolvedSources || null
          const cost = lookupResult.source.costUsd || 0.002

          results.push({
            actorId: actor.id,
            actorName: actor.name,
            version: "with_sources",
            circumstances: lookupResult.data.circumstances || null,
            rumoredCircumstances: lookupResult.data.rumoredCircumstances || null,
            sources: Array.isArray(sources) ? sources : [],
            resolvedSources: Array.isArray(resolvedSources) ? resolvedSources : null,
            costUsd: cost,
          })

          totalCost += cost
          console.log(`    Cost: $${cost.toFixed(4)}, Sources: ${sources.length}`)
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error"
        console.log(`    Error: ${errorMsg}`)
      }

      // Test 2: WITHOUT source requirement (requireSources = false)
      console.log("  Running WITHOUT source requirement...")
      try {
        gemini.setRequireSources(false)
        const lookupResult = await gemini.lookup(actor)

        if (!lookupResult.success || !lookupResult.data?.circumstances) {
          console.log(`    No death info found (without sources)`)
        } else {
          const rawData = lookupResult.source.rawData as RawDataResponse | undefined
          const sources = rawData?.parsed?.sources || []
          const resolvedSources = rawData?.resolvedSources || null
          const cost = lookupResult.source.costUsd || 0.002

          results.push({
            actorId: actor.id,
            actorName: actor.name,
            version: "without_sources",
            circumstances: lookupResult.data.circumstances || null,
            rumoredCircumstances: lookupResult.data.rumoredCircumstances || null,
            sources: Array.isArray(sources) ? sources : [],
            resolvedSources: Array.isArray(resolvedSources) ? resolvedSources : null,
            costUsd: cost,
          })

          totalCost += cost
          console.log(`    Cost: $${cost.toFixed(4)}, Sources: ${sources.length}`)
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error"
        console.log(`    Error: ${errorMsg}`)
      }

      // Save results to database
      if (results.length > 0) {
        for (const result of results) {
          try {
            await pool.query(
              `INSERT INTO enrichment_ab_tests
               (actor_id, actor_name, version, circumstances, rumored_circumstances, sources, resolved_sources, cost_usd)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               ON CONFLICT (actor_id, version) DO UPDATE SET
                 circumstances = EXCLUDED.circumstances,
                 rumored_circumstances = EXCLUDED.rumored_circumstances,
                 sources = EXCLUDED.sources,
                 resolved_sources = EXCLUDED.resolved_sources,
                 cost_usd = EXCLUDED.cost_usd,
                 created_at = CURRENT_TIMESTAMP`,
              [
                result.actorId,
                result.actorName,
                result.version,
                result.circumstances,
                result.rumoredCircumstances,
                JSON.stringify(result.sources),
                result.resolvedSources ? JSON.stringify(result.resolvedSources) : null,
                result.costUsd,
              ]
            )
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Unknown error"
            console.log(`    Database error: ${errorMsg}`)
          }
        }

        if (results.length === 2) {
          testsRun++
          console.log(`  ✓ Saved both versions to database`)
        } else {
          console.log(`  ⚠ Saved ${results.length} version(s) to database`)
        }
      }
    }

    // Summary
    console.log("\n" + "=".repeat(60))
    console.log("A/B Test Complete!")
    console.log("=".repeat(60))
    console.log(`Actors tested: ${testsRun}`)
    console.log(`Total cost: $${totalCost.toFixed(4)} / $${options.budget.toFixed(2)}`)
    console.log("\nView results at: http://localhost:5173/admin/ab-test-sources")
    console.log("=".repeat(60))
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

const program = new Command()
  .name("ab-test-source-requirement")
  .description("A/B test AI enrichment with/without source requirement")
  .option("-c, --count <n>", "Number of actors to test", parsePositiveNumber, 10)
  .option("-b, --budget <usd>", "Budget limit in USD", parsePositiveNumber, 10)
  .option("-y, --yes", "Skip confirmation prompt", false)
  .option("--actor-id <id>", "Test a specific actor by ID", parsePositiveNumber)
  .action(async (options) => {
    await runABTest(options)
  })

program.parse()
