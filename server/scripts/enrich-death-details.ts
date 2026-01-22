#!/usr/bin/env tsx
import newrelic from "newrelic"
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
 * Features ENABLED by default (use --disable-* to turn off):
 *   --disable-free               Disable free sources
 *   --disable-paid               Disable paid sources
 *   --disable-claude-cleanup     Disable Claude Opus 4.5 cleanup
 *   --disable-gather-all-sources Disable gathering all sources before cleanup
 *   --disable-follow-links       Disable following links from search results
 *   --disable-ai-link-selection  Disable AI-powered link selection
 *   --disable-ai-content-extraction Disable AI-powered content extraction
 *
 * Features DISABLED by default (enable with positive flag):
 *   -r, --recent-only            Only deaths in last 2 years
 *   --ai                         Include AI model fallbacks
 *
 * Other options:
 *   -l, --limit <n>              Limit number of actors to process (default: 100)
 *   -p, --min-popularity <n>     Only process actors above popularity threshold
 *   -n, --dry-run                Preview without writing to database
 *   -t, --tmdb-id <id>           Process a specific actor by TMDB ID
 *   -y, --yes                    Skip confirmation prompt
 *   --stop-on-match              Stop searching once we get results (default: true)
 *   -c, --confidence <n>         Minimum confidence threshold (0-1, default: 0.5)
 *   --max-cost-per-actor <n>     Maximum cost allowed per actor (USD)
 *   --max-total-cost <n>         Maximum total cost for entire run (USD, default: 10)
 *   --ignore-cache               Ignore cached responses, make fresh requests
 *
 * Link following options:
 *   --ai-model <model>           AI model for link selection and content extraction
 *   --max-links <n>              Maximum links to follow per source
 *   --max-link-cost <n>          Maximum cost for link following per actor (USD)
 *
 * Top-billed actor selection:
 *   --top-billed-year <year>     Only actors top-billed in top movies from this year
 *   --max-billing <n>            Maximum billing position (default: 5)
 *   --top-movies <n>             Number of top movies by popularity (default: 20)
 *
 * Actor filtering:
 *   --us-actors-only             Only process actors who primarily appeared in US productions
 *
 * Examples:
 *   npm run enrich:death-details -- --limit 50 --dry-run
 *   npm run enrich:death-details -- --tmdb-id 12345 --dry-run
 *   npm run enrich:death-details -- --limit 100 --disable-paid --max-total-cost 5
 *   npm run enrich:death-details -- --disable-claude-cleanup --limit 10
 *   npm run enrich:death-details -- --top-billed-year 2020 --top-movies 50
 */

import "dotenv/config"
import * as readline from "readline"
import { Command, InvalidArgumentError } from "commander"
import { getPool, resetPool, getDeceasedActorsFromTopMovies } from "../src/lib/db.js"
import { batchGetPersonDetails } from "../src/lib/tmdb.js"
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
import { createActorSlug } from "../src/lib/slug-utils.js"
import { getBrowserAuthConfig } from "../src/lib/death-sources/browser-auth/config.js"
import { getSessionInfo } from "../src/lib/death-sources/browser-auth/session-manager.js"

// Suppress pino console logging for CLI scripts by setting LOG_LEVEL to silent
// before any logger imports. New Relic will still capture events via its API.
if (!process.env.NEW_RELIC_LOG_LEVEL) {
  process.env.NEW_RELIC_LOG_LEVEL = "silent"
}

// Initialize New Relic for monitoring (silent - no console output)

// Base URL for actor death pages
const SITE_URL = process.env.SITE_URL || "https://deadonfilm.com"

// Display formatting constants
const SEPARATOR_WIDTH = 60
const ESTIMATED_CLAUDE_COST_PER_ACTOR = 0.07

// JSONB array index for appending errors (PostgreSQL jsonb_set uses large index to append)
const ERROR_APPEND_INDEX = 999999

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
  followLinks: boolean
  aiLinkSelection: boolean
  aiContentExtraction: boolean
  aiModel?: string
  maxLinks?: number
  maxLinkCost?: number
  topBilledYear?: number
  maxBilling?: number
  topMovies?: number
  usActorsOnly: boolean
  ignoreCache: boolean
  yes: boolean
  runId?: number // Optional run ID for tracking progress in database
  staging: boolean // Stage 4: Write to staging tables for review workflow
}

/**
 * Wait for user confirmation before proceeding.
 * Returns immediately if --yes flag was provided.
 */
async function waitForConfirmation(skipPrompt: boolean): Promise<boolean> {
  if (skipPrompt) {
    return true
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question("\nPress Enter to continue, or Ctrl+C to cancel... ", () => {
      rl.close()
      resolve(true)
    })
  })
}

/**
 * Global flag for graceful shutdown
 * Set to true when SIGTERM is received
 */
let shouldStop = false

/**
 * Update progress in the database for a running enrichment run
 */
async function updateRunProgress(
  runId: number | undefined,
  updates: {
    currentActorIndex?: number
    currentActorName?: string
    actorsQueried?: number
    actorsProcessed?: number
    actorsEnriched?: number
    totalCostUsd?: number
  }
): Promise<void> {
  if (!runId) return // No run ID, skip progress tracking

  const db = getPool()

  try {
    // Execute individual UPDATE statements to avoid SQL string interpolation
    // This fully complies with the "NEVER Use String Interpolation in SQL" guideline

    if (updates.currentActorIndex !== undefined) {
      await db.query(`UPDATE enrichment_runs SET current_actor_index = $1 WHERE id = $2`, [
        updates.currentActorIndex,
        runId,
      ])
    }

    if (updates.currentActorName !== undefined) {
      await db.query(`UPDATE enrichment_runs SET current_actor_name = $1 WHERE id = $2`, [
        updates.currentActorName,
        runId,
      ])
    }

    if (updates.actorsQueried !== undefined) {
      await db.query(`UPDATE enrichment_runs SET actors_queried = $1 WHERE id = $2`, [
        updates.actorsQueried,
        runId,
      ])
    }

    if (updates.actorsProcessed !== undefined) {
      await db.query(`UPDATE enrichment_runs SET actors_processed = $1 WHERE id = $2`, [
        updates.actorsProcessed,
        runId,
      ])
    }

    if (updates.actorsEnriched !== undefined) {
      await db.query(`UPDATE enrichment_runs SET actors_enriched = $1 WHERE id = $2`, [
        updates.actorsEnriched,
        runId,
      ])
    }

    if (updates.totalCostUsd !== undefined) {
      await db.query(`UPDATE enrichment_runs SET total_cost_usd = $1 WHERE id = $2`, [
        updates.totalCostUsd,
        runId,
      ])
    }
  } catch (error) {
    console.error("Failed to update run progress:", error)
    // Don't throw - we don't want to crash the enrichment if progress tracking fails
  }
}

/**
 * Complete an enrichment run in the database
 */
async function completeEnrichmentRun(
  runId: number | undefined,
  stats: {
    actorsProcessed: number
    actorsEnriched: number
    fillRate: number
    totalCostUsd: number
    totalTimeMs: number
    costBySource: Record<string, number>
    exitReason: "completed" | "cost_limit" | "interrupted"
  }
): Promise<void> {
  if (!runId) return

  const db = getPool()

  try {
    await db.query(
      `UPDATE enrichment_runs
       SET status = $1,
           completed_at = NOW(),
           duration_ms = $2,
           actors_processed = $3,
           actors_enriched = $4,
           fill_rate = $5,
           total_cost_usd = $6,
           cost_by_source = $7,
           exit_reason = $8,
           process_id = NULL,
           current_actor_index = NULL,
           current_actor_name = NULL
       WHERE id = $9`,
      [
        stats.exitReason === "completed"
          ? "completed"
          : stats.exitReason === "cost_limit"
            ? "completed"
            : "stopped",
        stats.totalTimeMs,
        stats.actorsProcessed,
        stats.actorsEnriched,
        stats.fillRate,
        stats.totalCostUsd,
        JSON.stringify(stats.costBySource),
        stats.exitReason,
        runId,
      ]
    )
  } catch (error) {
    console.error("Failed to complete enrichment run:", error)
    // Don't throw - the enrichment itself succeeded
  }
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
    followLinks,
    aiLinkSelection,
    aiContentExtraction,
    aiModel,
    maxLinks,
    maxLinkCost,
    topBilledYear,
    maxBilling,
    topMovies,
    usActorsOnly,
    ignoreCache,
    yes,
    runId,
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
    // Define the type for actor rows from our queries
    type ActorRow = {
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
      movie_title?: string // Only populated when using --top-billed-year
    }

    let actors: ActorRow[]

    // Use specialized query for top-billed year filtering
    if (topBilledYear) {
      console.log(`\nQuerying deceased actors from top-billed roles in ${topBilledYear}...`)
      const effectiveMaxBilling = maxBilling ?? 5
      const effectiveTopMovies = topMovies ?? 20
      console.log(`  Top movies to consider: ${effectiveTopMovies}`)
      console.log(`  Max billing position: ${effectiveMaxBilling}`)

      // First, fetch the top movies for display
      const topMoviesResult = await db.query<{
        tmdb_id: number
        title: string
        popularity: number | null
      }>(
        `SELECT tmdb_id, title, popularity
         FROM movies
         WHERE release_year = $1
           AND (original_language = 'en' OR 'US' = ANY(production_countries))
         ORDER BY popularity DESC NULLS LAST
         LIMIT $2`,
        [topBilledYear, effectiveTopMovies]
      )
      const selectedMovies = topMoviesResult.rows

      console.log(`\n  Top ${selectedMovies.length} movies from ${topBilledYear}:`)
      for (let i = 0; i < selectedMovies.length; i++) {
        const movie = selectedMovies[i]
        const pop = movie.popularity !== null ? Number(movie.popularity).toFixed(1) : "N/A"
        console.log(`    ${(i + 1).toString().padStart(2)}. ${movie.title} (pop: ${pop})`)
      }

      actors = await getDeceasedActorsFromTopMovies({
        year: topBilledYear,
        maxBilling: effectiveMaxBilling,
        topMoviesCount: effectiveTopMovies,
        limit,
      })

      // Fetch missing popularity scores from TMDB for actors that don't have them
      const actorsNeedingPopularity = actors.filter(
        (a) => a.popularity === null && a.tmdb_id !== null
      )
      if (actorsNeedingPopularity.length > 0) {
        console.log(
          `  Fetching popularity for ${actorsNeedingPopularity.length} actors from TMDB...`
        )
        const tmdbIds = actorsNeedingPopularity.map((a) => a.tmdb_id as number)
        const personDetails = await batchGetPersonDetails(tmdbIds)

        // Update actors in memory and collect updates for batch persist
        const tmdbIdsToUpdate: number[] = []
        const popularitiesToUpdate: number[] = []
        for (const actor of actors) {
          if (actor.popularity === null && actor.tmdb_id !== null) {
            const details = personDetails.get(actor.tmdb_id)
            if (details?.popularity !== undefined && details.popularity !== null) {
              actor.popularity = details.popularity
              tmdbIdsToUpdate.push(actor.tmdb_id)
              popularitiesToUpdate.push(details.popularity)
            }
          }
        }

        // Batch update to database
        let updatedCount = 0
        if (tmdbIdsToUpdate.length > 0) {
          await db.query(
            `UPDATE actors AS a
             SET popularity = v.popularity,
                 updated_at = CURRENT_TIMESTAMP
             FROM (
               SELECT UNNEST($1::int[]) AS tmdb_id,
                      UNNEST($2::double precision[]) AS popularity
             ) AS v
             WHERE a.tmdb_id = v.tmdb_id`,
            [tmdbIdsToUpdate, popularitiesToUpdate]
          )
          updatedCount = tmdbIdsToUpdate.length
        }
        if (updatedCount > 0) {
          console.log(`  Stored ${updatedCount} popularity scores to database`)
        }

        // Re-sort by popularity descending
        actors.sort((a, b) => {
          const popA = a.popularity ?? 0
          const popB = b.popularity ?? 0
          return popB - popA
        })
      }
    } else if (tmdbId) {
      // Target a specific actor
      console.log(`\nQuerying actor with TMDB ID ${tmdbId}...`)
      const result = await db.query<ActorRow>(
        `SELECT
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
          AND a.deathday IS NOT NULL`,
        [tmdbId]
      )
      actors = result.rows
    } else {
      // Query actors where Claude returned nulls for detailed fields
      console.log(`\nQuerying actors with missing death circumstances...`)
      const params: (number | string)[] = []
      let query = `
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
          c.notable_factors,
          (
            SELECT COUNT(*) FROM actor_movie_appearances WHERE actor_id = a.id
          ) + (
            SELECT COUNT(*) FROM actor_show_appearances WHERE actor_id = a.id
          ) AS appearance_count
        FROM actors a
        LEFT JOIN actor_death_circumstances c ON c.actor_id = a.id
        WHERE a.deathday IS NOT NULL
          AND a.cause_of_death IS NOT NULL
          AND (c.circumstances IS NULL OR c.notable_factors IS NULL OR array_length(c.notable_factors, 1) IS NULL)
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

      if (usActorsOnly) {
        // Filter to actors who appeared in US shows or US/English-language movies
        query += `
          AND (
            EXISTS (
              SELECT 1 FROM actor_show_appearances asa
              JOIN shows s ON asa.show_tmdb_id = s.tmdb_id
              WHERE asa.actor_id = a.id
              AND s.origin_country @> ARRAY['US']::text[]
            )
            OR EXISTS (
              SELECT 1 FROM actor_movie_appearances ama
              JOIN movies m ON ama.movie_tmdb_id = m.tmdb_id
              WHERE ama.actor_id = a.id
              AND (
                m.production_countries @> ARRAY['US']::text[]
                OR m.original_language = 'en'
              )
            )
          )`

        // When filtering for US actors, sort by US/English appearances instead of total
        query += `
          ORDER BY
            a.popularity DESC NULLS LAST,
            a.birthday DESC NULLS LAST,
            (
              SELECT COUNT(*) FROM actor_show_appearances asa
              JOIN shows s ON asa.show_tmdb_id = s.tmdb_id
              WHERE asa.actor_id = a.id AND s.origin_country @> ARRAY['US']::text[]
            ) + (
              SELECT COUNT(*) FROM actor_movie_appearances ama
              JOIN movies m ON ama.movie_tmdb_id = m.tmdb_id
              WHERE ama.actor_id = a.id
              AND (m.production_countries @> ARRAY['US']::text[] OR m.original_language = 'en')
            ) DESC`
      } else {
        query += ` ORDER BY a.popularity DESC NULLS LAST, a.birthday DESC NULLS LAST, appearance_count DESC`
      }

      if (limit) {
        params.push(limit)
        query += ` LIMIT $${params.length}`
      }

      const result = await db.query<ActorRow>(query, params)
      actors = result.rows
    }

    // Update run progress with initial actor count
    await updateRunProgress(runId, {
      actorsQueried: actors.length,
    })

    if (actors.length === 0) {
      console.log("\nNo actors to enrich. Done!")
      await resetPool()
      return
    }

    // Display configuration summary
    console.log(`\n${"=".repeat(SEPARATOR_WIDTH)}`)
    console.log(`Enrichment Configuration`)
    console.log(`${"=".repeat(SEPARATOR_WIDTH)}`)
    console.log(`\nTarget:`)
    console.log(`  Actors to process: ${actors.length}`)
    if (tmdbId) {
      console.log(`  Specific actor: TMDB ID ${tmdbId}`)
    } else {
      console.log(`  Min popularity: ${minPopularity}`)
      if (recentOnly) {
        console.log(`  Filter: Recent deaths only (last 2 years)`)
      }
      if (usActorsOnly) {
        console.log(`  Filter: US actors only`)
      }
    }

    // Top-billed actor selection
    if (topBilledYear) {
      console.log(`\nTop-Billed Selection:`)
      console.log(`  Year: ${topBilledYear}`)
      console.log(`  Top movies: ${topMovies ?? 20}`)
      console.log(`  Max billing position: ${maxBilling ?? 5}`)
    }

    console.log(`\nData Sources:`)
    console.log(`  Free sources: ${free ? "enabled" : "disabled"}`)
    console.log(`  Paid sources: ${paid ? "enabled" : "disabled"}`)
    console.log(`  AI sources: ${ai ? "enabled" : "disabled"}`)
    console.log(
      `  Stop on match: ${claudeCleanup && gatherAllSources ? "no (gathering all)" : stopOnMatch ? "yes" : "no"}`
    )
    console.log(`  Confidence threshold: ${confidenceThreshold}`)

    console.log(`\nLink Following:`)
    console.log(`  Follow links: ${followLinks ? "enabled" : "disabled"}`)
    console.log(`  AI link selection: ${aiLinkSelection ? "enabled" : "disabled"}`)
    console.log(`  AI content extraction: ${aiContentExtraction ? "enabled" : "disabled"}`)
    if (aiModel) {
      console.log(`  AI model: ${aiModel}`)
    }
    if (maxLinks !== undefined) {
      console.log(`  Max links per source: ${maxLinks}`)
    }
    if (maxLinkCost !== undefined) {
      console.log(`  Max link cost per actor: $${maxLinkCost}`)
    }

    // Show paywalled content access configuration
    console.log(`\nPaywalled Content Access:`)
    const hasNytApiKey = !!process.env.NYTIMES_API_KEY
    console.log(`  NYTimes API: ${hasNytApiKey ? "configured" : "not configured"}`)
    if (hasNytApiKey) {
      console.log(`    → Articles fetched via archive.is`)
    }

    const browserAuthConfig = getBrowserAuthConfig()
    const hasWapoCredentials = !!browserAuthConfig.credentials.washingtonpost
    console.log(`  Washington Post: ${hasWapoCredentials ? "configured" : "not configured"}`)
    if (hasWapoCredentials) {
      const wapoSession = await getSessionInfo("washingtonpost.com")
      if (wapoSession) {
        console.log(`    → Saved session (${wapoSession.cookieCount} cookies)`)
      } else {
        console.log(`    → Will login on first use`)
      }
    }

    if (browserAuthConfig.captchaSolver?.apiKey) {
      console.log(`  CAPTCHA solver: 2captcha (configured)`)
    }

    console.log(`\nClaude Cleanup:`)
    console.log(`  Enabled: ${claudeCleanup ? "yes (Opus 4.5)" : "disabled"}`)
    if (claudeCleanup) {
      console.log(`  Gather all sources: ${gatherAllSources ? "yes" : "no"}`)
      console.log(`  Estimated cost per actor: ~$${ESTIMATED_CLAUDE_COST_PER_ACTOR}`)
    }

    console.log(`\nCost Limits:`)
    if (maxCostPerActor !== undefined) {
      console.log(`  Max per actor: $${maxCostPerActor}`)
    } else {
      console.log(`  Max per actor: unlimited`)
    }
    if (maxTotalCost !== undefined) {
      console.log(`  Max total: $${maxTotalCost}`)
    } else {
      console.log(`  Max total: unlimited`)
    }

    if (ignoreCache) {
      console.log(`\nCache: DISABLED (fresh requests only)`)
    }

    console.log(
      `\nMode: ${dryRun ? "DRY RUN (no database writes)" : "LIVE (will write to database)"}`
    )
    console.log(`${"=".repeat(SEPARATOR_WIDTH)}`)

    // Sample actors preview
    if (topBilledYear) {
      // When using --top-billed-year, show actor with their movie
      console.log(`\nActors to enrich:`)
      for (const actor of actors) {
        const movieInfo = actor.movie_title ? ` (${actor.movie_title})` : ""
        console.log(`  - ${actor.name}${movieInfo}`)
      }
    } else {
      console.log(`\nSample actors (first 5):`)
      for (const actor of actors.slice(0, 5)) {
        console.log(`  - ${actor.name} (ID: ${actor.id}, TMDB: ${actor.tmdb_id || "N/A"})`)
        console.log(`    Death: ${actor.deathday}, Cause: ${actor.cause_of_death || "(none)"}`)
      }
      if (actors.length > 5) {
        console.log(`  ... and ${actors.length - 5} more`)
      }
    }

    // Prompt for confirmation (unless --yes or --dry-run)
    if (!dryRun) {
      // Show summary before prompt
      const sources = [free ? "free" : null, paid ? "paid" : null, ai ? "AI" : null]
        .filter(Boolean)
        .join(", ")
      const costStr = maxTotalCost !== undefined ? `$${maxTotalCost}` : "unlimited"

      console.log(`\n${"─".repeat(SEPARATOR_WIDTH)}`)
      console.log(`Ready to enrich ${actors.length} actors`)
      console.log(`  Sources: ${sources || "none"}`)
      if (claudeCleanup) {
        console.log(`  Claude cleanup: enabled${gatherAllSources ? " (gather all)" : ""}`)
      }
      console.log(`  Max cost: ${costStr}`)
      console.log(`${"─".repeat(SEPARATOR_WIDTH)}`)

      const confirmed = await waitForConfirmation(yes)
      if (!confirmed) {
        console.log("\nCancelled.")
        await resetPool()
        return
      }
    }

    if (dryRun) {
      console.log(`\n--- Dry Run Complete ---`)
      console.log(`Would have processed ${actors.length} actors with the above configuration.`)
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

    // Check if we should stop before starting enrichment
    if (shouldStop) {
      console.log("\nEnrichment stopped before starting (SIGTERM received)")
      await completeEnrichmentRun(runId, {
        actorsProcessed: 0,
        actorsEnriched: 0,
        fillRate: 0,
        totalCostUsd: 0,
        totalTimeMs: 0,
        costBySource: {},
        exitReason: "interrupted",
      })
      await resetPool()
      process.exit(0)
    }

    // Run enrichment - process actors one by one to enable progress tracking
    const results = new Map<number, Awaited<ReturnType<typeof orchestrator.enrichActor>>>()
    let costLimitReached = false

    try {
      // Process actors individually to update progress in real-time
      for (let i = 0; i < actorsToEnrich.length; i++) {
        const actor = actorsToEnrich[i]

        // Update progress before processing each actor
        await updateRunProgress(runId, {
          currentActorIndex: i + 1,
          currentActorName: actor.name,
        })

        // Enrich this actor
        const enrichment = await orchestrator.enrichActor(actor)
        results.set(actor.id, enrichment)
      }
    } catch (error) {
      if (error instanceof CostLimitExceededError) {
        console.log(`\n${"!".repeat(SEPARATOR_WIDTH)}`)
        console.log(`Cost limit reached - exiting gracefully`)
        console.log(`Limit: $${error.limit}, Current: $${error.currentCost.toFixed(4)}`)
        console.log(`${"!".repeat(SEPARATOR_WIDTH)}`)
        costLimitReached = true
        // Note: partial results were already collected in the results map
        newrelic.recordCustomEvent("DeathEnrichmentCostLimitReached", {
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
    const updatedActors: Array<{ name: string; tmdbId: number }> = []

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
      const relatedDeaths = cleaned?.relatedDeaths || enrichment.relatedDeaths || null

      // New fields from Claude cleanup
      const causeConfidence = cleaned?.causeConfidence || null
      const detailsConfidence = cleaned?.detailsConfidence || null
      const birthdayConfidence = cleaned?.birthdayConfidence || null
      const deathdayConfidence = cleaned?.deathdayConfidence || null
      const lastProject = cleaned?.lastProject || enrichment.lastProject || null
      const careerStatusAtDeath =
        cleaned?.careerStatusAtDeath || enrichment.careerStatusAtDeath || null
      const posthumousReleases =
        cleaned?.posthumousReleases || enrichment.posthumousReleases || null
      const relatedCelebrities =
        cleaned?.relatedCelebrities || enrichment.relatedCelebrities || null

      // Look up related_celebrity_ids from actors table
      let relatedCelebrityIds: number[] | null = null
      if (relatedCelebrities && relatedCelebrities.length > 0) {
        const names = relatedCelebrities.map((c) => c.name)
        const idResult = await db.query<{ id: number }>(
          `SELECT id FROM actors WHERE name = ANY($1)`,
          [names]
        )
        if (idResult.rows.length > 0) {
          relatedCelebrityIds = idResult.rows.map((r) => r.id)
        }
      }

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

      // TODO (Stage 4): Use enrichment-db-writer module to support staging mode
      // If options.staging is true:
      //   1. Get enrichment_run_actor_id for this actor
      //   2. Call writeToStaging() instead of direct db.query
      //   3. Skip cache invalidation (data not live yet)
      // If options.staging is false:
      //   Continue with current behavior (writeToProduction)

      // Update actor_death_circumstances table with all fields
      await db.query(
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
          related_deaths,
          sources,
          raw_response,
          enriched_at,
          enrichment_source,
          enrichment_version,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), $20, $21, NOW(), NOW())
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
          related_deaths = COALESCE(EXCLUDED.related_deaths, actor_death_circumstances.related_deaths),
          sources = COALESCE(EXCLUDED.sources, actor_death_circumstances.sources),
          raw_response = COALESCE(EXCLUDED.raw_response, actor_death_circumstances.raw_response),
          enriched_at = NOW(),
          enrichment_source = EXCLUDED.enrichment_source,
          enrichment_version = EXCLUDED.enrichment_version,
          updated_at = NOW()`,
        [
          actorId,
          circumstances,
          circumstancesConfidence,
          rumoredCircumstances,
          causeConfidence,
          detailsConfidence,
          birthdayConfidence,
          deathdayConfidence,
          locationOfDeath,
          lastProject ? JSON.stringify(lastProject) : null,
          careerStatusAtDeath,
          posthumousReleases && posthumousReleases.length > 0
            ? JSON.stringify(posthumousReleases)
            : null,
          relatedCelebrityIds,
          relatedCelebrities && relatedCelebrities.length > 0
            ? JSON.stringify(relatedCelebrities)
            : null,
          notableFactors && notableFactors.length > 0 ? notableFactors : null,
          additionalContext,
          relatedDeaths,
          JSON.stringify({
            circumstances: enrichment.circumstancesSource,
            rumoredCircumstances: enrichment.rumoredCircumstancesSource,
            notableFactors: enrichment.notableFactorsSource,
            locationOfDeath: enrichment.locationOfDeathSource,
            lastProject: enrichment.lastProjectSource,
            careerStatusAtDeath: enrichment.careerStatusAtDeathSource,
            cleanupSource: cleaned ? "claude-opus-4.5" : null,
          }),
          enrichment.rawSources
            ? JSON.stringify({
                rawSources: enrichment.rawSources,
                gatheredAt: new Date().toISOString(),
              })
            : null,
          "multi-source-enrichment",
          "2.0.0", // Version with career context fields
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
        updatedActors.push({ name: actorRecord.name, tmdbId: actorRecord.tmdbId })
      }

      updated++
    }

    // Print final stats
    const stats = orchestrator.getStats()
    console.log(`\n${"=".repeat(SEPARATOR_WIDTH)}`)
    console.log(
      costLimitReached ? `Enrichment Stopped (Cost Limit Reached)` : `Enrichment Complete!`
    )
    console.log(`${"=".repeat(SEPARATOR_WIDTH)}`)
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

    // Record completion event
    newrelic.recordCustomEvent("DeathEnrichmentCompleted", {
      actorsProcessed: stats.actorsProcessed,
      actorsEnriched: stats.actorsEnriched,
      fillRate: stats.fillRate,
      databaseUpdates: updated,
      totalCostUsd: stats.totalCostUsd,
      totalTimeMs: stats.totalTimeMs,
    })

    // Update enrichment run completion in database
    await completeEnrichmentRun(runId, {
      actorsProcessed: stats.actorsProcessed,
      actorsEnriched: stats.actorsEnriched,
      fillRate: stats.fillRate,
      totalCostUsd: stats.totalCostUsd,
      totalTimeMs: stats.totalTimeMs,
      costBySource: stats.costBySource,
      exitReason: costLimitReached ? "cost_limit" : shouldStop ? "interrupted" : "completed",
    })

    // Rebuild caches if we updated anything
    if (updated > 0) {
      await rebuildDeathCaches()
      console.log("\nRebuilt death caches")
    }

    // Print death page links for updated actors
    if (updatedActors.length > 0) {
      console.log(`\n${"─".repeat(SEPARATOR_WIDTH)}`)
      console.log(`Death Page Links:`)
      console.log(`${"─".repeat(SEPARATOR_WIDTH)}`)
      for (const actor of updatedActors) {
        const slug = createActorSlug(actor.name, actor.tmdbId)
        console.log(`  ${actor.name}: ${SITE_URL}/actor/${slug}/death`)
      }
    }
  } catch (error) {
    newrelic.recordCustomEvent("DeathEnrichmentError", {
      error: error instanceof Error ? error.message : "Unknown error",
    })
    console.error("Error during enrichment:", error)

    // Mark run as failed in database
    if (runId) {
      const db = getPool()
      try {
        await db.query(
          `UPDATE enrichment_runs
           SET status = 'failed',
               completed_at = NOW(),
               exit_reason = 'error',
               process_id = NULL,
               current_actor_index = NULL,
               current_actor_name = NULL,
               errors = jsonb_set(
                 COALESCE(errors, '[]'::jsonb),
                 '{${ERROR_APPEND_INDEX}}',
                 to_jsonb($2::text)
               )
           WHERE id = $1`,
          [runId, error instanceof Error ? error.message : "Unknown error"]
        )
      } catch (dbError) {
        console.error("Failed to update enrichment run status on error:", dbError)
      }
    }

    process.exit(1)
  } finally {
    await resetPool()
  }

  // Exit cleanly to avoid hanging on background connections
  process.exit(0)
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
  // Source category options (enabled by default, use --disable-* to turn off)
  .option("--disable-free", "Disable free sources")
  .option("--disable-paid", "Disable paid sources")
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
    parseFloat,
    10
  )
  // Claude cleanup options (enabled by default)
  .option("--disable-claude-cleanup", "Disable Claude Opus 4.5 cleanup")
  .option("--disable-gather-all-sources", "Disable gathering data from ALL sources before cleanup")
  // Link following options (enabled by default)
  .option("--disable-follow-links", "Disable following links from search results")
  .option("--disable-ai-link-selection", "Disable AI-powered link selection")
  .option("--disable-ai-content-extraction", "Disable AI-powered content extraction from pages")
  .option("--ai-model <model>", "AI model to use for link selection and content extraction")
  .option("--max-links <number>", "Maximum number of links to follow per source", parsePositiveInt)
  .option("--max-link-cost <number>", "Maximum cost for link following per actor (USD)", parseFloat)
  // Top-billed actor selection options
  .option(
    "--top-billed-year <year>",
    "Only process actors who were top-billed in movies from this year",
    parsePositiveInt
  )
  .option(
    "--max-billing <number>",
    "Maximum billing position to consider as top-billed (default: 5)",
    parsePositiveInt
  )
  .option(
    "--top-movies <number>",
    "Number of top movies by popularity to consider (default: 20)",
    parsePositiveInt
  )
  // Actor filtering options
  .option("--us-actors-only", "Only process actors who primarily appeared in US productions")
  .option("--ignore-cache", "Ignore cached responses and make fresh requests to all sources")
  .option("-y, --yes", "Skip confirmation prompt")
  // Progress tracking option (used when spawned from admin UI)
  .option(
    "--run-id <number>",
    "Enrichment run ID for progress tracking (primarily for internal/admin UI use; typically not set manually)",
    parsePositiveInt
  )
  // Stage 4: Review workflow
  .option("--staging", "Write to staging tables for review before committing to production")
  .action(async (options) => {
    await enrichMissingDetails({
      limit: options.limit,
      minPopularity: options.minPopularity,
      recentOnly: options.recentOnly || false,
      dryRun: options.dryRun || false,
      free: !options.disableFree,
      paid: !options.disablePaid,
      ai: options.ai || false,
      stopOnMatch: options.stopOnMatch !== false,
      confidence: options.confidence,
      tmdbId: options.tmdbId,
      maxCostPerActor: options.maxCostPerActor,
      maxTotalCost: options.maxTotalCost,
      claudeCleanup: !options.disableClaudeCleanup,
      gatherAllSources: !options.disableGatherAllSources,
      followLinks: !options.disableFollowLinks,
      aiLinkSelection: !options.disableAiLinkSelection,
      aiContentExtraction: !options.disableAiContentExtraction,
      aiModel: options.aiModel,
      maxLinks: options.maxLinks,
      maxLinkCost: options.maxLinkCost,
      topBilledYear: options.topBilledYear,
      maxBilling: options.maxBilling,
      topMovies: options.topMovies,
      usActorsOnly: options.usActorsOnly || false,
      ignoreCache: options.ignoreCache || false,
      yes: options.yes || false,
      runId: options.runId,
      staging: options.staging || false,
    })
  })

// Only run when executed directly
// Handle SIGTERM for graceful shutdown (when stopped from admin UI)
process.on("SIGTERM", () => {
  console.log("\n\nReceived SIGTERM - stopping enrichment gracefully...")
  shouldStop = true
})

const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  program.parse()
}
