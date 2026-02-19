/**
 * Shared utilities for news-based death sources.
 *
 * Extracts common functionality used by Variety, Deadline, NewsAPI, and similar
 * news sources to avoid code duplication.
 */

import { DEATH_KEYWORDS, CIRCUMSTANCE_KEYWORDS, NOTABLE_FACTOR_KEYWORDS } from "../base-source.js"
import type { ActorForEnrichment } from "../types.js"
import { searchDuckDuckGo, isDuckDuckGoCaptcha } from "../../shared/duckduckgo-search.js"

const DUCKDUCKGO_HTML_URL = "https://html.duckduckgo.com/html/"
const GOOGLE_CSE_URL = "https://www.googleapis.com/customsearch/v1"

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"

export interface WebSearchResult {
  /** Raw HTML-like text containing URLs and snippets (compatible with extractUrlFromSearchResults) */
  html: string
  /** Which search engine was used */
  engine: "duckduckgo" | "google"
  /** Error message if search failed entirely */
  error?: string
}

/**
 * Search the web using DDG (with browser fallback) and Google CSE fallback.
 *
 * Fallback chain:
 * 1. DuckDuckGo fetch (free, fast)
 * 2. DuckDuckGo browser with stealth mode (bypasses CAPTCHA)
 * 3. Google Custom Search API (requires GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_CX)
 *
 * Returns HTML-like text compatible with extractUrlFromSearchResults().
 *
 * Note: This function returns raw HTML for backward compatibility with death
 * sources that use extractUrlFromSearchResults(). For biography sources that
 * only need URLs, use searchDuckDuckGo() from shared/duckduckgo-search.ts directly.
 */
export async function searchWeb(
  query: string,
  options?: { userAgent?: string; signal?: AbortSignal }
): Promise<WebSearchResult> {
  const userAgent = options?.userAgent || DEFAULT_USER_AGENT

  // Try DuckDuckGo first — fetch-based (free, fast)
  try {
    const url = `${DUCKDUCKGO_HTML_URL}?q=${encodeURIComponent(query)}`
    const response = await fetch(url, {
      headers: { "User-Agent": userAgent },
      signal: options?.signal,
    })

    if (response.ok) {
      const html = await response.text()

      if (!isDuckDuckGoCaptcha(html)) {
        return { html, engine: "duckduckgo" }
      }

      // CAPTCHA detected — try browser fallback before Google CSE
      console.log("DuckDuckGo CAPTCHA detected, trying browser fallback...")
    }
  } catch {
    // DDG fetch failed — try browser fallback
  }

  // Try DuckDuckGo browser fallback (stealth mode bypasses anomaly-modal)
  try {
    const ddgResult = await searchDuckDuckGo({
      query,
      userAgent,
      useBrowserFallback: true,
      signal: options?.signal,
    })

    if (ddgResult.urls.length > 0 && ddgResult.engine === "duckduckgo-browser") {
      // Convert URLs back to HTML-like format for backward compatibility
      const html = ddgResult.urls.map((u) => `<a href="${u}">${u}</a>`).join("\n")
      return { html, engine: "duckduckgo" }
    }
  } catch {
    // Browser fallback failed — try Google CSE
  }

  // Fall back to Google Custom Search API
  console.log("DuckDuckGo browser fallback exhausted, falling back to Google CSE")

  const apiKey = process.env.GOOGLE_SEARCH_API_KEY
  const cx = process.env.GOOGLE_SEARCH_CX

  if (!apiKey || !cx) {
    return {
      html: "",
      engine: "google",
      error: "DuckDuckGo CAPTCHA blocked and Google Search API not configured",
    }
  }

  try {
    const url = new URL(GOOGLE_CSE_URL)
    url.searchParams.set("key", apiKey)
    url.searchParams.set("cx", cx)
    url.searchParams.set("q", query)
    url.searchParams.set("num", "10")

    const response = await fetch(url.toString(), {
      headers: { "User-Agent": userAgent },
      signal: options?.signal,
    })

    const data = (await response.json()) as {
      items?: Array<{ title: string; link: string; snippet: string }>
      error?: { code: number; message: string }
    }

    if (!response.ok || data.error) {
      return {
        html: "",
        engine: "google",
        error: `Google API error: ${data.error?.message || response.status}`,
      }
    }

    if (!data.items || data.items.length === 0) {
      return { html: "", engine: "google", error: "No search results found" }
    }

    // Build HTML-like text that extractUrlFromSearchResults can parse
    const html = data.items
      .map((item) => `<a href="${item.link}">${item.title}</a>\n<p>${item.snippet}</p>`)
      .join("\n")

    return { html, engine: "google" }
  } catch (error) {
    return {
      html: "",
      engine: "google",
      error: error instanceof Error ? error.message : "Google search failed",
    }
  }
}

/**
 * Extract location of death from article text.
 */
export function extractLocation(text: string): string | null {
  const locationPatterns = [
    /died\s+(?:in|at)\s+([A-Z][a-zA-Z\s,]+?)(?:\s+(?:on|at\s+age|from)|[.,]|$)/i,
    /passed\s+away\s+(?:in|at)\s+([A-Z][a-zA-Z\s,]+?)(?:\s+(?:on|at\s+age|from)|[.,]|$)/i,
    /death\s+(?:in|at)\s+([A-Z][a-zA-Z\s,]+?)(?:\s+(?:on|from)|[.,]|$)/i,
  ]

  for (const pattern of locationPatterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      const location = match[1].trim()
      if (
        location.length >= 3 &&
        location.length <= 60 &&
        !location.match(/^\d/) &&
        !location.match(
          /january|february|march|april|may|june|july|august|september|october|november|december/i
        )
      ) {
        return location
      }
    }
  }

  return null
}

/**
 * Extract notable factors about a death from article text.
 */
export function extractNotableFactors(text: string): string[] {
  const factors: string[] = []
  const lowerText = text.toLowerCase()

  for (const keyword of NOTABLE_FACTOR_KEYWORDS) {
    if (lowerText.includes(keyword.toLowerCase())) {
      factors.push(keyword)
    }
  }

  // Add circumstance keywords as factors
  for (const keyword of CIRCUMSTANCE_KEYWORDS) {
    if (lowerText.includes(keyword.toLowerCase()) && !factors.includes(keyword)) {
      factors.push(keyword)
    }
  }

  return [...new Set(factors)].slice(0, 5)
}

/**
 * Extract death-related sentences from article text.
 *
 * @param text - The article text to extract from
 * @param actor - The actor to look for references to
 * @param maxSentences - Maximum number of sentences to return (default: 4)
 * @returns Array of death-related sentences about the actor
 */
export function extractDeathSentences(
  text: string,
  actor: ActorForEnrichment,
  maxSentences: number = 4
): string[] {
  const lowerText = text.toLowerCase()

  // Check if article mentions death
  const hasDeathMention = DEATH_KEYWORDS.some((keyword) =>
    lowerText.includes(keyword.toLowerCase())
  )

  if (!hasDeathMention) {
    return []
  }

  const sentences = text.split(/[.!?]+/)
  const deathSentences: string[] = []

  for (const sentence of sentences) {
    const trimmed = sentence.trim()
    const lowerSentence = trimmed.toLowerCase()

    // Check for death keywords
    const hasDeathKeyword = DEATH_KEYWORDS.some((kw) => lowerSentence.includes(kw.toLowerCase()))

    if (hasDeathKeyword && trimmed.length > 20 && trimmed.length < 500) {
      // Verify this is about the right person
      if (isAboutActor(lowerSentence, actor)) {
        deathSentences.push(trimmed)
      }
    }
  }

  return deathSentences.slice(0, maxSentences)
}

/**
 * Check if a sentence is about a specific actor.
 *
 * Looks for the actor's name parts, pronouns, or generic actor references.
 */
export function isAboutActor(lowerSentence: string, actor: ActorForEnrichment): boolean {
  const nameParts = actor.name.split(" ")
  const lastName = nameParts[nameParts.length - 1].toLowerCase()
  const firstName = nameParts[0].toLowerCase()

  return (
    lowerSentence.includes(lastName) ||
    lowerSentence.includes(firstName) ||
    lowerSentence.includes(" he ") ||
    lowerSentence.includes(" she ") ||
    lowerSentence.includes(" his ") ||
    lowerSentence.includes(" her ") ||
    lowerSentence.startsWith("he ") ||
    lowerSentence.startsWith("she ") ||
    lowerSentence.includes(" the actor") ||
    lowerSentence.includes(" the actress") ||
    lowerSentence.includes(" the star")
  )
}

/**
 * Extract a URL from search results HTML based on domain pattern.
 *
 * @param html - The search results HTML
 * @param urlPattern - Regex pattern for matching URLs (e.g., /https?:\/\/(?:www\.)?variety\.com\/\d{4}\/[^"'\s<>]+/gi)
 * @param actor - The actor to prioritize URLs for
 * @returns The best matching URL or null
 */
export function extractUrlFromSearchResults(
  html: string,
  urlPattern: RegExp,
  actor: ActorForEnrichment
): string | null {
  const matches = html.match(urlPattern) || []

  if (matches.length === 0) {
    return null
  }

  // Prefer URLs that contain obituary-related terms (highest priority)
  const obituaryTerms = ["obituary", "obit", "dies", "dead", "death", "rip", "passes"]

  // First pass: look for obituary-related URLs
  for (const url of matches) {
    const lowerUrl = url.toLowerCase()
    const hasObituaryTerm = obituaryTerms.some((term) => lowerUrl.includes(term))
    if (hasObituaryTerm) {
      return url
    }
  }

  // Second pass: look for URLs with actor name parts
  const nameParts = actor.name.toLowerCase().split(" ")
  for (const url of matches) {
    const lowerUrl = url.toLowerCase()
    const hasNamePart = nameParts.some((part) => part.length > 2 && lowerUrl.includes(part))
    if (hasNamePart) {
      return url
    }
  }

  // Return first result if no better match
  return matches[0] ?? null
}
