/**
 * Death Sources Module
 *
 * Multi-source enrichment system for death information.
 * Supports structured data sources, web search, news sites, and AI models.
 */

// Export all types
export * from "./types.js"

// Base class
export {
  BaseDataSource,
  DEATH_KEYWORDS,
  CIRCUMSTANCE_KEYWORDS,
  NOTABLE_FACTOR_KEYWORDS,
  setIgnoreCache,
  getIgnoreCache,
} from "./base-source.js"

// Source implementations
export { WikidataSource } from "./sources/wikidata.js"
export { DuckDuckGoSource } from "./sources/duckduckgo.js"
export { GoogleSearchSource } from "./sources/google.js"
export { BingSearchSource } from "./sources/bing.js"
export { FindAGraveSource } from "./sources/findagrave.js"
export { LegacySource } from "./sources/legacy.js"
export { TelevisionAcademySource } from "./sources/television-academy.js"
export { IBDBSource } from "./sources/ibdb.js"
export { BFISightSoundSource } from "./sources/bfi-sight-sound.js"
export { WikipediaSource } from "./sources/wikipedia.js"
export { DeadlineSource } from "./sources/deadline.js"
export { VarietySource } from "./sources/variety.js"
export { NewsAPISource } from "./sources/newsapi.js"
export { ChroniclingAmericaSource } from "./sources/chronicling-america.js"
export { HollywoodReporterSource } from "./sources/hollywood-reporter.js"
export { TMZSource } from "./sources/tmz.js"
export { PeopleSource } from "./sources/people.js"
export { BBCNewsSource } from "./sources/bbc-news.js"
export { GoogleNewsRSSSource } from "./sources/google-news-rss.js"
export { BAFTASource } from "./sources/bafta.js"
export { WGASource } from "./sources/wga.js"
export { DGASource } from "./sources/dga.js"
export { BraveSearchSource } from "./sources/brave.js"

// AI providers
export { GPT4oMiniSource, GPT4oSource } from "./ai-providers/openai.js"
export { PerplexitySource } from "./ai-providers/perplexity.js"
export { DeepSeekSource } from "./ai-providers/deepseek.js"
export { GrokSource } from "./ai-providers/grok.js"

// Main orchestrator
export {
  DeathEnrichmentOrchestrator,
  DEFAULT_CONFIG,
  type ExtendedEnrichmentResult,
  type ActorLogEntry,
} from "./orchestrator.js"

// Claude cleanup
export { cleanupWithClaude, buildCleanupPrompt, estimateCleanupCost } from "./claude-cleanup.js"

// Status bar
export { StatusBar, createNoOpStatusBar, type StatusBarState } from "./status-bar.js"

// Logger
export {
  EnrichmentLogger,
  getEnrichmentLogger,
  setEnrichmentLogger,
  type LogConfig,
  type LogLevel,
} from "./logger.js"

// Cache
export {
  getCachedQuery,
  setCachedQuery,
  generateQueryHash,
  getCacheStats,
  getCostStats,
  getCachedQueriesForActor,
  deleteCachedQueriesOlderThan,
  deleteCachedQueriesForSource,
  clearWebSearchCache,
  clearCacheForActor,
  clearCacheForActors,
  clearAllCache,
  resetActorEnrichmentStatus,
  type CachedQueryResult,
  type CacheEntry,
  type CacheStats,
  type CostStats,
} from "./cache.js"

// Browser fetch (for bot-protected sites)
export {
  shouldUseBrowserFetch,
  isBlockedResponse,
  browserFetchPage,
  shutdownBrowser,
  registerBrowserCleanup,
  isBrowserFetchEnabled,
  setBrowserConfig,
  getBrowserConfig,
  isAuthEnabledForUrl,
  detectPaywall,
  getAuthenticatedContext,
  handleAuthenticationFlow,
} from "./browser-fetch.js"

// Browser authentication (for paywalled sites)
export {
  // Configuration
  getBrowserAuthConfig,
  setBrowserAuthConfig,
  resetBrowserAuthConfig,
  hasAnyCredentials,
  hasCredentialsForSite,
  hasCaptchaSolver,
  // Session management
  loadSession,
  saveSession,
  isSessionValid,
  applySessionToContext,
  touchSession,
  deleteSession,
  listSessions,
  clearExpiredSessions,
  getSessionInfo,
  // CAPTCHA
  detectCaptcha,
  waitForCaptcha,
  isChallengePage,
  solveCaptcha,
  injectCaptchaToken,
  getBalance,
  // Login handlers
  NYTimesLoginHandler,
  WashingtonPostLoginHandler,
  // Types re-exported for convenience
  type BrowserAuthConfig,
  type SiteCredentials,
  type SiteCredential,
  type SupportedSite,
  type CaptchaSolverConfig,
  type CaptchaDetectionResult,
  type CaptchaSolveResult,
  type LoginHandler,
  type LoginResult,
  type StoredSession,
  type PaywallDetectionResult,
  type AuthenticatedContextResult,
} from "./browser-auth/index.js"

// URL resolution (for Gemini grounding redirects)
export {
  resolveRedirectUrl,
  resolveRedirectUrls,
  resolveGeminiUrls,
  isGeminiRedirectUrl,
  getSourceName,
  SOURCE_NAMES,
  type ResolvedUrl,
} from "./url-resolver.js"

// Wikipedia section selector (AI-assisted section selection)
export {
  selectRelevantSections,
  isAISectionSelectionAvailable,
  createSectionSelectionSourceEntry,
  type WikipediaSection,
  type SectionSelectionResult,
} from "./wikipedia-section-selector.js"

// Wikipedia date extractor (AI-assisted date validation)
export {
  extractDatesWithAI,
  isAIDateExtractionAvailable,
  type DateExtractionResult,
} from "./wikipedia-date-extractor.js"
