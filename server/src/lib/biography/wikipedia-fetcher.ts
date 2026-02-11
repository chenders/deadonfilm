/**
 * Wikipedia intro section fetcher for biography enrichment.
 *
 * Fetches the intro (section 0) from Wikipedia articles via the MediaWiki API,
 * cleans HTML to plain text, and supports concurrent batch fetching.
 */

import { logger } from "../logger.js"
import {
  removeScriptTags,
  removeStyleTags,
  stripHtmlTags,
  decodeHtmlEntities,
} from "../death-sources/html-utils.js"

/**
 * Extract the article title from a Wikipedia URL.
 * Handles both /wiki/Title and encoded formats.
 */
export function extractWikipediaTitle(url: string): string | null {
  try {
    const parsed = new URL(url)
    const match = parsed.pathname.match(/^\/wiki\/(.+)$/)
    if (!match) return null
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

/**
 * Clean Wikipedia HTML to plain text.
 */
function cleanWikipediaHtml(html: string): string {
  let text = html
  text = removeScriptTags(text)
  text = removeStyleTags(text)
  text = stripHtmlTags(text)
  text = decodeHtmlEntities(text)
  // Remove citation markers like [1], [2], etc.
  text = text.replace(/\[\d+\]/g, "")
  // Normalize whitespace
  text = text.replace(/\s+/g, " ").trim()
  return text
}

/**
 * Fetch the intro section (section 0) of a Wikipedia article.
 *
 * @param wikipediaUrl - Full Wikipedia URL (e.g., https://en.wikipedia.org/wiki/John_Wayne)
 * @returns Plain text intro, or null if unavailable
 */
export async function fetchWikipediaIntro(wikipediaUrl: string): Promise<string | null> {
  const title = extractWikipediaTitle(wikipediaUrl)
  if (!title) {
    logger.debug({ wikipediaUrl }, "Could not extract title from Wikipedia URL")
    return null
  }

  // Determine the Wikipedia language subdomain
  let lang = "en"
  try {
    const parsed = new URL(wikipediaUrl)
    const subdomain = parsed.hostname.split(".")[0]
    if (subdomain && subdomain !== "www" && /^[a-z]{2,10}(-[a-z]{2,10})?$/.test(subdomain)) {
      lang = subdomain
    }
  } catch {
    // Fall back to English
  }

  const apiUrl =
    `https://${lang}.wikipedia.org/w/api.php?` +
    new URLSearchParams({
      action: "parse",
      page: title,
      prop: "text",
      section: "0",
      format: "json",
      redirects: "1",
      disableeditsection: "1",
      disabletoc: "1",
    }).toString()

  try {
    const response = await fetch(apiUrl, {
      headers: { "User-Agent": "DeadOnFilm/1.0 (biography enrichment)" },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      logger.warn({ status: response.status, title }, "Wikipedia API error")
      return null
    }

    const data = (await response.json()) as {
      parse?: { text?: { "*"?: string } }
      error?: { info?: string }
    }

    if (data.error) {
      logger.debug({ title, error: data.error.info }, "Wikipedia API returned error")
      return null
    }

    const html = data.parse?.text?.["*"]
    if (!html) return null

    const text = cleanWikipediaHtml(html)
    // Only return if we got meaningful content
    if (text.length < 50) return null
    // Limit to reasonable length for prompt inclusion
    return text.slice(0, 4000)
  } catch (error) {
    logger.debug({ error, title }, "Failed to fetch Wikipedia intro")
    return null
  }
}

/**
 * Batch fetch Wikipedia intros for multiple actors.
 * Uses concurrent fetching with controlled parallelism.
 *
 * @param actors - Array of actors with IDs and Wikipedia URLs
 * @param chunkSize - Number of concurrent requests (default: 10)
 * @param delayMs - Delay between chunks in ms (default: 50)
 * @returns Map of actor ID to Wikipedia intro text
 */
export async function batchFetchWikipediaIntros(
  actors: Array<{ id: number; wikipediaUrl: string }>,
  chunkSize = 10,
  delayMs = 50
): Promise<Map<number, string>> {
  const results = new Map<number, string>()

  // Split into chunks
  const chunks: Array<Array<{ id: number; wikipediaUrl: string }>> = []
  for (let i = 0; i < actors.length; i += chunkSize) {
    chunks.push(actors.slice(i, i + chunkSize))
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]

    const chunkResults = await Promise.allSettled(
      chunk.map(async (actor) => {
        const intro = await fetchWikipediaIntro(actor.wikipediaUrl)
        return { id: actor.id, intro }
      })
    )

    for (const result of chunkResults) {
      if (result.status === "fulfilled" && result.value.intro) {
        results.set(result.value.id, result.value.intro)
      }
    }

    // Delay between chunks (skip after last chunk)
    if (i < chunks.length - 1 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  return results
}
