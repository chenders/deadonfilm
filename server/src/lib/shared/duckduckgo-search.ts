/**
 * Shared web search utility with Google CSE + DuckDuckGo fallback chain.
 *
 * Two entry points:
 * - webSearch(): Full fallback chain (Google CSE → DDG fetch → DDG browser)
 * - searchDuckDuckGo(): DDG-only (fetch → browser)
 *
 * Used by both death enrichment (via news-utils.ts) and biography enrichment
 * (britannica, biography-com, people, legacy, bbc-news, ap-news).
 */

import { decodeHtmlEntities } from "../death-sources/html-utils.js"

const DUCKDUCKGO_HTML_URL = "https://html.duckduckgo.com/html/"
const GOOGLE_CSE_URL = "https://www.googleapis.com/customsearch/v1"

/** CSS selector for DDG search result elements */
const DDG_RESULTS_SELECTOR = ".result__url, .result__a, #links"

/** Time to wait after CAPTCHA solve for page reload */
const POST_CAPTCHA_WAIT_MS = 3000

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
 * Search the web with the full fallback chain.
 *
 * 1. Google CSE (fast, reliable, no CAPTCHA) — if API keys configured
 * 2. DDG fetch-based HTML endpoint (free fallback)
 * 3. DDG browser-based with stealth mode (bypasses anomaly-modal)
 *
 * Use this when you want the most reliable search. For DDG-only,
 * use searchDuckDuckGo() directly.
 */
export async function webSearch(options: DuckDuckGoSearchOptions): Promise<DuckDuckGoSearchResult> {
  const { domainFilter, additionalDomainFilters, userAgent, timeoutMs, signal } = options

  // Step 1: Try Google CSE first (fast, reliable, no CAPTCHA)
  const cseResult = await searchGoogleCse(options.query, domainFilter, additionalDomainFilters, {
    userAgent,
    timeoutMs,
    signal,
  })
  if (cseResult) {
    return cseResult
  }

  // Step 2: Fall through to DDG chain
  return searchDuckDuckGo(options)
}

/**
 * Search DuckDuckGo with automatic browser fallback on CAPTCHA.
 *
 * DDG-only fallback chain:
 * 1. fetch-based DDG HTML endpoint (free, fast)
 * 2. Browser-based DDG with stealth mode (bypasses anomaly-modal)
 * 3. CAPTCHA detection + solving if browser page still blocked
 *
 * For Google CSE + DDG combined, use webSearch() instead.
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
  let fetchFailureReason: "captcha" | "fetch-error" | null = null

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
      fetchFailureReason = "captcha"
      console.log("DuckDuckGo CAPTCHA detected on fetch, trying browser fallback...")
    } else {
      fetchFailureReason = "fetch-error"
    }
  } catch {
    // fetch failed — fall through to browser fallback
    fetchFailureReason = "fetch-error"
  }

  // Step 2: Try browser-based DDG (stealth mode bypasses anomaly-modal)
  if (!useBrowserFallback) {
    return {
      urls: [],
      engine: "duckduckgo-fetch",
      costUsd: 0,
      error:
        fetchFailureReason === "captcha"
          ? "DuckDuckGo CAPTCHA detected and browser fallback is disabled"
          : "DuckDuckGo search failed and browser fallback is disabled",
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
 * Search Google Custom Search Engine.
 *
 * Returns null if not configured or if the search fails (so caller falls through to DDG).
 */
async function searchGoogleCse(
  query: string,
  domainFilter?: string,
  additionalDomainFilters?: string[],
  options?: { userAgent?: string; timeoutMs?: number; signal?: AbortSignal }
): Promise<DuckDuckGoSearchResult | null> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY
  const cx = process.env.GOOGLE_SEARCH_CX

  if (!apiKey || !cx) {
    return null
  }

  try {
    console.log(`Trying Google CSE for: ${query.substring(0, 80)}...`)

    const url = new URL(GOOGLE_CSE_URL)
    url.searchParams.set("key", apiKey)
    url.searchParams.set("cx", cx)
    url.searchParams.set("q", query)
    url.searchParams.set("num", "10")

    const response = await fetch(url.toString(), {
      headers: { "User-Agent": options?.userAgent || DEFAULT_USER_AGENT },
      signal: options?.signal ?? AbortSignal.timeout(options?.timeoutMs ?? 15000),
    })

    const data = (await response.json()) as {
      items?: Array<{ title: string; link: string; snippet: string }>
      error?: { code: number; message: string }
    }

    if (!response.ok || data.error) {
      console.log(
        `Google CSE error: ${data.error?.message || response.status}, falling back to DDG`
      )
      return null
    }

    if (!data.items || data.items.length === 0) {
      console.log("Google CSE returned no results, falling back to DDG")
      return null
    }

    // Apply domain filtering to Google CSE results
    let urls = data.items.map((item) => item.link)

    if (domainFilter) {
      const allDomains = [domainFilter, ...(additionalDomainFilters || [])]
      urls = urls.filter((u) => allDomains.some((d) => u.includes(d)))
    }

    if (urls.length === 0) {
      console.log("Google CSE results didn't match domain filter, falling back to DDG")
      return null
    }

    return { urls, engine: "google-cse", costUsd: 0.005 }
  } catch (error) {
    console.log(
      `Google CSE fetch failed: ${error instanceof Error ? error.message : "Unknown"}, falling back to DDG`
    )
    return null
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
  timeoutMs?: number
): Promise<DuckDuckGoSearchResult> {
  // Browser navigation has more overhead than fetch — enforce a minimum of 30s
  const browserTimeout = Math.max(timeoutMs ?? 30000, 30000)

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
      timeout: browserTimeout,
    })

    // Wait for search results to render (or fall back to short delay)
    await page.waitForSelector(DDG_RESULTS_SELECTOR, { timeout: 5000 }).catch(() => {})

    // Get the page HTML
    let html = await page.content()

    // Check for CAPTCHA even in browser mode
    if (isDuckDuckGoCaptcha(html)) {
      console.log("DuckDuckGo CAPTCHA detected in browser mode, attempting CAPTCHA solve...")

      // Try CAPTCHA detection + solving
      const captchaResult = await detectCaptcha(page)
      if (captchaResult.detected) {
        console.log(
          `DDG CAPTCHA detected as type="${captchaResult.type}", siteKey=${captchaResult.siteKey ? "found" : "null"}, context="${captchaResult.context}"`
        )
        const authConfig = getBrowserAuthConfig()
        if (authConfig.captchaSolver) {
          const solveResult = await solveCaptcha(page, captchaResult, authConfig.captchaSolver)
          costUsd += solveResult.costUsd

          if (solveResult.success) {
            await page
              .waitForLoadState("networkidle", { timeout: POST_CAPTCHA_WAIT_MS })
              .catch(() => {})
            html = await page.content()
          } else {
            console.warn(`DDG CAPTCHA solving failed: ${solveResult.error}`)
          }
        } else {
          console.warn(
            "DDG CAPTCHA detected but no solver configured (set CAPTCHA_SOLVER_PROVIDER + API key)"
          )
        }
      } else {
        console.warn(
          "DDG anomaly-modal present but detectCaptcha() found no standard CAPTCHA widget"
        )
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
