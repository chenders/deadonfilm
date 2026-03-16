/**
 * Browser fetch orchestration for deadonfilm.
 *
 * Manages a browser singleton and provides page fetching with bot-detection
 * bypass. Infrastructure (stealth, CAPTCHA, archives) delegated to @debriefer/browser.
 */

import type { Browser, BrowserContext, Page } from "playwright-core"
import { chromium } from "playwright-core"
import {
  createStealthContext,
  getStealthLaunchArgs,
  fetchPageWithFallbacks,
} from "@debriefer/browser"
import type { BrowserFetchConfig, FetchedPage } from "./types.js"
import { getCaptchaSolverConfig } from "../shared/captcha-config.js"

// ============================================================================
// Browser singleton with initialization lock
// ============================================================================

let browserInstance: Browser | null = null
let browserInitPromise: Promise<Browser> | null = null

async function getBrowser(): Promise<Browser> {
  if (browserInstance?.isConnected()) return browserInstance

  // Prevent concurrent launches — share the same initialization promise
  if (browserInitPromise) return browserInitPromise

  browserInitPromise = chromium
    .launch({
      headless: process.env.BROWSER_FETCH_HEADLESS !== "false",
      executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined,
      args: getStealthLaunchArgs(),
    })
    .then((browser) => {
      browserInstance = browser
      browserInitPromise = null
      return browser
    })
    .catch((error) => {
      browserInitPromise = null
      throw error
    })

  return browserInitPromise
}

/**
 * Get a fresh stealth browser page and context.
 * Caller is responsible for closing the context when done.
 */
export async function getBrowserPage(): Promise<{ page: Page; context: BrowserContext }> {
  const browser = await getBrowser()
  const context = await createStealthContext(browser)
  const page = await context.newPage()
  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-US,en;q=0.9",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  })
  return { page, context }
}

/**
 * Shut down the browser singleton cleanly.
 */
export async function shutdownBrowser(): Promise<void> {
  if (browserInstance) {
    try {
      await browserInstance.close()
    } catch {
      // Ignore errors during shutdown
    }
    browserInstance = null
  }
}

/**
 * Register SIGINT/SIGTERM handlers to close the browser on process exit.
 */
export function registerBrowserCleanup(): void {
  const cleanup = () => {
    shutdownBrowser().catch(() => {})
  }
  process.once("SIGINT", cleanup)
  process.once("SIGTERM", cleanup)
}

// ============================================================================
// Fetch utilities
// ============================================================================

/** Check if browser fetching is enabled via env var. */
export function isBrowserFetchEnabled(): boolean {
  return process.env.BROWSER_FETCH_ENABLED !== "false"
}

/**
 * Check if a URL should use browser-based fetching.
 * Returns true if browser fetch is enabled AND the URL's domain is in the
 * config's browserProtectedDomains list.
 */
export function shouldUseBrowserFetch(url: string, config?: BrowserFetchConfig): boolean {
  if (!isBrowserFetchEnabled()) return false
  if (!config?.browserProtectedDomains?.length) return false
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "")
    return config.browserProtectedDomains.some((d) => hostname === d || hostname.endsWith(`.${d}`))
  } catch {
    return false
  }
}

/** HTTP status codes that indicate blocking. */
const BLOCKED_STATUS_CODES = new Set([401, 403, 429, 451])

const SOFT_BLOCK_PATTERNS = [
  "captcha",
  "please verify you are human",
  "access denied",
  "bot detection",
  "unusual traffic",
  "cloudflare",
  "just a moment",
  "recaptcha",
  "hcaptcha",
]

/** Detect if a response indicates blocking (HTTP status or soft-block patterns). */
export function isBlockedResponse(status: number, body?: string): boolean {
  if (BLOCKED_STATUS_CODES.has(status)) return true
  if (body && status === 200 && body.length < 50_000) {
    const lower = body.toLowerCase()
    return SOFT_BLOCK_PATTERNS.some((p) => lower.includes(p))
  }
  return false
}

/** Map @debriefer/browser fetchMethod values to FetchedPage fetchMethod values. */
function mapFetchMethod(
  method: "direct" | "archive.org" | "archive.is" | "archive.is-browser" | "none"
): FetchedPage["fetchMethod"] {
  if (method === "direct") return "fetch"
  if (method === "archive.is" || method === "archive.is-browser") return "archive.is"
  if (method === "archive.org") return "fetch"
  return "browser"
}

/** Fetch a page using browser with full fallback chain (delegates to @debriefer/browser). */
export async function browserFetchPage(
  url: string,
  _config?: BrowserFetchConfig
): Promise<FetchedPage> {
  const startTime = Date.now()
  const result = await fetchPageWithFallbacks(url, { timeoutMs: 15_000 }, getCaptchaSolverConfig())
  return {
    url: result.url,
    title: result.title,
    content: result.content,
    contentLength: result.content.length,
    fetchTimeMs: Date.now() - startTime,
    fetchMethod: mapFetchMethod(result.fetchMethod),
    error: result.error,
  }
}
