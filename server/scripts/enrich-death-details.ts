#!/usr/bin/env tsx
/**
 * Enrich actors with missing death details using multi-source fallbacks.
 *
 * This script queries additional sources when Claude Batch API didn't return
 * sufficient circumstances/notable_factors/etc. It uses the DeathEnrichmentOrchestrator
 * to query free, paid, and AI sources in priority order.
 *
 * Usage:
 *   npm run enrich:death-details -- [options]
 *
 * Options:
 *   -l, --limit <n>              Limit number of actors to process (default: 100)
 *   -p, --min-popularity <n>     Only process actors above popularity threshold
 *   -r, --recent-only            Only deaths in last 2 years
 *   -n, --dry-run                Preview without writing to database
 *   -t, --tmdb-id <id>           Process a specific actor by TMDB ID
 *   --free                       Use all free sources (default)
 *   --paid                       Include paid sources (ordered by cost)
 *   --ai                         Include AI model fallbacks
 *   --stop-on-match              Stop searching once we get results (default: true)
 *   -c, --confidence <n>         Minimum confidence threshold (0-1, default: 0.5)
 *   --max-cost-per-actor <n>     Maximum cost allowed per actor (USD)
 *   --max-total-cost <n>         Maximum total cost for entire run (USD)
 *   --claude-cleanup             Enable Claude Opus 4.5 cleanup for structured data
 *   --gather-all-sources         Gather data from ALL sources before cleanup
 *   --ignore-cache               Ignore cached responses, make fresh requests
 *
 * Examples:
 *   npm run enrich:death-details -- --limit 50 --dry-run
 *   npm run enrich:death-details -- --tmdb-id 12345 --dry-run
 *   npm run enrich:death-details -- --limit 100 --paid --max-total-cost 5
 *   npm run enrich:death-details -- --claude-cleanup --gather-all-sources --limit 10
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { getPool, resetPool } from "../src/lib/db.js"
import { initNewRelic, recordCustomEvent } from "../src/lib/newrelic.js"
import { rebuildDeathCaches, invalidateActorCache } from "../src/lib/cache.js"
import {
  DeathEnrichmentOrchestrator,
  CostLimitExceededError,
  setIgnoreCache,
  type EnrichmentConfig,
  type ActorForEnrichment,
} from "../src/lib/death-sources/index.js"
import {
  normalizeDateToString,
  MIN_CIRCUMSTANCES_LENGTH,
  MIN_RUMORED_CIRCUMSTANCES_LENGTH,
} from "../src/lib/claude-batch/index.js"

// Initialize New Relic for monitoring
initNewRelic()

function parsePositiveInt(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  const parsed = parseInt(value, 10)
  if (parsed <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return parsed
}

interface EnrichOptions {
  limit: number
  minPopularity: number
  recentOnly: boolean
  dryRun: boolean
  free: boolean
  paid: boolean
  ai: boolean
  stopOnMatch: boolean
  confidence: number
  tmdbId?: number
  maxCostPerActor?: number
  maxTotalCost?: number
  claudeCleanup: boolean
  gatherAllSources: boolean
  ignoreCache: boolean
}

async function enrichMissingDetails(options: EnrichOptions): Promise<void> {
  const {
    limit,
    minPopularity,
    recentOnly,
    dryRun,
    free,
    paid,
    ai,
    stopOnMatch,
    confidence: confidenceThreshold,
    tmdbId,
    maxCostPerActor,
    maxTotalCost,
    claudeCleanup,
    gatherAllSources,
    ignoreCache,
  } = options

  // Configure cache behavior
  if (ignoreCache) {
    setIgnoreCache(true)
    console.log("Cache disabled - all requests will be made fresh")
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  const db = getPool()

  try {
    // Build query for actors needing enrichment
    const params: (number | string)[] = []
    let query: string

    if (tmdbId) {
      // Target a specific actor
      console.log(`\nQuerying actor with TMDB ID ${tmdbId}...`)
      params.push(tmdbId)
      query = `
        SELECT
          a.id,
          a.tmdb_id,
          a.name,
          a.birthday,
          a.deathday,
          a.cause_of_death,
          a.cause_of_death_details,
          a.popularity,
          c.circumstances,
          c.notable_factors
        FROM actors a
        LEFT JOIN actor_death_circumstances c ON c.actor_id = a.id
        WHERE a.tmdb_id = $1
          AND a.deathday IS NOT NULL
      `
    } else {
      // Query actors where Claude returned nulls for detailed fields
      console.log(`\nQuerying actors with missing death circumstances...`)
      query = `
        SELECT
          a.id,
          a.tmdb_id,
          a.name,
          a.birthday,
          a.deathday,
          a.cause_of_death,
          a.cause_of_death_details,
          a.popularity,
          c.circumstances,
          c.notable_factors
        FROM actors a
        LEFT JOIN actor_death_circumstances c ON c.actor_id = a.id
        WHERE a.deathday IS NOT NULL
          AND a.cause_of_death IS NOT NULL
          AND (c.circumstances IS NULL OR c.notable_factors IS NULL OR array_length(c.notable_factors, 1) IS NULL)
          AND a.deathday < CURRENT_DATE - INTERVAL '30 days'
      `

      if (minPopularity > 0) {
        params.push(minPopularity)
        query += ` AND a.popularity >= $${params.length}`
      }

      if (recentOnly) {
        // Deaths in last 2 years
        const twoYearsAgo = new Date()
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
        params.push(twoYearsAgo.toISOString().split("T")[0])
        query += ` AND a.deathday >= $${params.length}`
      }

      query += ` ORDER BY a.popularity DESC NULLS LAST, a.deathday DESC NULLS LAST`

      if (limit) {
        params.push(limit)
        query += ` LIMIT $${params.length}`
      }
    }

    const result = await db.query<{
      id: number
      tmdb_id: number | null
      name: string
      birthday: Date | string | null
      deathday: Date | string
      cause_of_death: string | null
      cause_of_death_details: string | null
      popularity: number | null
      circumstances: string | null
      notable_factors: string[] | null
    }>(query, params)

    const actors = result.rows

    console.log(`Found ${actors.length} actors needing enrichment`)

    if (actors.length === 0) {
      console.log("\nNo actors to enrich. Done!")
      await resetPool()
      return
    }

    // Configure the orchestrator
    const config: Partial<EnrichmentConfig> = {
      sourceCategories: {
        free: free,
        paid: paid,
        ai: ai,
      },
      stopOnMatch: claudeCleanup && gatherAllSources ? false : stopOnMatch, // Don't stop if gathering all
      confidenceThreshold: confidenceThreshold,
      costLimits: {
        maxCostPerActor: maxCostPerActor,
        maxTotalCost: maxTotalCost,
      },
      claudeCleanup: claudeCleanup
        ? {
            enabled: true,
            model: "claude-opus-4-5-20251101",
            gatherAllSources: gatherAllSources,
          }
        : undefined,
    }

    const orchestrator = new DeathEnrichmentOrchestrator(config)

    // Convert to ActorForEnrichment format
    const actorsToEnrich: ActorForEnrichment[] = actors.map((a) => ({
      id: a.id,
      tmdbId: a.tmdb_id,
      name: a.name,
      birthday: normalizeDateToString(a.birthday),
      deathday: normalizeDateToString(a.deathday) || "",
      causeOfDeath: a.cause_of_death,
      causeOfDeathDetails: a.cause_of_death_details,
      popularity: a.popularity,
    }))

    if (dryRun) {
      console.log(`\n--- Dry Run Mode ---`)
      console.log(`Would enrich ${actorsToEnrich.length} actors`)
      console.log(`\nSample actors (first 5):`)
      for (const actor of actorsToEnrich.slice(0, 5)) {
        console.log(`  - ${actor.name} (ID: ${actor.id}, TMDB: ${actor.tmdbId || "N/A"})`)
        console.log(`    Death: ${actor.deathday}, Cause: ${actor.causeOfDeath || "(none)"}`)
      }
      console.log(`\nSource configuration:`)
      console.log(`  Free sources: ${free ? "enabled" : "disabled"}`)
      console.log(`  Paid sources: ${paid ? "enabled" : "disabled"}`)
      console.log(`  AI sources: ${ai ? "enabled" : "disabled"}`)
      console.log(`  Stop on match: ${claudeCleanup && gatherAllSources ? false : stopOnMatch}`)
      console.log(`  Confidence threshold: ${confidenceThreshold}`)
      if (claudeCleanup) {
        console.log(`\nClaude cleanup configuration:`)
        console.log(`  Claude cleanup: ENABLED (Opus 4.5)`)
        console.log(`  Gather all sources: ${gatherAllSources ? "yes" : "no"}`)
        console.log(`  Estimated cost per actor: ~$0.07`)
      }
      if (maxCostPerActor !== undefined) {
        console.log(`  Max cost per actor: $${maxCostPerActor}`)
      }
      if (maxTotalCost !== undefined) {
        console.log(`  Max total cost: $${maxTotalCost}`)
      }
      await resetPool()
      return
    }

    // Run enrichment
    let results = new Map<number, Awaited<ReturnType<typeof orchestrator.enrichActor>>>()
    let costLimitReached = false

    try {
      results = await orchestrator.enrichBatch(actorsToEnrich)
    } catch (error) {
      if (error instanceof CostLimitExceededError) {
        console.log(`\n${"!".repeat(60)}`)
        console.log(`Cost limit reached - exiting gracefully`)
        console.log(`Limit: $${error.limit}, Current: $${error.currentCost.toFixed(4)}`)
        console.log(`${"!".repeat(60)}`)
        costLimitReached = true
        // Note: partial results were already processed by the orchestrator before throwing
        // Record the cost limit event
        recordCustomEvent("DeathEnrichmentCostLimitReached", {
          limitType: error.limitType,
          limit: error.limit,
          currentCost: error.currentCost,
        })
      } else {
        throw error
      }
    }

    // Apply results to database
    let updated = 0
    for (const [actorId, enrichment] of results) {
      if (
        !enrichment.circumstances &&
        !enrichment.notableFactors?.length &&
        !enrichment.cleanedDeathInfo
      ) {
        continue
      }

      // Use cleaned death info if available (from Claude cleanup), otherwise use raw enrichment
      const cleaned = enrichment.cleanedDeathInfo
      const circumstances = cleaned?.circumstances || enrichment.circumstances
      const rumoredCircumstances = cleaned?.rumoredCircumstances || enrichment.rumoredCircumstances
      const locationOfDeath = cleaned?.locationOfDeath || enrichment.locationOfDeath
      const notableFactors = cleaned?.notableFactors || enrichment.notableFactors
      const additionalContext = cleaned?.additionalContext || enrichment.additionalContext
      const relatedDeaths = cleaned?.relatedDeaths || null

      // Determine confidence level
      const circumstancesConfidence =
        cleaned?.circumstancesConfidence ||
        (enrichment.circumstancesSource?.confidence
          ? enrichment.circumstancesSource.confidence >= 0.7
            ? "high"
            : enrichment.circumstancesSource.confidence >= 0.4
              ? "medium"
              : "low"
          : null)

      // Update actor_death_circumstances table
      await db.query(
        `INSERT INTO actor_death_circumstances (
          actor_id,
          circumstances,
          circumstances_confidence,
          rumored_circumstances,
          location_of_death,
          notable_factors,
          additional_context,
          related_deaths,
          sources,
          raw_response,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
        ON CONFLICT (actor_id) DO UPDATE SET
          circumstances = COALESCE(EXCLUDED.circumstances, actor_death_circumstances.circumstances),
          circumstances_confidence = COALESCE(EXCLUDED.circumstances_confidence, actor_death_circumstances.circumstances_confidence),
          rumored_circumstances = COALESCE(EXCLUDED.rumored_circumstances, actor_death_circumstances.rumored_circumstances),
          location_of_death = COALESCE(EXCLUDED.location_of_death, actor_death_circumstances.location_of_death),
          notable_factors = COALESCE(EXCLUDED.notable_factors, actor_death_circumstances.notable_factors),
          additional_context = COALESCE(EXCLUDED.additional_context, actor_death_circumstances.additional_context),
          related_deaths = COALESCE(EXCLUDED.related_deaths, actor_death_circumstances.related_deaths),
          sources = COALESCE(EXCLUDED.sources, actor_death_circumstances.sources),
          raw_response = COALESCE(EXCLUDED.raw_response, actor_death_circumstances.raw_response),
          updated_at = NOW()`,
        [
          actorId,
          circumstances,
          circumstancesConfidence,
          rumoredCircumstances,
          locationOfDeath,
          notableFactors && notableFactors.length > 0 ? notableFactors : null,
          additionalContext,
          relatedDeaths,
          JSON.stringify({
            circumstances: enrichment.circumstancesSource,
            rumoredCircumstances: enrichment.rumoredCircumstancesSource,
            notableFactors: enrichment.notableFactorsSource,
            locationOfDeath: enrichment.locationOfDeathSource,
            cleanupSource: cleaned ? "claude-opus-4.5" : null,
          }),
          enrichment.rawSources
            ? JSON.stringify({
                rawSources: enrichment.rawSources,
                gatheredAt: new Date().toISOString(),
              })
            : null,
        ]
      )

      // Set has_detailed_death_info flag if we found substantive text for death page
      const hasSubstantiveCircumstances =
        circumstances && circumstances.length > MIN_CIRCUMSTANCES_LENGTH
      const hasSubstantiveRumors =
        rumoredCircumstances && rumoredCircumstances.length > MIN_RUMORED_CIRCUMSTANCES_LENGTH
      const hasRelatedDeaths = relatedDeaths && relatedDeaths.length > 50

      if (hasSubstantiveCircumstances || hasSubstantiveRumors || hasRelatedDeaths) {
        await db.query(`UPDATE actors SET has_detailed_death_info = true WHERE id = $1`, [actorId])
      }

      // Invalidate the actor's cache so updated death info is reflected immediately
      const actorRecord = actorsToEnrich.find((a) => a.id === actorId)
      if (actorRecord?.tmdbId) {
        await invalidateActorCache(actorRecord.tmdbId)
      }

      updated++
    }

    // Print final stats
    const stats = orchestrator.getStats()
    console.log(`\n${"=".repeat(60)}`)
    console.log(
      costLimitReached ? `Enrichment Stopped (Cost Limit Reached)` : `Enrichment Complete!`
    )
    console.log(`${"=".repeat(60)}`)
    console.log(`  Actors processed: ${stats.actorsProcessed}`)
    console.log(`  Actors enriched: ${stats.actorsEnriched}`)
    console.log(`  Fill rate: ${stats.fillRate.toFixed(1)}%`)
    console.log(`  Database updates: ${updated}`)
    console.log(`  Total cost: $${stats.totalCostUsd.toFixed(4)}`)
    console.log(`  Total time: ${(stats.totalTimeMs / 1000).toFixed(1)}s`)

    // Print cost breakdown by source
    const costEntries = Object.entries(stats.costBySource).filter(([, cost]) => cost > 0)
    if (costEntries.length > 0) {
      console.log(`\nCost Breakdown by Source:`)
      costEntries.sort((a, b) => (b[1] as number) - (a[1] as number))
      for (const [source, cost] of costEntries) {
        const percentage =
          stats.totalCostUsd > 0 ? ((cost as number) / stats.totalCostUsd) * 100 : 0
        console.log(`  ${source}: $${(cost as number).toFixed(4)} (${percentage.toFixed(1)}%)`)
      }
    }

    // Record event
    recordCustomEvent("DeathEnrichmentCompleted", {
      actorsProcessed: stats.actorsProcessed,
      actorsEnriched: stats.actorsEnriched,
      fillRate: stats.fillRate,
      databaseUpdates: updated,
      totalCostUsd: stats.totalCostUsd,
      totalTimeMs: stats.totalTimeMs,
    })

    // Rebuild caches if we updated anything
    if (updated > 0) {
      await rebuildDeathCaches()
      console.log("\nRebuilt death caches")
    }
  } catch (error) {
    recordCustomEvent("DeathEnrichmentError", {
      error: error instanceof Error ? error.message : "Unknown error",
    })
    console.error("Error during enrichment:", error)
    process.exit(1)
  } finally {
    await resetPool()
  }
}

// CLI setup
const program = new Command()
  .name("enrich-death-details")
  .description("Enrich actors with missing death details using multi-source fallbacks")
  .option("-l, --limit <number>", "Limit number of actors to process", parsePositiveInt, 100)
  .option(
    "-p, --min-popularity <number>",
    "Only process actors above popularity threshold",
    parsePositiveInt,
    0
  )
  .option("-r, --recent-only", "Only deaths in last 2 years")
  .option("-n, --dry-run", "Preview without writing to database")
  .option("--free", "Use all free sources (default)", true)
  .option("--paid", "Include paid sources (ordered by cost)")
  .option("--ai", "Include AI model fallbacks")
  .option("--stop-on-match", "Stop searching additional sources once we get results", true)
  .option(
    "-c, --confidence <number>",
    "Minimum confidence threshold to accept results (0-1)",
    parseFloat,
    0.5
  )
  .option("-t, --tmdb-id <number>", "Process a specific actor by TMDB ID", parsePositiveInt)
  .option(
    "--max-cost-per-actor <number>",
    "Maximum cost allowed per actor (USD) - stops trying sources for that actor if exceeded",
    parseFloat
  )
  .option(
    "--max-total-cost <number>",
    "Maximum total cost for the entire run (USD) - exits script if exceeded",
    parseFloat
  )
  .option(
    "--claude-cleanup",
    "Enable Claude Opus 4.5 cleanup to extract clean, structured data from raw sources"
  )
  .option(
    "--gather-all-sources",
    "Gather data from ALL sources before cleanup (requires --claude-cleanup)"
  )
  .option("--ignore-cache", "Ignore cached responses and make fresh requests to all sources")
  .action(async (options) => {
    await enrichMissingDetails({
      limit: options.limit,
      minPopularity: options.minPopularity,
      recentOnly: options.recentOnly || false,
      dryRun: options.dryRun || false,
      free: options.free !== false,
      paid: options.paid || false,
      ai: options.ai || false,
      stopOnMatch: options.stopOnMatch !== false,
      confidence: options.confidence,
      tmdbId: options.tmdbId,
      maxCostPerActor: options.maxCostPerActor,
      maxTotalCost: options.maxTotalCost,
      claudeCleanup: options.claudeCleanup || false,
      gatherAllSources: options.gatherAllSources || false,
      ignoreCache: options.ignoreCache || false,
    })
  })

// Only run when executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  program.parse()
}
