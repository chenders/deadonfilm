#!/usr/bin/env tsx
import "dotenv/config" // MUST be first import

import * as readline from "readline"
import { Command, InvalidArgumentError } from "commander"
import { Pool } from "pg"
import { withNewRelicTransaction } from "../src/lib/newrelic-cli.js"
import { BiographyEnrichmentOrchestrator } from "../src/lib/biography-sources/orchestrator.js"
import {
  writeBiographyToProduction,
  writeBiographyToStaging,
} from "../src/lib/biography-enrichment-db-writer.js"
import { setIgnoreCache } from "../src/lib/biography-sources/base-source.js"
import { GOLDEN_TEST_CASES, scoreAllResults } from "../src/lib/biography/golden-test-cases.js"
import type {
  ActorForBiography,
  BiographyData,
  BiographyEnrichmentConfig,
  BiographyResult,
} from "../src/lib/biography-sources/types.js"

/**
 * Biography enrichment CLI script.
 *
 * Enriches actor biographies with personal life information (childhood, education,
 * family, relationships, pre-fame life) from multiple sources with Claude synthesis.
 *
 * Usage:
 *   npm run enrich:biographies -- [options]
 *
 * Examples:
 *   npm run enrich:biographies -- --limit 5 --dry-run
 *   npm run enrich:biographies -- --actor-id 2157 --dry-run
 *   npm run enrich:biographies -- --actor-id 2157,2158 --yes
 *   npm run enrich:biographies -- --tmdb-id 12345 --dry-run
 *   npm run enrich:biographies -- --golden-test --yes
 *   npm run enrich:biographies -- --limit 50 --disable-web-search --max-total-cost 2
 *   npm run enrich:biographies -- --staging --limit 10
 */

// ============================================================================
// Argument Parsers
// ============================================================================

function parsePositiveInt(value: string): number {
  const n = parseInt(value, 10)
  if (isNaN(n) || !Number.isInteger(n) || n <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return n
}

export function parseNonNegativeInt(value: string): number {
  const n = parseInt(value, 10)
  if (isNaN(n) || !Number.isInteger(n) || n < 0) {
    throw new InvalidArgumentError("Must be a non-negative integer")
  }
  return n
}

function parsePositiveFloat(value: string): number {
  const n = parseFloat(value)
  if (isNaN(n) || n <= 0) {
    throw new InvalidArgumentError("Must be a positive number")
  }
  return n
}

function parseCommaSeparatedIds(value: string): number[] {
  return value.split(",").map((s) => {
    const n = parseInt(s.trim(), 10)
    if (isNaN(n) || n <= 0) throw new InvalidArgumentError(`Invalid ID: ${s}`)
    return n
  })
}

// ============================================================================
// Confirmation Prompt
// ============================================================================

async function waitForConfirmation(skipPrompt: boolean): Promise<boolean> {
  if (skipPrompt) return true
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question("\nPress Enter to continue, or Ctrl+C to cancel... ", () => {
      rl.close()
      resolve(true)
    })
  })
}

// ============================================================================
// Actor Query Functions
// ============================================================================

async function queryActorsByIds(pool: Pool, ids: number[]): Promise<ActorForBiography[]> {
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ")
  const result = await pool.query(
    `SELECT id, tmdb_id, imdb_person_id, name, birthday, deathday,
            wikipedia_url, biography AS biography_raw_tmdb, biography
     FROM actors
     WHERE id IN (${placeholders})`,
    ids
  )
  return result.rows
}

async function queryActorsByTmdbIds(pool: Pool, tmdbIds: number[]): Promise<ActorForBiography[]> {
  const placeholders = tmdbIds.map((_, i) => `$${i + 1}`).join(", ")
  const result = await pool.query(
    `SELECT id, tmdb_id, imdb_person_id, name, birthday, deathday,
            wikipedia_url, biography AS biography_raw_tmdb, biography
     FROM actors
     WHERE tmdb_id IN (${placeholders})`,
    tmdbIds
  )
  return result.rows
}

async function queryGoldenTestActors(pool: Pool): Promise<ActorForBiography[]> {
  const names = GOLDEN_TEST_CASES.map((tc) => tc.actorName)
  const placeholders = names.map((_, i) => `$${i + 1}`).join(", ")
  const result = await pool.query(
    `SELECT id, tmdb_id, imdb_person_id, name, birthday, deathday,
            wikipedia_url, biography AS biography_raw_tmdb, biography
     FROM actors
     WHERE name IN (${placeholders})`,
    names
  )
  return result.rows
}

async function queryActorsByPopularity(
  pool: Pool,
  limit: number,
  minPopularity?: number
): Promise<ActorForBiography[]> {
  const conditions = ["deathday IS NOT NULL"]
  const params: (number | string)[] = []
  let paramIdx = 1

  if (minPopularity !== undefined) {
    conditions.push(`popularity >= $${paramIdx}`)
    params.push(minPopularity)
    paramIdx++
  }

  params.push(limit)

  const result = await pool.query(
    `SELECT id, tmdb_id, imdb_person_id, name, birthday, deathday,
            wikipedia_url, biography AS biography_raw_tmdb, biography
     FROM actors
     WHERE ${conditions.join(" AND ")}
     ORDER BY popularity DESC NULLS LAST
     LIMIT $${paramIdx}`,
    params
  )
  return result.rows
}

// ============================================================================
// Main CLI
// ============================================================================

const program = new Command()
  .name("enrich-biographies")
  .description("Enrich actor biographies with personal life information from multiple sources")
  .option("-l, --limit <n>", "Limit actors to process", parsePositiveInt, 10)
  .option("-p, --min-popularity <n>", "Minimum popularity threshold", parsePositiveFloat)
  .option(
    "-a, --actor-id <ids>",
    "Process specific actor(s) by ID (comma-separated)",
    parseCommaSeparatedIds
  )
  .option(
    "-t, --tmdb-id <ids>",
    "Process specific actor(s) by TMDB ID (comma-separated)",
    parseCommaSeparatedIds
  )
  .option("-n, --dry-run", "Preview without writing to database")
  .option("-c, --confidence <n>", "Confidence threshold (0-1)", parsePositiveFloat, 0.6)
  .option("--max-cost-per-actor <n>", "Max cost per actor in USD", parsePositiveFloat, 0.5)
  .option("--max-total-cost <n>", "Max total cost in USD", parsePositiveFloat, 5)
  .option("--golden-test", "Run golden test cases and score results")
  .option("--disable-haiku-cleanup", "Disable Haiku AI extraction stage")
  .option("--disable-web-search", "Disable web search sources")
  .option("--disable-news", "Disable news sources")
  .option("--disable-archives", "Disable archive sources")
  .option("--disable-books", "Disable book sources (Google Books, Open Library, IA Books)")
  .option(
    "--early-stop-sources <n>",
    "Min high-quality source families before early stopping (default 5, 0 = disable early stopping)",
    parseNonNegativeInt
  )
  .option("--staging", "Write to staging table for admin review")
  .option("--ignore-cache", "Ignore cached responses")
  .option("-y, --yes", "Skip confirmation prompt")
  .action(async (options) => {
    await run(options)
  })

interface CliOptions {
  limit: number
  minPopularity?: number
  actorId?: number[]
  tmdbId?: number[]
  dryRun?: boolean
  confidence: number
  maxCostPerActor: number
  maxTotalCost: number
  goldenTest?: boolean
  disableHaikuCleanup?: boolean
  disableWebSearch?: boolean
  disableNews?: boolean
  disableArchives?: boolean
  disableBooks?: boolean
  earlyStopSources?: number
  staging?: boolean
  ignoreCache?: boolean
  yes?: boolean
}

async function run(options: CliOptions): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  try {
    await withNewRelicTransaction("enrich-biographies", async (recordMetrics) => {
      // Set cache ignore if requested
      if (options.ignoreCache) {
        setIgnoreCache(true)
        console.log("Cache: IGNORED (fresh requests)")
      }

      // Build enrichment config from CLI options
      const config: Partial<BiographyEnrichmentConfig> = {
        limit: options.limit,
        confidenceThreshold: options.confidence,
        costLimits: {
          maxCostPerActor: options.maxCostPerActor,
          maxTotalCost: options.maxTotalCost,
        },
        sourceCategories: {
          free: true,
          reference: true,
          webSearch: !options.disableWebSearch,
          news: !options.disableNews,
          obituary: true,
          archives: !options.disableArchives,
          books: !options.disableBooks,
          ai: false,
        },
        contentCleaning: {
          haikuEnabled: !options.disableHaikuCleanup,
          mechanicalOnly: !!options.disableHaikuCleanup,
        },
        ...(options.earlyStopSources !== undefined && {
          earlyStopSourceCount: options.earlyStopSources,
        }),
      }

      // Query actors based on CLI options
      let actors: ActorForBiography[]

      if (options.actorId) {
        console.log(`Querying actors by ID: ${options.actorId.join(", ")}`)
        actors = await queryActorsByIds(pool, options.actorId)
      } else if (options.tmdbId) {
        console.log(`Querying actors by TMDB ID: ${options.tmdbId.join(", ")}`)
        actors = await queryActorsByTmdbIds(pool, options.tmdbId)
      } else if (options.goldenTest) {
        console.log("Querying golden test case actors...")
        actors = await queryGoldenTestActors(pool)
      } else {
        console.log(
          `Querying top ${options.limit} actors by popularity${options.minPopularity ? ` (min: ${options.minPopularity})` : ""}...`
        )
        actors = await queryActorsByPopularity(pool, options.limit, options.minPopularity)
      }

      if (actors.length === 0) {
        console.log("No actors found matching criteria.")
        return
      }

      // Show confirmation summary
      console.log("\n" + "=".repeat(60))
      console.log("Biography Enrichment Configuration")
      console.log("=".repeat(60))
      console.log(`  Actors to process:    ${actors.length}`)
      console.log(`  Confidence threshold: ${options.confidence}`)
      console.log(`  Max cost per actor:   $${options.maxCostPerActor}`)
      console.log(`  Max total cost:       $${options.maxTotalCost}`)
      console.log(`  Haiku AI cleanup:     ${options.disableHaikuCleanup ? "DISABLED" : "enabled"}`)
      console.log(`  Web search:           ${options.disableWebSearch ? "DISABLED" : "enabled"}`)
      console.log(`  News sources:         ${options.disableNews ? "DISABLED" : "enabled"}`)
      console.log(`  Archive sources:      ${options.disableArchives ? "DISABLED" : "enabled"}`)
      console.log(`  Write target:         ${options.staging ? "STAGING" : "PRODUCTION"}`)
      console.log(`  Dry run:              ${options.dryRun ? "YES" : "no"}`)
      if (options.goldenTest) {
        console.log(`  Golden test mode:     YES`)
      }
      console.log("=".repeat(60))

      console.log("\nActors:")
      for (const actor of actors) {
        console.log(`  - ${actor.name} (ID: ${actor.id}, TMDB: ${actor.tmdb_id})`)
      }

      // Wait for confirmation
      const confirmed = await waitForConfirmation(!!options.yes)
      if (!confirmed) {
        console.log("Cancelled.")
        return
      }

      if (options.dryRun) {
        console.log("\n[DRY RUN] Would process the following actors:")
        for (const actor of actors) {
          console.log(`  - ${actor.name} (ID: ${actor.id}, TMDB: ${actor.tmdb_id})`)
        }
        console.log("\n[DRY RUN] No changes made.")
        return
      }

      // Create orchestrator and process actors
      const orchestrator = new BiographyEnrichmentOrchestrator(config)
      const startTime = Date.now()
      const enrichmentResults = new Map<number, BiographyResult>()
      let totalCost = 0
      let enrichedCount = 0

      for (let i = 0; i < actors.length; i++) {
        const actor = actors[i]
        console.log(`\n[${i + 1}/${actors.length}] Processing ${actor.name}...`)

        try {
          const result = await orchestrator.enrichActor(actor)
          enrichmentResults.set(actor.id, result)
          totalCost += result.stats.totalCostUsd

          if (result.data) {
            enrichedCount++

            // Write to database
            const writeFunc = options.staging ? writeBiographyToStaging : writeBiographyToProduction
            await writeFunc(pool, actor.id, result.data, result.sources)
            console.log(
              `  Written to ${options.staging ? "staging" : "production"} | ` +
                `Sources: ${result.stats.sourcesSucceeded}/${result.stats.sourcesAttempted} | ` +
                `Cost: $${result.stats.totalCostUsd.toFixed(4)} | ` +
                `Time: ${result.stats.processingTimeMs}ms`
            )
          } else {
            console.log(
              `  No data produced | ` +
                `Sources: ${result.stats.sourcesSucceeded}/${result.stats.sourcesAttempted} | ` +
                `Error: ${result.error || "unknown"}`
            )
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Unknown error"
          console.error(`  Fatal error processing ${actor.name}: ${errorMsg}`)
        }

        // Check total cost limit
        if (totalCost >= options.maxTotalCost) {
          console.log(
            `\nTotal cost limit reached ($${totalCost.toFixed(4)} >= $${options.maxTotalCost})`
          )
          console.log(`Processed ${i + 1} of ${actors.length} actors before limit`)
          break
        }

        // Delay between actors
        if (i < actors.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
      }

      // Golden test scoring
      if (options.goldenTest && enrichmentResults.size > 0) {
        const resultsByName = new Map<string, BiographyData>()
        for (const [actorId, result] of enrichmentResults) {
          if (result.data) {
            const actor = actors.find((a) => a.id === actorId)
            if (actor) resultsByName.set(actor.name, result.data)
          }
        }
        const { summary } = scoreAllResults(resultsByName)
        console.log("\n" + summary)
      }

      // Record final metrics for New Relic
      recordMetrics({
        recordsProcessed: enrichmentResults.size,
        recordsUpdated: enrichedCount,
        totalCostUsd: totalCost,
        goldenTestMode: !!options.goldenTest,
        dryRun: !!options.dryRun,
      })

      // Batch summary
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log("\n" + "=".repeat(60))
      console.log("Biography Enrichment Complete")
      console.log("=".repeat(60))
      console.log(`  Actors processed:  ${enrichmentResults.size}`)
      console.log(`  Actors enriched:   ${enrichedCount}`)
      console.log(
        `  Fill rate:         ${enrichmentResults.size > 0 ? ((enrichedCount / enrichmentResults.size) * 100).toFixed(1) : 0}%`
      )
      console.log(`  Total cost:        $${totalCost.toFixed(4)}`)
      console.log(`  Total time:        ${elapsed}s`)
      console.log("=".repeat(60))
    })
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

program.parse()
