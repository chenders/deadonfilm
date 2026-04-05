/**
 * Surprise discovery orchestrator.
 *
 * Top-level pipeline that wires together all discovery phases with logging
 * and cost tracking. Runs three phases:
 *
 * Phase 1: Autocomplete → boring filter → incongruity scoring
 * Phase 2: Reddit research + claim verification (per high-scoring candidate)
 * Phase 3: Integration of verified findings into the biography
 *
 * Returns early if disabled, if no incongruous candidates are found, or
 * if no findings are verified.
 */

import { logger } from "../../logger.js"
import { getPool } from "../../db/pool.js"
import { fetchAutocompleteSuggestions } from "./autocomplete.js"
import { filterBoringSuggestions } from "./boring-filter.js"
import type { BoringFilterContext } from "./boring-filter.js"
import { scoreIncongruity } from "./incongruity-scorer.js"
import { researchOnReddit } from "./reddit-researcher.js"
import { verifyClaim } from "./verifier.js"
import { integrateFindings } from "./integrator.js"
import type {
  DiscoveryConfig,
  DiscoveryResult,
  DiscoveryResults,
  ResearchedAssociation,
} from "./types.js"

export interface DiscoveryActor {
  id: number
  name: string
  tmdb_id: number | null
}

/**
 * Builds the boring filter context by querying the actor's filmography and
 * co-stars from the database.
 *
 * @param actor - Actor record with id
 * @param bioText - Existing biography text to check for already-covered terms
 * @returns Context object for the boring filter
 */
async function buildFilterContext(
  actor: DiscoveryActor,
  bioText: string
): Promise<BoringFilterContext> {
  const pool = getPool()

  const movieResult = await pool.query<{ title: string; character_name: string | null }>(
    `SELECT m.title, ama.character_name
     FROM actor_movie_appearances ama
     JOIN movies m ON m.tmdb_id = ama.movie_tmdb_id
     WHERE ama.actor_id = $1
     LIMIT 200`,
    [actor.id]
  )

  const showResult = await pool.query<{ name: string }>(
    `SELECT s.name
     FROM actor_show_appearances asa
     JOIN shows s ON s.tmdb_id = asa.show_tmdb_id
     WHERE asa.actor_id = $1
     LIMIT 100`,
    [actor.id]
  )

  const costarResult = await pool.query<{ name: string }>(
    `SELECT DISTINCT a.name
     FROM actor_movie_appearances ama1
     JOIN actor_movie_appearances ama2 ON ama1.movie_tmdb_id = ama2.movie_tmdb_id
     JOIN actors a ON a.id = ama2.actor_id
     WHERE ama1.actor_id = $1 AND ama2.actor_id != $1
     LIMIT 200`,
    [actor.id]
  )

  return {
    movieTitles: movieResult.rows.map((r) => r.title),
    showTitles: showResult.rows.map((r) => r.name),
    characterNames: movieResult.rows
      .map((r) => r.character_name)
      .filter((c): c is string => c !== null),
    costarNames: costarResult.rows.map((r) => r.name),
    bioText,
  }
}

/**
 * Builds an empty DiscoveryResults record with the current timestamp and config.
 *
 * @param config - Discovery configuration
 * @returns Empty DiscoveryResults with discoveredAt timestamp
 */
function buildEmptyResults(config: DiscoveryConfig): DiscoveryResults {
  return {
    discoveredAt: new Date().toISOString(),
    config: {
      integrationStrategy: config.integrationStrategy,
      incongruityThreshold: config.incongruityThreshold,
    },
    autocomplete: {
      queriesRun: 0,
      totalSuggestions: 0,
      uniqueSuggestions: 0,
      byPattern: {},
    },
    boringFilter: {
      dropped: 0,
      droppedByReason: {},
      remaining: 0,
    },
    incongruityCandidates: [],
    researched: [],
    integrated: [],
    costUsd: 0,
  }
}

/**
 * Runs the surprise discovery pipeline for a single actor.
 *
 * Phase 1 always runs (unless disabled). Phases 2 and 3 are gated on the
 * results of prior phases. Returns early if no incongruous candidates are
 * found or no findings are verified.
 *
 * @param actor - Actor to run discovery for
 * @param existingNarrative - Actor's current biography narrative text
 * @param existingFacts - Actor's current lesser-known facts array
 * @param config - Discovery pipeline configuration
 * @returns Discovery result with optional biography updates and full record
 */
export async function runSurpriseDiscovery(
  actor: DiscoveryActor,
  existingNarrative: string,
  existingFacts: Array<{ text: string; sourceUrl: string | null; sourceName: string | null }>,
  config: DiscoveryConfig
): Promise<DiscoveryResult> {
  const emptyResult: DiscoveryResult = {
    hasFindings: false,
    updatedNarrative: null,
    newLesserKnownFacts: [],
    discoveryResults: buildEmptyResults(config),
  }

  if (!config.enabled) {
    return emptyResult
  }

  let totalCost = 0

  // ── Phase 1: Autocomplete → boring filter → incongruity scoring ──────────

  logger.info({ actorName: actor.name }, "discovery:autocomplete starting")

  const suggestions = await fetchAutocompleteSuggestions(actor.name)

  const byPattern: Record<string, number> = {}
  for (const s of suggestions) {
    byPattern[s.queryPattern] = (byPattern[s.queryPattern] ?? 0) + 1
  }

  logger.info(
    {
      actorName: actor.name,
      total: suggestions.length,
      byPattern,
    },
    "discovery:autocomplete complete"
  )

  const filterContext = await buildFilterContext(actor, existingNarrative)
  const filterResult = filterBoringSuggestions(suggestions, filterContext)

  logger.info(
    {
      actorName: actor.name,
      dropped: filterResult.dropped,
      remaining: filterResult.kept.length,
      droppedByReason: filterResult.droppedByReason,
    },
    "discovery:boring-filter complete"
  )

  const scoringResult = await scoreIncongruity(actor.name, filterResult.kept)
  totalCost += scoringResult.costUsd

  const highScoring = scoringResult.candidates.filter((c) => c.score >= config.incongruityThreshold)

  logger.info(
    {
      actorName: actor.name,
      scored: scoringResult.candidates.length,
      aboveThreshold: highScoring.length,
      threshold: config.incongruityThreshold,
    },
    "discovery:incongruity complete"
  )

  const phase1Results: DiscoveryResults = {
    ...buildEmptyResults(config),
    autocomplete: {
      queriesRun: 57, // 26 quoted-letter + 26 quoted-space-letter + 5 keyword
      totalSuggestions: suggestions.length,
      uniqueSuggestions: suggestions.length,
      byPattern,
    },
    boringFilter: {
      dropped: filterResult.dropped,
      droppedByReason: filterResult.droppedByReason,
      remaining: filterResult.kept.length,
    },
    incongruityCandidates: scoringResult.candidates,
    costUsd: totalCost,
  }

  if (highScoring.length === 0) {
    return { ...emptyResult, discoveryResults: phase1Results }
  }

  // ── Phase 2: Reddit research + claim verification ────────────────────────

  const researched: ResearchedAssociation[] = []

  for (const candidate of highScoring) {
    if (totalCost >= config.maxCostPerActorUsd) {
      logger.warn(
        {
          actorName: actor.name,
          totalCost,
          limit: config.maxCostPerActorUsd,
        },
        "discovery: cost limit reached, stopping research"
      )
      break
    }

    logger.info({ actorName: actor.name, term: candidate.term }, "discovery:reddit searching")

    const redditResult = await researchOnReddit(actor.name, candidate.term)
    totalCost += redditResult.costUsd

    logger.info(
      {
        actorName: actor.name,
        term: candidate.term,
        threadCount: redditResult.threads.length,
        hasClaim: !!redditResult.claimExtracted,
      },
      "discovery:reddit complete"
    )

    if (!redditResult.claimExtracted) {
      continue
    }

    const verifyResult = await verifyClaim(actor.name, candidate.term, redditResult.claimExtracted)

    const association: ResearchedAssociation = {
      term: candidate.term,
      incongruityScore: candidate.score,
      redditThreads: redditResult.threads,
      claimExtracted: redditResult.claimExtracted,
      verificationAttempts: verifyResult.attempts,
      verified: verifyResult.verified,
      verificationSource: verifyResult.verificationSource,
      verificationUrl: verifyResult.verificationUrl,
      verificationExcerpt: verifyResult.verificationExcerpt,
    }

    researched.push(association)

    if (verifyResult.verified) {
      logger.info(
        {
          actorName: actor.name,
          term: candidate.term,
          source: verifyResult.verificationSource,
        },
        "discovery:verify VERIFIED"
      )
    } else {
      logger.warn(
        {
          actorName: actor.name,
          term: candidate.term,
          attemptCount: verifyResult.attempts.length,
        },
        "discovery:verify not verified"
      )
    }
  }

  const verifiedFindings = researched.filter((r) => r.verified)

  const phase2Results: DiscoveryResults = {
    ...phase1Results,
    researched,
    costUsd: totalCost,
  }

  if (verifiedFindings.length === 0) {
    return { ...emptyResult, discoveryResults: phase2Results }
  }

  // ── Phase 3: Integration ─────────────────────────────────────────────────

  logger.info(
    { actorName: actor.name, findingsCount: verifiedFindings.length },
    "discovery:integrate starting"
  )

  const integrationResult = await integrateFindings(
    actor.name,
    existingNarrative,
    existingFacts,
    verifiedFindings,
    config.integrationStrategy
  )
  totalCost += integrationResult.costUsd

  logger.info(
    {
      actorName: actor.name,
      integratedCount: integrationResult.integrated.length,
      newFacts: integrationResult.newLesserKnownFacts.length,
      hasNarrativeUpdate: integrationResult.updatedNarrative !== null,
    },
    "discovery:integrate complete"
  )

  const finalResults: DiscoveryResults = {
    ...phase2Results,
    integrated: integrationResult.integrated,
    costUsd: totalCost,
  }

  const hasFindings =
    integrationResult.newLesserKnownFacts.length > 0 || integrationResult.updatedNarrative !== null

  return {
    hasFindings,
    updatedNarrative: integrationResult.updatedNarrative,
    newLesserKnownFacts: integrationResult.newLesserKnownFacts,
    discoveryResults: finalResults,
  }
}
