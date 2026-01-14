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
// export { WikipediaSource } from "./sources/wikipedia.js"
// export { FindAGraveSource } from "./sources/findagrave.js"
// export { LegacySource } from "./sources/legacy.js"

// AI providers will be exported here
// export { DeepSeekProvider } from "./ai-providers/deepseek.js"
// export { OpenAIMiniProvider } from "./ai-providers/openai-mini.js"
// export { PerplexityProvider } from "./ai-providers/perplexity.js"
// export { GrokProvider } from "./ai-providers/grok.js"

// Main orchestrator
export { DeathEnrichmentOrchestrator, DEFAULT_CONFIG } from "./orchestrator.js"
