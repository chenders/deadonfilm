/**
 * Actor preview card for hover popover.
 * Shows top movies, top shows, and total counts.
 */

import { useActorPreview } from "../../hooks/admin/useCoverage"
import Skeleton from "./ui/Skeleton"

interface ActorPreviewCardProps {
  actorId: number
}

export default function ActorPreviewCard({ actorId }: ActorPreviewCardProps) {
  const { data, isLoading, error } = useActorPreview(actorId)

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" label="Loading section title" />
          <Skeleton.Text lines={3} lastLineWidth={60} label="Loading movie list" />
          <Skeleton className="mt-4 h-4 w-20" label="Loading section title" />
          <Skeleton.Text lines={2} lastLineWidth={50} label="Loading show list" />
        </div>
      </div>
    )
  }

  if (error || !data) {
    return <div className="p-4 text-sm text-admin-text-muted">Failed to load preview</div>
  }

  const { topMovies, topShows, totalMovies, totalShows } = data

  return (
    <div className="p-4">
      {/* Top Movies */}
      {topMovies.length > 0 && (
        <div className="mb-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-admin-text-muted">
            Top Movies
          </h4>
          <ul className="space-y-1.5">
            {topMovies.map((movie, idx) => (
              <li key={idx} className="text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-admin-text-primary">{movie.title}</span>
                    {movie.releaseYear && (
                      <span className="ml-1 text-admin-text-muted">({movie.releaseYear})</span>
                    )}
                    {movie.character && (
                      <div className="truncate text-xs text-admin-text-muted">
                        as {movie.character}
                      </div>
                    )}
                  </div>
                  <span className="flex-shrink-0 rounded bg-admin-surface-overlay px-1.5 py-0.5 text-xs text-admin-text-muted">
                    {movie.popularity.toFixed(1)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Top Shows */}
      {topShows.length > 0 && (
        <div className="mb-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-admin-text-muted">
            Top Shows
          </h4>
          <ul className="space-y-1.5">
            {topShows.map((show, idx) => (
              <li key={idx} className="text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-admin-text-primary">{show.name}</span>
                    {show.firstAirYear && (
                      <span className="ml-1 text-admin-text-muted">({show.firstAirYear})</span>
                    )}
                    {show.character && (
                      <div className="truncate text-xs text-admin-text-muted">
                        as {show.character}
                      </div>
                    )}
                  </div>
                  <span className="flex-shrink-0 rounded bg-admin-surface-overlay px-1.5 py-0.5 text-xs text-admin-text-muted">
                    {show.episodeCount} ep
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* No filmography */}
      {topMovies.length === 0 && topShows.length === 0 && (
        <div className="text-sm text-admin-text-muted">No filmography data available</div>
      )}

      {/* Totals */}
      {(totalMovies > 0 || totalShows > 0) && (
        <div className="border-t border-admin-border pt-3 text-xs text-admin-text-muted">
          {totalMovies} movie{totalMovies !== 1 ? "s" : ""}, {totalShows} show
          {totalShows !== 1 ? "s" : ""} total
        </div>
      )}
    </div>
  )
}
