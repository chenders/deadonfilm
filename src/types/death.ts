// Death-related types

import type { PaginationInfo } from "./common"

// ============================================================================
// Entity Linking Types
// ============================================================================

/** Type of entity that can be linked */
export type EntityType = "actor" | "movie" | "show"

/** Method used to match the entity */
export type MatchMethod = "exact" | "fuzzy" | "ai"

/** A detected entity link in text */
export interface EntityLink {
  /** Start character position in original text */
  start: number
  /** End character position in original text */
  end: number
  /** The actual text that was matched */
  text: string
  /** Type of entity (actor, movie, show) */
  entityType: EntityType
  /** Internal ID of the entity */
  entityId: number
  /** URL slug for the entity page */
  entitySlug: string
  /** How the match was made */
  matchMethod: MatchMethod
  /** Confidence score (0.0 - 1.0) */
  confidence: number
}

/** Entity links stored by field name */
export interface StoredEntityLinks {
  circumstances?: EntityLink[]
  rumored_circumstances?: EntityLink[]
  additional_context?: EntityLink[]
}

// On This Day
export interface OnThisDayResponse {
  date: string
  month: string
  day: string
  deaths: Array<{
    actor: {
      id: number
      name: string
      profile_path: string | null
      deathday: string
    }
    notableFilms: Array<{
      id: number
      title: string
      year: string
    }>
  }>
  message?: string
}

// Recent Deaths
export interface RecentDeathsResponse {
  deaths: Array<{
    id: number
    tmdb_id: number | null
    name: string
    deathday: string
    cause_of_death: string | null
    cause_of_death_details: string | null
    profile_path: string | null
  }>
}

// COVID-19 Deaths types
export interface CovidDeath {
  rank: number
  id: number
  name: string
  deathday: string
  causeOfDeath: string | null
  causeOfDeathDetails: string | null
  profilePath: string | null
  ageAtDeath: number | null
}

export interface CovidDeathsResponse {
  persons: CovidDeath[]
  pagination: PaginationInfo
}

// Unnatural Deaths types
export type UnnaturalDeathCategory = "suicide" | "accident" | "overdose" | "homicide" | "other"

export interface UnnaturalDeathCategoryInfo {
  id: UnnaturalDeathCategory
  label: string
  count: number
}

export interface UnnaturalDeath {
  rank: number
  id: number
  name: string
  deathday: string
  causeOfDeath: string | null
  causeOfDeathDetails: string | null
  profilePath: string | null
  ageAtDeath: number | null
}

export interface UnnaturalDeathsResponse {
  persons: UnnaturalDeath[]
  pagination: PaginationInfo
  categories: UnnaturalDeathCategoryInfo[]
  selectedCategory: UnnaturalDeathCategory | "all"
  showSelfInflicted: boolean
}

// This Week Deaths types
export interface ThisWeekDeath {
  id: number
  name: string
  deathday: string
  profilePath: string | null
  causeOfDeath: string | null
  ageAtDeath: number | null
  yearOfDeath: number
}

export interface ThisWeekDeathsResponse {
  deaths: ThisWeekDeath[]
  weekRange: {
    start: string
    end: string
  }
}

// All Deaths types
export interface AllDeath {
  rank: number
  id: number
  name: string
  deathday: string
  profilePath: string | null
  causeOfDeath: string | null
  causeOfDeathDetails: string | null
  ageAtDeath: number | null
}

export interface AllDeathsResponse {
  deaths: AllDeath[]
  pagination: PaginationInfo
}

// Deaths by Cause types
export interface DeathByCause {
  id: number
  name: string
  deathday: string
  profilePath: string | null
  causeOfDeath: string
  causeOfDeathDetails: string | null
  ageAtDeath: number | null
  yearsLost: number | null
}

export interface DeathsByCauseResponse {
  cause: string
  slug: string
  deaths: DeathByCause[]
  pagination: PaginationInfo
}

// Deaths by Decade types
export interface DeathByDecade {
  id: number
  name: string
  deathday: string
  profilePath: string | null
  causeOfDeath: string | null
  ageAtDeath: number | null
  yearsLost: number | null
}

export interface DeathsByDecadeResponse {
  decade: number
  decadeLabel: string
  deaths: DeathByDecade[]
  pagination: PaginationInfo
}

// Death Details types (for dedicated death page)
export interface ProjectInfo {
  title: string
  year: number | null
  tmdb_id: number | null
  imdb_id: string | null
  type: "movie" | "show" | "documentary" | "unknown"
}

export interface RelatedCelebrity {
  name: string
  tmdbId: number | null
  relationship: string
  slug: string | null
}

export interface SourceEntry {
  url: string | null
  archiveUrl: string | null
  description: string
}

export interface DeathDetailsResponse {
  actor: {
    id: number
    tmdbId: number | null
    name: string
    birthday: string | null
    deathday: string
    profilePath: string | null
    causeOfDeath: string | null
    causeOfDeathDetails: string | null
    ageAtDeath: number | null
    yearsLost: number | null
    deathManner: string | null
    deathCategories: string[] | null
    strangeDeath: boolean
  }
  circumstances: {
    official: string | null
    confidence: string | null
    rumored: string | null
    locationOfDeath: string | null
    notableFactors: string[] | null
    additionalContext: string | null
  }
  career: {
    statusAtDeath: string | null
    lastProject: ProjectInfo | null
    posthumousReleases: ProjectInfo[] | null
  }
  relatedCelebrities: RelatedCelebrity[]
  sources: {
    cause: SourceEntry[] | null
    circumstances: SourceEntry[] | null
    rumored: SourceEntry[] | null
    additionalContext: SourceEntry[] | null
    careerStatus: SourceEntry[] | null
    lastProject: SourceEntry[] | null
    posthumousReleases: SourceEntry[] | null
    locationOfDeath: SourceEntry[] | null
    relatedCelebrities: SourceEntry[] | null
  }
  entityLinks?: StoredEntityLinks
}

// Notable Deaths types (discovery page)
export interface NotableDeathActor {
  id: number
  tmdbId: number | null
  name: string
  profilePath: string | null
  deathday: string
  ageAtDeath: number | null
  causeOfDeath: string | null
  deathManner: string | null
  strangeDeath: boolean
  notableFactors: string[] | null
  circumstancesConfidence: string | null
  slug: string
}

export interface NotableDeathsResponse {
  actors: NotableDeathActor[]
  pagination: PaginationInfo
}

export type NotableDeathsFilter = "all" | "strange" | "disputed" | "controversial"
