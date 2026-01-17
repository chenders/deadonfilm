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
 * Features ENABLED by default (use --disable-* to turn off):
 *   --disable-claude-cleanup         Disable Claude Opus 4.5 cleanup
 *   --disable-gather-all-sources     Stop on first good match instead of gathering all
 *   --disable-paid                   Exclude paid sources
 *   --disable-free                   Exclude free sources
 *   --disable-follow-links           Don't follow links from search results
 *   --disable-ai-link-selection      Use heuristics instead of AI for link ranking
 *   --disable-ai-content-extraction  Use regex instead of AI for content extraction
 *
 * Features DISABLED by default (use positive flag to enable):
 *   -r, --recent-only            Only deaths in last 2 years
 *   --ai                         Include AI model fallbacks (Perplexity, GPT-4o, etc.)
 *
 * Configuration:
 *   -l, --limit <n>              Limit number of actors to process (default: 100)
 *   -p, --min-popularity <n>     Only process actors above popularity threshold
 *   -n, --dry-run                Preview without writing to database
 *   -t, --tmdb-id <id>           Process a specific actor by TMDB ID
 *   -c, --confidence <n>         Minimum confidence threshold (0-1, default: 0.5)
 *   --ai-model <model>           AI model for link/content extraction (default: claude-sonnet-4-20250514)
 *   --max-links <n>              Max links to follow per actor (default: 3)
 *   --max-link-cost <n>          Max AI cost for links per actor (default: 0.01)
 *   --max-cost-per-actor <n>     Maximum cost allowed per actor (USD)
 *   --max-total-cost <n>         Maximum total cost for entire run (default: 10)
 *   --ignore-cache               Ignore cached responses, make fresh requests
 *   -y, --yes                    Skip confirmation prompt
 *
 * Top-Billed Selection (for popular US movies/shows):
 *   --top-billed-year <year>     Select from movies/shows released in specific year
 *   --top-billed-from-year <y>   Start of year range for selection
 *   --top-billed-to-year <year>  End of year range for selection
 *   --max-billing <n>            Max billing order to consider (default: 10)
 *   --min-movie-popularity <n>   Min movie/show popularity threshold (default: 20)
 *
 * US Content Filter:
 *   --us-actors-only             Only actors who appeared in US (English) content
 *
 * Keyboard Controls:
 *   q                            Quit after current actor completes (graceful shutdown)
 *
 * Examples:
 *   npm run enrich:death-details -- --limit 50 --dry-run
 *   npm run enrich:death-details -- --tmdb-id 12345 --dry-run
 *   npm run enrich:death-details -- --limit 100 --disable-paid --max-total-cost 5
 *   npm run enrich:death-details -- --limit 10 --yes
 *   npm run enrich:death-details -- --top-billed-year 2024 --limit 50 --dry-run
 *   npm run enrich:death-details -- --disable-follow-links --disable-claude-cleanup
 *
 * For API key configuration, see: server/.env.example
 */

import "dotenv/config"
import * as readline from "readline"
import { Command, InvalidArgumentError } from "commander"
import { getPool, resetPool } from "../src/lib/db.js"
import { initNewRelic, recordCustomEvent } from "../src/lib/newrelic.js"
import { rebuildDeathCaches, invalidateActorCache } from "../src/lib/cache.js"
import { createActorSlug } from "../src/lib/slug-utils.js"
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

/**
 * Set up keyboard listener for graceful shutdown.
 * Returns a cleanup function to restore terminal state.
 */
function setupKeyboardListener(onQuit: () => void): {
  cleanup: () => void
  rl: readline.Interface
} {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  // Enable raw mode if available (for single keypress detection)
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
    readline.emitKeypressEvents(process.stdin)

    process.stdin.on("keypress", (str, key) => {
      // Handle Ctrl+C for immediate exit
      if (key && key.ctrl && key.name === "c") {
        console.log("\n\nInterrupted by Ctrl+C")
        process.exit(130)
      }

      // Handle 'q' for graceful shutdown
      if (str === "q" || str === "Q") {
        onQuit()
      }
    })
  }

  const cleanup = () => {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false)
    }
    rl.close()
  }

  return { cleanup, rl }
}

/**
 * Generate the actor profile URL.
 */
function getActorProfileUrl(name: string, tmdbId: number | null): string | null {
  if (!tmdbId) return null
  const slug = createActorSlug(name, tmdbId)
  return `/person/${slug}`
}

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
  maxTotalCost: number
  claudeCleanup: boolean
  gatherAllSources: boolean
  ignoreCache: boolean
  // Link following options
  followLinks: boolean
  aiLinkSelection: boolean
  aiContentExtraction: boolean
  aiModel: string
  maxLinks: number
  maxLinkCost: number
  // Confirmation
  yes: boolean
  // Top-billed selection options
  topBilledYear?: number
  topBilledFromYear?: number
  topBilledToYear?: number
  maxBilling: number
  minMoviePopularity: number
  // US actors filter
  usActorsOnly: boolean
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
    followLinks,
    aiLinkSelection,
    aiContentExtraction,
    aiModel,
    maxLinks,
    maxLinkCost,
    yes: skipConfirmation,
    topBilledYear,
    topBilledFromYear,
    topBilledToYear,
    maxBilling,
    minMoviePopularity,
    usActorsOnly,
  } = options

  // Determine if we're using top-billed selection mode
  const useTopBilledMode = topBilledYear || topBilledFromYear || topBilledToYear

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
    } else if (useTopBilledMode) {
      // Query deceased actors who are top-billed in popular US movies or TV shows
      const yearFrom = topBilledYear || topBilledFromYear
      const yearTo = topBilledYear || topBilledToYear
      const yearDesc = topBilledYear
        ? `year ${topBilledYear}`
        : `years ${yearFrom || "any"}-${yearTo || "any"}`
      console.log(
        `\nQuerying top-billed deceased actors in popular US movies/shows (${yearDesc})...`
      )

      // Build parameterized query with billing and popularity filters
      params.push(maxBilling) // $1
      params.push(minMoviePopularity) // $2

      let yearFromParam = ""
      let yearToParam = ""
      if (yearFrom) {
        params.push(yearFrom)
        yearFromParam = `$${params.length}`
      }
      if (yearTo) {
        params.push(yearTo)
        yearToParam = `$${params.length}`
      }

      // Use a CTE to combine movie and show appearances
      query = `
        WITH top_billed_content AS (
          -- Movies
          SELECT
            a.id as actor_id,
            m.popularity as content_popularity,
            m.release_year as content_year
          FROM actors a
          INNER JOIN actor_movie_appearances ama ON ama.actor_id = a.id
          INNER JOIN movies m ON m.tmdb_id = ama.movie_tmdb_id
          WHERE a.deathday IS NOT NULL
            AND a.deathday < CURRENT_DATE - INTERVAL '30 days'
            AND m.original_language = 'en'
            AND ama.billing_order <= $1
            AND m.popularity >= $2
            ${yearFromParam ? `AND m.release_year >= ${yearFromParam}` : ""}
            ${yearToParam ? `AND m.release_year <= ${yearToParam}` : ""}

          UNION ALL

          -- TV Shows
          SELECT
            a.id as actor_id,
            s.popularity as content_popularity,
            EXTRACT(YEAR FROM s.first_air_date)::int as content_year
          FROM actors a
          INNER JOIN actor_show_appearances asa ON asa.actor_id = a.id
          INNER JOIN shows s ON s.tmdb_id = asa.show_tmdb_id
          WHERE a.deathday IS NOT NULL
            AND a.deathday < CURRENT_DATE - INTERVAL '30 days'
            AND s.original_language = 'en'
            AND asa.billing_order <= $1
            AND s.popularity >= $2
            ${yearFromParam ? `AND EXTRACT(YEAR FROM s.first_air_date) >= ${yearFromParam}` : ""}
            ${yearToParam ? `AND EXTRACT(YEAR FROM s.first_air_date) <= ${yearToParam}` : ""}
        ),
        actor_max_popularity AS (
          SELECT
            actor_id,
            MAX(content_popularity) as max_content_popularity
          FROM top_billed_content
          GROUP BY actor_id
        )
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
          amp.max_content_popularity
        FROM actors a
        LEFT JOIN actor_death_circumstances c ON c.actor_id = a.id
        INNER JOIN actor_max_popularity amp ON amp.actor_id = a.id
        WHERE (c.circumstances IS NULL OR c.notable_factors IS NULL OR array_length(c.notable_factors, 1) IS NULL)
        ORDER BY amp.max_content_popularity DESC NULLS LAST, a.popularity DESC NULLS LAST
      `

      if (limit) {
        params.push(limit)
        query += ` LIMIT $${params.length}`
      }
    } else if (usActorsOnly) {
      // Query deceased actors who primarily appear in US (English-language) content
      console.log(`\nQuerying deceased actors primarily in US movies/shows...`)
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
          AND EXISTS (
            SELECT 1 FROM actor_movie_appearances ama
            INNER JOIN movies m ON m.tmdb_id = ama.movie_tmdb_id
            WHERE ama.actor_id = a.id AND m.original_language = 'en'
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

      query += ` ORDER BY a.popularity DESC NULLS LAST, a.deathday DESC NULLS LAST`

      if (limit) {
        params.push(limit)
        query += ` LIMIT $${params.length}`
      }
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
      linkFollow: {
        enabled: followLinks,
        maxLinksPerActor: maxLinks,
        maxCostPerActor: maxLinkCost,
        aiLinkSelection: aiLinkSelection,
        aiContentExtraction: aiContentExtraction,
        aiModel: aiModel,
      },
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

    // Display configuration summary
    const displayConfigSummary = (): void => {
      console.log(`\n${"=".repeat(60)}`)
      console.log(`ENRICHMENT CONFIGURATION`)
      console.log(`${"=".repeat(60)}`)
      console.log(`\nTarget: ${actorsToEnrich.length} actors`)
      if (tmdbId) {
        console.log(`  Specific TMDB ID: ${tmdbId}`)
      }

      console.log(`\nData Sources:`)
      console.log(`  Free sources: ${free ? "ENABLED" : "disabled"}`)
      console.log(`  Paid sources: ${paid ? "ENABLED" : "disabled"}`)
      console.log(`  AI models: ${ai ? "ENABLED" : "disabled"}`)

      console.log(`\nLink Following:`)
      console.log(`  Follow links: ${followLinks ? "ENABLED" : "disabled"}`)
      if (followLinks) {
        console.log(`  AI link selection: ${aiLinkSelection ? "ENABLED" : "disabled"}`)
        console.log(`  AI content extraction: ${aiContentExtraction ? "ENABLED" : "disabled"}`)
        console.log(`  Max links per actor: ${maxLinks}`)
        console.log(`  Max link cost per actor: $${maxLinkCost}`)
        if (aiLinkSelection || aiContentExtraction) {
          console.log(`  AI model: ${aiModel}`)
        }
      }

      console.log(`\nClaude Cleanup:`)
      console.log(`  Claude cleanup: ${claudeCleanup ? "ENABLED (Opus 4.5)" : "disabled"}`)
      if (claudeCleanup) {
        console.log(`  Gather all sources: ${gatherAllSources ? "yes" : "no"}`)
        console.log(`  Estimated cost per actor: ~$0.07`)
      }

      console.log(`\nCost Limits:`)
      console.log(`  Max total cost: $${maxTotalCost}`)
      if (maxCostPerActor !== undefined) {
        console.log(`  Max cost per actor: $${maxCostPerActor}`)
      }

      console.log(`\nBehavior:`)
      console.log(
        `  Stop on match: ${claudeCleanup && gatherAllSources ? "no (gathering all)" : stopOnMatch ? "yes" : "no"}`
      )
      console.log(`  Confidence threshold: ${confidenceThreshold}`)
      console.log(`${"=".repeat(60)}`)
    }

    if (dryRun) {
      console.log(`\n--- Dry Run Mode ---`)
      displayConfigSummary()
      console.log(`\nSample actors (first 5):`)
      for (const actor of actorsToEnrich.slice(0, 5)) {
        console.log(`  - ${actor.name} (ID: ${actor.id}, TMDB: ${actor.tmdbId || "N/A"})`)
        console.log(`    Death: ${actor.deathday}, Cause: ${actor.causeOfDeath || "(none)"}`)
      }
      await resetPool()
      return
    }

    // Display config and prompt for confirmation (unless --yes flag)
    displayConfigSummary()
    if (!skipConfirmation && process.stdin.isTTY) {
      console.log(`\nPress Enter to continue, or Ctrl+C to cancel...`)
      await new Promise<void>((resolve) => {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        })
        rl.question("", () => {
          rl.close()
          resolve()
        })
      })
    }

    // Set up keyboard listener for graceful shutdown (press 'q' to quit after current actor)
    let keyboardCleanup: (() => void) | null = null
    if (process.stdin.isTTY) {
      const { cleanup } = setupKeyboardListener(() => {
        orchestrator.requestGracefulShutdown()
      })
      keyboardCleanup = cleanup
      console.log(`\nPress 'q' at any time to quit after the current actor completes.\n`)
    }

    // Run enrichment one actor at a time with immediate DB write and cache invalidation
    let updated = 0
    let costLimitReached = false
    let gracefullyShutdown = false

    try {
      for (let i = 0; i < actorsToEnrich.length; i++) {
        const actor = actorsToEnrich[i]

        // Check if shutdown was requested before starting this actor
        if (orchestrator.isShutdownRequested()) {
          console.log(
            `\nGraceful shutdown: Stopping before actor ${i + 1}/${actorsToEnrich.length}`
          )
          gracefullyShutdown = true
          break
        }

        console.log(`\n[${i + 1}/${actorsToEnrich.length}] Processing ${actor.name}...`)

        let enrichment
        try {
          enrichment = await orchestrator.enrichActor(actor)
        } catch (error) {
          if (error instanceof CostLimitExceededError) {
            console.log(`\n${"!".repeat(60)}`)
            console.log(`Cost limit reached - exiting gracefully`)
            console.log(`Limit: $${error.limit}, Current: $${error.currentCost.toFixed(4)}`)
            console.log(`${"!".repeat(60)}`)
            costLimitReached = true
            recordCustomEvent("DeathEnrichmentCostLimitReached", {
              limitType: error.limitType,
              limit: error.limit,
              currentCost: error.currentCost,
            })
            break
          }
          throw error
        }

        // Skip if no enrichment data found
        if (
          !enrichment.circumstances &&
          !enrichment.notableFactors?.length &&
          !enrichment.cleanedDeathInfo
        ) {
          console.log(`  No enrichment data found for ${actor.name}`)
          continue
        }

        // Use cleaned death info if available (from Claude cleanup), otherwise use raw enrichment
        const cleaned = enrichment.cleanedDeathInfo
        const circumstances = cleaned?.circumstances || enrichment.circumstances
        const rumoredCircumstances =
          cleaned?.rumoredCircumstances || enrichment.rumoredCircumstances
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
            actor.id,
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

        // Determine if actor qualifies for death page
        const hasSubstantiveCircumstances =
          circumstances && circumstances.length > MIN_CIRCUMSTANCES_LENGTH
        const hasSubstantiveRumors =
          rumoredCircumstances && rumoredCircumstances.length > MIN_RUMORED_CIRCUMSTANCES_LENGTH
        const hasRelatedDeaths = relatedDeaths && relatedDeaths.length > 50
        const qualifiesForDeathPage =
          hasSubstantiveCircumstances || hasSubstantiveRumors || hasRelatedDeaths

        // Set has_detailed_death_info flag if qualified
        if (qualifiesForDeathPage) {
          await db.query(`UPDATE actors SET has_detailed_death_info = true WHERE id = $1`, [
            actor.id,
          ])
        }

        // Invalidate the actor's cache immediately so updated death info is reflected on the website
        if (actor.tmdbId) {
          await invalidateActorCache(actor.tmdbId)
        }

        updated++

        // Output actor status with URL and qualification
        const profileUrl = getActorProfileUrl(actor.name, actor.tmdbId)
        console.log(`  Database updated for ${actor.name}`)

        if (qualifiesForDeathPage) {
          console.log(`  \x1b[32m✓ Qualifies for death page\x1b[0m`)
          if (profileUrl) {
            console.log(`  URL: ${profileUrl}`)
          }
        } else {
          // Explain why they don't qualify
          const reasons: string[] = []
          if (!circumstances) {
            reasons.push("no circumstances found")
          } else if (circumstances.length <= MIN_CIRCUMSTANCES_LENGTH) {
            reasons.push(
              `circumstances too short (${circumstances.length}/${MIN_CIRCUMSTANCES_LENGTH} chars)`
            )
          }
          if (!rumoredCircumstances) {
            reasons.push("no rumored circumstances")
          } else if (rumoredCircumstances.length <= MIN_RUMORED_CIRCUMSTANCES_LENGTH) {
            reasons.push(
              `rumors too short (${rumoredCircumstances.length}/${MIN_RUMORED_CIRCUMSTANCES_LENGTH} chars)`
            )
          }
          if (!relatedDeaths || relatedDeaths.length <= 50) {
            reasons.push("no related deaths")
          }
          console.log(`  \x1b[33m✗ Does not qualify for death page:\x1b[0m ${reasons.join(", ")}`)
          if (profileUrl) {
            console.log(`  URL: ${profileUrl}`)
          }
        }

        // Add delay between actors to be respectful to APIs
        if (i < actorsToEnrich.length - 1 && !orchestrator.isShutdownRequested()) {
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
      }
    } finally {
      // Clean up keyboard listener
      if (keyboardCleanup) {
        keyboardCleanup()
      }
    }

    // Print final stats
    const stats = orchestrator.getStats()
    console.log(`\n${"=".repeat(60)}`)
    const completionMessage = costLimitReached
      ? `Enrichment Stopped (Cost Limit Reached)`
      : gracefullyShutdown
        ? `Enrichment Stopped (User Requested Quit)`
        : `Enrichment Complete!`
    console.log(completionMessage)
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
  .addHelpText(
    "after",
    `
For services requiring API keys (paid sources, AI providers), see:
  server/.env.example

This file contains instructions for obtaining API keys and configuring
each data source.
`
  )
  // Basic options
  .option("-l, --limit <number>", "Limit number of actors to process", parsePositiveInt, 100)
  .option(
    "-p, --min-popularity <number>",
    "Only process actors above popularity threshold",
    parsePositiveInt,
    0
  )
  .option("-n, --dry-run", "Preview without writing to database")
  .option("-t, --tmdb-id <number>", "Process a specific actor by TMDB ID", parsePositiveInt)
  .option(
    "-c, --confidence <number>",
    "Minimum confidence threshold to accept results (0-1)",
    parseFloat,
    0.5
  )
  .option("-y, --yes", "Skip confirmation prompt")

  // Features ENABLED by default (use --disable-* to turn off)
  .option("--disable-claude-cleanup", "Disable Claude Opus 4.5 cleanup")
  .option("--disable-gather-all-sources", "Stop on first good match instead of gathering all")
  .option("--disable-paid", "Exclude paid sources")
  .option("--disable-free", "Exclude free sources")
  .option("--disable-follow-links", "Don't follow links from search results")
  .option("--disable-ai-link-selection", "Use heuristics instead of AI for link ranking")
  .option("--disable-ai-content-extraction", "Use regex instead of AI for content extraction")

  // Features DISABLED by default (use positive flag to enable)
  .option("-r, --recent-only", "Only deaths in last 2 years")
  .option("--ai", "Include AI model fallbacks (Perplexity, GPT-4o, etc.)")

  // AI model configuration
  .option(
    "--ai-model <model>",
    "AI model for link selection/content extraction",
    "claude-sonnet-4-20250514"
  )

  // Link following configuration
  .option("--max-links <number>", "Max links to follow per actor", parsePositiveInt, 3)
  .option("--max-link-cost <number>", "Max AI cost for links per actor (USD)", parseFloat, 0.01)

  // Cost limits with new defaults
  .option("--max-cost-per-actor <number>", "Maximum cost allowed per actor (USD)", parseFloat)
  .option(
    "--max-total-cost <number>",
    "Maximum total cost for the entire run (USD)",
    parseFloat,
    10
  )

  // Cache control
  .option("--ignore-cache", "Ignore cached responses and make fresh requests to all sources")

  // Top-billed selection options
  .option(
    "--top-billed-year <year>",
    "Select actors from movies/shows released in a specific year",
    parsePositiveInt
  )
  .option(
    "--top-billed-from-year <year>",
    "Start of year range for top-billed movie/show selection",
    parsePositiveInt
  )
  .option(
    "--top-billed-to-year <year>",
    "End of year range for top-billed movie/show selection",
    parsePositiveInt
  )
  .option(
    "--max-billing <order>",
    "Maximum billing order to consider as 'top-billed' (default: 10)",
    parsePositiveInt,
    10
  )
  .option(
    "--min-movie-popularity <popularity>",
    "Minimum movie/show popularity to include (default: 20)",
    parsePositiveInt,
    20
  )
  .option(
    "--us-actors-only",
    "Only include actors who have appeared in US (English-language) content"
  )
  .action(async (options) => {
    await enrichMissingDetails({
      limit: options.limit,
      minPopularity: options.minPopularity,
      // Features DISABLED by default - enable with positive flag
      recentOnly: options.recentOnly || false,
      ai: options.ai || false,
      // Features ENABLED by default - disable with --disable-* flags
      claudeCleanup: !options.disableClaudeCleanup,
      gatherAllSources: !options.disableGatherAllSources,
      paid: !options.disablePaid,
      free: !options.disableFree,
      followLinks: !options.disableFollowLinks,
      aiLinkSelection: !options.disableAiLinkSelection,
      aiContentExtraction: !options.disableAiContentExtraction,
      // AI model configuration
      aiModel: options.aiModel,
      // Value-based options
      maxLinks: options.maxLinks,
      maxLinkCost: options.maxLinkCost,
      maxTotalCost: options.maxTotalCost,
      maxCostPerActor: options.maxCostPerActor,
      confidence: options.confidence,
      // Other options
      dryRun: options.dryRun || false,
      tmdbId: options.tmdbId,
      ignoreCache: options.ignoreCache || false,
      yes: options.yes || false,
      stopOnMatch: true, // Always true unless gathering all sources
      topBilledYear: options.topBilledYear,
      topBilledFromYear: options.topBilledFromYear,
      topBilledToYear: options.topBilledToYear,
      maxBilling: options.maxBilling,
      minMoviePopularity: options.minMoviePopularity,
      usActorsOnly: options.usActorsOnly || false,
    })
  })

// Only run when executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  program.parse()
}
