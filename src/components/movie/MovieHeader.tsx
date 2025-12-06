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
    <div className="flex flex-col items-center text-center mb-8">
      {posterUrl ? (
        <img
          src={posterUrl}
          alt={`${movie.title} poster`}
          className="w-48 md:w-56 h-auto rounded-lg shadow-md mb-6"
        />
      ) : (
        <div className="w-48 md:w-56 h-72 md:h-84 bg-beige rounded-lg flex items-center justify-center mb-6">
          <span className="text-text-muted">No poster</span>
        </div>
      )}

      <h1 className="font-display text-3xl md:text-5xl text-brown-dark mb-2">{movie.title}</h1>
      <p className="text-xl md:text-2xl text-text-muted mb-4">({year})</p>

      {movie.genres && movie.genres.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center">
          {movie.genres.map((genre) => (
            <span
              key={genre.id}
              className="px-4 py-1.5 bg-beige rounded-full text-sm md:text-base text-brown-dark"
            >
              {genre.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
