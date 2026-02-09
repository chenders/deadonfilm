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
 */
async function executeSparqlQuery(query: string): Promise<SparqlResult | null> {
  await rateLimiter.waitForRateLimit()

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

      if (response.status === 429 && attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt)
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }

      if (response.status >= 500 && attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt)
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }

      if (!response.ok) {
        console.error(`Wikidata SPARQL error: ${response.status}`)
        return null
      }

      return (await response.json()) as SparqlResult
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt)
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }
      console.error("Wikidata SPARQL fetch error:", error)
      return null
    }
  }

  return null
}

/**
 * Fetch sitelinks count for a single actor by TMDB person ID.
 *
 * Uses Wikidata property P4985 (TMDB person ID) to find the entity,
 * then counts the number of sitelinks (Wikipedia language editions).
 *
 * @returns Number of sitelinks, or null if not found/error
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
  if (!result) return null

  const bindings = result.results.bindings
  if (bindings.length === 0) return null

  const sitelinks = parseInt(bindings[0].sitelinks?.value ?? "0", 10)
  return isNaN(sitelinks) ? null : sitelinks
}

/**
 * Fetch sitelinks count for a single actor by Wikipedia URL.
 *
 * Resolves the Wikipedia article to a Wikidata entity via the enwiki sitelink,
 * then counts total sitelinks.
 *
 * @returns Number of sitelinks, or null if not found/error
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
  if (!result) return null

  const bindings = result.results.bindings
  if (bindings.length === 0) return null

  const sitelinks = parseInt(bindings[0].sitelinks?.value ?? "0", 10)
  return isNaN(sitelinks) ? null : sitelinks
}

/**
 * Batch fetch sitelinks counts for multiple actors by TMDB person IDs.
 *
 * Uses a VALUES clause to query up to MAX_BATCH_SIZE actors per SPARQL query.
 * This is far more efficient than individual queries for large backfills.
 *
 * @returns Map of tmdbId → sitelinks count (actors not found are omitted)
 */
export async function fetchSitelinksBatch(tmdbIds: number[]): Promise<Map<number, number>> {
  const results = new Map<number, number>()

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

    const result = await executeSparqlQuery(query)
    if (!result) continue

    for (const binding of result.results.bindings) {
      const tmdbId = parseInt(binding.tmdbId?.value ?? "", 10)
      const sitelinks = parseInt(binding.sitelinks?.value ?? "0", 10)
      if (!isNaN(tmdbId) && !isNaN(sitelinks)) {
        results.set(tmdbId, sitelinks)
      }
    }
  }

  return results
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
