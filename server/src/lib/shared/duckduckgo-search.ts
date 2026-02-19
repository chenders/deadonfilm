/**
 * Shared DuckDuckGo search utility with browser fallback.
 *
 * Consolidates duplicated DDG search logic from 6+ biography sources and
 * death sources into one module with a multi-tier fallback chain:
 *
 * 1. fetch-based DDG (free, fast)
 * 2. Browser-based DDG with stealth fingerprinting (bypasses anomaly-modal)
 * 3. CAPTCHA solver as last resort (if configured)
 *
 * Used by both death enrichment (via news-utils.ts) and biography enrichment
 * (britannica, biography-com, people, legacy, bbc-news, ap-news).
 */

import { decodeHtmlEntities } from "../death-sources/html-utils.js"

const DUCKDUCKGO_HTML_URL = "https://html.duckduckgo.com/html/"

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"

export interface DuckDuckGoSearchOptions {
  query: string
  /** Filter results to only include URLs containing this domain */
  domainFilter?: string
  /** Additional domain filters (e.g. BBC needs both bbc.com and bbc.co.uk) */
  additionalDomainFilters?: string[]
  userAgent?: string
  timeoutMs?: number
  /** Whether to try browser-based DDG when fetch is CAPTCHA-blocked (default: true) */
  useBrowserFallback?: boolean
  /** AbortSignal for cancellation */
  signal?: AbortSignal
}

export interface DuckDuckGoSearchResult {
  urls: string[]
  /** Which method produced the results */
  engine: "duckduckgo-fetch" | "duckduckgo-browser" | "google-cse"
  /** Cost incurred (0 for fetch/browser, CAPTCHA solve cost if any) */
  costUsd: number
  /** Error if all methods failed */
  error?: string
}

/**
 * Search DuckDuckGo with automatic browser fallback on CAPTCHA.
 *
 * Fallback chain:
 * 1. fetch-based DDG HTML endpoint (free, fast)
 * 2. Browser-based DDG with stealth mode (bypasses anomaly-modal)
 * 3. CAPTCHA detection + solving if browser page still blocked
 */
export async function searchDuckDuckGo(
  options: DuckDuckGoSearchOptions
): Promise<DuckDuckGoSearchResult> {
  const {
    query,
    domainFilter,
    additionalDomainFilters,
    userAgent = DEFAULT_USER_AGENT,
    timeoutMs = 15000,
    useBrowserFallback = true,
    signal,
  } = options

  // Step 1: Try fetch-based DDG (free, fast)
  try {
    const url = `${DUCKDUCKGO_HTML_URL}?q=${encodeURIComponent(query)}`
    const response = await fetch(url, {
      headers: { "User-Agent": userAgent },
      signal: signal ?? AbortSignal.timeout(timeoutMs),
    })

    if (response.ok) {
      const html = await response.text()

      if (!isDuckDuckGoCaptcha(html)) {
        const urls = extractUrlsFromDuckDuckGoHtml(html, domainFilter, additionalDomainFilters)
        return { urls, engine: "duckduckgo-fetch", costUsd: 0 }
      }

      // CAPTCHA detected — fall through to browser fallback
      console.log("DuckDuckGo CAPTCHA detected on fetch, trying browser fallback...")
    }
  } catch {
    // fetch failed — fall through to browser fallback
  }

  // Step 2: Try browser-based DDG (stealth mode bypasses anomaly-modal)
  if (!useBrowserFallback) {
    return {
      urls: [],
      engine: "duckduckgo-fetch",
      costUsd: 0,
      error: "DuckDuckGo CAPTCHA detected and browser fallback is disabled",
    }
  }

  try {
    return await browserDuckDuckGoSearch(query, domainFilter, additionalDomainFilters, timeoutMs)
  } catch (error) {
    return {
      urls: [],
      engine: "duckduckgo-browser",
      costUsd: 0,
      error: `Browser DDG search failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    }
  }
}

/**
 * Perform a DuckDuckGo search using a headless browser with stealth mode.
 * Falls back to CAPTCHA solving if the page still shows anomaly-modal.
 */
async function browserDuckDuckGoSearch(
  query: string,
  domainFilter?: string,
  additionalDomainFilters?: string[],
  timeoutMs = 15000
): Promise<DuckDuckGoSearchResult> {
  // Dynamic import to avoid loading browser infra when not needed
  const { getBrowserPage } = await import("../death-sources/browser-fetch.js")
  const { detectCaptcha, solveCaptcha } = await import("../death-sources/browser-auth/index.js")
  const { getBrowserAuthConfig } = await import("../death-sources/browser-auth/index.js")

  const { page, context } = await getBrowserPage()
  let costUsd = 0

  try {
    const url = `${DUCKDUCKGO_HTML_URL}?q=${encodeURIComponent(query)}`

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    })

    // Wait for results to render
    await page.waitForTimeout(2000)

    // Get the page HTML
    let html = await page.content()

    // Check for CAPTCHA even in browser mode
    if (isDuckDuckGoCaptcha(html)) {
      console.log("DuckDuckGo CAPTCHA detected in browser mode, attempting CAPTCHA solve...")

      // Try CAPTCHA detection + solving
      const captchaResult = await detectCaptcha(page)
      if (captchaResult.detected) {
        const authConfig = getBrowserAuthConfig()
        if (authConfig.captchaSolver) {
          const solveResult = await solveCaptcha(page, captchaResult, authConfig.captchaSolver)
          costUsd += solveResult.costUsd

          if (solveResult.success) {
            await page.waitForTimeout(2000)
            html = await page.content()
          } else {
            console.warn(`DDG CAPTCHA solving failed: ${solveResult.error}`)
          }
        }
      }

      // If still CAPTCHA after solving attempt, give up
      if (isDuckDuckGoCaptcha(html)) {
        return {
          urls: [],
          engine: "duckduckgo-browser",
          costUsd,
          error: "DuckDuckGo CAPTCHA could not be bypassed",
        }
      }
    }

    const urls = extractUrlsFromDuckDuckGoHtml(html, domainFilter, additionalDomainFilters)
    return { urls, engine: "duckduckgo-browser", costUsd }
  } finally {
    await page.close().catch(() => {})
    await context.close().catch(() => {})
  }
}

/**
 * Check if DDG HTML response contains a CAPTCHA/anomaly page.
 */
export function isDuckDuckGoCaptcha(html: string): boolean {
  return html.includes("anomaly-modal") || html.includes("bots use DuckDuckGo too")
}

/**
 * Extract URLs from DuckDuckGo HTML search results.
 *
 * @param html - Raw HTML from DDG search
 * @param domainFilter - Only return URLs containing this domain (e.g. "britannica.com")
 * @param additionalDomainFilters - Additional domains to accept (e.g. ["bbc.co.uk"])
 */
export function extractUrlsFromDuckDuckGoHtml(
  html: string,
  domainFilter?: string,
  additionalDomainFilters?: string[]
): string[] {
  const urls: string[] = []

  const matchesDomain = (url: string): boolean => {
    if (!domainFilter) return true
    if (url.includes(domainFilter)) return true
    if (additionalDomainFilters) {
      return additionalDomainFilters.some((d) => url.includes(d))
    }
    return false
  }

  // Extract from result__url href attributes
  const urlRegex = /class="result__url"[^>]*href="([^"]+)"/g
  let match
  while ((match = urlRegex.exec(html)) !== null) {
    const cleaned = cleanDuckDuckGoUrl(match[1])
    if (matchesDomain(cleaned)) {
      urls.push(cleaned)
    }
  }

  // Fallback: try result__a href attributes
  if (urls.length === 0) {
    const linkRegex = /class="result__a"[^>]*href="([^"]+)"/g
    while ((match = linkRegex.exec(html)) !== null) {
      const cleaned = cleanDuckDuckGoUrl(match[1])
      if (matchesDomain(cleaned)) {
        urls.push(cleaned)
      }
    }
  }

  return urls
}

/**
 * Clean DuckDuckGo redirect URLs to extract the actual destination URL.
 *
 * Handles:
 * - DDG redirect format: //duckduckgo.com/l/?uddg=ENCODED_URL&...
 * - Protocol-relative URLs: //example.com → https://example.com
 * - HTML entity encoding in URLs
 */
export function cleanDuckDuckGoUrl(url: string): string {
  // Handle DuckDuckGo redirect: //duckduckgo.com/l/?uddg=ENCODED_URL&...
  if (url.includes("duckduckgo.com/l/")) {
    const uddgMatch = url.match(/uddg=([^&]+)/)
    if (uddgMatch) {
      try {
        return decodeURIComponent(decodeHtmlEntities(uddgMatch[1]))
      } catch {
        // Fall through
      }
    }
  }

  // Handle protocol-relative URLs
  if (url.startsWith("//")) {
    return "https:" + url
  }

  return url
}
