/**
 * Wikidata Awards Fetcher
 *
 * Fetches actor-level awards (wins and nominations) from Wikidata via SPARQL.
 * Awards are classified into tiers and scored using a diminishing-returns curve.
 *
 * SPARQL properties:
 * - P166 (award received) for wins
 * - P1411 (nominated for) for nominations
 * - Lookup via P4985 (TMDB person ID)
 *
 * Follows the same patterns as wikidata-sitelinks.ts (rate limiter, retry, batch).
 */

const WIKIDATA_SPARQL_ENDPOINT = "https://query.wikidata.org/sparql"

const USER_AGENT = "DeadOnFilm/1.0 (https://deadonfilm.com; contact@deadonfilm.com)"

const REQUEST_DELAY_MS = 100

/** Max retries on 429/500 responses */
const MAX_RETRIES = 3

/** Base delay for retry backoff (ms) */
const RETRY_BASE_DELAY_MS = 2000

/** Max TMDB IDs per batch SPARQL query */
const MAX_BATCH_SIZE = 50

// ============================================================================
// Award Tier Classification
// ============================================================================

/** Award tier determines point values */
export type AwardTier = "oscar" | "emmy_globe" | "bafta_sag"

/**
 * Point values per tier for wins and nominations.
 * These feed into the diminishing-returns scoring curve.
 */
const TIER_POINTS: Record<AwardTier, { win: number; nomination: number }> = {
  oscar: { win: 15, nomination: 5 },
  emmy_globe: { win: 10, nomination: 3 },
  bafta_sag: { win: 7, nomination: 2 },
}

/**
 * Wikidata QIDs for recognized awards, grouped by tier.
 *
 * Oscar tier (15 win / 5 nom):
 *   Best Actor, Best Actress, Best Supporting Actor, Best Supporting Actress
 *
 * Emmy/Globe tier (10 win / 3 nom):
 *   Emmy lead drama/comedy, Golden Globe drama lead categories
 *
 * BAFTA/SAG tier (7 win / 2 nom):
 *   BAFTA and SAG lead/supporting categories
 */
const AWARD_TIER_MAP: Record<string, AwardTier> = {
  // Oscar tier
  Q103916: "oscar", // Academy Award for Best Actor
  Q103618: "oscar", // Academy Award for Best Actress
  Q106301: "oscar", // Academy Award for Best Supporting Actor
  Q106291: "oscar", // Academy Award for Best Supporting Actress

  // Emmy/Globe tier
  Q258672: "emmy_globe", // Primetime Emmy for Outstanding Lead Actor in a Drama Series
  Q258695: "emmy_globe", // Primetime Emmy for Outstanding Lead Actress in a Drama Series
  Q258732: "emmy_globe", // Primetime Emmy for Outstanding Lead Actor in a Comedy Series
  Q258756: "emmy_globe", // Primetime Emmy for Outstanding Lead Actress in a Comedy Series
  Q191417: "emmy_globe", // Golden Globe Award for Best Actor – Motion Picture Drama
  Q190935: "emmy_globe", // Golden Globe Award for Best Actress – Motion Picture Drama

  // BAFTA/SAG tier
  Q595718: "bafta_sag", // BAFTA Award for Best Actor in a Leading Role
  Q595720: "bafta_sag", // BAFTA Award for Best Actress in a Leading Role
  Q592975: "bafta_sag", // BAFTA Award for Best Actor in a Supporting Role
  Q592993: "bafta_sag", // BAFTA Award for Best Actress in a Supporting Role
  Q652238: "bafta_sag", // Screen Actors Guild Award for Outstanding Performance by a Male Actor in a Leading Role
  Q652245: "bafta_sag", // Screen Actors Guild Award for Outstanding Performance by a Female Actor in a Leading Role
  Q652271: "bafta_sag", // Screen Actors Guild Award for Outstanding Performance by a Male Actor in a Supporting Role
  Q652280: "bafta_sag", // Screen Actors Guild Award for Outstanding Performance by a Female Actor in a Supporting Role
}

/** Set of all recognized award QIDs for SPARQL filtering */
const ALL_AWARD_QIDS = Object.keys(AWARD_TIER_MAP)

// ============================================================================
// Types
// ============================================================================

export interface AwardEntry {
  wikidataId: string // e.g., "Q103916"
  label: string // e.g., "Academy Award for Best Actor"
  tier: AwardTier
}

export interface ActorAwardsData {
  totalScore: number // Pre-computed 0-100 score
  wins: AwardEntry[]
  nominations: AwardEntry[]
  fetchedAt: string // ISO date
}

interface SparqlResult {
  results: {
    bindings: Array<{
      tmdbId?: { value: string }
      award?: { value: string }
      awardLabel?: { value: string }
      type?: { value: string } // "win" or "nomination"
    }>
  }
}

// ============================================================================
// Rate Limiter
// ============================================================================

class WikidataRateLimiter {
  private lastRequestTime = 0

  async waitForRateLimit(): Promise<void> {
    const now = Date.now()
    const timeSinceLastRequest = now - this.lastRequestTime
    if (timeSinceLastRequest < REQUEST_DELAY_MS) {
      await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS - timeSinceLastRequest))
    }
    this.lastRequestTime = Date.now()
  }
}

const rateLimiter = new WikidataRateLimiter()

// ============================================================================
// SPARQL Execution
// ============================================================================

async function executeSparqlQuery(query: string): Promise<SparqlResult> {
  await rateLimiter.waitForRateLimit()

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        await rateLimiter.waitForRateLimit()
      }

      const response = await fetch(WIKIDATA_SPARQL_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/sparql-results+json",
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
        },
        body: `query=${encodeURIComponent(query)}`,
      })

      if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
        lastError = new Error(`Wikidata SPARQL error: ${response.status}`)
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt)
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }

      if (!response.ok) {
        throw new Error(`Wikidata SPARQL error: ${response.status}`)
      }

      return (await response.json()) as SparqlResult
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt)
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }
    }
  }

  throw lastError ?? new Error("Wikidata SPARQL: max retries exhausted")
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Classify a Wikidata award QID into a tier.
 * Returns null for unrecognized awards.
 */
export function classifyAwardTier(wikidataId: string): AwardTier | null {
  return AWARD_TIER_MAP[wikidataId] ?? null
}

/**
 * Calculate awards score from structured awards data.
 *
 * Uses a diminishing-returns exponential curve:
 *   score = 100 * (1 - exp(-points / 30))
 *
 * Where points come from tiered win/nomination values.
 * This produces: 1 Oscar win (~15 pts) ≈ 40, 2 wins (~30 pts) ≈ 63,
 * heavy award history ≈ 85+.
 */
export function calculateActorAwardsScore(data: ActorAwardsData | null): number {
  if (!data) return 0

  let points = 0

  for (const win of data.wins) {
    const tierPoints = TIER_POINTS[win.tier]
    if (tierPoints) {
      points += tierPoints.win
    }
  }

  for (const nom of data.nominations) {
    const tierPoints = TIER_POINTS[nom.tier]
    if (tierPoints) {
      points += tierPoints.nomination
    }
  }

  if (points === 0) return 0

  return Math.min(100, 100 * (1 - Math.exp(-points / 30)))
}

/**
 * Extract the QID from a Wikidata entity URI.
 * e.g., "http://www.wikidata.org/entity/Q103916" → "Q103916"
 */
function extractQid(uri: string): string | null {
  const match = uri.match(/Q\d+$/)
  return match ? match[0] : null
}

/**
 * Fetch awards for a single actor by TMDB person ID.
 *
 * @returns ActorAwardsData with pre-computed score, or null if not found.
 * @throws On network/HTTP errors after retries exhausted.
 */
export async function fetchActorAwardsByTmdbId(tmdbId: number): Promise<ActorAwardsData | null> {
  const awardValues = ALL_AWARD_QIDS.map((qid) => `wd:${qid}`).join(" ")

  const query = `
    SELECT DISTINCT ?award ?awardLabel ?type WHERE {
      ?person wdt:P4985 "${tmdbId}" .
      {
        ?person wdt:P166 ?award .
        BIND("win" AS ?type)
      } UNION {
        ?person wdt:P1411 ?award .
        BIND("nomination" AS ?type)
      }
      VALUES ?award { ${awardValues} }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
    }
  `

  const result = await executeSparqlQuery(query)
  const bindings = result.results.bindings

  if (bindings.length === 0) return null

  return parseAwardsBindings(bindings)
}

/**
 * Batch fetch awards for multiple actors by TMDB person IDs.
 *
 * Returns a map of tmdbId → ActorAwardsData. Actors not found in Wikidata
 * are omitted from the results.
 */
export async function fetchActorAwardsBatch(
  tmdbIds: number[]
): Promise<{ results: Map<number, ActorAwardsData>; queriedIds: Set<number> }> {
  const results = new Map<number, ActorAwardsData>()
  const queriedIds = new Set<number>()

  const awardValues = ALL_AWARD_QIDS.map((qid) => `wd:${qid}`).join(" ")

  for (let i = 0; i < tmdbIds.length; i += MAX_BATCH_SIZE) {
    const chunk = tmdbIds.slice(i, i + MAX_BATCH_SIZE)
    const tmdbValues = chunk.map((id) => `"${id}"`).join(" ")

    const query = `
      SELECT DISTINCT ?tmdbId ?award ?awardLabel ?type WHERE {
        VALUES ?tmdbId { ${tmdbValues} }
        ?person wdt:P4985 ?tmdbId .
        {
          ?person wdt:P166 ?award .
          BIND("win" AS ?type)
        } UNION {
          ?person wdt:P1411 ?award .
          BIND("nomination" AS ?type)
        }
        VALUES ?award { ${awardValues} }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
      }
    `

    let sparqlResult: SparqlResult
    try {
      sparqlResult = await executeSparqlQuery(query)
    } catch (error) {
      console.error(
        `Wikidata awards batch query failed for ${chunk.length} TMDB IDs (skipping chunk):`,
        error
      )
      continue
    }

    // Mark all IDs in this chunk as successfully queried
    for (const id of chunk) {
      queriedIds.add(id)
    }

    // Group bindings by tmdbId
    const bindingsByTmdb = new Map<
      number,
      Array<{
        award?: { value: string }
        awardLabel?: { value: string }
        type?: { value: string }
      }>
    >()

    for (const binding of sparqlResult.results.bindings) {
      const tmdbId = parseInt(binding.tmdbId?.value ?? "", 10)
      if (isNaN(tmdbId)) continue

      if (!bindingsByTmdb.has(tmdbId)) {
        bindingsByTmdb.set(tmdbId, [])
      }
      bindingsByTmdb.get(tmdbId)!.push(binding)
    }

    // Parse each actor's awards
    for (const [tmdbId, bindings] of bindingsByTmdb) {
      const awardsData = parseAwardsBindings(bindings)
      if (awardsData) {
        results.set(tmdbId, awardsData)
      }
    }
  }

  return { results, queriedIds }
}

/**
 * Parse SPARQL bindings into ActorAwardsData.
 */
function parseAwardsBindings(
  bindings: Array<{
    award?: { value: string }
    awardLabel?: { value: string }
    type?: { value: string }
  }>
): ActorAwardsData | null {
  const wins: AwardEntry[] = []
  const nominations: AwardEntry[] = []
  const seen = new Set<string>()

  for (const binding of bindings) {
    const awardUri = binding.award?.value
    if (!awardUri) continue

    const qid = extractQid(awardUri)
    if (!qid) continue

    const tier = classifyAwardTier(qid)
    if (!tier) continue

    const type = binding.type?.value ?? "unknown"
    const dedupeKey = `${type}:${qid}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    const entry: AwardEntry = {
      wikidataId: qid,
      label: binding.awardLabel?.value ?? qid,
      tier,
    }

    if (binding.type?.value === "win") {
      wins.push(entry)
    } else if (binding.type?.value === "nomination") {
      nominations.push(entry)
    }
  }

  if (wins.length === 0 && nominations.length === 0) return null

  const data: ActorAwardsData = {
    totalScore: 0,
    wins,
    nominations,
    fetchedAt: new Date().toISOString(),
  }

  data.totalScore = calculateActorAwardsScore(data)

  return data
}
