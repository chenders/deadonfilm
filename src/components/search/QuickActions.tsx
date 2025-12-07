import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { getRandomMovie, getDiscoverMovie } from "@/services/api"
import { createMovieSlug } from "@/utils/slugify"
import { FilmReelIcon, SkullIcon } from "@/components/icons"

type LoadingState = null | "random" | "classic" | "high-mortality"

export default function QuickActions() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState<LoadingState>(null)

  const handleDiscover = async (type: "random" | "classic" | "high-mortality") => {
    setLoading(type)
    try {
      const data = type === "random" ? await getRandomMovie() : await getDiscoverMovie(type)
      const slug = createMovieSlug(data.title, data.release_date, data.id)
      navigate(`/movie/${slug}`)
    } catch (error) {
      console.error(`Failed to get ${type} movie:`, error)
    } finally {
      setLoading(null)
    }
  }

  const buttonClass =
    "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brown-dark bg-beige border border-brown-medium/30 rounded-full hover:bg-cream hover:border-brown-medium/50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"

  return (
    <div data-testid="quick-actions" className="flex flex-wrap justify-center gap-2 mt-6">
      <button
        data-testid="high-mortality-btn"
        onClick={() => handleDiscover("high-mortality")}
        disabled={loading !== null}
        className={buttonClass}
      >
        <SkullIcon size={14} className={loading === "high-mortality" ? "animate-pulse" : ""} />
        {loading === "high-mortality" ? "..." : "High Mortality"}
      </button>

      <button
        data-testid="classic-btn"
        onClick={() => handleDiscover("classic")}
        disabled={loading !== null}
        className={buttonClass}
      >
        <FilmReelIcon size={14} className={loading === "classic" ? "animate-spin" : ""} />
        {loading === "classic" ? "..." : "Classic Films"}
      </button>

      <button
        data-testid="random-movie-btn"
        onClick={() => handleDiscover("random")}
        disabled={loading !== null}
        className={buttonClass}
      >
        <span className={loading === "random" ? "animate-pulse" : ""}>🎲</span>
        {loading === "random" ? "..." : "Surprise Me"}
      </button>
    </div>
  )
}
