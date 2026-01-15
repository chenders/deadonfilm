import type { ShowDetails } from "@/types"
import { getPosterUrl } from "@/services/api"
import { getYear } from "@/utils/formatDate"

interface ShowHeaderProps {
  show: ShowDetails
  hidePoster?: boolean
}

export default function ShowHeader({ show, hidePoster = false }: ShowHeaderProps) {
  const year = getYear(show.firstAirDate)
  const posterUrl = getPosterUrl(show.posterPath, "w342")

  return (
    <div data-testid="show-header" className="mb-2 flex flex-col items-center text-center md:mb-4">
      {!hidePoster &&
        (posterUrl ? (
          <img
            data-testid="show-poster"
            src={posterUrl}
            alt={`${show.name} poster`}
            width={342}
            height={513}
            className="mb-2 h-auto w-[clamp(6rem,18vh,12rem)] rounded-lg shadow-md"
          />
        ) : (
          <div
            data-testid="show-poster-placeholder"
            className="mb-2 flex aspect-[2/3] w-[clamp(6rem,18vh,12rem)] items-center justify-center rounded-lg bg-surface-muted"
          >
            <span className="text-foreground-muted">No poster</span>
          </div>
        ))}

      <h1
        data-testid="show-title"
        className="font-display text-3xl leading-tight text-accent md:text-4xl"
      >
        {show.name}
      </h1>
      <p data-testid="show-year" className="text-lg text-foreground-muted md:text-xl">
        ({year})
      </p>
      <p data-testid="show-meta" className="mt-1 text-sm text-foreground-muted">
        {show.numberOfSeasons} season{show.numberOfSeasons !== 1 ? "s" : ""} &bull;{" "}
        {show.numberOfEpisodes} episode{show.numberOfEpisodes !== 1 ? "s" : ""} &bull; {show.status}
      </p>
    </div>
  )
}

export function ShowPoster({ show }: { show: ShowDetails }) {
  const posterUrl = getPosterUrl(show.posterPath, "w342")
  const tmdbUrl = `https://www.themoviedb.org/tv/${show.id}`

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
          data-testid="show-poster"
          src={posterUrl}
          alt={`${show.name} poster`}
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
        data-testid="show-poster-placeholder"
        className="flex aspect-[2/3] w-32 cursor-pointer items-center justify-center rounded-lg bg-surface-muted transition-colors hover:bg-surface-muted md:w-44"
      >
        <span className="text-sm text-foreground-muted">No poster</span>
      </div>
    </a>
  )
}
