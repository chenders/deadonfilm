// Death-related types

import type { PaginationInfo } from "./common"

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
    tmdb_id: number
    name: string
    deathday: string
    cause_of_death: string | null
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
