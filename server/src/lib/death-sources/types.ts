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
  CLAUDE_LINK_SELECTOR = "claude_link_selector", // AI-assisted link selection
  CLAUDE_PAGE_EXTRACTOR = "claude_page_extractor", // AI-assisted page content extraction
  GEMINI_SECTION_SELECTOR = "gemini_section_selector", // AI-assisted Wikipedia section selection
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

  // International Film Databases
  ALLOCINE = "allocine", // French
  DOUBAN = "douban", // Chinese
  SOOMPI = "soompi", // Korean
  FILMIBEAT = "filmibeat", // Indian

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

  // Historical Archives (free, for pre-internet deaths)
  CHRONICLING_AMERICA = "chronicling_america", // Library of Congress, 1756-1963
  TROVE = "trove", // National Library of Australia
  EUROPEANA = "europeana", // European digital archives

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
  /**
   * Additional results from multi-story sources (news, search engines).
   * Each entry is a separate source/article that can provide death information.
   */
  additionalResults?: Array<{
    source: EnrichmentSourceEntry
    data: Partial<EnrichmentData> | null
  }>
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
  // Career context fields
  lastProject: ProjectReference | null
  careerStatusAtDeath: CareerStatus | null
  posthumousReleases: ProjectReference[] | null
  relatedDeaths: string | null
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
  // Career context fields
  lastProject?: ProjectReference | null
  lastProjectSource?: EnrichmentSourceEntry
  careerStatusAtDeath?: CareerStatus | null
  careerStatusAtDeathSource?: EnrichmentSourceEntry
  posthumousReleases?: ProjectReference[] | null
  posthumousReleasesSource?: EnrichmentSourceEntry
  relatedDeaths?: string | null
  relatedDeathsSource?: EnrichmentSourceEntry
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
  /** Domain extracted from URL (e.g., "cnn.com") */
  domain?: string
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
// Claude Cleanup Types
// ============================================================================

/**
 * Confidence level for extracted death information.
 */
export type ConfidenceLevel = "high" | "medium" | "low" | "disputed"

/**
 * Career status at time of death.
 */
export type CareerStatus = "active" | "semi-retired" | "retired" | "hiatus" | "unknown"

/**
 * Reference to a film/TV project (for last_project, posthumous_releases).
 */
export interface ProjectReference {
  title: string
  year: number | null
  tmdbId: number | null
  imdbId: string | null
  type: "movie" | "show" | "documentary" | "unknown"
}

/**
 * Raw data collected from a single source, before Claude cleanup.
 */
export interface RawSourceData {
  sourceName: string
  sourceType: DataSourceType
  text: string
  url?: string
  confidence: number
  resolvedSources?: import("./url-resolver.js").ResolvedUrl[]
}

/**
 * Enriched death information extracted from raw data.
 * This matches the structure we ask Claude to return.
 */
export interface EnrichedDeathInfo {
  circumstances: string | null
  rumoredCircumstances: string | null
  notableFactors: string[]
  relatedCelebrities: RelatedCelebrity[]
  locationOfDeath: string | null
  additionalContext: string | null
}

/**
 * Clean, structured death information returned by Claude Opus 4.5.
 * These are the user-facing fields for the /death page.
 */
export interface CleanedDeathInfo {
  // Core death info (also shown on main actor page)
  cause: string | null
  causeConfidence: ConfidenceLevel | null
  details: string | null
  detailsConfidence: ConfidenceLevel | null

  // Date confidence (separate from source-level verification)
  birthdayConfidence: ConfidenceLevel | null
  deathdayConfidence: ConfidenceLevel | null

  // Extended info for /death page
  circumstances: string | null // Full narrative - the main content
  circumstancesConfidence: ConfidenceLevel | null
  rumoredCircumstances: string | null // Alternative accounts, disputed info

  locationOfDeath: string | null
  notableFactors: string[] // Tags: multiple_deaths, investigation, etc.
  relatedDeaths: string | null // Family/others who died in connection
  relatedCelebrities: RelatedCelebrity[] | null // Celebrities mentioned in death circumstances
  additionalContext: string | null // Career context relevant to death

  // Career context at time of death
  lastProject: ProjectReference | null
  careerStatusAtDeath: CareerStatus | null
  posthumousReleases: ProjectReference[] | null

  // Metadata
  cleanupSource: "claude-opus-4.5"
  cleanupTimestamp: string
}

/**
 * Configuration for Claude cleanup step.
 */
export interface ClaudeCleanupConfig {
  enabled: boolean
  model: "claude-opus-4-5-20251101"
  gatherAllSources: boolean // true = don't stop on first match
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
 * Configuration for following links from web search results.
 */
export interface LinkFollowConfig {
  /** Enable link following from search results (default: true) */
  enabled: boolean
  /** Maximum number of links to follow per actor (default: 3) */
  maxLinksPerActor: number
  /** Maximum cost for link following operations per actor in USD (default: 0.01) */
  maxCostPerActor: number
  /** Use Claude to intelligently select which links to visit (default: false) */
  aiLinkSelection: boolean
  /** Use Claude to extract death info from fetched page content (default: false) */
  aiContentExtraction: boolean
  /** Optional allowlist of domains to prefer (e.g., ["cnn.com", "bbc.com"]) */
  allowedDomains?: string[]
  /** Optional blocklist of domains to skip (e.g., ["pinterest.com", "imdb.com"]) */
  blockedDomains?: string[]
  /** Browser-based fetching configuration for bot-protected sites */
  browserFetch?: BrowserFetchConfig
}

/**
 * Default link follow configuration.
 */
export const DEFAULT_LINK_FOLLOW_CONFIG: LinkFollowConfig = {
  enabled: true,
  maxLinksPerActor: 3,
  maxCostPerActor: 0.01,
  aiLinkSelection: false,
  aiContentExtraction: false,
}

/**
 * Configuration for browser-based page fetching.
 * Used to bypass bot detection on protected sites.
 */
export interface BrowserFetchConfig {
  /** Enable browser-based fetching (default: true) */
  enabled: boolean
  /** Domains that should always use browser fetching */
  browserProtectedDomains: string[]
  /** Fall back to browser if regular fetch is blocked (default: true) */
  fallbackOnBlock: boolean
  /** Idle timeout before auto-shutting down browser in ms (default: 60000) */
  idleTimeoutMs: number
  /** Page load timeout in ms (default: 30000) */
  pageTimeoutMs: number
  /** Maximum content length to extract (default: 100000) */
  maxContentLength: number
}

/**
 * Default browser fetch configuration.
 */
export const DEFAULT_BROWSER_FETCH_CONFIG: BrowserFetchConfig = {
  enabled: true,
  browserProtectedDomains: [
    "nytimes.com",
    "washingtonpost.com",
    "wsj.com",
    "latimes.com",
    "bostonglobe.com",
    "ft.com",
    "economist.com",
    "bloomberg.com",
  ],
  fallbackOnBlock: true,
  idleTimeoutMs: 60000,
  pageTimeoutMs: 30000,
  maxContentLength: 100000,
}

/**
 * Result from fetching a page for link following.
 */
export interface FetchedPage {
  url: string
  title: string
  content: string // Plain text content extracted from HTML
  contentLength: number
  fetchTimeMs: number
  error?: string
  /** How the page was fetched: regular HTTP, browser automation, or archive service */
  fetchMethod?: "fetch" | "browser" | "archive.is"
  /** If fetched from archive.is, the archive URL */
  archiveUrl?: string
}

/**
 * Result from AI link selection.
 */
export interface LinkSelectionResult {
  selectedUrls: string[]
  reasoning?: string
  costUsd: number
}

/**
 * Result from AI content extraction.
 */
export interface ContentExtractionResult {
  circumstances: string | null
  causeOfDeath: string | null
  dateOfDeath: string | null
  locationOfDeath: string | null
  notableFactors: string[]
  confidence: number
  costUsd: number
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
  confidenceThreshold: number
  statsFile?: string
  /** Cost limits to control spending */
  costLimits?: CostLimitConfig
  /** Claude Opus 4.5 cleanup configuration */
  claudeCleanup?: ClaudeCleanupConfig
  /** Link following configuration for web search sources */
  linkFollow?: LinkFollowConfig
  /** Maximum number of stories to collect from news sources (default: 3) */
  maxStoriesPerSource?: number
  /** Wikipedia source configuration */
  wikipediaOptions?: WikipediaOptions
}

/**
 * Default maximum stories per news source.
 */
export const DEFAULT_MAX_STORIES_PER_SOURCE = 3

// ============================================================================
// Wikipedia Options Types
// ============================================================================

/**
 * Configuration for Wikipedia source behavior.
 */
export interface WikipediaOptions {
  /**
   * Use AI (Gemini Flash) to select relevant sections instead of regex patterns.
   * This can capture non-obvious sections like "Hunting and Fishing" or "Controversies"
   * that may contain death/health/incident information.
   * Default: false (opt-in)
   */
  useAISectionSelection?: boolean
  /**
   * Which AI model to use for section selection.
   * Default: "gemini-flash" (cheapest at ~$0.0001/query)
   */
  sectionSelectionModel?: "gemini-flash"
  /**
   * Maximum number of sections to fetch content from.
   * Default: 10
   */
  maxSections?: number
}

/**
 * Default Wikipedia options.
 */
export const DEFAULT_WIKIPEDIA_OPTIONS: WikipediaOptions = {
  useAISectionSelection: false,
  sectionSelectionModel: "gemini-flash",
  maxSections: 10,
}

// ============================================================================
// Enrichment Run Tracking Types
// ============================================================================

/**
 * Database record for an enrichment script run.
 */
export interface EnrichmentRunRecord {
  id?: number
  startedAt: Date
  completedAt?: Date
  durationMs?: number

  // Actor stats
  actorsQueried: number
  actorsProcessed: number
  actorsEnriched: number
  actorsWithDeathPage: number
  fillRate?: number

  // Cost tracking
  totalCostUsd: number
  costBySource: Record<string, number>

  // Source stats
  sourceHitRates: Record<string, number>
  sourcesAttempted: string[]

  // Configuration used
  config: Partial<EnrichmentConfig>

  // Link following stats
  linksFollowed: number
  pagesFetched: number
  aiLinkSelections: number
  aiContentExtractions: number

  // Errors
  errorCount: number
  errors: Array<{ actorId: number; error: string }>

  // Exit reason
  exitReason?: "completed" | "cost_limit" | "error" | "interrupted"

  // Metadata
  scriptName?: string
  scriptVersion?: string
  hostname?: string
}

/**
 * Per-actor stats within an enrichment run.
 */
export interface EnrichmentRunActorRecord {
  id?: number
  runId: number
  actorId: number

  wasEnriched: boolean
  createdDeathPage: boolean
  confidence?: number

  sourcesAttempted: string[]
  winningSource?: string

  processingTimeMs?: number
  costUsd: number

  linksFollowed: number
  pagesFetched: number

  error?: string
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
 * Error thrown when a cost limit is exceeded during enrichment.
 *
 * This error is thrown by the orchestrator when either:
 * - Per-actor cost limit is exceeded (limitType: "per-actor")
 * - Total batch cost limit is exceeded (limitType: "total")
 *
 * For total cost limit errors, the `partialResults` property contains
 * enrichment results that were successfully gathered before the limit
 * was hit, allowing the caller to save partial progress.
 *
 * @template T - The type of results stored in partialResults (typically EnrichmentResult)
 *
 * @example
 * ```typescript
 * try {
 *   await orchestrator.enrichActors(actors)
 * } catch (error) {
 *   if (error instanceof CostLimitExceededError) {
 *     // Save partial results before exiting
 *     if (error.partialResults) {
 *       for (const [actorId, result] of error.partialResults) {
 *         await saveEnrichmentResult(actorId, result)
 *       }
 *     }
 *     console.log(`Cost limit reached: $${error.currentCost} / $${error.limit}`)
 *   }
 * }
 * ```
 */
export class CostLimitExceededError<T = unknown> extends Error {
  /**
   * @param message - Human-readable error message
   * @param limitType - Whether per-actor or total batch limit was exceeded
   * @param currentCost - The cost that triggered the limit (USD)
   * @param limit - The configured limit that was exceeded (USD)
   * @param actorId - ID of the actor being processed when limit was hit (per-actor only)
   * @param actorName - Name of the actor for logging purposes (per-actor only)
   * @param partialResults - Map of actorId → enrichment results gathered before the limit was exceeded.
   *                         Only populated for total cost limit errors. Allows callers to persist
   *                         partial progress rather than losing all work when the limit is hit.
   */
  constructor(
    message: string,
    public readonly limitType: "per-actor" | "total",
    public readonly currentCost: number,
    public readonly limit: number,
    public readonly actorId?: number,
    public readonly actorName?: string,
    public readonly partialResults?: Map<number, T>
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

/**
 * Error thrown when a source request times out.
 * High-priority sources should have timeouts stored for later review.
 * Low-priority sources should just be logged and continue.
 */
export class SourceTimeoutError extends Error {
  constructor(
    message: string,
    public readonly sourceType: DataSourceType,
    public readonly timeoutMs: number,
    public readonly isHighPriority: boolean
  ) {
    super(message)
    this.name = "SourceTimeoutError"
  }
}

// ============================================================================
// Browser Authentication Error Types
// ============================================================================

/**
 * Reason for authentication failure.
 */
export type AuthenticationFailureReason =
  | "invalid_credentials"
  | "captcha_failed"
  | "session_expired"
  | "rate_limited"
  | "account_locked"
  | "network_error"
  | "unknown"

/**
 * Error thrown when browser authentication fails.
 *
 * @example
 * ```typescript
 * try {
 *   await browserFetchPage(url)
 * } catch (error) {
 *   if (error instanceof AuthenticationError) {
 *     if (error.reason === "invalid_credentials") {
 *       console.log(`Check your ${error.site} credentials`)
 *     } else if (error.reason === "captcha_failed") {
 *       console.log(`CAPTCHA solving failed, cost: $${error.costIncurred}`)
 *     }
 *   }
 * }
 * ```
 */
export class AuthenticationError extends Error {
  /**
   * @param message - Human-readable error message
   * @param site - Site where authentication failed (e.g., "nytimes.com")
   * @param reason - Specific reason for the failure
   * @param costIncurred - Any costs incurred during the attempt (CAPTCHA solving, etc.)
   */
  constructor(
    message: string,
    public readonly site: string,
    public readonly reason: AuthenticationFailureReason,
    public readonly costIncurred: number = 0
  ) {
    super(message)
    this.name = "AuthenticationError"
  }
}

/**
 * Error thrown when CAPTCHA solving fails.
 *
 * This error provides details about the CAPTCHA attempt including
 * the type of CAPTCHA, the provider used, and any costs incurred.
 *
 * @example
 * ```typescript
 * try {
 *   await solveCaptcha(page, detection, config)
 * } catch (error) {
 *   if (error instanceof CaptchaSolveError) {
 *     console.log(`Failed to solve ${error.captchaType}: ${error.message}`)
 *     console.log(`Cost incurred: $${error.costIncurred}`)
 *   }
 * }
 * ```
 */
export class CaptchaSolveError extends Error {
  /**
   * @param message - Human-readable error message
   * @param captchaType - Type of CAPTCHA that failed (recaptcha_v2, hcaptcha, etc.)
   * @param provider - CAPTCHA solving service used (2captcha, capsolver)
   * @param costIncurred - Cost incurred during the attempt in USD
   * @param timeoutMs - How long the solve attempt took before failing
   */
  constructor(
    message: string,
    public readonly captchaType: string,
    public readonly provider: string,
    public readonly costIncurred: number,
    public readonly timeoutMs?: number
  ) {
    super(message)
    this.name = "CaptchaSolveError"
  }
}
