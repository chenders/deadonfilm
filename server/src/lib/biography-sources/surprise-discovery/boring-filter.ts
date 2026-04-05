/**
 * Boring filter for surprise discovery.
 *
 * Heuristic filter that drops autocomplete suggestions that are obviously
 * uninteresting: filmography matches, co-star names, generic queries, and
 * terms already covered in the existing biography.
 *
 * No AI calls — pure string matching. Expected to eliminate 80-90% of
 * raw autocomplete suggestions.
 */

import type { AutocompleteSuggestion } from "./types.js"

export interface BoringFilterContext {
  movieTitles: string[]
  showTitles: string[]
  characterNames: string[]
  costarNames: string[]
  bioText: string
}

export interface BoringFilterResult {
  kept: AutocompleteSuggestion[]
  dropped: number
  droppedByReason: Record<string, number>
}

const GENERIC_BLOCKLIST = new Set([
  "age",
  "height",
  "weight",
  "net worth",
  "salary",
  "young",
  "old",
  "movies",
  "films",
  "shows",
  "awards",
  "oscar",
  "emmy",
  "grammy",
  "bafta",
  "husband",
  "wife",
  "spouse",
  "partner",
  "boyfriend",
  "girlfriend",
  "children",
  "kids",
  "son",
  "daughter",
  "family",
  "death",
  "died",
  "dead",
  "alive",
  "cause of death",
  "birthday",
  "born",
  "birth",
  "nationality",
  "ethnicity",
  "religion",
  "house",
  "home",
  "car",
  "photos",
  "images",
  "pictures",
  "hot",
  "sexy",
  "bikini",
  "dress",
  "hair",
  "makeup",
  "plastic surgery",
  "instagram",
  "twitter",
  "tiktok",
  "facebook",
  "youtube",
  "imdb",
  "wikipedia",
  "wiki",
  "bio",
  "biography",
  "news",
  "latest",
  "today",
  "2024",
  "2025",
  "2026",
  "interview",
  "quotes",
])

/**
 * Returns true if the term matches a generic blocklist entry.
 * Exact match on the full term, or every word of a 1-2 word term is generic.
 */
function isGeneric(term: string): boolean {
  if (GENERIC_BLOCKLIST.has(term)) {
    return true
  }
  const words = term.split(/\s+/)
  if (words.length <= 2 && words.every((w) => GENERIC_BLOCKLIST.has(w))) {
    return true
  }
  return false
}

/**
 * Returns true if the term has a filmography-related match.
 * Checks movie titles, show titles, and character names.
 * Matches if:
 *   - term equals a title/name (exact)
 *   - term contains a title/name as a substring
 *   - a title/name contains the term as a substring
 */
function isFilmographyMatch(term: string, context: BoringFilterContext): boolean {
  const all = [...context.movieTitles, ...context.showTitles, ...context.characterNames]
  for (const entry of all) {
    if (term === entry) return true
    if (term.includes(entry)) return true
    if (entry.includes(term)) return true
  }
  return false
}

/**
 * Returns true if the term partially matches any co-star name.
 * Matches if term equals, contains, or is contained within a co-star name.
 */
function isCostarMatch(term: string, context: BoringFilterContext): boolean {
  for (const costar of context.costarNames) {
    if (term === costar) return true
    if (term.includes(costar)) return true
    if (costar.includes(term)) return true
  }
  return false
}

/**
 * Returns true if the term (longer than 3 chars) appears in the bio text.
 */
function isInBio(term: string, bioText: string): boolean {
  if (term.length <= 3) return false
  return bioText.toLowerCase().includes(term.toLowerCase())
}

/**
 * Remove subset terms — if term A is a strict prefix of term B (followed by
 * a space or apostrophe), drop term A and keep term B.
 */
function removeSubsets(
  suggestions: AutocompleteSuggestion[],
  droppedByReason: Record<string, number>
): AutocompleteSuggestion[] {
  const terms = suggestions.map((s) => s.term)
  const dropped = new Set<string>()

  for (let i = 0; i < terms.length; i++) {
    for (let j = 0; j < terms.length; j++) {
      if (i === j) continue
      const shorter = terms[i]
      const longer = terms[j]
      if (longer.startsWith(shorter)) {
        const nextChar = longer[shorter.length]
        if (nextChar === " " || nextChar === "'") {
          dropped.add(shorter)
        }
      }
    }
  }

  if (dropped.size > 0) {
    droppedByReason["subset"] = (droppedByReason["subset"] ?? 0) + dropped.size
  }

  return suggestions.filter((s) => !dropped.has(s.term))
}

/**
 * Filter suggestions that are obviously uninteresting.
 *
 * Checks (in order):
 * 1. Generic blocklist — catches SEO bait terms
 * 2. Filmography match — drops movie/show/character references
 * 3. Co-star match — drops other actor names
 * 4. In-bio text — drops terms already covered in the biography
 * 5. Subset removal — keeps more specific terms over generic prefixes
 */
export function filterBoringSuggestions(
  suggestions: AutocompleteSuggestion[],
  context: BoringFilterContext
): BoringFilterResult {
  const droppedByReason: Record<string, number> = {}
  const bioTextLower = context.bioText.toLowerCase()

  // Precompute lowercased context arrays once to avoid re-lowercasing per suggestion
  const lowerContext: BoringFilterContext = {
    movieTitles: context.movieTitles.map((t) => t.toLowerCase()),
    showTitles: context.showTitles.map((t) => t.toLowerCase()),
    characterNames: context.characterNames.map((t) => t.toLowerCase()),
    costarNames: context.costarNames.map((t) => t.toLowerCase()),
    bioText: bioTextLower,
  }

  const afterBasicFilters = suggestions.filter((s) => {
    const term = s.term.toLowerCase()

    if (isGeneric(term)) {
      droppedByReason["generic"] = (droppedByReason["generic"] ?? 0) + 1
      return false
    }

    if (isFilmographyMatch(term, lowerContext)) {
      droppedByReason["filmography"] = (droppedByReason["filmography"] ?? 0) + 1
      return false
    }

    if (isCostarMatch(term, lowerContext)) {
      droppedByReason["costar"] = (droppedByReason["costar"] ?? 0) + 1
      return false
    }

    if (bioTextLower.length > 0 && term.length > 3 && bioTextLower.includes(term)) {
      droppedByReason["in-bio"] = (droppedByReason["in-bio"] ?? 0) + 1
      return false
    }

    return true
  })

  const kept = removeSubsets(afterBasicFilters, droppedByReason)

  const dropped = suggestions.length - kept.length

  return { kept, dropped, droppedByReason }
}
