/**
 * Browser-based page fetching for sites with bot detection.
 *
 * Uses Playwright to fetch pages that block regular HTTP requests.
 * Maintains a singleton browser with idle timeout for efficiency.
 *
 * Features:
 * - Domain-specific browser fetching for known bot-protected sites
 * - Fallback to browser when regular fetch returns 403/blocked
 * - Auto-shutdown after idle timeout
 * - Content extraction from article/main elements
 * - Authenticated access to paywalled sites (NYTimes, WashPost)
 * - Session persistence with cookie storage
 * - CAPTCHA detection and solving
 *
 * Configuration via BrowserFetchConfig or environment:
 *   BROWSER_FETCH_ENABLED=true     Enable browser fetching (default: true)
 *   BROWSER_FETCH_HEADLESS=true    Run headless (default: true)
 *   BROWSER_AUTH_ENABLED=true      Enable authenticated access
 */

import type { Browser, BrowserContext, Page } from "playwright-core"
import type { BrowserFetchConfig, FetchedPage } from "./types.js"
import { DEFAULT_BROWSER_FETCH_CONFIG } from "./types.js"
import { htmlToText } from "./html-utils.js"
import {
  getBrowserAuthConfig,
  hasCredentialsForSite,
  loadSession,
  saveSession,
  applySessionToContext,
  detectCaptcha,
  solveCaptcha,
  NYTimesLoginHandler,
  WashingtonPostLoginHandler,
} from "./browser-auth/index.js"
import type {
  LoginHandler,
  SupportedSite,
  PaywallDetectionResult,
  AuthenticatedContextResult,
} from "./browser-auth/index.js"

// Content extraction thresholds
const JS_RENDER_WAIT_MS = 2000
const MIN_ARTICLE_CONTENT_LENGTH = 500
const MIN_TEXT_CONTENT_LENGTH = 100
const SOFT_BLOCK_PAGE_SIZE_THRESHOLD = 50000
const MODAL_BUTTON_TIMEOUT_MS = 1000
const MODAL_CLOSE_WAIT_MS = 500

// Browser instance management
let browserInstance: Browser | null = null
let browserInitPromise: Promise<Browser> | null = null
let idleTimeoutHandle: ReturnType<typeof setTimeout> | null = null
let lastActivityTime = Date.now()
let cleanupHandlersRegistered = false

// Configuration (can be overridden via setBrowserConfig)
let activeConfig: BrowserFetchConfig = { ...DEFAULT_BROWSER_FETCH_CONFIG }

// Environment overrides
const ENV_ENABLED = process.env.BROWSER_FETCH_ENABLED
const HEADLESS = process.env.BROWSER_FETCH_HEADLESS !== "false"

// Login handlers registry
const loginHandlers: Map<string, LoginHandler> = new Map()

/**
 * Get or create a login handler for a domain.
 */
function getLoginHandler(domain: string): LoginHandler | null {
  const normalizedDomain = domain.replace(/^www\./, "").toLowerCase()

  // Check cache
  if (loginHandlers.has(normalizedDomain)) {
    return loginHandlers.get(normalizedDomain)!
  }

  // Create handler based on domain
  let handler: LoginHandler | null = null

  if (normalizedDomain === "nytimes.com" || normalizedDomain.endsWith(".nytimes.com")) {
    handler = new NYTimesLoginHandler()
  } else if (
    normalizedDomain === "washingtonpost.com" ||
    normalizedDomain.endsWith(".washingtonpost.com")
  ) {
    handler = new WashingtonPostLoginHandler()
  }

  if (handler) {
    loginHandlers.set(normalizedDomain, handler)
  }

  return handler
}

/**
 * Get the supported site type from a URL.
 */
function getSiteFromUrl(url: string): SupportedSite | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "")

    if (hostname === "nytimes.com" || hostname.endsWith(".nytimes.com")) {
      return "nytimes"
    }
    if (hostname === "washingtonpost.com" || hostname.endsWith(".washingtonpost.com")) {
      return "washingtonpost"
    }

    return null
  } catch {
    return null
  }
}

/**
 * Get the domain from a URL for session storage.
 */
function getDomainFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "")
    // Get the base domain (e.g., "nytimes.com" from "www.nytimes.com")
    const parts = hostname.split(".")
    if (parts.length > 2) {
      return parts.slice(-2).join(".")
    }
    return hostname
  } catch {
    return ""
  }
}

/**
 * Set the browser fetch configuration.
 */
export function setBrowserConfig(config: Partial<BrowserFetchConfig>): void {
  activeConfig = { ...DEFAULT_BROWSER_FETCH_CONFIG, ...config }
}

/**
 * Get the current browser fetch configuration.
 */
export function getBrowserConfig(): BrowserFetchConfig {
  return { ...activeConfig }
}

/**
 * Check if browser fetching is enabled.
 * Respects both config and environment variable.
 */
export function isBrowserFetchEnabled(): boolean {
  // Environment variable takes precedence
  if (ENV_ENABLED !== undefined) {
    return ENV_ENABLED === "true"
  }
  return activeConfig.enabled
}

/**
 * Check if a URL should use browser fetching based on domain.
 */
export function shouldUseBrowserFetch(url: string, config?: BrowserFetchConfig): boolean {
  const cfg = config || activeConfig

  if (!isBrowserFetchEnabled()) {
    return false
  }

  try {
    const hostname = new URL(url).hostname.toLowerCase()
    const baseHostname = hostname.replace(/^www\./, "")

    return cfg.browserProtectedDomains.some((domain) => {
      const baseDomain = domain.toLowerCase().replace(/^www\./, "")
      return baseHostname === baseDomain || baseHostname.endsWith(`.${baseDomain}`)
    })
  } catch {
    return false
  }
}

/**
 * Check if a response indicates the request was blocked.
 * Detects both HTTP status codes and soft blocks in HTML content.
 */
export function isBlockedResponse(status: number, body?: string): boolean {
  // HTTP status codes indicating blocking
  if (status === 403 || status === 401 || status === 429 || status === 451) {
    return true
  }

  // Check for soft blocks in HTML body
  if (body && status === 200) {
    const lowerBody = body.toLowerCase()

    // Common bot detection patterns
    const blockPatterns = [
      "captcha",
      "please verify you are human",
      "access denied",
      "bot detection",
      "unusual traffic",
      "automated access",
      "enable javascript",
      "browser check",
      "cloudflare",
      "ddos protection",
      "checking your browser",
      "just a moment",
      "please wait while we verify",
      "security check",
      "recaptcha",
      "hcaptcha",
      "px-captcha", // PerimeterX
      "distil", // Distil Networks
      "imperva", // Imperva Incapsula
    ]

    for (const pattern of blockPatterns) {
      if (lowerBody.includes(pattern)) {
        // Make sure it's not just mentioned in an article
        // Check if the page is very short (likely a challenge page)
        if (body.length < SOFT_BLOCK_PAGE_SIZE_THRESHOLD) {
          return true
        }
      }
    }

    // Check for empty or near-empty content that suggests blocking
    const textContent = htmlToText(body)
    if (textContent.length < MIN_TEXT_CONTENT_LENGTH && lowerBody.includes("<script")) {
      // Very little text content but has scripts - likely a challenge page
      return true
    }
  }

  return false
}

/**
 * Reset the idle timeout.
 */
function resetIdleTimeout(): void {
  lastActivityTime = Date.now()

  if (idleTimeoutHandle) {
    clearTimeout(idleTimeoutHandle)
  }

  idleTimeoutHandle = setTimeout(async () => {
    const idleTime = Date.now() - lastActivityTime
    if (idleTime >= activeConfig.idleTimeoutMs && browserInstance) {
      console.log(`Browser idle for ${Math.round(idleTime / 1000)}s, shutting down...`)
      await shutdownBrowser()
    }
  }, activeConfig.idleTimeoutMs)
}

/**
 * Get or create the shared browser instance.
 * Uses lazy initialization and handles reconnection.
 */
async function getBrowser(): Promise<Browser> {
  if (browserInstance?.isConnected()) {
    resetIdleTimeout()
    return browserInstance
  }

  // Avoid race conditions during initialization
  if (browserInitPromise) {
    return browserInitPromise
  }

  browserInitPromise = (async () => {
    // Dynamic import to avoid loading playwright if unused
    const { chromium } = await import("playwright-core")

    console.log("Launching browser for page fetching...")

    // Try to find installed browser
    const executablePath = process.env.BROWSER_EXECUTABLE_PATH

    browserInstance = await chromium.launch({
      headless: HEADLESS,
      executablePath: executablePath || undefined,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-infobars",
        "--window-position=0,0",
        "--ignore-certificate-errors",
        "--ignore-certificate-errors-spki-list",
      ],
    })

    // Handle browser disconnection
    browserInstance.on("disconnected", () => {
      console.log("Browser disconnected")
      browserInstance = null
      browserInitPromise = null
      if (idleTimeoutHandle) {
        clearTimeout(idleTimeoutHandle)
        idleTimeoutHandle = null
      }
    })

    resetIdleTimeout()
    return browserInstance
  })()

  return browserInitPromise
}

/**
 * Shutdown the browser instance.
 * Call this on script termination for cleanup.
 */
export async function shutdownBrowser(): Promise<void> {
  if (idleTimeoutHandle) {
    clearTimeout(idleTimeoutHandle)
    idleTimeoutHandle = null
  }

  if (browserInstance) {
    try {
      await browserInstance.close()
    } catch {
      // Ignore close errors
    }
    browserInstance = null
    browserInitPromise = null
  }
}

// ============================================================================
// Authentication Functions
// ============================================================================

/**
 * Check if authentication is enabled and configured for a URL.
 */
export function isAuthEnabledForUrl(url: string): boolean {
  const authConfig = getBrowserAuthConfig()
  if (!authConfig.enabled) {
    return false
  }

  const site = getSiteFromUrl(url)
  if (!site) {
    return false
  }

  return hasCredentialsForSite(site)
}

/**
 * Detect if a page is showing a paywall.
 */
export async function detectPaywall(page: Page): Promise<PaywallDetectionResult> {
  const url = page.url()
  const site = getSiteFromUrl(url)

  // Paywall indicators by site
  const paywallSelectors: Record<string, string[]> = {
    nytimes: [
      '[data-testid="inline-message"]',
      '[data-testid="gateway-content"]',
      ".gateway-content",
      ".paywall",
      '[class*="paywall"]',
      "#gateway-content",
    ],
    washingtonpost: [
      '[data-qa="paywall-overlay"]',
      ".paywall-overlay",
      '[class*="paywall"]',
      ".subscription-required",
      "#paywall-content",
    ],
  }

  // Generic paywall patterns
  const genericSelectors = [
    ".paywall",
    '[class*="paywall"]',
    '[id*="paywall"]',
    ".subscriber-only",
    ".subscription-required",
    '[data-testid*="paywall"]',
  ]

  const selectorsToCheck = site
    ? [...(paywallSelectors[site] || []), ...genericSelectors]
    : genericSelectors

  for (const selector of selectorsToCheck) {
    try {
      const element = page.locator(selector).first()
      if ((await element.count()) > 0 && (await element.isVisible())) {
        // Check if it's a soft paywall (dismissable) or hard paywall
        // Note: This callback runs in browser context, not Node.js
        const isSoftPaywall = await page.evaluate((sel) => {
          // @ts-expect-error - document is available in browser context
          const el = document.querySelector(sel)
          if (!el) return false
          const text = el.textContent?.toLowerCase() || ""
          return (
            text.includes("free article") ||
            text.includes("register") ||
            text.includes("sign up for free") ||
            text.includes("create account")
          )
        }, selector)

        return {
          detected: true,
          type: isSoftPaywall ? "soft" : "hard",
          site: site || undefined,
        }
      }
    } catch {
      // Continue checking
    }
  }

  // Check for truncated content (common paywall sign)
  try {
    const bodyText = await page.locator("body").textContent()
    const lowerText = (bodyText || "").toLowerCase()

    if (
      lowerText.includes("subscribe to continue") ||
      lowerText.includes("subscribers only") ||
      lowerText.includes("to read the full article") ||
      lowerText.includes("become a subscriber")
    ) {
      return {
        detected: true,
        type: "hard",
        site: site || undefined,
      }
    }
  } catch {
    // Ignore
  }

  return {
    detected: false,
    type: null,
  }
}

/**
 * Get an authenticated browser context for a URL.
 *
 * This function:
 * 1. Checks for existing session cookies
 * 2. Applies them to the context if valid
 * 3. Performs login if needed
 * 4. Saves the session for future use
 *
 * @param url - URL to authenticate for
 * @param browser - Browser instance to create context from
 * @returns Authenticated context with metadata
 */
export async function getAuthenticatedContext(
  url: string,
  browser: Browser
): Promise<AuthenticatedContextResult> {
  const authConfig = getBrowserAuthConfig()
  const domain = getDomainFromUrl(url)
  const site = getSiteFromUrl(url)

  // Create a new context
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
  })

  // If auth is not enabled or no credentials, return basic context
  if (!authConfig.enabled || !site || !hasCredentialsForSite(site)) {
    return {
      context,
      loginPerformed: false,
      sessionRestored: false,
      costUsd: 0,
    }
  }

  // Try to load existing session
  const session = await loadSession(domain)
  if (session) {
    try {
      await applySessionToContext(session, context)
      console.log(`Restored session for ${domain}`)
      return {
        context,
        loginPerformed: false,
        sessionRestored: true,
        costUsd: 0,
        site,
      }
    } catch (error) {
      console.warn(`Failed to apply session for ${domain}:`, error)
      // Continue to login
    }
  }

  // Need to perform login
  const handler = getLoginHandler(domain)
  if (!handler || !handler.hasCredentials()) {
    return {
      context,
      loginPerformed: false,
      sessionRestored: false,
      costUsd: 0,
    }
  }

  // Create a page for login
  const loginPage = await context.newPage()
  let costUsd = 0

  try {
    const result = await handler.login(loginPage, authConfig.captchaSolver)
    costUsd = result.captchaCostUsd || 0

    if (result.success) {
      // Save the session
      await saveSession(domain, context, authConfig.credentials[site]?.email)

      return {
        context,
        loginPerformed: true,
        sessionRestored: false,
        costUsd,
        site,
      }
    } else {
      console.warn(`Login failed for ${domain}: ${result.error}`)
      return {
        context,
        loginPerformed: false,
        sessionRestored: false,
        costUsd,
      }
    }
  } finally {
    await loginPage.close().catch(() => {})
  }
}

/**
 * Handle authentication flow for a page that may require login.
 *
 * @param page - Page that may need authentication
 * @param url - Original URL being fetched
 * @returns true if authentication was successful and page should be re-fetched
 */
export async function handleAuthenticationFlow(page: Page, url: string): Promise<boolean> {
  const authConfig = getBrowserAuthConfig()
  const domain = getDomainFromUrl(url)
  const site = getSiteFromUrl(url)

  if (!authConfig.enabled || !site || !hasCredentialsForSite(site)) {
    return false
  }

  const handler = getLoginHandler(domain)
  if (!handler || !handler.hasCredentials()) {
    return false
  }

  // Check if we're already logged in
  const isLoggedIn = await handler.verifySession(page)
  if (isLoggedIn) {
    return false
  }

  console.log(`Authentication required for ${domain}, performing login...`)

  // Perform login
  const result = await handler.login(page, authConfig.captchaSolver)

  if (result.success) {
    // Save the session for future use
    await saveSession(domain, page.context(), authConfig.credentials[site]?.email)
    return true
  }

  console.warn(`Login failed for ${domain}: ${result.error}`)
  return false
}

/**
 * Fetch a page using a headless browser.
 * Bypasses bot detection by running real JavaScript.
 * Supports authenticated access to paywalled sites.
 *
 * @param url - URL to fetch
 * @param config - Optional browser fetch configuration
 * @param options - Additional options for authentication
 */
export async function browserFetchPage(
  url: string,
  config?: BrowserFetchConfig,
  options?: { useAuth?: boolean }
): Promise<FetchedPage> {
  const cfg = config || activeConfig
  const startTime = Date.now()
  const useAuth = options?.useAuth ?? true

  if (!isBrowserFetchEnabled()) {
    return {
      url,
      title: "",
      content: "",
      contentLength: 0,
      fetchTimeMs: Date.now() - startTime,
      fetchMethod: "browser",
      error: "Browser fetching is disabled",
    }
  }

  let page: Page | null = null
  let context: BrowserContext | null = null
  let authCostUsd = 0

  try {
    const browser = await getBrowser()

    // Check if we should use authenticated context
    if (useAuth && isAuthEnabledForUrl(url)) {
      const authResult = await getAuthenticatedContext(url, browser)
      context = authResult.context
      authCostUsd = authResult.costUsd

      if (authResult.loginPerformed) {
        console.log(`Logged in successfully, cost: $${authCostUsd.toFixed(4)}`)
      } else if (authResult.sessionRestored) {
        console.log("Using restored session")
      }

      page = await context.newPage()
    } else {
      page = await browser.newPage()
    }

    // Set a realistic user agent
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    })

    // Navigate and wait for content
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: cfg.pageTimeoutMs,
    })

    // Wait a bit for JavaScript to render
    await page.waitForTimeout(JS_RENDER_WAIT_MS)

    // Check for CAPTCHA
    const captchaResult = await detectCaptcha(page)
    if (captchaResult.detected) {
      const authConfig = getBrowserAuthConfig()
      if (authConfig.captchaSolver) {
        console.log(`CAPTCHA detected: ${captchaResult.type}, attempting to solve...`)
        const solveResult = await solveCaptcha(page, captchaResult, authConfig.captchaSolver)
        authCostUsd += solveResult.costUsd

        if (solveResult.success) {
          // Wait for page to reload after CAPTCHA
          await page.waitForTimeout(JS_RENDER_WAIT_MS)
        } else {
          console.warn(`CAPTCHA solving failed: ${solveResult.error}`)
        }
      } else {
        console.warn("CAPTCHA detected but no solver configured")
      }
    }

    // Check for paywall and attempt authentication if needed
    const paywallResult = await detectPaywall(page)
    if (paywallResult.detected && paywallResult.type === "hard" && useAuth) {
      console.log(`Paywall detected for ${url}`)

      // Try to authenticate
      const authSuccess = await handleAuthenticationFlow(page, url)
      if (authSuccess) {
        // Re-navigate to the original URL after login
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: cfg.pageTimeoutMs,
        })
        await page.waitForTimeout(JS_RENDER_WAIT_MS)
      }
    }

    // Try to dismiss cookie/paywall modals
    await dismissModals(page)

    // Extract title
    const title = await page.title()

    // Extract main content
    let content = await extractPageContent(page)

    // Truncate if too long
    if (content.length > cfg.maxContentLength) {
      content = content.substring(0, cfg.maxContentLength) + "..."
    }

    resetIdleTimeout()

    return {
      url,
      title,
      content,
      contentLength: content.length,
      fetchTimeMs: Date.now() - startTime,
      fetchMethod: "browser",
    }
  } catch (error) {
    return {
      url,
      title: "",
      content: "",
      contentLength: 0,
      fetchTimeMs: Date.now() - startTime,
      fetchMethod: "browser",
      error: error instanceof Error ? error.message : "Unknown error",
    }
  } finally {
    if (page) {
      await page.close().catch(() => {})
    }
    if (context) {
      await context.close().catch(() => {})
    }
  }
}

/**
 * Try to dismiss common cookie consent and paywall modals.
 */
async function dismissModals(page: Page): Promise<void> {
  const dismissSelectors = [
    // Cookie consent
    '[data-testid="GDPR-accept"]',
    '[aria-label="accept cookies"]',
    '[aria-label="Accept cookies"]',
    '[aria-label="Accept all cookies"]',
    'button:has-text("Accept")',
    'button:has-text("Accept All")',
    'button:has-text("I Accept")',
    'button:has-text("I Agree")',
    'button:has-text("Agree")',
    'button:has-text("Continue")',
    'button:has-text("Got it")',
    'button:has-text("OK")',
    "#onetrust-accept-btn-handler",
    ".accept-cookies",
    ".cookie-accept",
    // Paywall dismiss
    'button:has-text("Maybe later")',
    'button:has-text("No thanks")',
    'button:has-text("Skip")',
    '[aria-label="Close"]',
    '[aria-label="Dismiss"]',
    ".close-modal",
    ".dismiss-button",
  ]

  for (const selector of dismissSelectors) {
    try {
      const button = page.locator(selector).first()
      if ((await button.count()) > 0) {
        await button.click({ timeout: MODAL_BUTTON_TIMEOUT_MS })
        // Wait a moment for modal to close
        await page.waitForTimeout(MODAL_CLOSE_WAIT_MS)
        break
      }
    } catch {
      // Ignore - button not found or click failed
    }
  }
}

/**
 * Extract the main content from a page.
 * Tries article selectors first, then falls back to body.
 */
async function extractPageContent(page: Page): Promise<string> {
  const contentSelectors = [
    "article",
    '[role="main"]',
    '[role="article"]',
    ".story-body",
    ".story-content",
    ".article-body",
    ".article-content",
    ".post-content",
    "#article-body",
    "#story-body",
    "main",
    ".content",
    "#content",
    "body",
  ]

  for (const selector of contentSelectors) {
    try {
      const element = page.locator(selector).first()
      if ((await element.count()) > 0) {
        const text = (await element.textContent()) || ""
        // Clean up whitespace
        const cleaned = text
          .replace(/\s+/g, " ")
          .replace(/\n\s*\n/g, "\n")
          .trim()
        if (cleaned.length > MIN_ARTICLE_CONTENT_LENGTH) {
          return cleaned
        }
      }
    } catch {
      // Try next selector
    }
  }

  // Fallback: get all body text
  try {
    const bodyText = await page.locator("body").textContent()
    return (bodyText || "")
      .replace(/\s+/g, " ")
      .replace(/\n\s*\n/g, "\n")
      .trim()
  } catch {
    return ""
  }
}

/**
 * Register cleanup handler for process termination.
 * Call this at script startup to ensure browser is closed on exit.
 * Safe to call multiple times - handlers are only registered once.
 */
export function registerBrowserCleanup(): void {
  if (cleanupHandlersRegistered) {
    return
  }
  cleanupHandlersRegistered = true

  const cleanup = async () => {
    await shutdownBrowser()
  }

  process.on("SIGINT", async () => {
    await cleanup()
    process.exit(0)
  })

  process.on("SIGTERM", async () => {
    await cleanup()
    process.exit(0)
  })

  process.on("beforeExit", cleanup)
}

// Legacy exports for backward compatibility
export const requiresBrowserFetch = shouldUseBrowserFetch
export const fetchWithBrowser = browserFetchPage
export const closeBrowser = shutdownBrowser
export const isBrowserFetchAvailable = isBrowserFetchEnabled
