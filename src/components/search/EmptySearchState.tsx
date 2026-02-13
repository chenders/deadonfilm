import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { getRandomPopularMovies, getPosterUrl } from "@/services/api"
import { createMovieSlug } from "@/utils/slugify"
import { FilmReelIcon } from "@/components/icons"
import type { SearchMediaType } from "@/types"

interface EmptySearchStateProps {
  query: string
  mediaType: SearchMediaType
  onTypeChange: (type: SearchMediaType) => void
  /** Compact mode for dropdown/modal. Full mode for search results page. */
  variant?: "compact" | "full"
  /** Called when a link is clicked (e.g. to close modal/dropdown) */
  onNavigate?: () => void
}

type Suggestion = {
  label: string
  switchTo?: SearchMediaType
}

function getSuggestions(mediaType: SearchMediaType): Suggestion[] {
  switch (mediaType) {
    case "movie":
      return [
        { label: "Try TV Shows instead", switchTo: "tv" },
        { label: "Search by actor name in People", switchTo: "person" },
      ]
    case "tv":
      return [
        { label: "Try Movies instead", switchTo: "movie" },
        { label: "Search by actor name in People", switchTo: "person" },
      ]
    case "person":
      return [
        { label: "Try Movies instead", switchTo: "movie" },
        { label: "Try TV Shows instead", switchTo: "tv" },
      ]
    default:
      return [{ label: "Check your spelling" }, { label: "Try a shorter query" }]
  }
}

const BROWSE_LINKS = [
  { to: "/deaths/notable", label: "Notable Deaths" },
  { to: "/causes-of-death", label: "Causes" },
  { to: "/deaths/decades", label: "Decades" },
  { to: "/forever-young", label: "Forever Young" },
] as const

export default function EmptySearchState({
  query,
  mediaType,
  onTypeChange,
  variant = "compact",
  onNavigate,
}: EmptySearchStateProps) {
  const suggestions = getSuggestions(mediaType)
  const isCompact = variant === "compact"

  return (
    <div data-testid="empty-search-state">
      {/* Header */}
      <p
        className={`font-display uppercase tracking-wide text-brown-dark ${
          isCompact ? "mb-1 text-sm" : "mb-2 text-lg"
        }`}
      >
        End of Reel
      </p>
      <p className={`text-text-muted ${isCompact ? "text-sm" : "text-base"}`}>
        No results for "<span className="italic">{query}</span>"
      </p>

      {/* Suggestions */}
      <div className={`${isCompact ? "mt-3" : "mt-4"}`}>
        <p className={`mb-1.5 font-medium text-brown-dark ${isCompact ? "text-xs" : "text-sm"}`}>
          Suggestions:
        </p>
        <ul className={`space-y-1 ${isCompact ? "text-xs" : "text-sm"}`}>
          {suggestions.map((suggestion) => (
            <li key={suggestion.label} className="text-text-muted">
              <span className="mr-1 text-brown-medium/50">&bull;</span>
              {suggestion.switchTo ? (
                <button
                  type="button"
                  data-testid={`suggestion-${suggestion.switchTo}`}
                  onClick={() => onTypeChange(suggestion.switchTo!)}
                  className="text-brown-medium underline decoration-brown-medium/40 underline-offset-2 hover:text-brown-dark hover:decoration-brown-dark/60"
                >
                  {suggestion.label}
                </button>
              ) : (
                suggestion.label
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Popular Movies */}
      <PopularMoviesRow compact={isCompact} onNavigate={onNavigate} />

      {/* Browse Links */}
      <div className={`${isCompact ? "mt-3" : "mt-5"}`}>
        <p className={`mb-1.5 text-text-muted ${isCompact ? "text-xs" : "text-sm"}`}>Or browse:</p>
        <div className="flex flex-wrap justify-center gap-1.5">
          {BROWSE_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={onNavigate}
              className="rounded-full border border-brown-medium/25 bg-beige px-2.5 py-0.5 text-xs font-medium text-brown-dark transition-colors hover:border-brown-medium/50 hover:bg-cream"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

function PopularMoviesRow({ compact, onNavigate }: { compact: boolean; onNavigate?: () => void }) {
  const { data } = useQuery({
    queryKey: ["random-popular-movies"],
    queryFn: () => getRandomPopularMovies(4),
    staleTime: 4 * 60 * 60 * 1000, // 4 hours - matches server cache
    retry: 1,
  })

  if (!data || data.movies.length === 0) return null

  return (
    <div className={`${compact ? "mt-3" : "mt-5"}`}>
      <p className={`mb-2 text-text-muted ${compact ? "text-xs" : "text-sm"}`}>
        Popular on Dead on Film:
      </p>
      <div className="flex justify-center gap-2">
        {data.movies.map((movie) => {
          const releaseDate = movie.releaseYear ? `${movie.releaseYear}-01-01` : ""
          const slug = createMovieSlug(movie.title, releaseDate, movie.id)

          const posterUrl = getPosterUrl(movie.posterPath, "w92")

          return (
            <Link
              key={movie.id}
              to={`/movie/${slug}`}
              onClick={onNavigate}
              className="group flex w-16 flex-col items-center text-center"
            >
              {posterUrl ? (
                <img
                  src={posterUrl}
                  alt={movie.title}
                  width={48}
                  height={72}
                  loading="lazy"
                  className="mb-1 h-[72px] w-12 rounded object-cover shadow-sm transition-transform group-hover:scale-105"
                />
              ) : (
                <div className="mb-1 flex h-[72px] w-12 items-center justify-center rounded bg-brown-medium/20">
                  <FilmReelIcon size={20} className="text-text-muted" />
                </div>
              )}
              <span
                className={`w-full truncate font-medium text-brown-dark ${compact ? "text-[10px]" : "text-xs"}`}
                title={movie.title}
              >
                {movie.title}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
