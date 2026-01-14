/**
 * Death Sources Module
 *
 * Multi-source enrichment system for death information.
 * Supports structured data sources, web search, news sites, and AI models.
 */

// Export all types
export * from "./types.js"

// Base class
export { BaseDataSource, DEATH_KEYWORDS, CIRCUMSTANCE_KEYWORDS, NOTABLE_FACTOR_KEYWORDS } from "./base-source.js"

// Source implementations
export { WikidataSource } from "./sources/wikidata.js"
export { DuckDuckGoSource } from "./sources/duckduckgo.js"
export { FindAGraveSource } from "./sources/findagrave.js"
// export { WikipediaSource } from "./sources/wikipedia.js"
// export { LegacySource } from "./sources/legacy.js"

// AI providers
export { GPT4oMiniSource, GPT4oSource } from "./ai-providers/openai.js"
export { PerplexitySource } from "./ai-providers/perplexity.js"
// export { DeepSeekSource } from "./ai-providers/deepseek.js"
// export { GrokSource } from "./ai-providers/grok.js"

// Main orchestrator
export { DeathEnrichmentOrchestrator, DEFAULT_CONFIG } from "./orchestrator.js"
