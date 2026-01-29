import { useState, useEffect } from "react"
import { useParams, useLocation } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import { useShow } from "@/hooks/useShow"
import { usePageViewTracking } from "@/hooks/usePageViewTracking"
import { extractShowId } from "@/utils/slugify"
import { getYear } from "@/utils/formatDate"
import ShowHeader, { ShowPoster } from "@/components/show/ShowHeader"
import ShowDeceasedList from "@/components/show/ShowDeceasedList"
import ShowLivingList from "@/components/show/ShowLivingList"
import EpisodeBrowser from "@/components/show/EpisodeBrowser"
import MortalityGauge from "@/components/movie/MortalityGauge"
import CastToggle from "@/components/movie/CastToggle"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import ErrorMessage from "@/components/common/ErrorMessage"
import AggregateScore from "@/components/common/AggregateScore"
import type { ViewMode } from "@/types"

export default function ShowPage() {
  const { slug } = useParams<{ slug: string }>()
  const location = useLocation()
  const showId = slug ? extractShowId(slug) : 0
  const { data, isLoading, error } = useShow(showId)
  const [showLiving, setShowLiving] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>("list")

  // Track page view for analytics
  usePageViewTracking("show", showId || null, location.pathname)

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

  if (!showId) {
    return <ErrorMessage message="Invalid show URL" />
  }

  if (isLoading) {
    return <LoadingSpinner message="Loading show data..." />
  }

  if (error) {
    return <ErrorMessage message={error.message} />
  }

  if (!data) {
    return <ErrorMessage message="Show not found" />
  }

  const { show, seasons, deceased, living, stats } = data
  const year = getYear(show.firstAirDate)
  const title = `${show.name} (${year})`

  return (
    <>
      <Helmet>
        <title>{title} - Dead on Film</title>
        <meta
          name="description"
          content={`${stats.deceasedCount} of ${stats.totalCast} cast members from ${show.name} (${year}) have passed away. See death dates, causes, and mortality statistics.`}
        />
        <meta property="og:title" content={`${title} - Dead on Film`} />
        <meta
          property="og:description"
          content={`${stats.mortalityPercentage}% of the cast has passed away`}
        />
        <meta property="og:type" content="video.tv_show" />
        {show.posterPath && (
          <meta property="og:image" content={`https://image.tmdb.org/t/p/w500${show.posterPath}`} />
        )}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${title} - Dead on Film`} />
        <meta
          name="twitter:description"
          content={`${stats.mortalityPercentage}% of the cast has passed away`}
        />
        {show.posterPath && (
          <meta
            name="twitter:image"
            content={`https://image.tmdb.org/t/p/w500${show.posterPath}`}
          />
        )}
        <link rel="canonical" href={`https://deadonfilm.com${location.pathname}`} />
      </Helmet>

      <div data-testid="show-page" className="mx-auto max-w-4xl">
        <ShowHeader show={show} hidePoster />

        {/* Poster + Gauge side by side */}
        <div className="mb-4 flex items-center justify-center gap-4">
          <ShowPoster show={show} />
          <div className="flex flex-col items-center gap-3">
            <MortalityGauge stats={stats} />
            {data.aggregateScore !== null && data.aggregateScore !== undefined && (
              <AggregateScore
                score={data.aggregateScore}
                confidence={data.aggregateConfidence ?? null}
                size="sm"
              />
            )}
          </div>
        </div>

        <EpisodeBrowser
          seasons={seasons}
          showId={show.id}
          showName={show.name}
          showFirstAirDate={show.firstAirDate}
        />

        {stats.totalCast === 0 ? (
          <div className="bg-surface-secondary mt-8 rounded-lg p-6 text-center">
            <p className="text-text-secondary">
              Cast information is not yet available for this show.
            </p>
          </div>
        ) : (
          <>
            <CastToggle
              showLiving={showLiving}
              onToggle={setShowLiving}
              deceasedCount={stats.deceasedCount}
              livingCount={stats.livingCount}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />

            {showLiving ? (
              <ShowLivingList actors={living} showId={show.id} showName={show.name} />
            ) : (
              <ShowDeceasedList actors={deceased} showId={show.id} showName={show.name} />
            )}
          </>
        )}
      </div>
    </>
  )
}
