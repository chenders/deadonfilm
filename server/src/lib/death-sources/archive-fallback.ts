/**
 * Archive fallback for paywalled or bot-protected sites.
 *
 * Instead of fighting with CAPTCHAs and bot detection, we can often
 * fetch archived versions of articles from:
 * 1. archive.org (Wayback Machine)
 * 2. archive.is/archive.today/archive.ph
 */

import { createRequire } from "node:module"

import { htmlToText } from "./html-utils.js"
import { getBrowserAuthConfig } from "./browser-auth/config.js"

import { consoleLog } from "./logger.js"

// Create require function for CommonJS modules (needed for playwright-extra)
const require = createRequire(import.meta.url)

// Browser-like headers for all requests
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Connection: "keep-alive",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Cache-Control": "max-age=0",
}

// Rate limiting configuration
const RATE_LIMIT = {
  archiveOrg: {
    minDelayMs: 1000, // 1 second between archive.org requests
    lastRequestTime: 0,
  },
  archiveIs: {
    minDelayMs: 5000, // 5 seconds between archive.is requests (more strict)
    lastRequestTime: 0,
  },
}

/**
 * Wait for rate limit before making a request.
 */
async function waitForRateLimit(service: "archiveOrg" | "archiveIs"): Promise<void> {
  const config = RATE_LIMIT[service]
  const now = Date.now()
  const elapsed = now - config.lastRequestTime
  const waitTime = Math.max(0, config.minDelayMs - elapsed)

  if (waitTime > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitTime))
  }

  config.lastRequestTime = Date.now()
}

// Domains that should use archive.org fallback
const ARCHIVE_FALLBACK_DOMAINS = [
  "nytimes.com",
  "washingtonpost.com",
  "wsj.com",
  "ft.com",
  "economist.com",
  "bloomberg.com",
  "latimes.com",
  "bostonglobe.com",
  "telegraph.co.uk",
  "imdb.com",
  "variety.com",
  "deadline.com",
  "apnews.com",
]

/**
 * Check if a URL should try archive.org fallback.
 */
export function shouldUseArchiveFallback(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "")
    return ARCHIVE_FALLBACK_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    )
  } catch {
    return false
  }
}

/**
 * Result from checking archive.org availability.
 */
export interface ArchiveAvailability {
  available: boolean
  url: string | null
  timestamp: string | null
  status: number | null
}

/**
 * Check if a URL is available on archive.org.
 *
 * Uses the Wayback Machine Availability API.
 */
export async function checkArchiveAvailability(url: string): Promise<ArchiveAvailability> {
  try {
    // Respect rate limits
    await waitForRateLimit("archiveOrg")

    const apiUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`

    const response = await fetch(apiUrl, {
      headers: {
        ...BROWSER_HEADERS,
        Accept: "application/json, text/plain, */*",
      },
    })

    if (!response.ok) {
      return { available: false, url: null, timestamp: null, status: response.status }
    }

    const data = (await response.json()) as {
      archived_snapshots?: {
        closest?: {
          available: boolean
          url: string
          timestamp: string
          status: string
        }
      }
    }

    const snapshot = data.archived_snapshots?.closest
    if (snapshot?.available) {
      return {
        available: true,
        url: snapshot.url,
        timestamp: snapshot.timestamp,
        status: parseInt(snapshot.status, 10),
      }
    }

    return { available: false, url: null, timestamp: null, status: null }
  } catch (error) {
    console.warn(`Archive availability check failed for ${url}:`, error)
    return { available: false, url: null, timestamp: null, status: null }
  }
}

/**
 * Convert a URL to its archive.org equivalent.
 *
 * @param url - Original URL
 * @param timestamp - Optional specific timestamp (format: YYYYMMDDhhmmss)
 * @returns Archive.org URL
 */
export function getArchiveUrl(url: string, timestamp?: string): string {
  const ts = timestamp || "" // Empty = latest available
  return `https://web.archive.org/web/${ts}/${url}`
}

/**
 * Result from fetching archived content.
 */
export interface ArchiveFetchResult {
  success: boolean
  url: string
  archiveUrl: string | null
  title: string
  content: string
  contentLength: number
  timestamp: string | null
  error?: string
}

/**
 * Fetch content from archive.org for a given URL.
 *
 * This is a simple HTTP fetch - no browser needed since archive.org
 * doesn't have the same bot detection as the original sites.
 */
export async function fetchFromArchive(url: string): Promise<ArchiveFetchResult> {
  // First check availability
  const availability = await checkArchiveAvailability(url)

  if (!availability.available || !availability.url) {
    return {
      success: false,
      url,
      archiveUrl: null,
      title: "",
      content: "",
      contentLength: 0,
      timestamp: null,
      error: "URL not available on archive.org",
    }
  }

  try {
    // Respect rate limits for page fetch too
    await waitForRateLimit("archiveOrg")

    // Fetch the archived page
    const response = await fetch(availability.url, {
      headers: BROWSER_HEADERS,
    })

    if (!response.ok) {
      return {
        success: false,
        url,
        archiveUrl: availability.url,
        title: "",
        content: "",
        contentLength: 0,
        timestamp: availability.timestamp,
        error: `Archive fetch failed with status ${response.status}`,
      }
    }

    const html = await response.text()

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const title = titleMatch ? titleMatch[1].trim() : ""

    // Extract main content
    const content = extractArticleContent(html)

    return {
      success: true,
      url,
      archiveUrl: availability.url,
      title,
      content,
      contentLength: content.length,
      timestamp: availability.timestamp,
    }
  } catch (error) {
    return {
      success: false,
      url,
      archiveUrl: availability.url,
      title: "",
      content: "",
      contentLength: 0,
      timestamp: availability.timestamp,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Extract article content from HTML.
 * Tries to find the main article body and clean it up.
 */
function extractArticleContent(html: string): string {
  // Remove archive.org toolbar/banner
  const cleaned = html.replace(
    /<!--\s*BEGIN WAYBACK TOOLBAR INSERT\s*-->[\s\S]*?<!--\s*END WAYBACK TOOLBAR INSERT\s*-->/gi,
    ""
  )

  // Try to extract article content using common patterns
  const articlePatterns = [
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<div[^>]*class="[^"]*article-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*story-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*post-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
  ]

  for (const pattern of articlePatterns) {
    const match = cleaned.match(pattern)
    if (match && match[1]) {
      const text = htmlToText(match[1])
      if (text.length > 500) {
        return text
      }
    }
  }

  // Fallback: extract all text from body
  const bodyMatch = cleaned.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (bodyMatch) {
    return htmlToText(bodyMatch[1])
  }

  return htmlToText(cleaned)
}

/**
 * Try to fetch a URL, falling back to archive.org if the domain is known to be problematic.
 *
 * @param url - URL to fetch
 * @param directFetchFn - Function to try direct fetch first (e.g., browserFetchPage)
 * @returns Fetch result with content
 */
export async function fetchWithArchiveFallback(
  url: string,
  directFetchFn?: (url: string) => Promise<{ content: string; error?: string }>
): Promise<ArchiveFetchResult> {
  // If we have a direct fetch function, try it first
  if (directFetchFn) {
    try {
      const directResult = await directFetchFn(url)
      if (directResult.content && directResult.content.length > 500 && !directResult.error) {
        return {
          success: true,
          url,
          archiveUrl: null,
          title: "",
          content: directResult.content,
          contentLength: directResult.content.length,
          timestamp: null,
        }
      }
    } catch {
      // Direct fetch failed, continue to archive fallback
    }
  }

  // Check if this domain should use archive fallback
  if (!shouldUseArchiveFallback(url)) {
    return {
      success: false,
      url,
      archiveUrl: null,
      title: "",
      content: "",
      contentLength: 0,
      timestamp: null,
      error: "Domain not configured for archive fallback",
    }
  }

  // Try archive.org first
  consoleLog(`Trying archive.org fallback for: ${url}`)
  const archiveOrgResult = await fetchFromArchive(url)

  if (archiveOrgResult.success) {
    return archiveOrgResult
  }

  // If archive.org failed, try archive.is HTTP fetch
  consoleLog(`Archive.org failed, trying archive.is for: ${url}`)
  const archiveIsResult = await fetchFromArchiveIs(url)

  if (archiveIsResult.success) {
    return archiveIsResult
  }

  // If HTTP fetch failed (likely due to CAPTCHA), try browser-based search
  // Only do this if we have CAPTCHA solver configured
  const config = getBrowserAuthConfig()
  if (config.captchaSolver?.apiKey) {
    consoleLog(`Archive.is HTTP failed, trying browser with CAPTCHA solving for: ${url}`)
    return searchArchiveIsWithBrowser(url)
  }

  return archiveIsResult
}

/**
 * Check if a URL is available on archive.is/archive.today.
 *
 * Archive.is doesn't have a proper API, so we check by trying to access
 * the timemap endpoint.
 */
export async function checkArchiveIsAvailability(url: string): Promise<ArchiveAvailability> {
  try {
    // Respect rate limits
    await waitForRateLimit("archiveIs")

    // Try the "newest" endpoint which redirects to the most recent snapshot
    const checkUrl = `https://archive.is/newest/${url}`

    const response = await fetch(checkUrl, {
      method: "HEAD",
      headers: BROWSER_HEADERS,
      redirect: "manual", // Don't follow redirects, we just want to see if it exists
    })

    // 302 redirect means there's an archived version
    if (response.status === 302) {
      const archiveUrl = response.headers.get("location")
      return {
        available: true,
        url: archiveUrl,
        timestamp: null, // archive.is doesn't provide timestamps in a standard format
        status: 200,
      }
    }

    // 429 means rate limited
    if (response.status === 429) {
      console.warn("Archive.is rate limited, waiting longer...")
      RATE_LIMIT.archiveIs.minDelayMs = Math.min(RATE_LIMIT.archiveIs.minDelayMs * 2, 30000)
      return { available: false, url: null, timestamp: null, status: 429 }
    }

    return { available: false, url: null, timestamp: null, status: response.status }
  } catch (error) {
    console.warn(`Archive.is availability check failed for ${url}:`, error)
    return { available: false, url: null, timestamp: null, status: null }
  }
}

/**
 * Fetch content from archive.is for a given URL.
 */
export async function fetchFromArchiveIs(url: string): Promise<ArchiveFetchResult> {
  // Check availability first
  const availability = await checkArchiveIsAvailability(url)

  if (!availability.available || !availability.url) {
    return {
      success: false,
      url,
      archiveUrl: null,
      title: "",
      content: "",
      contentLength: 0,
      timestamp: null,
      error:
        availability.status === 429
          ? "Rate limited by archive.is"
          : "URL not available on archive.is",
    }
  }

  try {
    // Respect rate limits
    await waitForRateLimit("archiveIs")

    const response = await fetch(availability.url, {
      headers: BROWSER_HEADERS,
    })

    if (response.status === 429) {
      RATE_LIMIT.archiveIs.minDelayMs = Math.min(RATE_LIMIT.archiveIs.minDelayMs * 2, 30000)
      return {
        success: false,
        url,
        archiveUrl: availability.url,
        title: "",
        content: "",
        contentLength: 0,
        timestamp: null,
        error: "Rate limited by archive.is",
      }
    }

    if (!response.ok) {
      return {
        success: false,
        url,
        archiveUrl: availability.url,
        title: "",
        content: "",
        contentLength: 0,
        timestamp: null,
        error: `Archive.is fetch failed with status ${response.status}`,
      }
    }

    const html = await response.text()

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const title = titleMatch ? titleMatch[1].trim() : ""

    // Extract content (archive.is wraps content differently)
    const content = extractArchiveIsContent(html)

    return {
      success: true,
      url,
      archiveUrl: availability.url,
      title,
      content,
      contentLength: content.length,
      timestamp: null,
    }
  } catch (error) {
    return {
      success: false,
      url,
      archiveUrl: availability.url,
      title: "",
      content: "",
      contentLength: 0,
      timestamp: null,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Extract article content from archive.is HTML.
 */
function extractArchiveIsContent(html: string): string {
  // Archive.is wraps the original page in an iframe or embeds it directly
  // Try to find the main content
  const articlePatterns = [
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<div[^>]*class="[^"]*article-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*story-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*post-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
  ]

  for (const pattern of articlePatterns) {
    const match = html.match(pattern)
    if (match && match[1]) {
      const text = htmlToText(match[1])
      if (text.length > 500) {
        return text
      }
    }
  }

  // Fallback: extract from body
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (bodyMatch) {
    return htmlToText(bodyMatch[1])
  }

  return htmlToText(html)
}

/**
 * Search archive.is using a browser with automatic CAPTCHA solving.
 *
 * Archive.is requires CAPTCHA for searches, so we use playwright-extra
 * with the recaptcha plugin to automatically solve them.
 *
 * @param url - The URL to search for in archive.is
 * @returns Archive fetch result with content
 */
export async function searchArchiveIsWithBrowser(url: string): Promise<ArchiveFetchResult> {
  const config = getBrowserAuthConfig()

  // Check if we have CAPTCHA solver configured
  if (!config.captchaSolver?.apiKey) {
    return {
      success: false,
      url,
      archiveUrl: null,
      title: "",
      content: "",
      contentLength: 0,
      timestamp: null,
      error: "CAPTCHA solver not configured (TWOCAPTCHA_API_KEY required)",
    }
  }

  // Dynamically import playwright-extra and recaptcha plugin
  const { chromium } = require("playwright-extra")
  const { RecaptchaPlugin } = require("@extra/recaptcha")

  // Create and configure the recaptcha plugin
  const plugin = new RecaptchaPlugin({
    visualFeedback: true,
    provider: {
      id: "2captcha",
      token: config.captchaSolver.apiKey,
    },
  })

  // Workaround: playwright-extra 4.3.6 checks for _isPuppeteerExtraPlugin
  // but automation-extra-plugin doesn't set it
  Object.defineProperty(plugin, "_isPuppeteerExtraPlugin", { value: true, writable: false })
  chromium.use(plugin)

  const searchUrl = `https://archive.is/search/?q=${encodeURIComponent(url)}`

  let browser
  try {
    browser = await chromium.launch({
      headless: true, // Run headless in production
    })

    const page = await browser.newPage()
    await page.setViewportSize({ width: 1920, height: 1080 })

    // Visit homepage first to establish cookies
    await page.goto("https://archive.is/", { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(2000)

    // Navigate to search
    await page.goto(searchUrl, { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(2000)

    // Check for CAPTCHA and solve if present
    const hasRecaptcha = await page.locator("#g-recaptcha, .g-recaptcha").count()
    if (hasRecaptcha > 0) {
      consoleLog("Archive.is CAPTCHA detected, solving...")

      // Use the plugin's automatic solver
      const result = await page.solveRecaptchas()

      if (result.error) {
        return {
          success: false,
          url,
          archiveUrl: null,
          title: "",
          content: "",
          contentLength: 0,
          timestamp: null,
          error: `CAPTCHA solve failed: ${result.error}`,
        }
      }

      // Wait for page to update after CAPTCHA solution
      await page.waitForTimeout(5000)
    }

    // Look for search results
    const linkSelector = "#row0 .TEXT-BLOCK a"
    const linkCount = await page.locator(linkSelector).count()

    if (linkCount === 0) {
      // Check if still on CAPTCHA page
      const stillCaptcha = await page.locator("#g-recaptcha").count()
      if (stillCaptcha > 0) {
        return {
          success: false,
          url,
          archiveUrl: null,
          title: "",
          content: "",
          contentLength: 0,
          timestamp: null,
          error: "CAPTCHA not solved - still showing challenge",
        }
      }

      return {
        success: false,
        url,
        archiveUrl: null,
        title: "",
        content: "",
        contentLength: 0,
        timestamp: null,
        error: "No archived version found on archive.is",
      }
    }

    // Get the archive link
    const archiveUrl = await page.locator(linkSelector).first().getAttribute("href")

    if (!archiveUrl) {
      return {
        success: false,
        url,
        archiveUrl: null,
        title: "",
        content: "",
        contentLength: 0,
        timestamp: null,
        error: "Could not extract archive link",
      }
    }

    // Navigate to the archived page
    await page.goto(archiveUrl, { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(2000)

    const title = await page.title()

    // Extract article content
    const articleHtml = await page
      .locator("article")
      .first()
      .innerHTML()
      .catch(() => null)
    let content = ""

    if (articleHtml) {
      content = htmlToText(articleHtml)
    } else {
      // Fallback to body content
      const bodyHtml = await page
        .locator("body")
        .innerHTML()
        .catch(() => "")
      content = htmlToText(bodyHtml)
    }

    return {
      success: true,
      url,
      archiveUrl,
      title,
      content,
      contentLength: content.length,
      timestamp: null,
    }
  } catch (error) {
    return {
      success: false,
      url,
      archiveUrl: null,
      title: "",
      content: "",
      contentLength: 0,
      timestamp: null,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}
