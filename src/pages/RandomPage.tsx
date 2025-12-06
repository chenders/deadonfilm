import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { getRandomMovie } from "@/services/api"
import { createMovieSlug } from "@/utils/slugify"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import ErrorMessage from "@/components/common/ErrorMessage"

export default function RandomPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchAndRedirect() {
      try {
        const movie = await getRandomMovie()
        const slug = createMovieSlug(movie.title, movie.release_date, movie.id)
        navigate(`/movie/${slug}`, { replace: true })
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch random movie")
      }
    }

    fetchAndRedirect()
  }, [navigate])

  if (error) {
    return <ErrorMessage message={error} />
  }

  return <LoadingSpinner message="Finding a random movie..." />
}
