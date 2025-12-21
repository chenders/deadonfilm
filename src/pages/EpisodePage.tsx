import { useState, useEffect } from "react"
import { useParams, useLocation, Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import { useEpisode } from "@/hooks/useEpisode"
import { extractEpisodeInfo, createShowSlug } from "@/utils/slugify"
import { formatDate } from "@/utils/formatDate"
import ShowDeceasedList from "@/components/show/ShowDeceasedList"
import ShowLivingList from "@/components/show/ShowLivingList"
import CastToggle from "@/components/movie/CastToggle"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import ErrorMessage from "@/components/common/ErrorMessage"
import type { ViewMode } from "@/types"

export default function EpisodePage() {
  const { slug } = useParams<{ slug: string }>()
  const location = useLocation()
  const episodeInfo = slug ? extractEpisodeInfo(slug) : null
  const showId = episodeInfo?.showId || 0
  const seasonNumber = episodeInfo?.season || 0
  const episodeNumber = episodeInfo?.episode || 0

  const { data, isLoading, error } = useEpisode(showId, seasonNumber, episodeNumber)
  const [showLiving, setShowLiving] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>("list")

  // Auto-select the non-zero group when one group is empty
  useEffect(() => {
    if (!data) return
    const { stats } = data
    if (stats.deceasedCount === 0 && stats.livingCount > 0) {
      setShowLiving(true)
    } else if (stats.livingCount === 0 && stats.deceasedCount > 0) {
      setShowLiving(false)
    }
  }, [data])

  if (!episodeInfo) {
    return <ErrorMessage message="Invalid episode URL" />
  }

  if (isLoading) {
    return <LoadingSpinner message="Loading episode data..." />
  }

  if (error) {
    return <ErrorMessage message={error.message} />
  }

  if (!data) {
    return <ErrorMessage message="Episode not found" />
  }

  const { show, episode, deceased, living, stats } = data
  const episodeCode = `S${episode.seasonNumber}E${episode.episodeNumber}`
  const title = `${show.name} - ${episodeCode}: ${episode.name}`
  const showSlug = createShowSlug(show.name, null, show.id)

  // Get still image URL
  const stillUrl = episode.stillPath ? `https://image.tmdb.org/t/p/w500${episode.stillPath}` : null

  return (
    <>
      <Helmet>
        <title>{title} - Dead on Film</title>
        <meta
          name="description"
          content={`${stats.deceasedCount} of ${stats.totalCast} cast members from ${show.name} ${episodeCode} "${episode.name}" have passed away.`}
        />
        <meta property="og:title" content={`${title} - Dead on Film`} />
        <meta
          property="og:description"
          content={`${stats.mortalityPercentage}% of the episode cast has passed away`}
        />
        <meta property="og:type" content="video.episode" />
        {stillUrl && <meta property="og:image" content={stillUrl} />}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${title} - Dead on Film`} />
        <meta
          name="twitter:description"
          content={`${stats.mortalityPercentage}% of the episode cast has passed away`}
        />
        {stillUrl && <meta name="twitter:image" content={stillUrl} />}
        <link rel="canonical" href={`https://deadonfilm.com${location.pathname}`} />
      </Helmet>

      <div data-testid="episode-page" className="mx-auto max-w-4xl">
        {/* Breadcrumb */}
        <nav className="mb-4 text-sm text-text-muted">
          <Link to={`/show/${showSlug}`} className="hover:text-accent hover:underline">
            {show.name}
          </Link>
          <span className="mx-2">/</span>
          <span>Season {episode.seasonNumber}</span>
          <span className="mx-2">/</span>
          <span>Episode {episode.episodeNumber}</span>
        </nav>

        {/* Episode Header */}
        <div className="mb-6 text-center">
          <p className="text-lg text-brown-medium">{episodeCode}</p>
          <h1 className="font-display text-3xl leading-tight text-accent md:text-4xl">
            {episode.name}
          </h1>
          {episode.airDate && (
            <p className="mt-1 text-sm text-text-muted">
              Aired {formatDate(episode.airDate)}
              {episode.runtime && ` • ${episode.runtime} min`}
            </p>
          )}
        </div>

        {/* Episode Still + Stats */}
        <div className="mb-6 flex flex-col items-center gap-4 md:flex-row md:justify-center">
          {stillUrl ? (
            <img
              src={stillUrl}
              alt={`${episode.name} still`}
              className="h-auto w-full max-w-md rounded-lg shadow-md md:w-80"
            />
          ) : (
            <div className="flex h-44 w-full max-w-md items-center justify-center rounded-lg bg-beige md:w-80">
              <span className="text-text-muted">No image available</span>
            </div>
          )}

          {/* Stats */}
          <div className="rounded-lg border border-brown-medium/20 bg-white p-4 text-center">
            <div className="text-4xl font-bold text-accent">{stats.mortalityPercentage}%</div>
            <div className="text-sm text-brown-dark">cast deceased</div>
            <div className="mt-2 text-xs text-text-muted">
              {stats.deceasedCount} of {stats.totalCast} cast members
            </div>
          </div>
        </div>

        {/* Overview */}
        {episode.overview && (
          <div className="mb-6 rounded-lg border border-brown-medium/10 bg-beige/30 p-4">
            <p className="text-sm text-brown-dark">{episode.overview}</p>
          </div>
        )}

        {/* Cast Toggle and Lists */}
        <CastToggle
          showLiving={showLiving}
          onToggle={setShowLiving}
          deceasedCount={stats.deceasedCount}
          livingCount={stats.livingCount}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />

        {showLiving ? <ShowLivingList actors={living} /> : <ShowDeceasedList actors={deceased} />}
      </div>
    </>
  )
}
