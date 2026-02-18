/**
 * Type definitions for multi-source biography enrichment system.
 *
 * This module provides types for collecting biographical information from multiple
 * sources including structured databases, web searches, news sites, and AI models,
 * then synthesizing them into structured narrative biographies via Claude.
 */

import { ReliabilityTier } from "../death-sources/types.js"

// ============================================================================
// Source Types
// ============================================================================

/**
 * All possible data sources for biography information.
 * Organized by category for clarity.
 */
export enum BiographySourceType {
  // Structured Data (free)
  WIKIDATA_BIO = "wikidata-bio",
  WIKIPEDIA_BIO = "wikipedia-bio",
  TMDB_BIO = "tmdb-bio",

  // Reference Sites
  BRITANNICA = "britannica",
  BIOGRAPHY_COM = "biography-com",

  // Web Search (with link following)
  GOOGLE_SEARCH_BIO = "google-search-bio",
  BING_SEARCH_BIO = "bing-search-bio",
  BRAVE_SEARCH_BIO = "brave-search-bio",
  DUCKDUCKGO_BIO = "duckduckgo-bio",

  // News Sources
  GUARDIAN_BIO = "guardian-bio",
  NYTIMES_BIO = "nytimes-bio",
  AP_NEWS_BIO = "ap-news-bio",
  BBC_NEWS_BIO = "bbc-news-bio",
  PEOPLE_BIO = "people-bio",

  // Obituary Sites
  LEGACY_BIO = "legacy-bio",
  FINDAGRAVE_BIO = "findagrave-bio",

  // Historical Archives
  INTERNET_ARCHIVE_BIO = "internet-archive-bio",
  CHRONICLING_AMERICA_BIO = "chronicling-america-bio",
  TROVE_BIO = "trove-bio",
  EUROPEANA_BIO = "europeana-bio",

  // AI Models
  GEMINI_BIO = "gemini-bio",
  GPT_BIO = "gpt-bio",
  GROQ_BIO = "groq-bio",

  // AI Utility (internal)
  GEMINI_BIO_SECTION_SELECTOR = "gemini-bio-section-selector",
  HAIKU_CONTENT_CLEANER = "haiku-content-cleaner",
}

// ============================================================================
// Notable Factors
// ============================================================================

/**
 * Valid tags for notable life factors.
 * Only tags in this set are stored (prevents arbitrary tags from AI models).
 */
export const VALID_LIFE_NOTABLE_FACTORS = new Set([
  "orphaned",
  "adopted",
  "foster_child",
  "single_parent",
  "poverty",
  "wealth",
  "immigrant",
  "refugee",
  "military_service",
  "war_veteran",
  "combat_wounded",
  "pow",
  "scholar",
  "self_taught",
  "dropout",
  "child_star",
  "child_labor",
  "incarcerated",
  "wrongfully_convicted",
  "addiction_recovery",
  "disability",
  "chronic_illness",
  "civil_rights_activist",
  "political_figure",
  "athlete",
  "multiple_careers",
  "turned_down_fame",
  "rags_to_riches",
  "prodigy",
  "polyglot",
  "clergy",
  "royalty",
  "nobility",
  "espionage",
  "survivor",
  "whistleblower",
  "philanthropist",
])

// ============================================================================
// Source Entry Types
// ============================================================================

/**
 * Source entry tracking where biography data came from.
 * Extends the pattern from death-sources' EnrichmentSourceEntry with
 * publication metadata for better provenance tracking.
 */
export interface BiographySourceEntry {
  type: BiographySourceType
  url?: string | null
  retrievedAt: Date
  confidence: number // 0.0–1.0 content confidence
  reliabilityTier?: ReliabilityTier // Source reliability classification
  reliabilityScore?: number // 0.0–1.0 source trustworthiness
  publication?: string | null // "The Guardian", "Wikipedia", etc.
  articleTitle?: string | null // "The scholarship Nixon turned down"
  author?: string | null
  publishDate?: string | null
  domain?: string | null // "theguardian.com"
  contentType?: string | null // "obituary", "profile", "news", etc.
  rawData?: unknown // Original response for debugging
  costUsd?: number // Cost incurred for this lookup
  queryUsed?: string // The query/prompt used
}

// ============================================================================
// Actor Input Types
// ============================================================================

/**
 * Minimal actor information needed for biography enrichment queries.
 */
export interface ActorForBiography {
  id: number
  tmdb_id: number | null
  imdb_person_id: string | null
  name: string
  birthday: string | null
  deathday: string | null
  wikipedia_url: string | null
  biography_raw_tmdb: string | null
  biography: string | null
  place_of_birth?: string | null
}

// ============================================================================
// Biography Data Types
// ============================================================================

/**
 * Structured biography data produced by Claude synthesis.
 * These are the user-facing fields for the biography page.
 */
export interface BiographyData {
  narrativeTeaser: string | null
  narrative: string | null
  narrativeConfidence: "high" | "medium" | "low" | null
  lifeNotableFactors: string[]
  birthplaceDetails: string | null
  familyBackground: string | null
  education: string | null
  preFameLife: string | null
  fameCatalyst: string | null
  personalStruggles: string | null
  relationships: string | null
  lesserKnownFacts: string[]
  hasSubstantiveContent: boolean
}

/**
 * Raw data collected from a single source before Claude synthesis.
 */
export interface RawBiographySourceData {
  sourceName: string
  sourceType: BiographySourceType
  text: string
  url?: string
  confidence: number
  reliabilityTier?: ReliabilityTier
  reliabilityScore?: number
  publication?: string
  articleTitle?: string
  domain?: string
  contentType?: string
}

// ============================================================================
// Content Cleaning Types
// ============================================================================

/**
 * Output of the content cleaner (Stage 1 mechanical + optional Stage 2 AI).
 */
export interface CleanedContent {
  extractedText: string | null
  articleTitle: string | null
  publication: string | null
  author: string | null
  publishDate: string | null
  relevance: "high" | "medium" | "low" | "none"
  contentType: "obituary" | "profile" | "news" | "biography" | "interview" | "other"
  url: string
  domain: string
  originalBytes: number
  cleanedBytes: number
  costUsd: number
}

// ============================================================================
// Enrichment Result Types
// ============================================================================

/**
 * Per-actor biography enrichment result with data, sources, and stats.
 */
export interface BiographyResult {
  actorId: number
  data: BiographyData | null
  sources: BiographySourceEntry[]
  rawSources?: RawBiographySourceData[]
  cleanedData?: BiographyData // from Claude synthesis
  stats: {
    sourcesAttempted: number
    sourcesSucceeded: number
    totalCostUsd: number
    processingTimeMs: number
  }
  error?: string
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Complete biography enrichment configuration.
 */
export interface BiographyEnrichmentConfig {
  limit: number
  confidenceThreshold: number // default 0.6 (higher than death's 0.5)
  reliabilityThreshold: number // default 0.6
  useReliabilityThreshold: boolean // default true
  earlyStopSourceCount: number // minimum distinct high-quality source families before early stopping (default 5)
  sourceCategories: {
    free: boolean // Wikidata, Wikipedia, TMDB
    reference: boolean // Britannica, Biography.com
    webSearch: boolean // Google, Bing, Brave, DuckDuckGo
    news: boolean // Guardian, NYT, AP, BBC, People
    obituary: boolean // Legacy, Find a Grave
    archives: boolean // Internet Archive, Chronicling America, Trove, Europeana
    ai: boolean // Gemini, GPT, Groq fallbacks
  }
  costLimits: {
    maxCostPerActor: number
    maxTotalCost: number
  }
  contentCleaning: {
    haikuEnabled: boolean // Enable Haiku AI extraction (Stage 2)
    mechanicalOnly: boolean // Skip Stage 2, use mechanical only
  }
  synthesisModel: string // default "claude-sonnet-4-20250514"
}

/**
 * Default biography enrichment configuration.
 */
export const DEFAULT_BIOGRAPHY_CONFIG: BiographyEnrichmentConfig = {
  limit: 10,
  confidenceThreshold: 0.6,
  reliabilityThreshold: 0.6,
  useReliabilityThreshold: true,
  earlyStopSourceCount: 5,
  sourceCategories: {
    free: true,
    reference: true,
    webSearch: true,
    news: true,
    obituary: true,
    archives: true,
    ai: false,
  },
  costLimits: {
    maxCostPerActor: 0.5,
    maxTotalCost: 10.0,
  },
  contentCleaning: {
    haikuEnabled: true,
    mechanicalOnly: false,
  },
  synthesisModel: "claude-sonnet-4-20250514",
}
