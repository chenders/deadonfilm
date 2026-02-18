/**
 * Abstract base class for web search biography sources.
 *
 * Extends BaseBiographySource with common web search functionality adapted
 * for biographical content:
 * - Biography-focused search query templates
 * - Heuristic link selection with biography-specific domain scores
 * - Content cleaning integration (mechanical + optional AI)
 * - Career content filtering
 *
 * Subclasses (Google, Bing, Brave, DuckDuckGo) implement `performSearch()` to
 * return search results, and this base class handles link following, cleaning,
 * and scoring automatically.
 *
 * Modeled on death-sources/sources/web-search-base.ts but adapted for
 * biographical content rather than death information.
 */

import { BaseBiographySource, type BiographyLookupResult } from "../base-source.js"
import type { ActorForBiography, RawBiographySourceData } from "../types.js"
import type { SearchResult, FetchedPage } from "../../death-sources/types.js"
import { fetchPages, extractDomain } from "../../death-sources/link-follower.js"
import {
  mechanicalPreClean,
  aiExtractBiographicalContent,
  shouldPassToSynthesis,
} from "../content-cleaner.js"

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for biography web search behavior.
 */
export interface BiographyWebSearchConfig {
  /** Maximum number of links to follow from search results (default: 3) */
  maxLinksToFollow: number
  /** Use Haiku AI for content extraction in Stage 2 (default: false) */
  useAiCleaning: boolean
  /** Domains to always skip */
  blockedDomains: string[]
}

/**
 * Default configuration for biography web search sources.
 */
const DEFAULT_CONFIG: BiographyWebSearchConfig = {
  maxLinksToFollow: 3,
  useAiCleaning: false,
  blockedDomains: [
    "pinterest.com",
    "amazon.com",
    "ebay.com",
    "etsy.com",
    "alibaba.com",
    "aliexpress.com",
  ],
}

// ============================================================================
// Biography-Specific Domain Scores
// ============================================================================

/**
 * Domain rankings for heuristic link selection.
 * Higher score = more likely to have biographical content (not just career info).
 *
 * Differs from death-sources domain scores:
 * - Biography/reference sites ranked highest
 * - Entertainment trade press ranked lower (career-focused)
 * - Profile/interview sites ranked higher
 */
export const BIO_DOMAIN_SCORES: Record<string, number> = {
  // Biography/reference sites (highest)
  "biography.com": 95,
  "britannica.com": 90,
  "people.com": 85,
  "legacy.com": 80,
  "findagrave.com": 75,

  // Quality news/profiles
  "theguardian.com": 85,
  "nytimes.com": 85,
  "bbc.com": 80,
  "bbc.co.uk": 80,
  "apnews.com": 80,
  "washingtonpost.com": 80,

  // Entertainment (good for personal stories)
  "vanityfair.com": 80,
  "rollingstone.com": 75,
  "ew.com": 70,

  // Entertainment trade (career-focused, lower for bio)
  "variety.com": 50,
  "hollywoodreporter.com": 50,
  "deadline.com": 40,

  // Social media (low quality)
  "twitter.com": 20,
  "x.com": 20,
  "facebook.com": 15,
  "instagram.com": 15,

  // Avoid
  "imdb.com": 15,
  "pinterest.com": 5,
  "amazon.com": 5,
  "youtube.com": 25,
}

// ============================================================================
// Search Query Templates
// ============================================================================

/**
 * Biography-focused search query templates.
 * Each template targets a different aspect of biographical content.
 */
const SEARCH_QUERY_TEMPLATES = [
  (name: string) => `"${name}" childhood OR "early life" OR "grew up" OR education`,
  (name: string) => `"${name}" "before fame" OR "early career" OR "first job"`,
  (name: string) => `"${name}" family parents siblings`,
  (name: string) => `"${name}" interview personal life`,
  (name: string) => `"${name}" "little known" OR "lesser known" OR "fun fact"`,
]

// ============================================================================
// Career Content Filter
// ============================================================================

/**
 * Keywords indicating career-focused content (low biographical value).
 */
const CAREER_KEYWORDS = [
  "filmography",
  "awards",
  "nominations",
  "box office",
  "career",
  "discography",
  "selected works",
  "accolades",
  "grossing",
  "directed by",
  "produced by",
  "cast list",
  "episode list",
  "season",
  "ratings",
]

/**
 * Keywords indicating biographical content (high value).
 */
const BIO_KEYWORDS = [
  "childhood",
  "grew up",
  "born in",
  "early life",
  "parents",
  "family",
  "education",
  "school",
  "married",
  "personal",
  "siblings",
  "divorce",
  "military",
  "before fame",
  "first job",
  "interview",
  "struggled",
  "poverty",
  "scholarship",
]

/**
 * Count non-overlapping occurrences of a substring in a string.
 * Uses indexOf loop to avoid RegExp construction from non-literal strings.
 */
function countOccurrences(text: string, substring: string): number {
  let count = 0
  let pos = 0
  while ((pos = text.indexOf(substring, pos)) !== -1) {
    count++
    pos += substring.length
  }
  return count
}

/**
 * Determine whether a page's content is predominantly career-focused.
 *
 * Compares the density of career keywords against biographical keywords.
 * Returns true if the career keyword density exceeds the bio keyword density
 * by a significant margin, indicating the page is mostly about filmography,
 * awards, etc. rather than personal life.
 *
 * @param text - Cleaned page text to analyze
 * @returns true if the content is career-heavy and should be filtered out
 */
export function isCareerHeavyContent(text: string): boolean {
  if (!text || text.length < 100) return false

  const lowerText = text.toLowerCase()

  let careerCount = 0
  for (const kw of CAREER_KEYWORDS) {
    careerCount += countOccurrences(lowerText, kw.toLowerCase())
  }

  let bioCount = 0
  for (const kw of BIO_KEYWORDS) {
    bioCount += countOccurrences(lowerText, kw.toLowerCase())
  }

  // If no bio keywords at all and career keywords present, it's career-heavy
  if (bioCount === 0 && careerCount > 0) return true

  // Career-heavy if career keywords outnumber bio keywords by 3:1 or more
  if (careerCount >= 3 && bioCount > 0 && careerCount / bioCount >= 3) return true

  return false
}

// ============================================================================
// Link Selection
// ============================================================================

/**
 * Calculate a heuristic score for a search result based on biography relevance.
 *
 * @param result - The search result to score
 * @returns Score from 0-100
 */
function calculateBioHeuristicScore(result: SearchResult): number {
  let score = 50 // Base score

  const domain = result.domain || extractDomain(result.url)

  // Domain score
  if (domain && BIO_DOMAIN_SCORES[domain] !== undefined) {
    score = BIO_DOMAIN_SCORES[domain]
  }

  // Boost for biography-related keywords in title/snippet
  const combinedText = `${result.title} ${result.snippet}`.toLowerCase()

  for (const keyword of BIO_KEYWORDS) {
    if (combinedText.includes(keyword.toLowerCase())) {
      score += 5
    }
  }

  // Boost for profile/biography-related terms
  if (combinedText.includes("biography")) score += 15
  if (combinedText.includes("profile")) score += 10
  if (combinedText.includes("interview")) score += 10
  if (combinedText.includes("early life")) score += 15
  if (combinedText.includes("personal life")) score += 10
  if (combinedText.includes("childhood")) score += 10
  if (combinedText.includes("obituary")) score += 5

  // Penalize for career-heavy terms
  if (combinedText.includes("filmography")) score -= 10
  if (combinedText.includes("box office")) score -= 10
  if (combinedText.includes("awards list")) score -= 10

  return Math.min(100, Math.max(0, score))
}

/**
 * Select the best links from search results using biography heuristics.
 *
 * Filters out blocked domains, scores remaining results by biography
 * relevance, and returns the top N links.
 *
 * @param results - Search results to select from
 * @param maxLinks - Maximum number of links to return
 * @param blockedDomains - Domains to always skip
 * @returns Selected URLs sorted by biography relevance score
 */
export function selectBiographyLinks(
  results: SearchResult[],
  maxLinks: number,
  blockedDomains: string[] = DEFAULT_CONFIG.blockedDomains
): string[] {
  const scoredResults = results
    .map((result) => {
      const domain = result.domain || extractDomain(result.url)
      return { result, domain, score: calculateBioHeuristicScore(result) }
    })
    .filter(({ domain }) => {
      // Skip blocked domains
      return !blockedDomains.some((blocked) => domain.includes(blocked))
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxLinks)

  return scoredResults.map((r) => r.result.url)
}

// ============================================================================
// Abstract Base Class
// ============================================================================

/**
 * Abstract base class for web search biography sources.
 *
 * Subclasses must implement `performSearch()` to call their specific search
 * API and return results. This class handles link following, content cleaning,
 * career filtering, and confidence calculation.
 */
export abstract class BiographyWebSearchBase extends BaseBiographySource {
  /**
   * Web search configuration.
   * Can be updated by the orchestrator when initializing sources.
   */
  protected config: BiographyWebSearchConfig = { ...DEFAULT_CONFIG }

  /**
   * Update the web search configuration.
   */
  setConfig(config: Partial<BiographyWebSearchConfig>): void {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Get the current web search configuration.
   */
  getConfig(): BiographyWebSearchConfig {
    return { ...this.config }
  }

  /**
   * Abstract method: Perform the search and return results.
   * Subclasses implement this to call their specific search API.
   */
  protected abstract performSearch(actor: ActorForBiography): Promise<{
    results: SearchResult[]
    error?: string
  }>

  /**
   * Generate multiple biography-focused search queries for an actor.
   *
   * Returns all query templates filled with the actor's name, providing
   * comprehensive coverage of different biographical aspects.
   */
  getSearchQueries(actor: ActorForBiography): string[] {
    return SEARCH_QUERY_TEMPLATES.map((template) => template(actor.name))
  }

  /**
   * Build a single primary search query for an actor.
   * Uses a rotating template based on the actor ID for variety across actors.
   */
  protected override buildBiographyQuery(actor: ActorForBiography): string {
    const templateIndex = actor.id % SEARCH_QUERY_TEMPLATES.length
    return SEARCH_QUERY_TEMPLATES[templateIndex](actor.name)
  }

  /**
   * Main lookup implementation.
   *
   * 1. Call the abstract performSearch() to get search results
   * 2. Select top links using biography heuristics
   * 3. Fetch selected pages using fetchPages from death-sources link-follower
   * 4. Run each page through mechanicalPreClean
   * 5. Optionally run through aiExtractBiographicalContent if config says so
   * 6. Filter out career-heavy content
   * 7. Combine cleaned content into a single text blob
   * 8. Calculate biographical confidence
   * 9. Return BiographyLookupResult
   */
  protected async performLookup(actor: ActorForBiography): Promise<BiographyLookupResult> {
    const startTime = Date.now()

    // Step 1: Perform the search
    const { results, error } = await this.performSearch(actor)

    if (error || results.length === 0) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: error || "No search results found",
      }
    }

    // Step 2: Select top links using biography heuristics
    const selectedUrls = selectBiographyLinks(
      results,
      this.config.maxLinksToFollow,
      this.config.blockedDomains
    )

    if (selectedUrls.length === 0) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: "No suitable links found after filtering",
      }
    }

    // Step 3: Fetch selected pages
    const pages = await fetchPages(selectedUrls)
    const successfulPages = pages.filter((p: FetchedPage) => !p.error && p.content.length > 100)

    if (successfulPages.length === 0) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: "Failed to fetch any pages",
      }
    }

    // Steps 4-6: Clean content and filter career-heavy pages
    const cleanedTexts: Array<{
      text: string
      url: string
      domain: string
      title: string
    }> = []
    let totalCost = this.isFree ? 0 : this.estimatedCostPerQuery

    for (const page of successfulPages) {
      const domain = extractDomain(page.url)

      // Step 4: Run through mechanical pre-clean
      const cleaned = mechanicalPreClean(page.content)

      if (!cleaned.text || cleaned.text.length < 100) {
        continue
      }

      // Step 5: Optionally run through AI extraction
      if (this.config.useAiCleaning) {
        const aiResult = await aiExtractBiographicalContent(cleaned, actor.name, page.url, domain)

        totalCost += aiResult.costUsd

        // Use AI result if it passes synthesis gate
        if (aiResult.extractedText && shouldPassToSynthesis(aiResult.relevance)) {
          // Step 6: Filter out career-heavy content
          if (!isCareerHeavyContent(aiResult.extractedText)) {
            cleanedTexts.push({
              text: aiResult.extractedText,
              url: page.url,
              domain,
              title: aiResult.articleTitle || page.title,
            })
          }
        }
      } else {
        // Step 6: Filter out career-heavy content (mechanical-only path)
        if (!isCareerHeavyContent(cleaned.text)) {
          cleanedTexts.push({
            text: cleaned.text,
            url: page.url,
            domain,
            title: cleaned.metadata.title || page.title,
          })
        }
      }
    }

    // Step 7: Combine cleaned content
    if (cleanedTexts.length === 0) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: "No biographical content found after cleaning and filtering",
      }
    }

    const combinedText = cleanedTexts
      .map(({ text, url }) => `[Source: ${url}]\n${text}`)
      .join("\n\n---\n\n")

    // Step 8: Calculate biographical confidence
    const confidence = this.calculateBiographicalConfidence(combinedText)

    // Use the first (highest-scoring) page's URL as the primary source
    const primaryPage = cleanedTexts[0]

    // Step 9: Return result
    const sourceData: RawBiographySourceData = {
      sourceName: this.name,
      sourceType: this.type,
      text: combinedText,
      url: primaryPage.url,
      confidence,
      reliabilityTier: this.reliabilityTier,
      reliabilityScore: this.reliabilityScore,
      domain: primaryPage.domain,
      articleTitle: primaryPage.title,
      contentType: "biography",
    }

    return {
      success: true,
      source: {
        ...this.createSourceEntry(startTime, confidence, {
          url: primaryPage.url,
          domain: primaryPage.domain,
          articleTitle: primaryPage.title,
          contentType: "biography",
          rawData: {
            pagesFollowed: selectedUrls.length,
            pagesFetched: successfulPages.length,
            pagesAfterCleaning: cleanedTexts.length,
          },
        }),
        costUsd: totalCost,
      },
      data: sourceData,
    }
  }

  /**
   * Helper to add domain to search results if not present.
   */
  protected addDomainToResults(results: SearchResult[]): SearchResult[] {
    return results.map((result) => ({
      ...result,
      domain: result.domain || extractDomain(result.url),
    }))
  }
}
