/**
 * Link Follower module for enhanced web search enrichment.
 *
 * Provides functionality to:
 * 1. Select promising links from search results (AI or heuristic-based)
 * 2. Fetch page content from selected URLs
 * 3. Extract death information from fetched content (AI or regex-based)
 *
 * All operations track costs and respect configured limits.
 */

import Anthropic from "@anthropic-ai/sdk"
import type {
  SearchResult,
  LinkFollowConfig,
  FetchedPage,
  LinkSelectionResult,
  ContentExtractionResult,
  BrowserFetchConfig,
} from "./types.js"
import { DEFAULT_BROWSER_FETCH_CONFIG } from "./types.js"
import { htmlToText } from "./html-utils.js"
import { extractArticleContent } from "../shared/readability-extract.js"
import { DEATH_KEYWORDS, CIRCUMSTANCE_KEYWORDS } from "./base-source.js"
import { shouldUseBrowserFetch, isBlockedResponse, browserFetchPage } from "./browser-fetch.js"
import { shouldUseArchiveFallback, searchArchiveIsWithBrowser } from "./archive-fallback.js"
import { getBrowserAuthConfig } from "./browser-auth/config.js"
import { WashingtonPostLoginHandler } from "./browser-auth/login-handlers/washingtonpost.js"
import { loadSession, saveSession, applySessionToContext } from "./browser-auth/session-manager.js"
import { chromium } from "playwright-core"

import { consoleLog } from "./logger.js"

// Claude model for link operations (use a cheaper model than cleanup)
const LINK_MODEL_ID = "claude-sonnet-4-20250514"
const MAX_TOKENS = 1000

// Cost per million tokens (Sonnet 4)
const INPUT_COST_PER_MILLION = 3
const OUTPUT_COST_PER_MILLION = 15

// Fetch timeouts and limits
const FETCH_TIMEOUT_MS = 10000
const MAX_CONTENT_LENGTH = 100000 // 100KB max per page

/**
 * Domain rankings for heuristic link selection.
 * Higher score = more likely to have death information.
 */
const DOMAIN_SCORES: Record<string, number> = {
  // News - excellent death coverage
  "cnn.com": 90,
  "bbc.com": 90,
  "bbc.co.uk": 90,
  "nytimes.com": 90,
  "washingtonpost.com": 85,
  "theguardian.com": 85,
  "reuters.com": 85,
  "apnews.com": 85,
  "latimes.com": 80,
  "usatoday.com": 75,
  "nbcnews.com": 80,
  "cbsnews.com": 80,
  "abcnews.go.com": 80,
  "foxnews.com": 75,

  // Entertainment news
  "variety.com": 90,
  "hollywoodreporter.com": 90,
  "deadline.com": 90,
  "ew.com": 85,
  "people.com": 85,
  "tmz.com": 80,
  "eonline.com": 75,
  "usmagazine.com": 70,

  // Obituary sites
  "legacy.com": 95,
  "tributes.com": 90,
  "findagrave.com": 85,
  "obituaries.com": 85,

  // Reference
  "britannica.com": 80,
  "biography.com": 80,

  // Social media (lower quality)
  "twitter.com": 40,
  "x.com": 40,
  "facebook.com": 30,
  "instagram.com": 30,

  // Sites to avoid (often irrelevant)
  "imdb.com": 20, // Usually doesn't have death details
  "pinterest.com": 5,
  "amazon.com": 5,
  "ebay.com": 5,
  "youtube.com": 30,
}

/**
 * Domains to always skip (blocked by default).
 */
const DEFAULT_BLOCKED_DOMAINS = [
  "pinterest.com",
  "amazon.com",
  "ebay.com",
  "etsy.com",
  "alibaba.com",
  "aliexpress.com",
]

/**
 * Extract domain from URL.
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

/**
 * Calculate heuristic score for a search result.
 */
function calculateHeuristicScore(result: SearchResult): number {
  let score = 50 // Base score

  const domain = result.domain || extractDomain(result.url)

  // Domain score
  if (domain && DOMAIN_SCORES[domain]) {
    score = DOMAIN_SCORES[domain]
  }

  // Boost for death-related keywords in title/snippet
  const combinedText = `${result.title} ${result.snippet}`.toLowerCase()

  for (const keyword of DEATH_KEYWORDS) {
    if (combinedText.includes(keyword.toLowerCase())) {
      score += 5
    }
  }

  for (const keyword of CIRCUMSTANCE_KEYWORDS) {
    if (combinedText.includes(keyword.toLowerCase())) {
      score += 3
    }
  }

  // Boost for obituary-related terms
  if (combinedText.includes("obituary") || combinedText.includes("obit")) {
    score += 15
  }
  if (combinedText.includes("cause of death")) {
    score += 20
  }
  if (combinedText.includes("died") || combinedText.includes("death")) {
    score += 10
  }

  return Math.min(100, score)
}

/**
 * Select links using heuristic scoring (no AI cost).
 */
export function selectLinksWithHeuristics(
  results: SearchResult[],
  maxLinks: number,
  config?: Partial<LinkFollowConfig>
): LinkSelectionResult {
  const blockedDomains = config?.blockedDomains || DEFAULT_BLOCKED_DOMAINS
  const allowedDomains = config?.allowedDomains

  // Filter and score results
  const scoredResults = results
    .map((result) => {
      const domain = result.domain || extractDomain(result.url)
      return { result, domain, score: calculateHeuristicScore(result) }
    })
    .filter(({ domain }) => {
      // Skip blocked domains
      if (blockedDomains.some((blocked) => domain.includes(blocked))) {
        return false
      }
      // If allowlist specified, only include those
      if (allowedDomains && allowedDomains.length > 0) {
        return allowedDomains.some((allowed) => domain.includes(allowed))
      }
      return true
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxLinks)

  return {
    selectedUrls: scoredResults.map((r) => r.result.url),
    reasoning: `Selected top ${scoredResults.length} links by heuristic score`,
    costUsd: 0,
  }
}

/**
 * Select links using Claude AI for intelligent ranking.
 */
export async function selectLinksWithAI(
  results: SearchResult[],
  actorName: string,
  maxLinks: number,
  config?: Partial<LinkFollowConfig>
): Promise<LinkSelectionResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("ANTHROPIC_API_KEY not set, falling back to heuristic selection")
    return selectLinksWithHeuristics(results, maxLinks, config)
  }

  const blockedDomains = config?.blockedDomains || DEFAULT_BLOCKED_DOMAINS

  // Pre-filter blocked domains
  const filteredResults = results.filter((result) => {
    const domain = result.domain || extractDomain(result.url)
    return !blockedDomains.some((blocked) => domain.includes(blocked))
  })

  if (filteredResults.length === 0) {
    return { selectedUrls: [], costUsd: 0 }
  }

  const anthropic = new Anthropic()

  const resultsText = filteredResults
    .map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   Snippet: ${r.snippet}`)
    .join("\n\n")

  const prompt = `You are selecting web pages most likely to contain detailed death information for the actor "${actorName}".

Search Results:
${resultsText}

Select the top ${maxLinks} URLs most likely to contain:
- Cause of death
- Circumstances of death
- Date and location of death
- Medical details
- Obituary information

Prefer:
- News articles from reputable sources
- Obituary pages
- Biographical articles with death sections

Avoid:
- Fan sites or forums
- Shopping pages
- Social media profiles
- Pages that only mention the person briefly

Respond with JSON only:
{
  "selectedUrls": ["url1", "url2", ...],
  "reasoning": "Brief explanation of selections"
}`

  try {
    const response = await anthropic.messages.create({
      model: LINK_MODEL_ID,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    })

    // Calculate cost
    const inputTokens = response.usage.input_tokens
    const outputTokens = response.usage.output_tokens
    const costUsd =
      (inputTokens * INPUT_COST_PER_MILLION) / 1_000_000 +
      (outputTokens * OUTPUT_COST_PER_MILLION) / 1_000_000

    // Parse response
    const textBlock = response.content.find((block) => block.type === "text")
    if (!textBlock || textBlock.type !== "text") {
      console.warn("No text response from Claude for link selection")
      return selectLinksWithHeuristics(results, maxLinks, config)
    }

    // Strip markdown fences if present
    let jsonText = textBlock.text.trim()
    if (jsonText.startsWith("```")) {
      const match = jsonText.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```/)
      if (match) {
        jsonText = match[1].trim()
      }
    }

    const parsed = JSON.parse(jsonText) as {
      selectedUrls: string[]
      reasoning?: string
    }

    return {
      selectedUrls: parsed.selectedUrls.slice(0, maxLinks),
      reasoning: parsed.reasoning,
      costUsd,
    }
  } catch (error) {
    console.warn("AI link selection failed, falling back to heuristics:", error)
    return selectLinksWithHeuristics(results, maxLinks, config)
  }
}

/**
 * Check if URL is a Washington Post URL.
 */
function isWashingtonPostUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    return hostname === "washingtonpost.com" || hostname.endsWith(".washingtonpost.com")
  } catch {
    return false
  }
}

/**
 * Fetch a Washington Post article using authenticated browser session.
 * Uses session persistence to avoid logging in every time.
 * Returns error result (doesn't throw) so caller can fall back to archive.is.
 */
async function fetchWithWapoAuth(url: string): Promise<FetchedPage> {
  const startTime = Date.now()
  const authConfig = getBrowserAuthConfig()
  const loginHandler = new WashingtonPostLoginHandler()

  if (!loginHandler.hasCredentials()) {
    return {
      url,
      title: "",
      content: "",
      contentLength: 0,
      fetchTimeMs: Date.now() - startTime,
      fetchMethod: "browser",
      error: "No WaPo credentials configured",
    }
  }

  let browser
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined,
    })
  } catch (error) {
    return {
      url,
      title: "",
      content: "",
      contentLength: 0,
      fetchTimeMs: Date.now() - startTime,
      fetchMethod: "browser",
      error: `Failed to launch browser: ${error instanceof Error ? error.message : "Unknown error"}`,
    }
  }

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 900 },
    })

    const page = await context.newPage()

    // Try to use existing session first
    const existingSession = await loadSession("washingtonpost.com")
    let needsLogin = true

    if (existingSession) {
      consoleLog(`  Using saved WaPo session...`)
      await applySessionToContext(existingSession, context)

      // Navigate directly to article and check if we're logged in
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })
        await page.waitForTimeout(2000)

        // Verify session is still valid by checking for paywall/login indicators
        const pageContent = await page.content()
        const hasPaywall =
          pageContent.includes("Already a subscriber?") ||
          pageContent.includes("Subscribe to continue") ||
          pageContent.includes("subscription required")

        if (!hasPaywall) {
          needsLogin = false
          consoleLog(`  Session valid, no login needed`)
        } else {
          consoleLog(`  Session expired, logging in again...`)
        }
      } catch (navError) {
        // Navigation failed (HTTP/2 error, timeout, etc.) - return error to trigger fallback
        const errorMsg = navError instanceof Error ? navError.message : "Unknown navigation error"
        consoleLog(`  Navigation failed: ${errorMsg}`)
        return {
          url,
          title: "",
          content: "",
          contentLength: 0,
          fetchTimeMs: Date.now() - startTime,
          fetchMethod: "browser",
          error: `Navigation failed: ${errorMsg}`,
        }
      }
    }

    if (needsLogin) {
      consoleLog(`  Logging into Washington Post...`)
      const loginResult = await loginHandler.login(page, authConfig.captchaSolver)

      if (!loginResult.success) {
        return {
          url,
          title: "",
          content: "",
          contentLength: 0,
          fetchTimeMs: Date.now() - startTime,
          fetchMethod: "browser",
          error: `WaPo login failed: ${loginResult.error}`,
        }
      }

      // Save session for future use
      await saveSession("washingtonpost.com", context)

      // Navigate to the article after login
      consoleLog(`  Fetching article...`)
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })
        await page.waitForTimeout(2000)
      } catch (navError) {
        const errorMsg = navError instanceof Error ? navError.message : "Unknown navigation error"
        consoleLog(`  Navigation failed after login: ${errorMsg}`)
        return {
          url,
          title: "",
          content: "",
          contentLength: 0,
          fetchTimeMs: Date.now() - startTime,
          fetchMethod: "browser",
          error: `Navigation failed: ${errorMsg}`,
        }
      }
    }

    const title = await page.title()

    // Extract article content — try Readability on full page first, fall back to htmlToText
    const fullPageHtml = await page.content().catch(() => "")
    const readabilityResult = fullPageHtml ? extractArticleContent(fullPageHtml, url) : null
    let content = ""
    if (readabilityResult && readabilityResult.text.length >= 200) {
      content = readabilityResult.text
    } else {
      const articleHtml = await page
        .locator("article")
        .first()
        .innerHTML()
        .catch(() => null)
      if (articleHtml) {
        content = htmlToText(articleHtml)
      } else {
        const mainHtml = await page
          .locator("main, .article-body, [data-feature='article-body']")
          .first()
          .innerHTML()
          .catch(() => "")
        content = htmlToText(mainHtml)
      }
    }

    // Truncate if too long
    if (content.length > MAX_CONTENT_LENGTH) {
      content = content.substring(0, MAX_CONTENT_LENGTH) + "..."
    }

    return {
      url,
      title,
      content,
      contentLength: content.length,
      fetchTimeMs: Date.now() - startTime,
      fetchMethod: "browser",
    }
  } catch (error) {
    // Catch-all for any unexpected errors
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
    await browser.close()
  }
}

/**
 * Fetch a single page and extract text content.
 * Uses authenticated browser for WaPo, archive.is for other paywalled domains,
 * browser fetching for bot-protected domains, or falls back to regular fetch.
 */
async function fetchPage(url: string, browserConfig?: BrowserFetchConfig): Promise<FetchedPage> {
  const startTime = Date.now()
  const config = browserConfig || DEFAULT_BROWSER_FETCH_CONFIG

  // For Washington Post, try authenticated browser fetch first
  if (isWashingtonPostUrl(url)) {
    consoleLog(`  Trying authenticated fetch for WaPo URL: ${url}`)
    const wapoResult = await fetchWithWapoAuth(url)

    if (wapoResult.content.length > 500) {
      consoleLog(`  WaPo auth success: ${wapoResult.contentLength} chars`)
      return wapoResult
    } else {
      consoleLog(`  WaPo auth failed: ${wapoResult.error || "No content"}, trying archive.is...`)
      // Fall through to archive.is
    }
  }

  // For other paywalled domains (like NYTimes), try archive.is
  if (shouldUseArchiveFallback(url)) {
    consoleLog(`  Trying archive.is for paywalled URL: ${url}`)
    const archiveResult = await searchArchiveIsWithBrowser(url)

    if (archiveResult.success && archiveResult.content.length > 500) {
      consoleLog(`  Archive.is success: ${archiveResult.contentLength} chars`)
      return {
        url,
        title: archiveResult.title,
        content: archiveResult.content,
        contentLength: archiveResult.contentLength,
        fetchTimeMs: Date.now() - startTime,
        fetchMethod: "archive.is",
        archiveUrl: archiveResult.archiveUrl || undefined,
      }
    } else {
      consoleLog(`  Archive.is failed: ${archiveResult.error || "No content"}`)
      // Fall through to other methods
    }
  }

  // Check if domain should always use browser
  if (config.enabled && shouldUseBrowserFetch(url, config)) {
    return browserFetchPage(url, config)
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    })

    clearTimeout(timeoutId)

    // Check for blocking status codes
    if (!response.ok) {
      // If blocked and fallback is enabled, try browser
      if (config.enabled && config.fallbackOnBlock && isBlockedResponse(response.status)) {
        return browserFetchPage(url, config)
      }

      return {
        url,
        title: "",
        content: "",
        contentLength: 0,
        fetchTimeMs: Date.now() - startTime,
        fetchMethod: "fetch",
        error: `HTTP ${response.status}`,
      }
    }

    const html = await response.text()

    // Check for soft blocks in HTML content
    if (config.enabled && config.fallbackOnBlock && isBlockedResponse(200, html)) {
      return browserFetchPage(url, config)
    }

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const title = titleMatch ? titleMatch[1].trim() : ""

    // Convert to text — try Readability first, fall back to htmlToText
    const readabilityArticle = extractArticleContent(html, url)
    let content =
      readabilityArticle && readabilityArticle.text.length >= 200
        ? readabilityArticle.text
        : htmlToText(html)

    // Truncate if too long
    if (content.length > MAX_CONTENT_LENGTH) {
      content = content.substring(0, MAX_CONTENT_LENGTH) + "..."
    }

    return {
      url,
      title,
      content,
      contentLength: content.length,
      fetchTimeMs: Date.now() - startTime,
      fetchMethod: "fetch",
    }
  } catch (error) {
    // On network errors, try browser if fallback is enabled
    if (config.enabled && config.fallbackOnBlock) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error"
      // Don't retry for abort errors (timeout)
      if (!errorMsg.includes("abort")) {
        return browserFetchPage(url, config)
      }
    }

    return {
      url,
      title: "",
      content: "",
      contentLength: 0,
      fetchTimeMs: Date.now() - startTime,
      fetchMethod: "fetch",
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Fetch multiple pages in parallel.
 */
export async function fetchPages(
  urls: string[],
  browserConfig?: BrowserFetchConfig
): Promise<FetchedPage[]> {
  const results = await Promise.all(urls.map((url) => fetchPage(url, browserConfig)))
  return results
}

/**
 * Extract death information using Claude AI.
 */
export async function extractWithAI(
  pages: FetchedPage[],
  actorName: string
): Promise<ContentExtractionResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("ANTHROPIC_API_KEY not set, falling back to regex extraction")
    return extractWithRegex(pages, actorName)
  }

  // Filter out failed pages and combine content
  const successfulPages = pages.filter((p) => !p.error && p.content.length > 100)

  if (successfulPages.length === 0) {
    return {
      circumstances: null,
      causeOfDeath: null,
      dateOfDeath: null,
      locationOfDeath: null,
      notableFactors: [],
      confidence: 0,
      costUsd: 0,
    }
  }

  const anthropic = new Anthropic()

  // Combine content with source labels
  const combinedContent = successfulPages
    .map((p) => `=== Source: ${p.url} ===\n${p.content.substring(0, 20000)}`)
    .join("\n\n")

  const prompt = `Extract death information for "${actorName}" from the following web page content.

${combinedContent}

Extract any available death information and respond with JSON only:
{
  "circumstances": "Detailed narrative of the death circumstances, or null if not found",
  "causeOfDeath": "Specific medical cause (e.g., 'heart attack', 'cancer'), or null if not found",
  "dateOfDeath": "Date in YYYY-MM-DD format if found, or null",
  "locationOfDeath": "City, State/Country where they died, or null if not found",
  "notableFactors": ["array of notable aspects like 'suicide', 'overdose', 'on_set', 'vehicle_crash', etc."],
  "confidence": 0.0-1.0 based on how much information was found and its reliability
}

IMPORTANT:
- Only include information that is clearly about this person's death
- Use null for any field where information is not found
- Be factual and avoid speculation
- Confidence should reflect the quality and quantity of information found`

  try {
    const response = await anthropic.messages.create({
      model: LINK_MODEL_ID,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    })

    // Calculate cost
    const inputTokens = response.usage.input_tokens
    const outputTokens = response.usage.output_tokens
    const costUsd =
      (inputTokens * INPUT_COST_PER_MILLION) / 1_000_000 +
      (outputTokens * OUTPUT_COST_PER_MILLION) / 1_000_000

    // Parse response
    const textBlock = response.content.find((block) => block.type === "text")
    if (!textBlock || textBlock.type !== "text") {
      console.warn("No text response from Claude for content extraction")
      return extractWithRegex(pages, actorName)
    }

    // Strip markdown fences if present
    let jsonText = textBlock.text.trim()
    if (jsonText.startsWith("```")) {
      const match = jsonText.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```/)
      if (match) {
        jsonText = match[1].trim()
      }
    }

    const parsed = JSON.parse(jsonText) as ContentExtractionResult

    return {
      ...parsed,
      costUsd,
    }
  } catch (error) {
    console.warn("AI content extraction failed, falling back to regex:", error)
    return extractWithRegex(pages, actorName)
  }
}

/**
 * Extract death information using regex patterns (fallback, no AI cost).
 */
export function extractWithRegex(pages: FetchedPage[], actorName: string): ContentExtractionResult {
  const successfulPages = pages.filter((p) => !p.error && p.content.length > 100)

  if (successfulPages.length === 0) {
    return {
      circumstances: null,
      causeOfDeath: null,
      dateOfDeath: null,
      locationOfDeath: null,
      notableFactors: [],
      confidence: 0,
      costUsd: 0,
    }
  }

  // Combine all content
  const combinedContent = successfulPages.map((p) => p.content).join(" ")
  const lowerContent = combinedContent.toLowerCase()

  // Find sentences containing death-related keywords
  const sentences = combinedContent.split(/[.!?]+/)
  const relevantSentences: string[] = []

  const actorFirstName = actorName.split(" ")[0].toLowerCase()
  const actorLastName = actorName.split(" ").slice(-1)[0].toLowerCase()

  for (const sentence of sentences) {
    const lowerSentence = sentence.toLowerCase()

    // Check if sentence is about this actor's death
    const mentionsActor =
      lowerSentence.includes(actorFirstName) || lowerSentence.includes(actorLastName)

    const mentionsDeath = DEATH_KEYWORDS.some((kw) => lowerSentence.includes(kw.toLowerCase()))

    if (mentionsActor && mentionsDeath) {
      relevantSentences.push(sentence.trim())
    }
  }

  // Extract notable factors
  const notableFactors: string[] = []

  if (
    lowerContent.includes("suicide") ||
    lowerContent.includes("took his own life") ||
    lowerContent.includes("took her own life")
  ) {
    notableFactors.push("suicide")
  }
  if (lowerContent.includes("overdose")) {
    notableFactors.push("overdose")
  }
  if (lowerContent.includes("murder") || lowerContent.includes("homicide")) {
    notableFactors.push("homicide")
  }
  if (
    lowerContent.includes("car crash") ||
    lowerContent.includes("vehicle") ||
    lowerContent.includes("accident")
  ) {
    notableFactors.push("vehicle_crash")
  }
  if (lowerContent.includes("on set") || lowerContent.includes("during filming")) {
    notableFactors.push("on_set")
  }
  if (lowerContent.includes("cancer")) {
    notableFactors.push("cancer")
  }
  if (lowerContent.includes("heart attack") || lowerContent.includes("cardiac")) {
    notableFactors.push("heart_disease")
  }

  // Calculate confidence based on relevance
  const confidence = Math.min(0.6, 0.2 + relevantSentences.length * 0.1)

  return {
    circumstances:
      relevantSentences.length > 0 ? relevantSentences.slice(0, 5).join(". ") + "." : null,
    causeOfDeath: null, // Hard to extract reliably with regex
    dateOfDeath: null, // Hard to extract reliably with regex
    locationOfDeath: null, // Hard to extract reliably with regex
    notableFactors,
    confidence,
    costUsd: 0,
  }
}

/**
 * Main entry point: Follow links and extract death information.
 */
export async function followLinksAndExtract(
  results: SearchResult[],
  actorName: string,
  config: LinkFollowConfig
): Promise<{
  extraction: ContentExtractionResult
  linksFollowed: number
  pagesFetched: number
  totalCostUsd: number
}> {
  if (!config.enabled || results.length === 0) {
    return {
      extraction: {
        circumstances: null,
        causeOfDeath: null,
        dateOfDeath: null,
        locationOfDeath: null,
        notableFactors: [],
        confidence: 0,
        costUsd: 0,
      },
      linksFollowed: 0,
      pagesFetched: 0,
      totalCostUsd: 0,
    }
  }

  let totalCostUsd = 0

  // Step 1: Select links (AI or heuristic)
  let selection: LinkSelectionResult

  if (config.aiLinkSelection) {
    selection = await selectLinksWithAI(results, actorName, config.maxLinksPerActor, config)
    totalCostUsd += selection.costUsd

    // Check cost limit
    if (totalCostUsd > config.maxCostPerActor) {
      console.warn(
        `Link following cost limit exceeded after selection: $${totalCostUsd.toFixed(4)}`
      )
      return {
        extraction: {
          circumstances: null,
          causeOfDeath: null,
          dateOfDeath: null,
          locationOfDeath: null,
          notableFactors: [],
          confidence: 0,
          costUsd: 0,
        },
        linksFollowed: 0,
        pagesFetched: 0,
        totalCostUsd,
      }
    }
  } else {
    selection = selectLinksWithHeuristics(results, config.maxLinksPerActor, config)
  }

  if (selection.selectedUrls.length === 0) {
    return {
      extraction: {
        circumstances: null,
        causeOfDeath: null,
        dateOfDeath: null,
        locationOfDeath: null,
        notableFactors: [],
        confidence: 0,
        costUsd: 0,
      },
      linksFollowed: 0,
      pagesFetched: 0,
      totalCostUsd,
    }
  }

  // Step 2: Fetch pages (with browser fallback for protected sites)
  const pages = await fetchPages(selection.selectedUrls, config.browserFetch)
  const successfulPages = pages.filter((p) => !p.error)

  // Step 3: Extract content (AI or regex)
  let extraction: ContentExtractionResult

  if (config.aiContentExtraction && successfulPages.length > 0) {
    extraction = await extractWithAI(pages, actorName)
    totalCostUsd += extraction.costUsd
  } else {
    extraction = extractWithRegex(pages, actorName)
  }

  return {
    extraction,
    linksFollowed: selection.selectedUrls.length,
    pagesFetched: successfulPages.length,
    totalCostUsd,
  }
}
