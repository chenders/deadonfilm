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
    <div data-testid="movie-header" className="mb-2 flex flex-col items-center text-center md:mb-4">
      {!hidePoster &&
        (posterUrl ? (
          <img
            data-testid="movie-poster"
            src={posterUrl}
            alt={`${movie.title} poster`}
            width={342}
            height={513}
            className="mb-2 h-auto w-[clamp(6rem,18vh,12rem)] rounded-lg shadow-md"
          />
        ) : (
          <div
            data-testid="movie-poster-placeholder"
            className="mb-2 flex aspect-[2/3] w-[clamp(6rem,18vh,12rem)] items-center justify-center rounded-lg bg-beige"
          >
            <span className="text-text-muted">No poster</span>
          </div>
        ))}

      <h1
        data-testid="movie-title"
        className="font-display text-3xl leading-tight text-accent md:text-4xl"
      >
        {movie.title}
      </h1>
      <p data-testid="movie-year" className="text-lg text-brown-medium md:text-xl">
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
          width={342}
          height={513}
          className="h-auto w-32 cursor-pointer rounded-lg shadow-md md:w-44"
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
        className="flex aspect-[2/3] w-32 cursor-pointer items-center justify-center rounded-lg bg-beige transition-colors hover:bg-cream md:w-44"
      >
        <span className="text-sm text-text-muted">No poster</span>
      </div>
    </a>
  )
}
