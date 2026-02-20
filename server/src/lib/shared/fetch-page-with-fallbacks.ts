/**
 * Shared page fetching utility with automatic archive fallbacks.
 *
 * When a destination page is blocked (403, CAPTCHA, etc.), automatically
 * falls back to archived versions:
 *
 * 1. Plain fetch() with browser-like headers
 * 2. archive.org (Wayback Machine)
 * 3. archive.is (HTTP)
 * 4. archive.is (browser + CAPTCHA solver) — if configured
 *
 * Used by biography sources (britannica, bbc-news, biography-com, people,
 * legacy, ap-news) and available for death sources.
 */

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Connection: "keep-alive",
  "Upgrade-Insecure-Requests": "1",
}

export interface PageFetchOptions {
  /** Custom User-Agent header */
  userAgent?: string
  /** Additional headers to include in the direct fetch */
  headers?: Record<string, string>
  /** Timeout in milliseconds (default: 15000) */
  timeoutMs?: number
  /** AbortSignal for cancellation */
  signal?: AbortSignal
}

export interface PageFetchResult {
  /** Fetched page content (HTML) */
  content: string
  /** Page title extracted from HTML */
  title: string
  /** Final URL (may differ from input if archive was used) */
  url: string
  /** Which fetch method succeeded */
  fetchMethod: "direct" | "archive.org" | "archive.is"
  /** Error message if all methods failed */
  error?: string
}

/**
 * Fetch a page with automatic archive fallbacks when blocked.
 *
 * Fallback chain:
 * 1. Direct fetch with browser-like headers
 * 2. archive.org (Wayback Machine) — if direct fetch is blocked
 * 3. archive.is (HTTP) — if archive.org fails
 * 4. archive.is (browser + CAPTCHA solver) — if HTTP archive.is fails and solver is configured
 */
export async function fetchPageWithFallbacks(
  url: string,
  options?: PageFetchOptions
): Promise<PageFetchResult> {
  const timeoutMs = options?.timeoutMs ?? 15000

  // Step 1: Try direct fetch with browser-like headers
  try {
    const headers: Record<string, string> = {
      ...BROWSER_HEADERS,
      ...(options?.userAgent ? { "User-Agent": options.userAgent } : {}),
      ...(options?.headers || {}),
    }

    const response = await fetch(url, {
      headers,
      signal: options?.signal ?? AbortSignal.timeout(timeoutMs),
    })

    if (response.ok) {
      const html = await response.text()

      // Check for soft blocks (CAPTCHA pages, bot detection)
      const { isBlockedResponse } = await import("../death-sources/browser-fetch.js")
      if (!isBlockedResponse(response.status, html)) {
        const title = extractTitle(html)
        return { content: html, title, url, fetchMethod: "direct" }
      }

      console.log(`Page blocked (soft block detected) for ${url}, trying archive fallbacks...`)
    } else {
      const { isBlockedResponse } = await import("../death-sources/browser-fetch.js")
      if (isBlockedResponse(response.status)) {
        console.log(
          `Page blocked (HTTP ${response.status}) for ${url}, trying archive fallbacks...`
        )
      } else {
        // Non-blocking HTTP error (e.g. 404, 500) — don't try archives
        return {
          content: "",
          title: "",
          url,
          fetchMethod: "direct",
          error: `HTTP ${response.status}`,
        }
      }
    }
  } catch (error) {
    // Network error — still try archives
    console.log(
      `Direct fetch failed for ${url}: ${error instanceof Error ? error.message : "Unknown"}, trying archive fallbacks...`
    )
  }

  // Step 2: Try archive.org (Wayback Machine)
  try {
    const { fetchFromArchive } = await import("../death-sources/archive-fallback.js")
    const archiveResult = await fetchFromArchive(url)

    if (archiveResult.success && archiveResult.content.length > 0) {
      console.log(`archive.org hit for ${url}`)
      return {
        content: archiveResult.content,
        title: archiveResult.title,
        url: archiveResult.archiveUrl || url,
        fetchMethod: "archive.org",
      }
    }
  } catch (error) {
    console.log(
      `archive.org failed for ${url}: ${error instanceof Error ? error.message : "Unknown"}`
    )
  }

  // Step 3: Try archive.is (HTTP)
  try {
    const { fetchFromArchiveIs } = await import("../death-sources/archive-fallback.js")
    const archiveIsResult = await fetchFromArchiveIs(url)

    if (archiveIsResult.success && archiveIsResult.content.length > 0) {
      console.log(`archive.is hit for ${url}`)
      return {
        content: archiveIsResult.content,
        title: archiveIsResult.title,
        url: archiveIsResult.archiveUrl || url,
        fetchMethod: "archive.is",
      }
    }
  } catch (error) {
    console.log(
      `archive.is HTTP failed for ${url}: ${error instanceof Error ? error.message : "Unknown"}`
    )
  }

  // Step 4: Try archive.is with browser + CAPTCHA solver
  try {
    const { getBrowserAuthConfig } = await import("../death-sources/browser-auth/config.js")
    const config = getBrowserAuthConfig()

    if (config.captchaSolver?.apiKey) {
      const { searchArchiveIsWithBrowser } = await import("../death-sources/archive-fallback.js")
      const browserResult = await searchArchiveIsWithBrowser(url)

      if (browserResult.success && browserResult.content.length > 0) {
        console.log(`archive.is browser hit for ${url}`)
        return {
          content: browserResult.content,
          title: browserResult.title,
          url: browserResult.archiveUrl || url,
          fetchMethod: "archive.is",
        }
      }
    }
  } catch (error) {
    console.log(
      `archive.is browser failed for ${url}: ${error instanceof Error ? error.message : "Unknown"}`
    )
  }

  return {
    content: "",
    title: "",
    url,
    fetchMethod: "direct",
    error: "All fetch methods failed (direct + archive.org + archive.is)",
  }
}

/**
 * Extract title from HTML.
 */
function extractTitle(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return titleMatch ? titleMatch[1].trim() : ""
}
