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
import type { BrowserFetchConfig } from "./types.js"

// ============================================================================
// Browser singleton
// ============================================================================

let browserInstance: Browser | null = null

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({
      headless: process.env.BROWSER_FETCH_HEADLESS !== "false",
      executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined,
      args: getStealthLaunchArgs(),
    })
  }
  return browserInstance
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

/** Check if a URL should use browser-based fetching (domain is commonly blocked). */
export function shouldUseBrowserFetch(_url: string, _config?: BrowserFetchConfig): boolean {
  return isBrowserFetchEnabled()
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

/** Fetch a page using browser with full fallback chain (delegates to @debriefer/browser). */
export async function browserFetchPage(
  url: string,
  _config?: BrowserFetchConfig
): Promise<{
  url: string
  title: string
  content: string
  contentLength: number
  fetchTimeMs: number
  fetchMethod: string
  error?: string
}> {
  const startTime = Date.now()
  const result = await fetchPageWithFallbacks(url, { timeoutMs: 15_000 })
  return {
    url: result.url,
    title: result.title,
    content: result.content,
    contentLength: result.content.length,
    fetchTimeMs: Date.now() - startTime,
    fetchMethod: result.fetchMethod,
    error: result.error,
  }
}
