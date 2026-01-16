import { useParams, useLocation, Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import { useSeason } from "@/hooks/useSeason"
import { createShowSlug, createEpisodeSlug, extractShowId } from "@/utils/slugify"
import { formatDate } from "@/utils/formatDate"
import MortalityGauge from "@/components/movie/MortalityGauge"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import ErrorMessage from "@/components/common/ErrorMessage"

export default function SeasonPage() {
  const { slug, seasonNumber: seasonNumberParam } = useParams<{
    slug: string
    seasonNumber: string
  }>()
  const location = useLocation()
  const showId = extractShowId(slug || "")
  const seasonNumber = parseInt(seasonNumberParam || "0", 10)

  const { data, isLoading, error } = useSeason(showId, seasonNumber)

  if (!showId || !seasonNumber) {
    return <ErrorMessage message="Invalid season URL" />
  }

  if (isLoading) {
    return <LoadingSpinner message="Loading season data..." />
  }

  if (error) {
    return <ErrorMessage message={error.message} />
  }

  if (!data) {
    return <ErrorMessage message="Season not found" />
  }

  const { show, season, episodes, stats } = data
  const title = `${show.name} - ${season.name}`
  const showSlug = createShowSlug(show.name, show.firstAirDate, show.id)

  // Get poster image URL
  const posterUrl = season.posterPath
    ? `https://image.tmdb.org/t/p/w300${season.posterPath}`
    : show.posterPath
      ? `https://image.tmdb.org/t/p/w300${show.posterPath}`
      : null

  return (
    <>
      <Helmet>
        <title>{title} - Dead on Film</title>
        <meta
          name="description"
          content={`${stats.uniqueDeceasedGuestStars} guest stars from ${show.name} ${season.name} have passed away. Browse all ${stats.totalEpisodes} episodes.`}
        />
        <meta property="og:title" content={`${title} - Dead on Film`} />
        <meta
          property="og:description"
          content={`${stats.uniqueDeceasedGuestStars} deceased guest stars across ${stats.totalEpisodes} episodes`}
        />
        <meta property="og:type" content="video.tv_show" />
        {posterUrl && <meta property="og:image" content={posterUrl} />}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={`${title} - Dead on Film`} />
        {posterUrl && <meta name="twitter:image" content={posterUrl} />}
        <link rel="canonical" href={`https://deadonfilm.com${location.pathname}`} />
      </Helmet>

      <div data-testid="season-page" className="mx-auto max-w-4xl">
        {/* Breadcrumb */}
        <nav className="mb-4 text-sm text-foreground-muted">
          <Link to={`/show/${showSlug}`} className="hover:text-accent hover:underline">
            {show.name}
          </Link>
          <span className="mx-2">/</span>
          <span>{season.name}</span>
        </nav>

        {/* Season Header */}
        <div className="mb-6 flex flex-col gap-6 md:flex-row">
          {/* Poster */}
          {posterUrl ? (
            <img
              src={posterUrl}
              alt={`${season.name} poster`}
              className="h-auto w-48 flex-shrink-0 self-center rounded-lg shadow-md md:self-start"
            />
          ) : (
            <div className="flex h-72 w-48 flex-shrink-0 items-center justify-center self-center rounded-lg bg-surface-muted md:self-start">
              <span className="text-center text-sm text-foreground-muted">No poster</span>
            </div>
          )}

          {/* Info */}
          <div className="flex-1 text-center md:text-left">
            <h1 className="font-display text-3xl leading-tight text-accent md:text-4xl">
              {season.name}
            </h1>
            <p className="mt-1 text-lg text-foreground-muted">{show.name}</p>

            {season.airDate && (
              <p className="mt-2 text-sm text-foreground-muted">
                Premiered {formatDate(season.airDate)}
              </p>
            )}

            {/* Stats */}
            <div className="mt-4 flex flex-wrap justify-center gap-4 md:justify-start">
              <div className="rounded-lg border border-border-theme/20 bg-surface px-4 py-2 text-center">
                <div className="text-2xl font-bold text-foreground">
                  {stats.totalEpisodes.toLocaleString()}
                </div>
                <div className="text-xs text-foreground-muted">Episodes</div>
              </div>
              <div className="rounded-lg border border-border-theme/20 bg-surface px-4 py-2 text-center">
                <div className="text-2xl font-bold text-foreground">
                  {stats.uniqueGuestStars.toLocaleString()}
                </div>
                <div className="text-xs text-foreground-muted">Guest Stars</div>
              </div>
              <div className="rounded-lg border border-accent/20 bg-accent/5 px-4 py-2 text-center">
                <div className="text-2xl font-bold text-accent">
                  {stats.uniqueDeceasedGuestStars.toLocaleString()}
                </div>
                <div className="text-xs text-foreground-muted">Deceased</div>
              </div>
            </div>

            {/* Mortality Gauge */}
            {stats.uniqueGuestStars > 0 && (
              <div className="mt-4">
                <MortalityGauge
                  stats={{
                    totalCast: stats.uniqueGuestStars,
                    deceasedCount: stats.uniqueDeceasedGuestStars,
                    livingCount: stats.uniqueGuestStars - stats.uniqueDeceasedGuestStars,
                    mortalityPercentage: Math.round(
                      (stats.uniqueDeceasedGuestStars / stats.uniqueGuestStars) * 100
                    ),
                    expectedDeaths: stats.expectedDeaths,
                    mortalitySurpriseScore: stats.mortalitySurpriseScore,
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Episode List */}
        <div className="mt-8">
          <h2 className="mb-4 border-b border-border-theme/20 pb-2 font-display text-xl text-foreground">
            Episodes
          </h2>

          <div className="space-y-2">
            {episodes.map((episode) => {
              const slug = createEpisodeSlug(
                show.name,
                episode.name,
                episode.seasonNumber,
                episode.episodeNumber,
                show.id
              )

              return (
                <Link
                  key={episode.episodeNumber}
                  to={`/episode/${slug}`}
                  data-testid={`episode-link-${episode.episodeNumber}`}
                  className="block rounded-lg border border-border-theme/20 bg-surface p-4 transition-colors hover:border-accent/30 hover:bg-surface-muted/30"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold text-accent">E{episode.episodeNumber}</span>
                        <span className="text-foreground">{episode.name}</span>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-muted">
                        {episode.airDate && <span>{formatDate(episode.airDate)}</span>}
                        {episode.runtime && <span>{episode.runtime} min</span>}
                        {episode.guestStarCount > 0 && (
                          <span>{episode.guestStarCount.toLocaleString()} guest stars</span>
                        )}
                      </div>
                    </div>

                    {/* Death stats badge */}
                    {episode.deceasedCount > 0 && (
                      <div className="flex-shrink-0 rounded-full bg-accent/10 px-2 py-1 text-xs font-medium text-accent">
                        {episode.deceasedCount.toLocaleString()} deceased
                      </div>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
