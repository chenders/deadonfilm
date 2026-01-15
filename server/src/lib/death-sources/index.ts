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
export { FindAGraveSource } from "./sources/findagrave.js"
export { LegacySource } from "./sources/legacy.js"
export { TelevisionAcademySource } from "./sources/television-academy.js"
export { IBDBSource } from "./sources/ibdb.js"
export { BFISightSoundSource } from "./sources/bfi-sight-sound.js"
export { WikipediaSource } from "./sources/wikipedia.js"

// AI providers
export { GPT4oMiniSource, GPT4oSource } from "./ai-providers/openai.js"
export { PerplexitySource } from "./ai-providers/perplexity.js"
export { DeepSeekSource } from "./ai-providers/deepseek.js"
// export { GrokSource } from "./ai-providers/grok.js"

// Main orchestrator
export {
  DeathEnrichmentOrchestrator,
  DEFAULT_CONFIG,
  type ExtendedEnrichmentResult,
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
  type CachedQueryResult,
  type CacheEntry,
  type CacheStats,
  type CostStats,
} from "./cache.js"
