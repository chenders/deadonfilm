/**
 * Type definitions for multi-source death enrichment system.
 *
 * This module provides types for tracking death information from multiple sources
 * including structured databases, web searches, news sites, and AI models.
 */

// ============================================================================
// Data Source Types
// ============================================================================

/**
 * All possible data sources for death information.
 * Organized by category for clarity.
 */
export enum DataSourceType {
  // AI Models
  CLAUDE = "claude",
  CLAUDE_BATCH = "claude_batch",
  OPENAI_GPT4O = "openai_gpt4o",
  OPENAI_GPT4O_MINI = "openai_gpt4o_mini",
  PERPLEXITY = "perplexity",
  GEMINI_PRO = "gemini_pro",
  GEMINI_FLASH = "gemini_flash",
  GROK = "grok",
  DEEPSEEK = "deepseek",
  MISTRAL = "mistral",
  LLAMA_GROQ = "llama_groq",

  // Structured Data
  WIKIDATA = "wikidata",
  WIKIPEDIA = "wikipedia",
  IMDB = "imdb",
  TMDB = "tmdb",

  // Film Industry Archives
  TELEVISION_ACADEMY = "television_academy",
  IBDB = "ibdb",
  BFI_SIGHT_SOUND = "bfi_sight_sound",

  // Cemetery/Obituary
  FINDAGRAVE = "findagrave",
  BILLIONGRAVES = "billiongraves",
  LEGACY = "legacy",
  TRIBUTES = "tributes",
  OBITUARY_DAILY_TIMES = "obituary_daily_times",

  // Search Engines
  GOOGLE_SEARCH = "google_search",
  BING_SEARCH = "bing_search",
  DUCKDUCKGO = "duckduckgo",
  BRAVE_SEARCH = "brave_search",

  // News Sources
  NEWSAPI = "newsapi",
  GOOGLE_NEWS_RSS = "google_news_rss",
  AP_NEWS = "ap_news",
  REUTERS = "reuters",
  BBC_NEWS = "bbc_news",
  GUARDIAN = "guardian",
  NYTIMES = "nytimes",
  WASHINGTON_POST = "washington_post",
  LA_TIMES = "la_times",
  VARIETY = "variety",
  HOLLYWOOD_REPORTER = "hollywood_reporter",
  PEOPLE_MAGAZINE = "people_magazine",
  TMZ = "tmz",
  E_ONLINE = "e_online",
  ENTERTAINMENT_WEEKLY = "entertainment_weekly",
  DEADLINE = "deadline",

  // Newspaper Archives
  NEWSPAPERS_COM = "newspapers_com",
  NEWSPAPER_ARCHIVE = "newspaper_archive",
  GENEALOGY_BANK = "genealogy_bank",

  // Genealogy/Vital Records
  ANCESTRY = "ancestry",
  FAMILYSEARCH = "familysearch",
  MYHERITAGE = "myheritage",
  FINDMYPAST = "findmypast",

  // Books/Publications
  GOOGLE_BOOKS = "google_books",
  OPEN_LIBRARY = "open_library",
  WORLDCAT = "worldcat",
  INTERNET_ARCHIVE = "internet_archive",

  // Court/Public Records
  PACER = "pacer",
  COURTLISTENER = "courtlistener",
  FINDLAW = "findlaw",
  JUSTIA = "justia",
  NTSB = "ntsb",
  OSHA = "osha",
  SSA_DEATH_MASTER = "ssa_death_master",
  CORONER_REPORT = "coroner_report",

  // Social Media
  TWITTER_X = "twitter_x",
  REDDIT = "reddit",
  INSTAGRAM = "instagram",
  FACEBOOK = "facebook",
}

/**
 * Source entry tracking where data came from.
 */
export interface EnrichmentSourceEntry {
  type: DataSourceType
  url?: string | null
  retrievedAt: Date
  confidence: number // 0.0 - 1.0
  rawData?: unknown // Original response for debugging
  costUsd?: number // Cost incurred for this lookup
  queryUsed?: string // The query/prompt used
}

// ============================================================================
// Actor Input Types
// ============================================================================

/**
 * Minimal actor information needed for enrichment queries.
 */
export interface ActorForEnrichment {
  id: number
  tmdbId: number | null
  name: string
  birthday: string | null
  deathday: string | null
  causeOfDeath: string | null
  causeOfDeathDetails: string | null
  popularity: number | null
}

// ============================================================================
// Enrichment Result Types
// ============================================================================

/**
 * Result from a single source lookup.
 */
export interface SourceLookupResult {
  success: boolean
  source: EnrichmentSourceEntry
  data: Partial<EnrichmentData> | null
  error?: string
}

/**
 * Enrichment data that can be extracted from sources.
 */
export interface EnrichmentData {
  circumstances: string | null
  rumoredCircumstances: string | null
  notableFactors: string[]
  relatedCelebrities: RelatedCelebrity[]
  locationOfDeath: string | null
  additionalContext: string | null
}

/**
 * Complete enrichment result with source tracking.
 */
export interface EnrichmentResult {
  circumstances?: string | null
  circumstancesSource?: EnrichmentSourceEntry
  rumoredCircumstances?: string | null
  rumoredCircumstancesSource?: EnrichmentSourceEntry
  notableFactors?: string[]
  notableFactorsSource?: EnrichmentSourceEntry
  relatedCelebrities?: RelatedCelebrity[]
  relatedCelebritiesSource?: EnrichmentSourceEntry
  locationOfDeath?: string | null
  locationOfDeathSource?: EnrichmentSourceEntry
  additionalContext?: string | null
  additionalContextSource?: EnrichmentSourceEntry
}

/**
 * Related celebrity in death circumstances.
 */
export interface RelatedCelebrity {
  name: string
  tmdbId: number | null
  relationship: string
}

// ============================================================================
// Search Types
// ============================================================================

/**
 * Web search result from any search provider.
 */
export interface SearchResult {
  title: string
  url: string
  snippet: string
  source: DataSourceType
}

/**
 * Quality assessment of search results.
 */
export interface SearchQualityScore {
  hasRelevantInfo: boolean
  confidence: number // 0.0 - 1.0
  deathKeywordsFound: string[]
  circumstanceKeywordsFound: string[]
}

// ============================================================================
// AI Provider Types
// ============================================================================

/**
 * Configuration for an AI provider.
 */
export interface AIProviderConfig {
  name: string
  type: DataSourceType
  hasWebSearch: boolean
  costPerQuery: number // USD
  enabled: boolean
  apiKeyEnvVar: string
}

/**
 * Result from an AI model query.
 */
export interface AIQueryResult {
  circumstances?: string | null
  rumoredCircumstances?: string | null
  notableFactors?: string[]
  source: EnrichmentSourceEntry
}

// ============================================================================
// Enrichment Stats Types
// ============================================================================

/**
 * Cost breakdown by source for an actor enrichment.
 */
export interface CostBreakdown {
  /** Cost per source type used */
  bySource: Record<DataSourceType, number>
  /** Total cost for this actor */
  total: number
}

/**
 * Statistics for a single actor enrichment run.
 */
export interface EnrichmentStats {
  actorId: number
  actorName: string
  deathYear: number | null
  fieldsFilledBefore: string[]
  fieldsFilledAfter: string[]
  sourcesAttempted: SourceAttemptStats[]
  finalSource: DataSourceType | null
  confidence: number
  totalCostUsd: number
  totalTimeMs: number
  /** Detailed cost breakdown by source */
  costBreakdown: CostBreakdown
}

/**
 * Statistics for a single source attempt.
 */
export interface SourceAttemptStats {
  source: DataSourceType
  success: boolean
  timeMs: number
  costUsd?: number
  error?: string
}

/**
 * Aggregate statistics for a batch enrichment run.
 */
export interface BatchEnrichmentStats {
  actorsProcessed: number
  actorsEnriched: number
  fillRate: number // percentage
  totalCostUsd: number
  totalTimeMs: number
  sourceHitRates: Record<DataSourceType, number>
  /** Cost breakdown by source type across all actors */
  costBySource: Record<DataSourceType, number>
  errors: Array<{ actorId: number; error: string }>
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Source category flags for CLI.
 */
export interface SourceCategoryFlags {
  free: boolean
  paid: boolean
  ai: boolean
}

/**
 * Specific source flags for granular control.
 */
export interface SpecificSourceFlags {
  wikidata?: boolean
  wikipedia?: boolean
  findagrave?: boolean
  legacy?: boolean
  duckduckgo?: boolean
  google?: boolean
  newsapi?: boolean
  // Add more as needed
}

/**
 * AI model selection flags.
 */
export interface AIModelFlags {
  perplexity?: boolean
  grok?: boolean
  gpt4oMini?: boolean
  deepseek?: boolean
  all?: boolean
}

/**
 * Cost limit configuration.
 */
export interface CostLimitConfig {
  /** Maximum cost allowed per actor (USD) - stops processing actor if exceeded */
  maxCostPerActor?: number
  /** Maximum total cost for the entire batch (USD) - exits if exceeded */
  maxTotalCost?: number
}

/**
 * Complete enrichment configuration.
 */
export interface EnrichmentConfig {
  limit?: number
  minPopularity?: number
  recentOnly?: boolean
  dryRun?: boolean
  sourceCategories: SourceCategoryFlags
  specificSources: SpecificSourceFlags
  aiModels: AIModelFlags
  stopOnMatch: boolean
  confidenceThreshold: number
  statsFile?: string
  /** Cost limits to control spending */
  costLimits?: CostLimitConfig
}

// ============================================================================
// Source Interface
// ============================================================================

/**
 * Interface that all data source implementations must follow.
 */
export interface DataSource {
  readonly name: string
  readonly type: DataSourceType
  readonly isFree: boolean
  readonly estimatedCostPerQuery: number

  /**
   * Check if this source is available (API key configured, etc.)
   */
  isAvailable(): boolean

  /**
   * Look up death information for an actor.
   */
  lookup(actor: ActorForEnrichment): Promise<SourceLookupResult>
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error thrown when a cost limit is exceeded.
 */
export class CostLimitExceededError extends Error {
  constructor(
    message: string,
    public readonly limitType: "per-actor" | "total",
    public readonly currentCost: number,
    public readonly limit: number,
    public readonly actorId?: number,
    public readonly actorName?: string
  ) {
    super(message)
    this.name = "CostLimitExceededError"
  }
}

/**
 * Error thrown when a source access is blocked (403, rate limited, etc.)
 * This flags the source for review rather than treating it as a permanent failure.
 * Blocked sources should be investigated for alternative access methods:
 * - Browser automation (Puppeteer)
 * - API access requests
 * - Different request patterns
 */
export class SourceAccessBlockedError extends Error {
  constructor(
    message: string,
    public readonly sourceType: DataSourceType,
    public readonly url: string,
    public readonly statusCode: number
  ) {
    super(message)
    this.name = "SourceAccessBlockedError"
  }
}
