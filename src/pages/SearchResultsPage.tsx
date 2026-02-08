import { useState, useEffect, useCallback, useRef } from "react"
import { useSearchParams, Link } from "react-router-dom"
import { useUnifiedSearch } from "@/hooks/useUnifiedSearch"
import { createMovieSlug, createShowSlug, createActorSlug } from "@/utils/slugify"
import { getYear } from "@/utils/formatDate"
import { getMediaBadge, getPersonSubtitle, isValidMediaType } from "@/utils/search-utils"
import { SEO } from "@/components/SEO"
import MediaTypeToggle from "@/components/search/MediaTypeToggle"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import { SkullIcon, FilmReelIcon, TVIcon, PersonIcon } from "@/components/icons"
import type { UnifiedSearchResult, SearchMediaType } from "@/types"

const BASE_URL = "https://deadonfilm.com"
const MIN_QUERY_LENGTH = 3

function getResultUrl(result: UnifiedSearchResult): string {
  if (result.media_type === "person") {
    return `/actor/${createActorSlug(result.title, result.id)}`
  }
  if (result.media_type === "tv") {
    return `/show/${createShowSlug(result.title, result.release_date, result.id)}`
  }
  return `/movie/${createMovieSlug(result.title, result.release_date, result.id)}`
}

// Larger image sizes than the search modal (w92/w185 vs w45_and_h67_face)
// because ResultCard renders at 56px/72px vs the modal's 40px/56px
function getPosterUrls(posterPath: string | null) {
  if (!posterPath) return null
  const base = "https://media.themoviedb.org/t/p"
  return {
    src: `${base}/w92${posterPath}`,
    srcSet: `${base}/w92${posterPath} 1x, ${base}/w185${posterPath} 2x`,
  }
}

function getProfileUrls(profilePath: string | null) {
  if (!profilePath) return null
  const base = "https://media.themoviedb.org/t/p"
  return {
    src: `${base}/w92${profilePath}`,
    srcSet: `${base}/w92${profilePath} 1x, ${base}/w185${profilePath} 2x`,
  }
}

function ResultCard({ result }: { result: UnifiedSearchResult }) {
  const isPerson = result.media_type === "person"
  const year = isPerson ? "" : getYear(result.release_date)
  const badge = getMediaBadge(result.media_type)
  const url = getResultUrl(result)
  const imageUrls = isPerson
    ? getProfileUrls(result.poster_path)
    : getPosterUrls(result.poster_path)

  return (
    <Link
      to={url}
      data-testid="search-result-card"
      className="flex items-center gap-4 rounded-lg border border-brown-medium/10 bg-surface-elevated px-4 py-3 transition-colors hover:bg-beige/50"
    >
      {/* Image */}
      {isPerson ? (
        <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-full bg-brown-medium/10">
          {imageUrls ? (
            <img
              src={imageUrls.src}
              srcSet={imageUrls.srcSet}
              alt={result.title}
              width={56}
              height={56}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-brown-medium/30">
              <PersonIcon size={24} />
            </div>
          )}
        </div>
      ) : (
        <div className="h-[72px] w-12 flex-shrink-0 overflow-hidden rounded bg-brown-medium/10">
          {imageUrls ? (
            <img
              src={imageUrls.src}
              srcSet={imageUrls.srcSet}
              alt={`${result.title} poster`}
              width={48}
              height={72}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-brown-medium/30">
              {result.media_type === "tv" ? <TVIcon size={20} /> : <FilmReelIcon size={20} />}
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-lg font-medium text-brown-dark">{result.title}</span>
          <span
            className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge.className}`}
          >
            {badge.label}
          </span>
        </div>
        <div className="text-sm text-text-muted">{isPerson ? getPersonSubtitle(result) : year}</div>
      </div>

      {/* Death indicator */}
      {isPerson && result.is_deceased && (
        <div className="flex-shrink-0 text-accent">
          <SkullIcon size={24} />
        </div>
      )}
    </Link>
  )
}

export default function SearchResultsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryParam = searchParams.get("q") || ""
  const typeParam = searchParams.get("type")
  const mediaType: SearchMediaType = isValidMediaType(typeParam) ? typeParam : "all"

  const [inputValue, setInputValue] = useState(queryParam)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const mediaTypeRef = useRef(mediaType)
  mediaTypeRef.current = mediaType
  const isLocalUpdateRef = useRef(false)

  const { data, isLoading } = useUnifiedSearch(inputValue, mediaType)
  const results = data?.results || []

  // Sync input value when URL changes externally (e.g., browser back/forward)
  // Skip syncing when the URL change was triggered by our own debounced update
  useEffect(() => {
    if (isLocalUpdateRef.current) {
      isLocalUpdateRef.current = false
      return
    }
    setInputValue(queryParam)
  }, [queryParam, mediaType])

  const updateSearchParams = useCallback(
    (newQuery: string, newType: SearchMediaType) => {
      isLocalUpdateRef.current = true
      const params: Record<string, string> = {}
      const trimmed = newQuery.trim()
      if (trimmed) params.q = trimmed
      if (newType !== "all") params.type = newType
      setSearchParams(params, { replace: true })
    },
    [setSearchParams]
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setInputValue(value)

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    debounceTimerRef.current = setTimeout(() => {
      updateSearchParams(value, mediaTypeRef.current)
    }, 400)
  }

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  const handleMediaTypeChange = (type: SearchMediaType) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    updateSearchParams(inputValue, type)
  }

  // Group results by media type when showing "all"
  const movieResults = results.filter((r) => r.media_type === "movie")
  const tvResults = results.filter((r) => r.media_type === "tv")
  const personResults = results.filter((r) => r.media_type === "person")

  const hasResults = results.length > 0
  const effectiveQuery = inputValue.trim()
  const showNoResults = effectiveQuery.length >= 2 && !isLoading && !hasResults
  const normalizedQuery = queryParam.trim().toLowerCase()
  const shouldNoindex = normalizedQuery.length < MIN_QUERY_LENGTH || (!isLoading && !hasResults)
  const canonical =
    normalizedQuery.length >= MIN_QUERY_LENGTH
      ? `${BASE_URL}/search?q=${encodeURIComponent(normalizedQuery)}`
      : undefined

  const title = queryParam
    ? `Search results for "${queryParam}"`
    : "Search movies, shows, and people"
  const description = queryParam
    ? `Search results for "${queryParam}" on Dead on Film. Find movies, TV shows, and actors with mortality statistics.`
    : "Search the Dead on Film database for movies, TV shows, and actors. See which cast members have passed away."

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <SEO title={title} description={description} canonical={canonical} noindex={shouldNoindex} />

      <h1 className="mb-6 text-center font-display text-3xl text-brown-dark">Search</h1>

      {/* Search input */}
      <div className="mb-4">
        <input
          type="text"
          data-testid="search-page-input"
          value={inputValue}
          onChange={handleInputChange}
          placeholder="Search movies, shows, and people..."
          className="w-full rounded-lg border border-brown-medium/30 bg-surface-elevated px-4 py-3 text-lg text-brown-dark placeholder-text-muted/60 focus:border-brown-dark focus:outline-none focus:ring-1 focus:ring-brown-dark"
        />
      </div>

      {/* Media type toggle */}
      <div className="mb-8 flex justify-center">
        <MediaTypeToggle value={mediaType} onChange={handleMediaTypeChange} />
      </div>

      {/* Loading */}
      {isLoading && effectiveQuery.length >= 2 && (
        <div className="py-12">
          <LoadingSpinner message="Searching..." />
        </div>
      )}

      {/* Results */}
      {!isLoading && hasResults && (
        <div data-testid="search-results">
          {mediaType === "all" ? (
            <>
              {movieResults.length > 0 && (
                <section className="mb-8">
                  <h2 className="mb-3 font-display text-sm uppercase tracking-wide text-text-muted">
                    Movies
                  </h2>
                  <div className="space-y-2">
                    {movieResults.map((result) => (
                      <ResultCard key={`movie-${result.id}`} result={result} />
                    ))}
                  </div>
                </section>
              )}
              {tvResults.length > 0 && (
                <section className="mb-8">
                  <h2 className="mb-3 font-display text-sm uppercase tracking-wide text-text-muted">
                    TV Shows
                  </h2>
                  <div className="space-y-2">
                    {tvResults.map((result) => (
                      <ResultCard key={`tv-${result.id}`} result={result} />
                    ))}
                  </div>
                </section>
              )}
              {personResults.length > 0 && (
                <section className="mb-8">
                  <h2 className="mb-3 font-display text-sm uppercase tracking-wide text-text-muted">
                    People
                  </h2>
                  <div className="space-y-2">
                    {personResults.map((result) => (
                      <ResultCard key={`person-${result.id}`} result={result} />
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            <div className="space-y-2">
              {results.map((result) => (
                <ResultCard key={`${result.media_type}-${result.id}`} result={result} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* No results */}
      {showNoResults && (
        <div data-testid="search-no-results" className="py-16 text-center">
          <p className="mb-2 font-display text-lg uppercase tracking-wide text-brown-dark">
            End of Reel
          </p>
          <p className="text-text-muted">
            No results found for "<span className="italic">{inputValue}</span>"
          </p>
        </div>
      )}

      {/* Empty state (no query) */}
      {!effectiveQuery && (
        <div data-testid="search-empty-state" className="py-16 text-center">
          <p className="text-text-muted">
            Enter a search term to find movies, TV shows, and people.
          </p>
        </div>
      )}
    </div>
  )
}
