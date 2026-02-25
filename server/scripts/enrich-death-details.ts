#!/usr/bin/env tsx
import "dotenv/config" // MUST be first import to load environment variables
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
 *   -a, --actor-id <ids>         Process specific actor(s) by internal ID (comma-separated)
 *   -t, --tmdb-id <ids>          Process specific actor(s) by TMDB ID (comma-separated)
 *   -y, --yes                    Skip confirmation prompt
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
 *   npm run enrich:death-details -- --actor-id 2157 --dry-run
 *   npm run enrich:death-details -- --actor-id 2157,2158,2159 --dry-run
 *   npm run enrich:death-details -- --tmdb-id 12345 --dry-run
 *   npm run enrich:death-details -- --tmdb-id 12345,67890 --dry-run
 *   npm run enrich:death-details -- --limit 100 --disable-paid --max-total-cost 5
 *   npm run enrich:death-details -- --disable-claude-cleanup --limit 10
 *   npm run enrich:death-details -- --top-billed-year 2020 --top-movies 50
 */

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
import { isViolentDeath } from "../src/lib/death-sources/claude-cleanup.js"
import { createActorSlug } from "../src/lib/slug-utils.js"
import { getBrowserAuthConfig } from "../src/lib/death-sources/browser-auth/config.js"
import { getSessionInfo } from "../src/lib/death-sources/browser-auth/session-manager.js"
import {
  writeToProduction,
  writeToStaging,
  type EnrichmentData,
  type DeathCircumstancesData,
} from "../src/lib/enrichment-db-writer.js"

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

/**
 * Parse comma-separated positive integers for --actor-id and --tmdb-id options.
 * Validates each ID and rejects empty segments (e.g., "1," or ",2").
 * Used by Commander option parsing for clean error messages.
 */
function parseCommaSeparatedIds(value: string): number[] {
  if (!value || value.trim() === "") {
    throw new InvalidArgumentError("ID list cannot be empty")
  }

  const segments = value.split(",")
  const ids: number[] = []

  for (const segment of segments) {
    const trimmed = segment.trim()

    // Reject empty segments (e.g., "1," or ",2")
    if (trimmed === "") {
      throw new InvalidArgumentError("ID list cannot contain empty values (e.g., '1,' or ',2')")
    }

    // Validate and parse each ID
    try {
      ids.push(parsePositiveInt(trimmed))
    } catch (error) {
      throw new InvalidArgumentError(
        `Invalid ID '${trimmed}': ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  return ids
}

interface EnrichOptions {
  limit: number
  minPopularity: number
  recentOnly: boolean
  dryRun: boolean
  free: boolean
  paid: boolean
  ai: boolean
  confidence: number
  actorId?: number[]
  tmdbId?: number[]
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
  disableReliabilityThreshold: boolean // A/B control: disable source reliability threshold
  disableBooks: boolean // Disable book sources (Google Books, Open Library, IA Books)
  sortBy: "popularity" | "interestingness" // Order actors by popularity or interestingness score
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
  },
  staging: boolean = false
): Promise<void> {
  if (!runId) return

  const db = getPool()

  try {
    // Stage 4: Set review_status for staging runs
    const reviewStatus = staging ? "pending_review" : "not_applicable"

    // Count actors that created death pages from the per-actor tracking
    const deathPageResult = await db.query<{ cnt: string }>(
      `SELECT count(*) as cnt FROM enrichment_run_actors WHERE run_id = $1 AND created_death_page = true`,
      [runId]
    )
    const actorsWithDeathPage = parseInt(deathPageResult.rows[0]?.cnt ?? "0", 10)

    await db.query(
      `UPDATE enrichment_runs
       SET status = $1,
           completed_at = NOW(),
           duration_ms = $2,
           actors_processed = $3,
           actors_enriched = $4,
           actors_with_death_page = $5,
           fill_rate = $6,
           total_cost_usd = $7,
           cost_by_source = $8,
           exit_reason = $9,
           review_status = $10,
           process_id = NULL,
           current_actor_index = NULL,
           current_actor_name = NULL
       WHERE id = $11`,
      [
        stats.exitReason === "completed"
          ? "completed"
          : stats.exitReason === "cost_limit"
            ? "completed"
            : "stopped",
        stats.totalTimeMs,
        stats.actorsProcessed,
        stats.actorsEnriched,
        actorsWithDeathPage,
        stats.fillRate,
        stats.totalCostUsd,
        JSON.stringify(stats.costBySource),
        stats.exitReason,
        reviewStatus,
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
    confidence: confidenceThreshold,
    actorId,
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
    staging,
    disableReliabilityThreshold,
    disableBooks,
    sortBy,
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
      tmdb_popularity: number | null
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
        (a) => a.tmdb_popularity === null && a.tmdb_id !== null
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
          if (actor.tmdb_popularity === null && actor.tmdb_id !== null) {
            const details = personDetails.get(actor.tmdb_id)
            if (details?.popularity !== undefined && details.popularity !== null) {
              actor.tmdb_popularity = details.popularity
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
          const popA = a.tmdb_popularity ?? 0
          const popB = b.tmdb_popularity ?? 0
          return popB - popA
        })
      }
    } else if (actorId) {
      // Target specific actors by internal ID(s)
      console.log(`\nQuerying ${actorId.length} actor(s) by internal ID...`)
      const result = await db.query<ActorRow>(
        `SELECT
          a.id,
          a.tmdb_id,
          a.name,
          a.birthday,
          a.deathday,
          a.cause_of_death,
          a.cause_of_death_details,
          a.popularity AS tmdb_popularity,
          c.circumstances,
          c.notable_factors
        FROM actors a
        LEFT JOIN actor_death_circumstances c ON c.actor_id = a.id
        WHERE a.id = ANY($1::int[])
          AND a.deathday IS NOT NULL
        ORDER BY a.popularity DESC NULLS LAST`,
        [actorId]
      )
      actors = result.rows
    } else if (tmdbId) {
      // Target specific actors by TMDB ID(s)
      console.log(`\nQuerying ${tmdbId.length} actor(s) by TMDB ID...`)
      const result = await db.query<ActorRow>(
        `SELECT
          a.id,
          a.tmdb_id,
          a.name,
          a.birthday,
          a.deathday,
          a.cause_of_death,
          a.cause_of_death_details,
          a.popularity AS tmdb_popularity,
          c.circumstances,
          c.notable_factors
        FROM actors a
        LEFT JOIN actor_death_circumstances c ON c.actor_id = a.id
        WHERE a.tmdb_id = ANY($1::int[])
          AND a.deathday IS NOT NULL
        ORDER BY a.popularity DESC NULLS LAST`,
        [tmdbId]
      )
      actors = result.rows
    } else {
      // Query actors needing enrichment:
      // - Missing cause_of_death entirely, OR
      // - Have cause_of_death but missing detailed circumstances
      console.log(`\nQuerying actors needing death enrichment...`)
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
          a.popularity AS tmdb_popularity,
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
          AND (
            a.cause_of_death IS NULL
            OR c.circumstances IS NULL
            OR c.notable_factors IS NULL
            OR array_length(c.notable_factors, 1) IS NULL
          )
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
        const usOrderPrimary =
          sortBy === "interestingness"
            ? "a.interestingness_score DESC NULLS LAST"
            : "a.popularity DESC NULLS LAST"
        query += `
          ORDER BY
            ${usOrderPrimary},
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
        const orderPrimary =
          sortBy === "interestingness"
            ? "a.interestingness_score DESC NULLS LAST"
            : "a.popularity DESC NULLS LAST"
        query += ` ORDER BY ${orderPrimary}, a.birthday DESC NULLS LAST, appearance_count DESC`
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
    if (actorId) {
      console.log(`  Specific actor(s): Internal ID(s) ${actorId.join(", ")}`)
    } else if (tmdbId) {
      console.log(`  Specific actor(s): TMDB ID(s) ${tmdbId.join(", ")}`)
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
        books: !disableBooks,
      },
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
      useReliabilityThreshold: !disableReliabilityThreshold,
    }

    const orchestrator = new DeathEnrichmentOrchestrator(config)

    // Wire up RunLogger for DB log capture if we have a run ID
    if (runId) {
      const { RunLogger } = await import("../src/lib/run-logger.js")
      orchestrator.setRunLogger(new RunLogger("death", runId))
    }

    // Convert to ActorForEnrichment format
    const actorsToEnrich: ActorForEnrichment[] = actors.map((a) => ({
      id: a.id,
      tmdbId: a.tmdb_id,
      name: a.name,
      birthday: normalizeDateToString(a.birthday),
      deathday: normalizeDateToString(a.deathday) || "",
      causeOfDeath: a.cause_of_death,
      causeOfDeathDetails: a.cause_of_death_details,
      popularity: a.tmdb_popularity,
    }))

    // Check if we should stop before starting enrichment
    if (shouldStop) {
      console.log("\nEnrichment stopped before starting (SIGTERM received)")
      await completeEnrichmentRun(
        runId,
        {
          actorsProcessed: 0,
          actorsEnriched: 0,
          fillRate: 0,
          totalCostUsd: 0,
          totalTimeMs: 0,
          costBySource: {},
          exitReason: "interrupted",
        },
        staging
      )
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
    const updatedActors: Array<{ name: string; id: number }> = []

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

      // Extract cause of death from Claude cleanup (for actors missing it)
      const causeOfDeath = cleaned?.cause || null
      const causeOfDeathDetails = cleaned?.details || null

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

      // Manner and categories from Claude cleanup
      const manner = cleaned?.manner || null
      const categories = cleaned?.categories || null

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

      // Determine if we have substantive death info
      const hasSubstantiveCircumstances =
        circumstances && circumstances.length > MIN_CIRCUMSTANCES_LENGTH
      const hasSubstantiveRumors =
        rumoredCircumstances && rumoredCircumstances.length > MIN_RUMORED_CIRCUMSTANCES_LENGTH
      const hasRelatedDeaths = relatedDeaths && relatedDeaths.length > 50
      const hasDetailedDeathInfo =
        hasSubstantiveCircumstances || hasSubstantiveRumors || hasRelatedDeaths

      // Get actor record for metadata
      const actorRecord = actorsToEnrich.find((a) => a.id === actorId)

      // Prepare enrichment data structures
      // Only include causeOfDeath if actor doesn't already have one
      const enrichmentData: EnrichmentData = {
        actorId,
        hasDetailedDeathInfo: hasDetailedDeathInfo || false,
        // Fill in cause_of_death if we got one and actor doesn't have it
        causeOfDeath: !actorRecord?.causeOfDeath && causeOfDeath ? causeOfDeath : undefined,
        causeOfDeathSource:
          !actorRecord?.causeOfDeath && causeOfDeath ? "claude-opus-4.5" : undefined,
        causeOfDeathDetails:
          !actorRecord?.causeOfDeathDetails && causeOfDeathDetails
            ? causeOfDeathDetails
            : undefined,
        causeOfDeathDetailsSource:
          !actorRecord?.causeOfDeathDetails && causeOfDeathDetails ? "claude-opus-4.5" : undefined,
        // Manner of death and categories from Claude cleanup
        deathManner: manner,
        deathCategories: categories,
        // Derive violent_death from manner
        violentDeath: isViolentDeath(manner),
      }

      const circumstancesData: DeathCircumstancesData = {
        actorId,
        circumstances,
        circumstancesConfidence,
        rumoredCircumstances,
        causeConfidence,
        detailsConfidence,
        birthdayConfidence,
        deathdayConfidence,
        locationOfDeath,
        lastProject,
        careerStatusAtDeath,
        posthumousReleases,
        relatedCelebrityIds,
        relatedCelebrities,
        notableFactors,
        additionalContext,
        relatedDeaths,
        sources: {
          circumstances: enrichment.circumstancesSource,
          rumoredCircumstances: enrichment.rumoredCircumstancesSource,
          notableFactors: enrichment.notableFactorsSource,
          locationOfDeath: enrichment.locationOfDeathSource,
          additionalContext: enrichment.additionalContextSource,
          lastProject: enrichment.lastProjectSource,
          careerStatusAtDeath: enrichment.careerStatusAtDeathSource,
          posthumousReleases: enrichment.posthumousReleasesSource,
          relatedCelebrities: enrichment.relatedCelebritiesSource,
          cleanupSource: cleaned ? "claude-opus-4.5" : null,
        },
        rawResponse: enrichment.rawSources
          ? {
              rawSources: enrichment.rawSources,
              gatheredAt: new Date().toISOString(),
            }
          : null,
        enrichmentSource: "multi-source-enrichment",
        enrichmentVersion: disableReliabilityThreshold ? "4.0.0-no-reliability" : "4.0.0",
      }

      // Stage 4: Route to staging or production based on --staging flag
      if (staging && runId) {
        // Staging mode: Write to review tables
        // First, insert enrichment_run_actors record to track this enrichment
        const eraResult = await db.query<{ id: number }>(
          `INSERT INTO enrichment_run_actors (
            run_id,
            actor_id,
            was_enriched,
            created_death_page,
            confidence,
            sources_attempted,
            winning_source,
            processing_time_ms,
            cost_usd
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id`,
          [
            runId,
            actorId,
            true, // was_enriched
            hasDetailedDeathInfo || false, // created_death_page
            enrichment.circumstancesSource?.confidence || null,
            JSON.stringify([enrichment.circumstancesSource?.type].filter(Boolean)),
            enrichment.circumstancesSource?.type || null,
            null, // processing_time_ms - not tracked in staging mode
            enrichment.circumstancesSource?.costUsd || 0,
          ]
        )

        const enrichmentRunActorId = eraResult.rows[0].id

        // Write to staging tables for review
        await writeToStaging(db, enrichmentRunActorId, enrichmentData, circumstancesData)

        console.log(`  ✓ Staged for review: ${actorRecord?.name}`)
      } else {
        // Production mode: Write directly to actors/actor_death_circumstances
        await writeToProduction(db, enrichmentData, circumstancesData)

        // Invalidate cache so updated death info is reflected immediately
        await invalidateActorCache(actorId)
        if (actorRecord) {
          updatedActors.push({
            name: actorRecord.name,
            id: actorId,
          })
        }
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
    await completeEnrichmentRun(
      runId,
      {
        actorsProcessed: stats.actorsProcessed,
        actorsEnriched: stats.actorsEnriched,
        fillRate: stats.fillRate,
        totalCostUsd: stats.totalCostUsd,
        totalTimeMs: stats.totalTimeMs,
        costBySource: stats.costBySource,
        exitReason: costLimitReached ? "cost_limit" : shouldStop ? "interrupted" : "completed",
      },
      staging
    )

    // Rebuild caches if we updated anything (only in production mode)
    if (updated > 0 && !staging) {
      await rebuildDeathCaches()
      console.log("\nRebuilt death caches")
    } else if (updated > 0 && staging) {
      console.log(
        `\n${updated} enrichments staged for review - data not live yet, caches not rebuilt`
      )
    }

    // Print death page links for updated actors
    if (updatedActors.length > 0) {
      console.log(`\n${"─".repeat(SEPARATOR_WIDTH)}`)
      console.log(`Death Page Links:`)
      console.log(`${"─".repeat(SEPARATOR_WIDTH)}`)
      for (const actor of updatedActors) {
        const slug = createActorSlug(actor.name, actor.id)
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
  .option("--disable-books", "Disable book sources (Google Books, Open Library, IA Books)")
  .option("--ai", "Include AI model fallbacks")
  .option(
    "-c, --confidence <number>",
    "Minimum confidence threshold to accept results (0-1)",
    parseFloat,
    0.5
  )
  .option(
    "-a, --actor-id <ids>",
    "Process specific actor(s) by internal ID (comma-separated, e.g., '1,2,3')",
    parseCommaSeparatedIds
  )
  .option(
    "-t, --tmdb-id <ids>",
    "Process specific actor(s) by TMDB ID (comma-separated, e.g., '12345,67890')",
    parseCommaSeparatedIds
  )
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
  .option(
    "--disable-reliability-threshold",
    "Disable source reliability threshold (A/B control mode, uses content confidence only)"
  )
  .option(
    "--sort-by <field>",
    "Sort actors by: popularity (default) or interestingness",
    "popularity"
  )
  .action(async (options) => {
    // Validate that only one targeting mode is used at a time
    const targetingModes = [
      options.actorId ? "actor-id" : null,
      options.tmdbId ? "tmdb-id" : null,
      options.topBilledYear ? "top-billed-year" : null,
    ].filter(Boolean)

    if (targetingModes.length > 1) {
      console.error(
        `Error: Cannot use multiple targeting modes simultaneously: ${targetingModes.join(", ")}`
      )
      console.error("Please specify only one of: --actor-id, --tmdb-id, or --top-billed-year")
      process.exit(1)
    }

    await enrichMissingDetails({
      limit: options.limit,
      minPopularity: options.minPopularity,
      recentOnly: options.recentOnly || false,
      dryRun: options.dryRun || false,
      free: !options.disableFree,
      paid: !options.disablePaid,
      ai: options.ai || false,
      confidence: options.confidence,
      actorId: options.actorId,
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
      disableReliabilityThreshold: options.disableReliabilityThreshold || false,
      disableBooks: options.disableBooks || false,
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
