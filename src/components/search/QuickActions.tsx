import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { getRandomMovie } from "@/services/api"
import { createMovieSlug } from "@/utils/slugify"
import { FilmReelIcon } from "@/components/icons"

export default function QuickActions() {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(false)

  const handleRandomMovie = async () => {
    setIsLoading(true)
    try {
      const data = await getRandomMovie()
      const slug = createMovieSlug(data.title, data.release_date, data.id)
      navigate(`/movie/${slug}`)
    } catch (error) {
      console.error("Failed to get random movie:", error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div data-testid="quick-actions" className="flex justify-center gap-3 mt-6">
      <button
        data-testid="random-movie-btn"
        onClick={handleRandomMovie}
        disabled={isLoading}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-brown-dark bg-beige border border-brown-medium/30 rounded-lg hover:bg-cream hover:border-brown-medium/50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <FilmReelIcon size={16} className={isLoading ? "animate-spin" : ""} />
        {isLoading ? "Loading..." : "Surprise Me"}
      </button>
    </div>
  )
}
