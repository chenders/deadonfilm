/**
 * Entity linker types and interfaces.
 *
 * Defines the core data structures for entity linking in narrative text.
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Type of entity that can be linked
 */
export type EntityType = "actor" | "movie" | "show"

/**
 * Method used to match the entity
 */
export type MatchMethod = "exact" | "fuzzy" | "ai"

/**
 * A detected entity link in text
 */
export interface EntityLink {
  /** Start character position in original text */
  start: number
  /** End character position in original text */
  end: number
  /** The actual text that was matched */
  text: string
  /** Type of entity (actor, movie, show) */
  entityType: EntityType
  /** ID of the entity (internal actor.id for actors, TMDB ID for movies/shows) */
  entityId: number
  /** URL slug for the entity page */
  entitySlug: string
  /** How the match was made */
  matchMethod: MatchMethod
  /** Confidence score (0.0 - 1.0) */
  confidence: number
  /** Alternative matches if ambiguous (for review) */
  alternateMatches?: AlternateMatch[]
}

/**
 * Alternative match for ambiguous entities
 */
export interface AlternateMatch {
  entityId: number
  entitySlug: string
  confidence: number
}

// ============================================================================
// Internal Types (for matching logic)
// ============================================================================

/**
 * A linkable entity from the database
 */
export interface LinkableEntity {
  /** Entity type */
  type: EntityType
  /** Internal database ID (for actors only) */
  id?: number
  /** Display name */
  name: string
  /** TMDB ID */
  tmdbId: number
  /** URL slug */
  slug: string
  /** Release/air year (for movies/shows) */
  year?: number | null
}

/**
 * A text range that has been linked
 */
export interface LinkedRange {
  start: number
  end: number
}

/**
 * A potential entity mention extracted from text
 */
export interface EntityCandidate {
  text: string
  start: number
  end: number
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Statistics about the linking process
 */
export interface LinkingStats {
  exactMatches: number
  fuzzyMatches: number
  aiMatches: number
  totalLinks: number
}

/**
 * Result of the entity linking process
 */
export interface LinkingResult {
  links: EntityLink[]
  stats: LinkingStats
}

/**
 * Options for the linkEntities function
 */
export interface LinkingOptions {
  /** Actor ID to exclude from results (prevent self-linking) */
  excludeActorId?: number
  /** Minimum confidence score (default: 0.7) */
  minConfidence?: number
  /** Enable exact matching (default: true) */
  enableExact?: boolean
  /** Enable fuzzy matching (default: true) */
  enableFuzzy?: boolean
  /** Enable AI matching (default: false - opt-in for cost control) */
  enableAI?: boolean
}

/**
 * Context for AI matching
 */
export interface AIMatchContext {
  actorName: string
  deathday: string
  fieldType: string
}

// ============================================================================
// Database Types
// ============================================================================

/**
 * Entity links stored in the database (keyed by field name)
 */
export interface StoredEntityLinks {
  circumstances?: EntityLink[]
  rumored_circumstances?: EntityLink[]
  additional_context?: EntityLink[]
}
