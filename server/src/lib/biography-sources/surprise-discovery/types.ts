/**
 * Type definitions for the surprise discovery agent.
 *
 * Post-enrichment pipeline that discovers surprising public associations
 * about actors via Google Autocomplete, filters for incongruity, researches
 * via Reddit, verifies in reliable sources, and integrates into biographies.
 */

/**
 * Configuration for the surprise discovery pipeline.
 */
export interface DiscoveryConfig {
  /** Whether to run discovery after bio enrichment. Default: true */
  enabled: boolean
  /** Integration strategy: append-only (safer) or re-synthesize. Default: "append-only" */
  integrationStrategy: "append-only" | "re-synthesize"
  /** Minimum Haiku incongruity score (1-10) to proceed to Phase 2. Default: 7 */
  incongruityThreshold: number
  /** Maximum cost in USD for the discovery step per actor. Default: 0.10 */
  maxCostPerActorUsd: number
}

export const DEFAULT_DISCOVERY_CONFIG: DiscoveryConfig = {
  enabled: true,
  integrationStrategy: "append-only",
  incongruityThreshold: 7,
  maxCostPerActorUsd: 0.1,
}

/**
 * A single autocomplete suggestion with provenance tracking.
 */
export interface AutocompleteSuggestion {
  /** The full suggestion text from Google */
  fullText: string
  /** The extracted association term (everything after the actor name) */
  term: string
  /** Which query pattern produced this suggestion */
  queryPattern: "quoted-letter" | "quoted-space-letter" | "keyword"
  /** The raw query that was sent to autocomplete */
  rawQuery: string
}

/**
 * A candidate that passed the boring filter and was scored by Haiku.
 */
export interface IncongruityCandidate {
  term: string
  score: number
  reasoning: string
}

/**
 * A Reddit thread found during research.
 */
export interface RedditThread {
  url: string
  subreddit: string
  title: string
  upvotes: number
}

/**
 * A verification attempt against a reliable source.
 */
export interface VerificationAttempt {
  source: string
  url: string
  found: boolean
}

/**
 * A fully researched association with verification status.
 */
export interface ResearchedAssociation {
  term: string
  incongruityScore: number
  redditThreads: RedditThread[]
  claimExtracted: string
  verificationAttempts: VerificationAttempt[]
  verified: boolean
  verificationSource?: string
  verificationUrl?: string
  /** The relevant excerpt from the verified source */
  verificationExcerpt?: string
}

/**
 * An integrated finding that made it into the bio.
 */
export interface IntegratedFinding {
  term: string
  destination: "narrative" | "lesserKnownFacts" | "discarded"
  verificationSource: string
}

/**
 * Complete discovery results record stored per actor.
 */
export interface DiscoveryResults {
  discoveredAt: string
  config: {
    integrationStrategy: "append-only" | "re-synthesize"
    incongruityThreshold: number
  }
  autocomplete: {
    queriesRun: number
    totalSuggestions: number
    uniqueSuggestions: number
    byPattern: Record<string, number>
  }
  boringFilter: {
    dropped: number
    droppedByReason: Record<string, number>
    remaining: number
  }
  incongruityCandidates: IncongruityCandidate[]
  researched: ResearchedAssociation[]
  integrated: IntegratedFinding[]
  costUsd: number
}

/**
 * Result returned by the discovery orchestrator.
 */
export interface DiscoveryResult {
  /** Whether any findings were integrated */
  hasFindings: boolean
  /** Updated narrative (if changed) */
  updatedNarrative: string | null
  /** New lesser-known facts to append */
  newLesserKnownFacts: Array<{ text: string; sourceUrl: string | null; sourceName: string | null }>
  /** Full discovery record for storage */
  discoveryResults: DiscoveryResults
}
