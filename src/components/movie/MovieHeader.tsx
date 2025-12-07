import type { MovieDetails } from "@/types"
import { getPosterUrl } from "@/services/api"
import { getYear } from "@/utils/formatDate"

interface MovieHeaderProps {
  movie: MovieDetails
}

export default function MovieHeader({ movie }: MovieHeaderProps) {
  const year = getYear(movie.release_date)
  const posterUrl = getPosterUrl(movie.poster_path, "w342")

  return (
    <div data-testid="movie-header" className="flex flex-col items-center text-center mb-2 md:mb-4">
      {posterUrl ? (
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
      )}

      <h1
        data-testid="movie-title"
        className="font-display text-[clamp(1.25rem,4vh,2.5rem)] text-brown-dark leading-tight"
      >
        {movie.title}
      </h1>
      <p data-testid="movie-year" className="text-[clamp(0.875rem,2.5vh,1.25rem)] text-text-muted">
        ({year})
      </p>
    </div>
  )
}
