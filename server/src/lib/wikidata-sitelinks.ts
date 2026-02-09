/**
 * Wikidata Sitelinks API Client
 *
 * Fetches the number of Wikipedia language editions (sitelinks) for actors
 * via Wikidata SPARQL. Sitelinks count is a proxy for international fame —
 * actors with articles in many languages are more globally recognized.
 *
 * SPARQL endpoint: https://query.wikidata.org/sparql
 * Rate limit: No formal limit; we use 100ms minimum delay between requests
 *   since our queries are lightweight (single ID lookups or small batches).
 *   Wikidata's ~1 req/s guidance is for heavy/complex queries.
 * Auth: None required, but User-Agent header is mandatory per Wikidata policy
 */

const WIKIDATA_SPARQL_ENDPOINT = "https://query.wikidata.org/sparql"

const USER_AGENT = "DeadOnFilm/1.0 (https://deadonfilm.com; contact@deadonfilm.com)"

const REQUEST_DELAY_MS = 100

/** Max retries on 429/500 responses */
const MAX_RETRIES = 3

/** Base delay for retry backoff (ms) */
const RETRY_BASE_DELAY_MS = 2000

/** Max TMDB IDs per batch SPARQL query */
const MAX_BATCH_SIZE = 100

/**
 * Rate limiter to enforce minimum delay between requests
 */
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

interface SparqlResult {
  results: {
    bindings: Array<{
      item?: { value: string }
      tmdbId?: { value: string }
      sitelinks?: { value: string }
    }>
  }
}

/**
 * Execute a SPARQL query against Wikidata with retry logic.
 *
 * Throws on persistent errors (after retries exhausted) so callers can
 * distinguish "query failed" from "entity not found on Wikidata".
 */
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

/**
 * Fetch sitelinks count for a single actor by TMDB person ID.
 *
 * Uses Wikidata property P4985 (TMDB person ID) to find the entity,
 * then counts the number of sitelinks (Wikipedia language editions).
 *
 * @returns Number of sitelinks, or null if not found on Wikidata.
 * @throws On network/HTTP errors after retries exhausted.
 */
export async function fetchSitelinksByTmdbId(tmdbId: number): Promise<number | null> {
  const query = `
    SELECT ?item (COUNT(DISTINCT ?sitelink) AS ?sitelinks) WHERE {
      ?item wdt:P4985 "${tmdbId}" .
      ?sitelink schema:about ?item .
      ?sitelink schema:isPartOf/wikibase:wikiGroup "wikipedia" .
    }
    GROUP BY ?item
  `

  const result = await executeSparqlQuery(query)
  const bindings = result.results.bindings
  if (bindings.length === 0) return null

  const sitelinksValue = bindings[0].sitelinks?.value
  if (sitelinksValue == null) return null
  const sitelinks = parseInt(sitelinksValue, 10)
  return isNaN(sitelinks) ? null : sitelinks
}

/**
 * Fetch sitelinks count for a single actor by Wikipedia URL.
 *
 * Resolves the Wikipedia article to a Wikidata entity via the enwiki sitelink,
 * then counts total sitelinks.
 *
 * @returns Number of sitelinks, or null if not found on Wikidata.
 * @throws On network/HTTP errors after retries exhausted.
 */
export async function fetchSitelinksByWikipediaUrl(wikipediaUrl: string): Promise<number | null> {
  const title = extractWikipediaTitle(wikipediaUrl)
  if (!title) return null

  const escapedTitle = escapeSparqlString(title)

  const query = `
    SELECT ?item (COUNT(DISTINCT ?sitelink) AS ?sitelinks) WHERE {
      ?article schema:about ?item ;
               schema:isPartOf <https://en.wikipedia.org/> ;
               schema:name "${escapedTitle}"@en .
      ?sitelink schema:about ?item .
      ?sitelink schema:isPartOf/wikibase:wikiGroup "wikipedia" .
    }
    GROUP BY ?item
  `

  const result = await executeSparqlQuery(query)
  const bindings = result.results.bindings
  if (bindings.length === 0) return null

  const sitelinksValue = bindings[0].sitelinks?.value
  if (sitelinksValue == null) return null
  const sitelinks = parseInt(sitelinksValue, 10)
  return isNaN(sitelinks) ? null : sitelinks
}

export interface SitelinksBatchResult {
  /** Map of tmdbId → sitelinks count (actors not found in successful queries are omitted) */
  results: Map<number, number>
  /** Set of TMDB IDs that were in successfully queried chunks */
  queriedIds: Set<number>
}

/**
 * Batch fetch sitelinks counts for multiple actors by TMDB person IDs.
 *
 * Uses a VALUES clause to query up to MAX_BATCH_SIZE actors per SPARQL query.
 * This is far more efficient than individual queries for large backfills.
 *
 * Returns both results and the set of IDs that were successfully queried,
 * so callers can distinguish "not on Wikidata" from "query failed".
 */
export async function fetchSitelinksBatch(tmdbIds: number[]): Promise<SitelinksBatchResult> {
  const results = new Map<number, number>()
  const queriedIds = new Set<number>()

  // Process in chunks of MAX_BATCH_SIZE
  for (let i = 0; i < tmdbIds.length; i += MAX_BATCH_SIZE) {
    const chunk = tmdbIds.slice(i, i + MAX_BATCH_SIZE)
    const values = chunk.map((id) => `"${id}"`).join(" ")

    const query = `
      SELECT ?tmdbId (COUNT(DISTINCT ?sitelink) AS ?sitelinks) WHERE {
        VALUES ?tmdbId { ${values} }
        ?item wdt:P4985 ?tmdbId .
        ?sitelink schema:about ?item .
        ?sitelink schema:isPartOf/wikibase:wikiGroup "wikipedia" .
      }
      GROUP BY ?tmdbId
    `

    let result: SparqlResult
    try {
      result = await executeSparqlQuery(query)
    } catch (error) {
      console.error(
        `Wikidata batch query failed for ${chunk.length} TMDB IDs (skipping chunk):`,
        error
      )
      continue
    }

    // Mark all IDs in this chunk as successfully queried
    for (const id of chunk) {
      queriedIds.add(id)
    }

    for (const binding of result.results.bindings) {
      const tmdbId = parseInt(binding.tmdbId?.value ?? "", 10)
      if (isNaN(tmdbId)) continue
      const sitelinksValue = binding.sitelinks?.value
      if (sitelinksValue == null) continue // skip malformed bindings
      const sitelinks = parseInt(sitelinksValue, 10)
      if (!isNaN(sitelinks)) {
        results.set(tmdbId, sitelinks)
      }
    }
  }

  return { results, queriedIds }
}

/**
 * Extract the article title from a Wikipedia URL.
 * Handles both regular and mobile Wikipedia URLs.
 */
function extractWikipediaTitle(url: string): string | null {
  if (!url) return null

  try {
    const parsed = new URL(url)
    if (!parsed.hostname.match(/^en\.(?:m\.)?wikipedia\.org$/)) {
      return null
    }

    const match = parsed.pathname.match(/^\/wiki\/(.+)$/)
    if (!match) return null

    return decodeURIComponent(match[1]).split("#")[0].replace(/_/g, " ") || null
  } catch {
    return null
  }
}

/**
 * Escape a string for use in SPARQL queries.
 * Handles backslashes and double quotes.
 */
function escapeSparqlString(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}
