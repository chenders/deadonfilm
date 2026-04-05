/**
 * Reddit researcher for surprise discovery.
 *
 * Searches Reddit for discussion threads about a surprising actor association.
 * Uses Google CSE with site:reddit.com as the primary search provider,
 * falling back to Brave Search if Google is not configured.
 *
 * Web search has no per-query cost, so costUsd is always 0.
 */

import { logger } from "../../logger.js"
import type { RedditThread } from "./types.js"

const MAX_RESULTS = 5
const REDDIT_URL_PATTERN = /reddit\.com\/r\/([^/]+)/

/**
 * Extracts the subreddit name from a Reddit URL.
 *
 * @param url - Full Reddit URL
 * @returns Subreddit name, or "reddit" if not found
 */
export function extractSubreddit(url: string): string {
  const match = REDDIT_URL_PATTERN.exec(url)
  return match?.[1] ?? "reddit"
}

/**
 * Search Reddit via Google Custom Search Engine.
 *
 * @param query - Full search query string
 * @returns Array of raw result items with title, link, and snippet
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
  url.searchParams.set("num", String(MAX_RESULTS))

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
 * Search Reddit via Brave Search API.
 *
 * @param query - Full search query string
 * @returns Array of raw result items with title, url, and description
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
  url.searchParams.set("count", String(MAX_RESULTS))

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
 * Search Reddit for threads about a surprising actor association.
 *
 * Tries Google CSE first (site:reddit.com). Falls back to Brave Search
 * if Google is not configured. Filters results to reddit.com URLs only
 * and keeps the top 5.
 *
 * @param actorName - Full actor name (e.g. "John Wayne")
 * @param term - The surprising association term (e.g. "GPS navigation")
 * @returns Reddit threads found, extracted claim text, and cost in USD
 */
export async function researchOnReddit(
  actorName: string,
  term: string
): Promise<{ threads: RedditThread[]; claimExtracted: string; costUsd: number }> {
  const query = `"${actorName}" "${term}" site:reddit.com`

  const hasGoogle = !!(process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_CX)
  const hasBrave = !!process.env.BRAVE_SEARCH_API_KEY

  if (!hasGoogle && !hasBrave) {
    logger.warn(
      { actorName, term },
      "reddit-researcher: no search API configured (set GOOGLE_SEARCH_API_KEY+GOOGLE_SEARCH_CX or BRAVE_SEARCH_API_KEY)"
    )
    return { threads: [], claimExtracted: "", costUsd: 0 }
  }

  logger.debug({ actorName, term, query }, "reddit-researcher: searching Reddit")

  let rawResults: Array<{ title: string; link: string; snippet: string }> = []

  try {
    if (hasGoogle) {
      rawResults = await searchViaGoogle(query)
      logger.debug(
        { actorName, term, count: rawResults.length },
        "reddit-researcher: Google CSE results"
      )
    } else {
      rawResults = await searchViaBrave(query)
      logger.debug(
        { actorName, term, count: rawResults.length },
        "reddit-researcher: Brave Search results"
      )
    }
  } catch (error) {
    logger.error({ actorName, term, error }, "reddit-researcher: search API error")
    return { threads: [], claimExtracted: "", costUsd: 0 }
  }

  // Filter to reddit.com URLs only
  const redditResults = rawResults.filter((r) => r.link.includes("reddit.com"))

  // Keep top 5
  const topResults = redditResults.slice(0, MAX_RESULTS)

  const threads: RedditThread[] = topResults.map((r) => ({
    url: r.link,
    subreddit: extractSubreddit(r.link),
    title: r.title,
    upvotes: 0,
  }))

  // Extract claim from the best thread's snippet (first result)
  const claimExtracted = topResults[0]?.snippet ?? ""

  logger.debug(
    { actorName, term, threadCount: threads.length },
    "reddit-researcher: research complete"
  )

  return { threads, claimExtracted, costUsd: 0 }
}
