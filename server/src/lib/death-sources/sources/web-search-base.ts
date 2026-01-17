/**
 * Abstract base class for web search data sources.
 *
 * Extends BaseDataSource with common web search functionality:
 * - Standardized search result format
 * - Link following with AI or heuristic selection
 * - Page fetching and content extraction
 * - Cost tracking for link operations
 *
 * Subclasses (DuckDuckGo, Google, Bing) implement `performSearch()` to return
 * search results, and this base class handles link following automatically.
 */

import { BaseDataSource, DEATH_KEYWORDS } from "../base-source.js"
import type {
  ActorForEnrichment,
  SourceLookupResult,
  EnrichedDeathInfo,
  SearchResult,
  LinkFollowConfig,
} from "../types.js"
import { followLinksAndExtract, extractDomain } from "../link-follower.js"

/**
 * Default link follow configuration.
 */
const DEFAULT_CONFIG: LinkFollowConfig = {
  enabled: true,
  maxLinksPerActor: 3,
  maxCostPerActor: 0.01,
  aiLinkSelection: false,
  aiContentExtraction: false,
}

/**
 * Abstract base class for web search sources.
 */
export abstract class WebSearchBase extends BaseDataSource {
  /**
   * Link following configuration.
   * Can be set by the orchestrator when initializing sources.
   */
  protected linkFollowConfig: LinkFollowConfig = DEFAULT_CONFIG

  /**
   * Set link following configuration.
   */
  setLinkFollowConfig(config: Partial<LinkFollowConfig>): void {
    this.linkFollowConfig = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Get current link following configuration.
   */
  getLinkFollowConfig(): LinkFollowConfig {
    return this.linkFollowConfig
  }

  /**
   * Abstract method: Perform the search and return results.
   * Subclasses implement this to call their specific search API.
   */
  protected abstract performSearch(actor: ActorForEnrichment): Promise<{
    results: SearchResult[]
    error?: string
  }>

  /**
   * Main lookup implementation.
   * Performs search, optionally follows links, and extracts death info.
   */
  protected async performLookup(actor: ActorForEnrichment): Promise<SourceLookupResult> {
    const startTime = Date.now()

    console.log(`${this.name} search for: ${actor.name}`)

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

    console.log(`  Found ${results.length} search results`)

    // Step 2: Follow links if enabled
    let deathInfo: EnrichedDeathInfo | null = null
    let totalCostUsd = this.estimatedCostPerQuery
    let linksFollowed = 0
    let pagesFetched = 0

    if (this.linkFollowConfig.enabled) {
      const followResult = await followLinksAndExtract(results, actor.name, this.linkFollowConfig)

      linksFollowed = followResult.linksFollowed
      pagesFetched = followResult.pagesFetched
      totalCostUsd += followResult.totalCostUsd

      console.log(`  Followed ${linksFollowed} links, fetched ${pagesFetched} pages`)

      if (followResult.extraction.confidence > 0) {
        deathInfo = {
          circumstances: followResult.extraction.circumstances,
          rumoredCircumstances: null,
          notableFactors: followResult.extraction.notableFactors,
          relatedCelebrities: [],
          locationOfDeath: followResult.extraction.locationOfDeath,
          additionalContext: null,
        }
      }
    }

    // Step 3: If no link following, extract from snippets
    if (!deathInfo) {
      deathInfo = this.extractFromSnippets(results, actor)
    }

    // Calculate confidence
    const confidence = this.calculateSearchConfidence(results, deathInfo)

    console.log(
      `  Confidence: ${(confidence * 100).toFixed(0)}%, Cost: $${totalCostUsd.toFixed(4)}`
    )

    if (confidence === 0 || !deathInfo?.circumstances) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, undefined, undefined, {
          resultsCount: results.length,
          linksFollowed,
          pagesFetched,
        }),
        data: null,
        error: "No death information found in search results",
      }
    }

    return {
      success: true,
      source: {
        ...this.createSourceEntry(startTime, confidence, undefined, undefined, {
          resultsCount: results.length,
          linksFollowed,
          pagesFetched,
        }),
        costUsd: totalCostUsd,
      },
      data: deathInfo,
    }
  }

  /**
   * Extract death information from search result snippets.
   * Used as fallback when link following is disabled or returns nothing.
   */
  protected extractFromSnippets(
    results: SearchResult[],
    actor: ActorForEnrichment
  ): EnrichedDeathInfo | null {
    // Combine relevant snippets
    const relevantSnippets: string[] = []

    for (const result of results) {
      const combinedText = `${result.title} ${result.snippet}`.toLowerCase()

      // Check if snippet is likely about death
      const hasDeath = DEATH_KEYWORDS.some((kw) => combinedText.includes(kw.toLowerCase()))
      const hasActor =
        combinedText.includes(actor.name.toLowerCase()) ||
        combinedText.includes(actor.name.split(" ")[0].toLowerCase())

      if (hasDeath && hasActor) {
        relevantSnippets.push(result.snippet)
      }
    }

    if (relevantSnippets.length === 0) {
      return null
    }

    // Extract notable factors
    const combinedText = relevantSnippets.join(" ").toLowerCase()
    const notableFactors: string[] = []

    if (combinedText.includes("suicide")) notableFactors.push("suicide")
    if (combinedText.includes("overdose")) notableFactors.push("overdose")
    if (combinedText.includes("murder") || combinedText.includes("homicide"))
      notableFactors.push("homicide")
    if (combinedText.includes("accident")) notableFactors.push("accident")
    if (combinedText.includes("cancer")) notableFactors.push("cancer")
    if (combinedText.includes("heart")) notableFactors.push("heart_disease")

    return {
      circumstances: relevantSnippets.slice(0, 3).join(" "),
      rumoredCircumstances: null,
      notableFactors,
      relatedCelebrities: [],
      locationOfDeath: null,
      additionalContext: null,
    }
  }

  /**
   * Calculate confidence based on search results and extracted info.
   */
  protected calculateSearchConfidence(
    results: SearchResult[],
    deathInfo: EnrichedDeathInfo | null
  ): number {
    if (!deathInfo?.circumstances) {
      return 0
    }

    let confidence = 0.3 // Base confidence for having results

    // More results = higher confidence
    if (results.length >= 5) confidence += 0.1
    if (results.length >= 10) confidence += 0.1

    // Notable factors increase confidence
    if (deathInfo.notableFactors.length > 0) {
      confidence += Math.min(0.2, deathInfo.notableFactors.length * 0.05)
    }

    // Location adds confidence
    if (deathInfo.locationOfDeath) {
      confidence += 0.1
    }

    // Longer circumstances text suggests more detail
    if (deathInfo.circumstances.length > 200) {
      confidence += 0.1
    }
    if (deathInfo.circumstances.length > 500) {
      confidence += 0.1
    }

    return Math.min(0.8, confidence) // Cap at 0.8 for search results
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

  /**
   * Build a web search query for an actor's death.
   */
  protected buildSearchQuery(actor: ActorForEnrichment): string {
    const deathYear = actor.deathday ? new Date(actor.deathday).getFullYear() : null
    const yearStr = deathYear ? ` ${deathYear}` : ""
    return `"${actor.name}" death cause${yearStr}`
  }
}
