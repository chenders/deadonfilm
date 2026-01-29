import { useState, useEffect } from "react"
import { useParams, useLocation } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import { useMovie } from "@/hooks/useMovie"
import { useDeathInfoPolling } from "@/hooks/useDeathInfoPolling"
import { usePageViewTracking } from "@/hooks/usePageViewTracking"
import { extractMovieId } from "@/utils/slugify"
import { getYear } from "@/utils/formatDate"
import MovieHeader, { MoviePoster } from "@/components/movie/MovieHeader"
import MortalityGauge from "@/components/movie/MortalityGauge"
import MiniTimeline from "@/components/movie/MiniTimeline"
import CastToggle from "@/components/movie/CastToggle"
import DeceasedList from "@/components/movie/DeceasedList"
import LivingList from "@/components/movie/LivingList"
import LastSurvivor from "@/components/movie/LastSurvivor"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import ErrorMessage from "@/components/common/ErrorMessage"
import AggregateScore from "@/components/common/AggregateScore"
import JsonLd from "@/components/seo/JsonLd"
import { buildMovieSchema, buildBreadcrumbSchema } from "@/utils/schema"
import type { ViewMode } from "@/types"

export default function MoviePage() {
  const { slug } = useParams<{ slug: string }>()
  const location = useLocation()
  const movieId = slug ? extractMovieId(slug) : 0
  const { data, isLoading, error } = useMovie(movieId)
  const [showLiving, setShowLiving] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>("list")

  // Poll for death info updates if enrichment is pending
  const { enrichedDeceased, isPolling } = useDeathInfoPolling({
    movieId,
    deceased: data?.deceased ?? [],
    enrichmentPending: data?.enrichmentPending,
  })

  // Track page view for analytics
  usePageViewTracking("movie", movieId || null, location.pathname)

  // Auto-select the non-zero group when one group is empty
  // Must be before conditional returns to follow Rules of Hooks
  useEffect(() => {
    if (!data) return
    const { stats } = data
    if (stats.deceasedCount === 0 && stats.livingCount > 0) {
      setShowLiving(true)
    } else if (stats.livingCount === 0 && stats.deceasedCount > 0) {
      setShowLiving(false)
    }
  }, [data])

  if (!movieId) {
    return <ErrorMessage message="Invalid movie URL" />
  }

  if (isLoading) {
    return <LoadingSpinner message="Loading movie data..." />
  }

  if (error) {
    return <ErrorMessage message={error.message} />
  }

  if (!data) {
    return <ErrorMessage message="Movie not found" />
  }

  const { movie, living, stats, lastSurvivor } = data
  const year = getYear(movie.release_date)
  const title = `${movie.title} (${year})`

  return (
    <>
      <Helmet>
        <title>{title} - Dead on Film</title>
        <meta
          name="description"
          content={`${stats.deceasedCount} of ${stats.totalCast} cast members from ${movie.title} (${year}) have passed away. See death dates, causes, and mortality statistics.`}
        />
        <meta property="og:title" content={`${title} - Dead on Film`} />
        <meta
          property="og:description"
          content={`${stats.mortalityPercentage}% of the cast has passed away`}
        />
        <meta property="og:type" content="video.movie" />
        {movie.poster_path && (
          <meta
            property="og:image"
            content={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
          />
        )}
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${title} - Dead on Film`} />
        <meta
          name="twitter:description"
          content={`${stats.mortalityPercentage}% of the cast has passed away`}
        />
        {movie.poster_path && (
          <meta
            name="twitter:image"
            content={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
          />
        )}
        <link rel="canonical" href={`https://deadonfilm.com${location.pathname}`} />
      </Helmet>
      <JsonLd data={buildMovieSchema(movie, stats, slug!)} />
      <JsonLd
        data={buildBreadcrumbSchema([
          { name: "Home", url: "https://deadonfilm.com" },
          { name: movie.title, url: `https://deadonfilm.com${location.pathname}` },
        ])}
      />

      <div data-testid="movie-page" className="mx-auto max-w-4xl">
        <MovieHeader movie={movie} hidePoster />

        {/* Poster + Gauge side by side */}
        <div className="mb-4 flex items-center justify-center gap-4">
          <MoviePoster movie={movie} />
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

        {stats.totalCast === 0 ? (
          <div className="bg-surface-secondary mt-8 rounded-lg p-6 text-center">
            <p className="text-text-secondary">
              Cast information is not yet available for this movie.
            </p>
          </div>
        ) : (
          <>
            {lastSurvivor && stats.mortalityPercentage >= 50 && !showLiving && (
              <LastSurvivor actor={lastSurvivor} totalLiving={stats.livingCount} />
            )}

            <CastToggle
              showLiving={showLiving}
              onToggle={setShowLiving}
              deceasedCount={stats.deceasedCount}
              livingCount={stats.livingCount}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />

            {showLiving ? (
              <LivingList actors={living} />
            ) : viewMode === "timeline" ? (
              <MiniTimeline
                releaseYear={new Date(movie.release_date).getFullYear()}
                deceased={enrichedDeceased}
              />
            ) : (
              <DeceasedList actors={enrichedDeceased} isPolling={isPolling} />
            )}
          </>
        )}
      </div>
    </>
  )
}
