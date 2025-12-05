import type { MovieDetails } from '@/types'
import { getPosterUrl } from '@/services/api'
import { getYear } from '@/utils/formatDate'

interface MovieHeaderProps {
  movie: MovieDetails
}

export default function MovieHeader({ movie }: MovieHeaderProps) {
  const year = getYear(movie.release_date)
  const posterUrl = getPosterUrl(movie.poster_path, 'w342')

  return (
    <div className="flex flex-col sm:flex-row gap-6 mb-8">
      {posterUrl ? (
        <img
          src={posterUrl}
          alt={`${movie.title} poster`}
          className="w-48 h-auto rounded-lg shadow-md mx-auto sm:mx-0"
        />
      ) : (
        <div className="w-48 h-72 bg-beige rounded-lg flex items-center justify-center mx-auto sm:mx-0">
          <span className="text-text-muted">No poster</span>
        </div>
      )}

      <div className="text-center sm:text-left">
        <h1 className="font-display text-3xl md:text-4xl text-brown-dark mb-2">{movie.title}</h1>
        <p className="text-xl text-text-muted mb-4">({year})</p>

        {movie.genres && movie.genres.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
            {movie.genres.map((genre) => (
              <span
                key={genre.id}
                className="px-3 py-1 bg-beige rounded-full text-sm text-brown-dark"
              >
                {genre.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
