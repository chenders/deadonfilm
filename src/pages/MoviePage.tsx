import { useState } from "react"
import { useParams } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import { useMovie } from "@/hooks/useMovie"
import { useDeathInfoPolling } from "@/hooks/useDeathInfoPolling"
import { extractMovieId } from "@/utils/slugify"
import { getYear } from "@/utils/formatDate"
import MovieHeader from "@/components/movie/MovieHeader"
import MortalityScore from "@/components/movie/MortalityScore"
import CastToggle from "@/components/movie/CastToggle"
import DeceasedList from "@/components/movie/DeceasedList"
import LivingList from "@/components/movie/LivingList"
import LastSurvivor from "@/components/movie/LastSurvivor"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import ErrorMessage from "@/components/common/ErrorMessage"

export default function MoviePage() {
  const { slug } = useParams<{ slug: string }>()
  const movieId = slug ? extractMovieId(slug) : 0
  const { data, isLoading, error } = useMovie(movieId)
  const [showLiving, setShowLiving] = useState(false)

  // Poll for death info updates if enrichment is pending
  const { enrichedDeceased, isPolling } = useDeathInfoPolling({
    movieId,
    deceased: data?.deceased ?? [],
    enrichmentPending: data?.enrichmentPending,
  })

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
        <meta property="og:type" content="website" />
      </Helmet>

      <div data-testid="movie-page" className="max-w-4xl mx-auto">
        <MovieHeader movie={movie} />

        <MortalityScore stats={stats} />

        {lastSurvivor && stats.mortalityPercentage >= 50 && !showLiving && (
          <LastSurvivor actor={lastSurvivor} totalLiving={stats.livingCount} />
        )}

        <CastToggle
          showLiving={showLiving}
          onToggle={setShowLiving}
          deceasedCount={stats.deceasedCount}
          livingCount={stats.livingCount}
        />

        {showLiving ? (
          <LivingList actors={living} />
        ) : (
          <DeceasedList actors={enrichedDeceased} movieTitle={movie.title} isPolling={isPolling} />
        )}
      </div>
    </>
  )
}
