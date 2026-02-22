/**
 * URL pattern matching for prerender routes.
 *
 * Matches incoming URLs against known frontend routes and extracts
 * route parameters needed for data fetching.
 */

export type PageType =
  | "home"
  | "actor"
  | "redirect"
  | "movie"
  | "show"
  | "episode"
  | "search"
  | "forever-young"
  | "in-detail"
  | "covid-deaths"
  | "unnatural-deaths"
  | "deaths-index"
  | "deaths-all"
  | "deaths-notable"
  | "deaths-decades"
  | "deaths-decade"
  | "deaths-cause"
  | "genres-index"
  | "genre"
  | "causes-of-death-index"
  | "causes-of-death-category"
  | "causes-of-death-specific"
  | "about"
  | "faq"
  | "methodology"
  | "data-sources"
  | "season"

export interface MatchResult {
  pageType: PageType
  params: Record<string, string>
}

/**
 * Extract the trailing numeric ID from a slug like "the-godfather-1972-238"
 * Returns the last segment after the final hyphen.
 */
function extractTrailingId(slug: string): string | null {
  const lastHyphen = slug.lastIndexOf("-")
  if (lastHyphen === -1) return null
  const id = slug.slice(lastHyphen + 1)
  return /^\d+$/.test(id) ? id : null
}

/**
 * Parse episode slug format: {showSlug}-s{N}e{N}-{episodeSlug}-{showTmdbId}
 * Example: "breaking-bad-s1e1-pilot-1396"
 *
 * Uses the last -s{N}e{N}- match to handle show slugs that may contain
 * a similar substring. Extracts trailing TMDB ID separately.
 */
function parseEpisodeSlug(
  slug: string
): { showTmdbId: string; season: string; episode: string } | null {
  const showTmdbId = extractTrailingId(slug)
  if (!showTmdbId) return null

  // Find all -sNeN- markers and use the last one to correctly handle
  // show slugs that themselves contain a -s{N}e{N}- substring
  const matches = [...slug.matchAll(/-s(\d+)e(\d+)-/g)]
  if (matches.length === 0) return null

  const lastMatch = matches[matches.length - 1]
  return { showTmdbId, season: lastMatch[1], episode: lastMatch[2] }
}

/** Static pages (exact matches) — defined at module level to avoid per-call allocation */
const STATIC_PAGES: Record<string, PageType> = {
  "/forever-young": "forever-young",
  "/in-detail": "in-detail",
  "/covid-deaths": "covid-deaths",
  "/unnatural-deaths": "unnatural-deaths",
  "/deaths": "deaths-index",
  "/deaths/all": "deaths-all",
  "/deaths/notable": "deaths-notable",
  "/deaths/decades": "deaths-decades",
  "/movies/genres": "genres-index",
  "/causes-of-death": "causes-of-death-index",
  "/about": "about",
  "/faq": "faq",
  "/methodology": "methodology",
  "/data-sources": "data-sources",
}

/**
 * Match a URL path against known frontend routes.
 * Returns the page type and extracted parameters, or null for unrecognized paths.
 */
export function matchUrl(path: string): MatchResult | null {
  // Normalize: strip trailing slash (except root), strip query string
  const cleanPath = path.split("?")[0].replace(/\/$/, "") || "/"

  // Home
  if (cleanPath === "/") {
    return { pageType: "home", params: {} }
  }

  // Search
  if (cleanPath === "/search") {
    return { pageType: "search", params: {} }
  }

  // Actor death details: /actor/{slug}/death → redirect to /actor/{slug}
  const actorDeathMatch = cleanPath.match(/^\/actor\/([^/]+)\/death$/)
  if (actorDeathMatch) {
    return { pageType: "redirect", params: { target: `/actor/${actorDeathMatch[1]}` } }
  }

  // Actor: /actor/{slug}-{id}
  const actorMatch = cleanPath.match(/^\/actor\/([^/]+)$/)
  if (actorMatch) {
    const actorId = extractTrailingId(actorMatch[1])
    if (actorId) {
      return { pageType: "actor", params: { actorId } }
    }
  }

  // Movie: /movie/{slug}-{year}-{tmdbId}
  const movieMatch = cleanPath.match(/^\/movie\/([^/]+)$/)
  if (movieMatch) {
    const tmdbId = extractTrailingId(movieMatch[1])
    if (tmdbId) {
      return { pageType: "movie", params: { tmdbId } }
    }
  }

  // Episode: /episode/{showSlug}-s{N}e{N}-{episodeSlug}-{showTmdbId}
  const episodeMatch = cleanPath.match(/^\/episode\/([^/]+)$/)
  if (episodeMatch) {
    const parsed = parseEpisodeSlug(episodeMatch[1])
    if (parsed) {
      return {
        pageType: "episode",
        params: {
          showTmdbId: parsed.showTmdbId,
          season: parsed.season,
          episode: parsed.episode,
        },
      }
    }
  }

  // Season: /show/{slug}-{year}-{tmdbId}/season/{seasonNumber}
  const seasonMatch = cleanPath.match(/^\/show\/([^/]+)\/season\/(\d+)$/)
  if (seasonMatch) {
    const tmdbId = extractTrailingId(seasonMatch[1])
    if (tmdbId) {
      return { pageType: "season", params: { tmdbId, seasonNumber: seasonMatch[2] } }
    }
  }

  // Show: /show/{slug}-{year}-{tmdbId}
  const showMatch = cleanPath.match(/^\/show\/([^/]+)$/)
  if (showMatch) {
    const tmdbId = extractTrailingId(showMatch[1])
    if (tmdbId) {
      return { pageType: "show", params: { tmdbId } }
    }
  }

  // Static pages (exact matches)
  if (cleanPath in STATIC_PAGES) {
    return { pageType: STATIC_PAGES[cleanPath], params: {} }
  }

  // Deaths by decade: /deaths/decade/{decade}
  const decadeMatch = cleanPath.match(/^\/deaths\/decade\/(\d{4}s?)$/)
  if (decadeMatch) {
    return { pageType: "deaths-decade", params: { decade: decadeMatch[1] } }
  }

  // Deaths by cause: /deaths/{cause}
  const deathCauseMatch = cleanPath.match(/^\/deaths\/([a-z0-9-]+)$/)
  if (deathCauseMatch) {
    return { pageType: "deaths-cause", params: { cause: deathCauseMatch[1] } }
  }

  // Genre: /movies/genre/{genre}
  const genreMatch = cleanPath.match(/^\/movies\/genre\/([a-z0-9-]+)$/)
  if (genreMatch) {
    return { pageType: "genre", params: { genre: genreMatch[1] } }
  }

  // Causes of death specific: /causes-of-death/{category}/{cause}
  const causeSpecificMatch = cleanPath.match(/^\/causes-of-death\/([a-z0-9-]+)\/([a-z0-9-]+)$/)
  if (causeSpecificMatch) {
    return {
      pageType: "causes-of-death-specific",
      params: {
        categorySlug: causeSpecificMatch[1],
        causeSlug: causeSpecificMatch[2],
      },
    }
  }

  // Causes of death category: /causes-of-death/{category}
  const causeCategoryMatch = cleanPath.match(/^\/causes-of-death\/([a-z0-9-]+)$/)
  if (causeCategoryMatch) {
    return {
      pageType: "causes-of-death-category",
      params: { categorySlug: causeCategoryMatch[1] },
    }
  }

  return null
}
