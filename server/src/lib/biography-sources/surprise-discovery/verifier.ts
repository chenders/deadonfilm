/**
 * Claim verifier for surprise discovery.
 *
 * Verifies claims extracted from Reddit by searching for corroboration in
 * reliable journalistic and reference sources. A claim is considered verified
 * only when a source with reliability >= 0.9 (Tier 1 news, trade press, or
 * reference sites) returns it in search results.
 *
 * Uses Google CSE as the primary search provider, falling back to Brave Search
 * if Google is not configured. Tries two query patterns per verification attempt.
 */

import { logger } from "../../logger.js"
import type { VerificationAttempt } from "./types.js"

const NUM_RESULTS = 10

/**
 * High-reliability domains (ReliabilityTier >= 0.9).
 *
 * Includes Tier 1 News (0.95), Trade Press (0.9), and reference sites.
 * Excludes SEARCH_AGGREGATOR (0.7), AI_MODEL (0.55), and UGC sources.
 */
const RELIABLE_DOMAINS = new Set([
  // Tier 1 News
  "theguardian.com",
  "nytimes.com",
  "bbc.com",
  "bbc.co.uk",
  "apnews.com",
  "reuters.com",
  "washingtonpost.com",
  "latimes.com",
  // Trade Press
  "variety.com",
  "deadline.com",
  "hollywoodreporter.com",
  // Reference
  "britannica.com",
  "biography.com",
  "en.wikipedia.org",
  // Quality Publications
  "newyorker.com",
  "theatlantic.com",
  "smithsonianmag.com",
  "rollingstone.com",
  "vanityfair.com",
  "time.com",
  "telegraph.co.uk",
  "independent.co.uk",
  "npr.org",
  "pbs.org",
  "people.com",
  "ew.com",
])

/**
 * Extracts the bare domain from a URL, stripping the www. prefix.
 *
 * @param url - Full URL string
 * @returns Normalized hostname without www., or empty string on parse error
 */
export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

/**
 * Checks if a domain matches any entry in RELIABLE_DOMAINS.
 *
 * Matches exact hostname (after www. strip) or any subdomain of a reliable
 * domain (e.g. "edition.cnn.com" won't match, but "news.bbc.co.uk" would
 * match "bbc.co.uk").
 *
 * @param domain - Normalized hostname (www. already stripped)
 * @returns true if the domain is considered reliable
 */
export function isReliableDomain(domain: string): boolean {
  if (RELIABLE_DOMAINS.has(domain)) {
    return true
  }
  // Check subdomain: strip leading label(s) until we find a match or run out
  const parts = domain.split(".")
  for (let i = 1; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join(".")
    if (RELIABLE_DOMAINS.has(candidate)) {
      return true
    }
  }
  return false
}

/**
 * Search via Google Custom Search Engine.
 *
 * @param query - Full search query string
 * @returns Raw result items, or empty array if not configured or on error
 */
async function searchViaGoogle(
  query: string
): Promise<Array<{ title: string; link: string; snippet: string }>> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY
  const cx = process.env.GOOGLE_SEARCH_CX

  if (!apiKey || !cx) {
    return []
  }

  const url = new URL("https://www.googleapis.com/customsearch/v1")
  url.searchParams.set("key", apiKey)
  url.searchParams.set("cx", cx)
  url.searchParams.set("q", query)
  url.searchParams.set("num", String(NUM_RESULTS))

  const response = await fetch(url.toString())

  if (!response.ok) {
    throw new Error(`Google CSE returned ${response.status}: ${response.statusText}`)
  }

  const data = (await response.json()) as {
    items?: Array<{ title: string; link: string; snippet: string }>
  }

  return data.items ?? []
}

/**
 * Search via Brave Search API.
 *
 * @param query - Full search query string
 * @returns Raw result items, or empty array if not configured or on error
 */
async function searchViaBrave(
  query: string
): Promise<Array<{ title: string; link: string; snippet: string }>> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY

  if (!apiKey) {
    return []
  }

  const url = new URL("https://api.search.brave.com/res/v1/web/search")
  url.searchParams.set("q", query)
  url.searchParams.set("count", String(NUM_RESULTS))

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
  })

  if (!response.ok) {
    throw new Error(`Brave Search returned ${response.status}: ${response.statusText}`)
  }

  const data = (await response.json()) as {
    web?: { results?: Array<{ title: string; url: string; description: string }> }
  }

  return (data.web?.results ?? []).map((r) => ({
    title: r.title,
    link: r.url,
    snippet: r.description,
  }))
}

/**
 * Run a single search query and return raw results.
 *
 * Tries Google CSE first; falls back to Brave if Google is not configured.
 * Returns empty array when neither API is configured or on error.
 *
 * @param query - Full search query string
 * @param actorName - Actor name for log context
 * @param term - Association term for log context
 */
async function runSearch(
  query: string,
  actorName: string,
  term: string
): Promise<Array<{ title: string; link: string; snippet: string }>> {
  const hasGoogle = !!(process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_CX)
  const hasBrave = !!process.env.BRAVE_SEARCH_API_KEY

  if (!hasGoogle && !hasBrave) {
    return []
  }

  try {
    if (hasGoogle) {
      const results = await searchViaGoogle(query)
      logger.debug(
        { actorName, term, query, count: results.length },
        "verifier: Google CSE results"
      )
      return results
    } else {
      const results = await searchViaBrave(query)
      logger.debug(
        { actorName, term, query, count: results.length },
        "verifier: Brave Search results"
      )
      return results
    }
  } catch (error) {
    logger.error({ actorName, term, query, error }, "verifier: search API error")
    return []
  }
}

/**
 * Verifies a claim by searching for it in reliable journalistic sources.
 *
 * Tries two query patterns:
 *   1. `"${actorName}" "${term}"` — exact quoted match
 *   2. `"${actorName}" ${term}` — actor quoted, term unquoted
 *
 * For each search result, the domain is checked against RELIABLE_DOMAINS.
 * Returns verified=true as soon as a reliable source is found, with the
 * source domain, URL, and snippet as the verification excerpt.
 *
 * All attempts are tracked for observability regardless of outcome.
 *
 * @param actorName - Full actor name (e.g. "Helen Mirren")
 * @param term - The surprising association term (e.g. "karate black belt")
 * @param claim - The extracted claim text from Reddit research
 * @returns Verification result with attempts and optional source details
 */
export async function verifyClaim(
  actorName: string,
  term: string,
  claim: string
): Promise<{
  verified: boolean
  attempts: VerificationAttempt[]
  verificationSource?: string
  verificationUrl?: string
  verificationExcerpt?: string
}> {
  const queries = [`"${actorName}" "${term}"`, `"${actorName}" ${term}`]

  const attempts: VerificationAttempt[] = []

  logger.debug({ actorName, term, claim }, "verifier: starting claim verification")

  for (const query of queries) {
    const results = await runSearch(query, actorName, term)

    for (const result of results) {
      const domain = extractDomain(result.link)
      const reliable = isReliableDomain(domain)

      attempts.push({
        source: domain,
        url: result.link,
        found: reliable,
      })

      if (reliable) {
        logger.debug(
          { actorName, term, domain, url: result.link },
          "verifier: claim verified in reliable source"
        )
        return {
          verified: true,
          attempts,
          verificationSource: domain,
          verificationUrl: result.link,
          verificationExcerpt: result.snippet,
        }
      }
    }
  }

  logger.debug(
    { actorName, term, attemptCount: attempts.length },
    "verifier: claim could not be verified in reliable source"
  )

  return { verified: false, attempts }
}
