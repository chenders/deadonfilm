import type { MovieDetails } from "@/types"
import { getPosterUrl } from "@/services/api"
import { getYear } from "@/utils/formatDate"

interface MovieHeaderProps {
  movie: MovieDetails
  hidePoster?: boolean
}

export default function MovieHeader({ movie, hidePoster = false }: MovieHeaderProps) {
  const year = getYear(movie.release_date)
  const posterUrl = getPosterUrl(movie.poster_path, "w342")

  return (
    <div data-testid="movie-header" className="flex flex-col items-center text-center mb-2 md:mb-4">
      {!hidePoster &&
        (posterUrl ? (
          <img
            data-testid="movie-poster"
            src={posterUrl}
            alt={`${movie.title} poster`}
            className="w-[clamp(6rem,18vh,12rem)] h-auto rounded-lg shadow-md mb-2"
          />
        ) : (
          <div
            data-testid="movie-poster-placeholder"
            className="w-[clamp(6rem,18vh,12rem)] aspect-[2/3] bg-beige rounded-lg flex items-center justify-center mb-2"
          >
            <span className="text-text-muted">No poster</span>
          </div>
        ))}

      <h1
        data-testid="movie-title"
        className="font-display text-3xl md:text-4xl text-accent leading-tight"
      >
        {movie.title}
      </h1>
      <p data-testid="movie-year" className="text-lg md:text-xl text-brown-medium">
        ({year})
      </p>
    </div>
  )
}

export function MoviePoster({ movie }: { movie: MovieDetails }) {
  const posterUrl = getPosterUrl(movie.poster_path, "w342")
  const tmdbUrl = `https://www.themoviedb.org/movie/${movie.id}`

  if (posterUrl) {
    return (
      <a
        href={tmdbUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-shrink-0 transition-transform duration-200 hover:scale-105"
        title="View on TMDB"
      >
        <img
          data-testid="movie-poster"
          src={posterUrl}
          alt={`${movie.title} poster`}
          className="w-32 md:w-44 h-auto rounded-lg shadow-md cursor-pointer"
        />
      </a>
    )
  }

  return (
    <a
      href={tmdbUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex-shrink-0"
      title="View on TMDB"
    >
      <div
        data-testid="movie-poster-placeholder"
        className="w-32 md:w-44 aspect-[2/3] bg-beige rounded-lg flex items-center justify-center cursor-pointer hover:bg-cream transition-colors"
      >
        <span className="text-text-muted text-sm">No poster</span>
      </div>
    </a>
  )
}
