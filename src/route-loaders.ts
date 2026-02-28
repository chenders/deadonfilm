/**
 * Route-level data loaders for SSR prefetching.
 *
 * Each loader returns an array of { queryKey, queryFn } specs that the
 * SSR middleware prefetches via queryClient.prefetchQuery() before
 * rendering. This ensures the React Query cache is warm when the app
 * renders on the server, so components get data synchronously.
 *
 * Only public routes need loaders — admin routes are not SSR-rendered.
 * Static pages (about, faq, etc.) have no loaders since they don't fetch data.
 */

import { extractMovieId, extractShowId, extractEpisodeInfo } from "./utils/slugify"

/** A single query to prefetch before SSR */
export interface PrefetchSpec {
  queryKey: readonly unknown[]
  queryFn: () => Promise<unknown>
}

/** URL match result with extracted parameters */
interface RouteMatch {
  loaders: (fetchBase: string) => PrefetchSpec[]
}

/** Helper to create a fetch function against the internal API */
function apiFetch<T>(fetchBase: string, path: string): Promise<T> {
  return fetch(`${fetchBase}${path}`).then((res) => {
    if (!res.ok) throw new Error(`API ${res.status}: ${path}`)
    return res.json() as Promise<T>
  })
}

/**
 * Route patterns and their data loaders.
 * Order matters — first match wins. More specific patterns go first.
 */
const routes: Array<{
  pattern: RegExp
  loader: (params: Record<string, string>, searchParams: URLSearchParams) => RouteMatch
}> = [
  // Actor page
  {
    pattern: /^\/actor\/(?<slug>[^/]+)$/,
    loader: (params) => ({
      loaders: (base) => [
        {
          queryKey: ["actors", params.slug],
          queryFn: () => apiFetch(base, `/api/actor/${encodeURIComponent(params.slug)}`),
        },
      ],
    }),
  },

  // Movie page
  {
    pattern: /^\/movie\/(?<slug>[^/]+)$/,
    loader: (params) => {
      const movieId = extractMovieId(params.slug)
      return {
        loaders: (base) =>
          movieId > 0
            ? [
                {
                  queryKey: ["movies", movieId],
                  queryFn: () => apiFetch(base, `/api/movie/${movieId}`),
                },
              ]
            : [],
      }
    },
  },

  // Episode page
  {
    pattern: /^\/episode\/(?<slug>[^/]+)$/,
    loader: (params) => {
      const info = extractEpisodeInfo(params.slug)
      return {
        loaders: (base) =>
          info
            ? [
                {
                  queryKey: ["episode", info.showId, info.season, info.episode],
                  queryFn: () =>
                    apiFetch(
                      base,
                      `/api/show/${info.showId}/season/${info.season}/episode/${info.episode}`
                    ),
                },
              ]
            : [],
      }
    },
  },

  // Season page
  {
    pattern: /^\/show\/(?<slug>[^/]+)\/season\/(?<seasonNumber>\d+)$/,
    loader: (params) => {
      const showId = extractShowId(params.slug)
      const seasonNumber = parseInt(params.seasonNumber, 10)
      return {
        loaders: (base) =>
          showId > 0 && seasonNumber > 0
            ? [
                {
                  queryKey: ["season", showId, seasonNumber],
                  queryFn: () => apiFetch(base, `/api/show/${showId}/season/${seasonNumber}`),
                },
              ]
            : [],
      }
    },
  },

  // Show page
  {
    pattern: /^\/show\/(?<slug>[^/]+)$/,
    loader: (params) => {
      const showId = extractShowId(params.slug)
      return {
        loaders: (base) =>
          showId > 0
            ? [
                {
                  queryKey: ["shows", showId],
                  queryFn: () => apiFetch(base, `/api/show/${showId}`),
                },
              ]
            : [],
      }
    },
  },

  // Causes of death — specific cause (3rd level)
  {
    pattern: /^\/causes-of-death\/(?<categorySlug>[^/]+)\/(?<causeSlug>[^/]+)$/,
    loader: (params, searchParams) => {
      const page = searchParams.get("page") || "1"
      const includeObscure = searchParams.get("includeObscure") || "false"
      return {
        loaders: (base) => [
          {
            queryKey: [
              "specific-cause",
              params.categorySlug,
              params.causeSlug,
              parseInt(page, 10),
              includeObscure === "true",
            ],
            queryFn: () =>
              apiFetch(
                base,
                `/api/causes-of-death/${encodeURIComponent(params.categorySlug)}/${encodeURIComponent(params.causeSlug)}?page=${page}&includeObscure=${includeObscure}`
              ),
          },
        ],
      }
    },
  },

  // Causes of death — category (2nd level)
  {
    pattern: /^\/causes-of-death\/(?<categorySlug>[^/]+)$/,
    loader: (params, searchParams) => {
      const page = searchParams.get("page") || "1"
      const includeObscure = searchParams.get("includeObscure") || "false"
      return {
        loaders: (base) => [
          {
            queryKey: [
              "causes-of-death-category",
              params.categorySlug,
              parseInt(page, 10),
              includeObscure === "true",
              undefined,
            ],
            queryFn: () =>
              apiFetch(
                base,
                `/api/causes-of-death/${encodeURIComponent(params.categorySlug)}?page=${page}&includeObscure=${includeObscure}`
              ),
          },
        ],
      }
    },
  },

  // Causes of death — index
  {
    pattern: /^\/causes-of-death$/,
    loader: () => ({
      loaders: (base) => [
        {
          queryKey: ["causes-of-death-index"],
          queryFn: () => apiFetch(base, "/api/causes-of-death"),
        },
      ],
    }),
  },

  // Deaths by decade
  {
    pattern: /^\/deaths\/decade\/(?<decade>[^/]+)$/,
    loader: (params, searchParams) => {
      const page = searchParams.get("page") || "1"
      const includeObscure = searchParams.get("includeObscure") || "false"
      return {
        loaders: (base) => [
          {
            queryKey: [
              "deaths-by-decade",
              params.decade,
              parseInt(page, 10),
              includeObscure === "true",
            ],
            queryFn: () =>
              apiFetch(
                base,
                `/api/deaths/decade/${encodeURIComponent(params.decade)}?page=${page}&includeObscure=${includeObscure}`
              ),
          },
        ],
      }
    },
  },

  // Deaths — notable
  {
    pattern: /^\/deaths\/notable$/,
    loader: (_params, searchParams) => {
      const page = searchParams.get("page") || "1"
      const filter = searchParams.get("filter") || "all"
      const includeObscure = searchParams.get("includeObscure") || "false"
      const sort = searchParams.get("sort") || "date"
      const dir = searchParams.get("dir") || "desc"
      return {
        loaders: (base) => [
          {
            queryKey: [
              "notable-deaths",
              parseInt(page, 10),
              20,
              filter,
              includeObscure === "true",
              sort,
              dir,
            ],
            queryFn: () =>
              apiFetch(
                base,
                `/api/deaths/notable?page=${page}&filter=${filter}&includeObscure=${includeObscure}&sort=${sort}&dir=${dir}`
              ),
          },
        ],
      }
    },
  },

  // Deaths — all
  {
    pattern: /^\/deaths\/all$/,
    loader: (_params, searchParams) => {
      const page = searchParams.get("page") || "1"
      const includeObscure = searchParams.get("includeObscure") || "false"
      const search = searchParams.get("search") || ""
      const sort = searchParams.get("sort") || "date"
      const dir = searchParams.get("dir") || "desc"
      return {
        loaders: (base) => [
          {
            queryKey: [
              "all-deaths",
              parseInt(page, 10),
              includeObscure === "true",
              search,
              sort,
              dir,
            ],
            queryFn: () =>
              apiFetch(
                base,
                `/api/deaths/all?page=${page}&includeObscure=${includeObscure}${search ? `&search=${encodeURIComponent(search)}` : ""}&sort=${sort}&dir=${dir}`
              ),
          },
        ],
      }
    },
  },

  // Deaths — decades index
  {
    pattern: /^\/deaths\/decades$/,
    loader: () => ({
      loaders: (base) => [
        {
          queryKey: ["decade-categories"],
          queryFn: () => apiFetch(base, "/api/deaths/decades"),
        },
      ],
    }),
  },

  // Deaths — by cause (old route)
  {
    pattern: /^\/deaths\/(?<cause>[^/]+)$/,
    loader: (params, searchParams) => {
      const page = searchParams.get("page") || "1"
      const includeObscure = searchParams.get("includeObscure") || "false"
      return {
        loaders: (base) => [
          {
            queryKey: [
              "deaths-by-cause",
              params.cause,
              parseInt(page, 10),
              includeObscure === "true",
            ],
            queryFn: () =>
              apiFetch(
                base,
                `/api/deaths/cause/${encodeURIComponent(params.cause)}?page=${page}&includeObscure=${includeObscure}`
              ),
          },
        ],
      }
    },
  },

  // Deaths — causes index
  {
    pattern: /^\/deaths$/,
    loader: () => ({
      loaders: (base) => [
        {
          queryKey: ["cause-categories"],
          queryFn: () => apiFetch(base, "/api/deaths/causes"),
        },
      ],
    }),
  },

  // Movies by genre
  {
    pattern: /^\/movies\/genre\/(?<genre>[^/]+)$/,
    loader: (params, searchParams) => {
      const page = searchParams.get("page") || "1"
      return {
        loaders: (base) => [
          {
            queryKey: ["movies-by-genre", params.genre, parseInt(page, 10)],
            queryFn: () =>
              apiFetch(base, `/api/movies/genre/${encodeURIComponent(params.genre)}?page=${page}`),
          },
        ],
      }
    },
  },

  // Genres index
  {
    pattern: /^\/movies\/genres$/,
    loader: () => ({
      loaders: (base) => [
        {
          queryKey: ["genre-categories"],
          queryFn: () => apiFetch(base, "/api/movies/genres"),
        },
      ],
    }),
  },

  // Forever young
  {
    pattern: /^\/forever-young$/,
    loader: (_params, searchParams) => {
      const page = searchParams.get("page") || "1"
      const sort = searchParams.get("sort") || "year"
      const dir = searchParams.get("dir") || "desc"
      return {
        loaders: (base) => [
          {
            queryKey: ["forever-young", parseInt(page, 10), sort, dir],
            queryFn: () =>
              apiFetch(base, `/api/forever-young?page=${page}&sort=${sort}&dir=${dir}`),
          },
        ],
      }
    },
  },

  // Covid deaths
  {
    pattern: /^\/covid-deaths$/,
    loader: (_params, searchParams) => {
      const page = searchParams.get("page") || "1"
      const includeObscure = searchParams.get("includeObscure") || "false"
      return {
        loaders: (base) => [
          {
            queryKey: ["covid-deaths", parseInt(page, 10), includeObscure === "true"],
            queryFn: () =>
              apiFetch(base, `/api/covid-deaths?page=${page}&includeObscure=${includeObscure}`),
          },
        ],
      }
    },
  },

  // Unnatural deaths
  {
    pattern: /^\/unnatural-deaths$/,
    loader: (_params, searchParams) => {
      const page = searchParams.get("page") || "1"
      const category = searchParams.get("category") || "all"
      const showSelfInflicted = searchParams.get("showSelfInflicted") || "false"
      const includeObscure = searchParams.get("includeObscure") || "false"
      return {
        loaders: (base) => [
          {
            queryKey: [
              "unnatural-deaths",
              parseInt(page, 10),
              category,
              showSelfInflicted === "true",
              includeObscure === "true",
            ],
            queryFn: () =>
              apiFetch(
                base,
                `/api/unnatural-deaths?page=${page}&category=${category}&showSelfInflicted=${showSelfInflicted}&includeObscure=${includeObscure}`
              ),
          },
        ],
      }
    },
  },

  // Home page — prefetch stats, recent deaths, featured movie
  {
    pattern: /^\/$/,
    loader: () => ({
      loaders: (base) => [
        {
          queryKey: ["site-stats"],
          queryFn: () => apiFetch(base, "/api/stats"),
        },
        {
          queryKey: ["recent-deaths", 6],
          queryFn: () => apiFetch(base, "/api/recent-deaths?limit=6"),
        },
        {
          queryKey: ["featured-movie"],
          queryFn: () => apiFetch(base, "/api/featured-movie"),
        },
      ],
    }),
  },
]

/**
 * Match a URL against the route loaders and return prefetch specs.
 * Returns null if no loader matches (static pages, unknown routes).
 */
export function matchRouteLoaders(url: string): ((fetchBase: string) => PrefetchSpec[]) | null {
  // Split URL into path and search params
  const [pathname, search] = url.split("?")
  const normalizedPath = pathname.replace(/\/$/, "") || "/"
  const searchParams = new URLSearchParams(search || "")

  for (const route of routes) {
    const match = normalizedPath.match(route.pattern)
    if (match) {
      // Extract params from named capture groups
      const params: Record<string, string> = {}
      if (match.groups) {
        for (const [key, value] of Object.entries(match.groups)) {
          if (value != null) params[key] = value
        }
      }

      const result = route.loader(params, searchParams)
      return result.loaders
    }
  }

  return null
}
