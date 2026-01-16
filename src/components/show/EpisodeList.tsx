import { Link } from "react-router-dom"
import { createEpisodeSlug, createSeasonPath } from "@/utils/slugify"
import { formatDate } from "@/utils/formatDate"
import type { EpisodeSummary } from "@/types"

interface EpisodeListProps {
  episodes: EpisodeSummary[]
  showId: number
  showName: string
  showFirstAirDate: string | null
  seasonNumber: number
  seasonName: string
  isLoading: boolean
}

export default function EpisodeList({
  episodes,
  showId,
  showName,
  showFirstAirDate,
  seasonNumber,
  seasonName,
  isLoading,
}: EpisodeListProps) {
  if (isLoading) {
    return (
      <div data-testid="episode-list-loading" className="py-4 text-center text-foreground-muted">
        Loading episodes...
      </div>
    )
  }

  if (episodes.length === 0) {
    return (
      <div data-testid="episode-list-empty" className="py-4 text-center text-foreground-muted">
        No episodes available
      </div>
    )
  }

  return (
    <div data-testid="episode-list" className="mt-4">
      {/* Season divider and header */}
      <div className="mb-3 flex items-center justify-between border-t border-border-theme/30 pt-3">
        <h3
          data-testid="season-header"
          className="text-sm font-semibold uppercase tracking-wide text-foreground"
        >
          {seasonName || `Season ${seasonNumber}`}
          <span className="ml-2 font-normal text-foreground-muted">
            ({episodes.length} episode{episodes.length !== 1 ? "s" : ""})
          </span>
        </h3>
        <Link
          to={createSeasonPath(showName, showFirstAirDate, showId, seasonNumber)}
          data-testid="view-season-link"
          className="text-xs text-accent hover:underline"
        >
          View full season
        </Link>
      </div>

      <div className="space-y-2">
        {episodes.map((episode, index) => {
          const slug = createEpisodeSlug(
            showName,
            episode.name,
            episode.seasonNumber,
            episode.episodeNumber,
            showId
          )

          return (
            <Link
              key={`${episode.seasonNumber}-${episode.episodeNumber}`}
              to={`/episode/${slug}`}
              data-testid={`episode-link-${episode.episodeNumber}`}
              className="block rounded-lg border border-border-theme/20 bg-surface p-3 transition-colors hover:border-accent/30 hover:bg-surface-muted/30"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-accent">E{episode.episodeNumber}</span>
                  <span className="mx-2 text-foreground-muted">·</span>
                  <span className="text-foreground" title={episode.name}>
                    {episode.name.length > 40 ? `${episode.name.slice(0, 40)}...` : episode.name}
                  </span>
                </div>
                {episode.airDate && (
                  <span className="flex-shrink-0 text-xs text-foreground-muted">
                    {formatDate(episode.airDate)}
                  </span>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
