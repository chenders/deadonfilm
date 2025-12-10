import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { getRandomMovie, getDiscoverMovie } from "@/services/api"
import { createMovieSlug } from "@/utils/slugify"
import { FilmReelIcon, SkullIcon, CursedFilmIcon, CursedActorIcon } from "@/components/icons"

type LoadingState = null | "random" | "classic" | "high-mortality"

interface QuickActionButtonProps {
  testId: string
  onClick: () => void
  disabled: boolean
  isLoading: boolean
  icon: React.ReactNode
  label: string
  tooltip: string
}

function QuickActionButton({
  testId,
  onClick,
  disabled,
  isLoading,
  icon,
  label,
  tooltip,
}: QuickActionButtonProps) {
  const buttonClass =
    "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brown-dark bg-beige border border-brown-medium/30 rounded-full hover:bg-cream hover:border-brown-medium/50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"

  const tooltipClass =
    "absolute left-1/2 -translate-x-1/2 top-full mt-2 w-48 text-xs text-center bg-brown-dark text-cream px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 delay-300 group-hover:delay-300 pointer-events-none z-10 shadow-lg"

  return (
    <div className="group relative">
      <button data-testid={testId} onClick={onClick} disabled={disabled} className={buttonClass}>
        {icon}
        {isLoading ? "..." : label}
      </button>
      <span className={tooltipClass}>{tooltip}</span>
    </div>
  )
}

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

  return (
    <div data-testid="quick-actions" className="mt-6 flex flex-wrap justify-center gap-2">
      <QuickActionButton
        testId="high-mortality-btn"
        onClick={() => handleDiscover("high-mortality")}
        disabled={loading !== null}
        isLoading={loading === "high-mortality"}
        icon={
          <SkullIcon size={14} className={loading === "high-mortality" ? "animate-pulse" : ""} />
        }
        label="High Mortality"
        tooltip="Movies where more actors died than statistically expected"
      />

      <QuickActionButton
        testId="classic-btn"
        onClick={() => handleDiscover("classic")}
        disabled={loading !== null}
        isLoading={loading === "classic"}
        icon={<FilmReelIcon size={14} className={loading === "classic" ? "animate-spin" : ""} />}
        label="Classic Films"
        tooltip="Golden age cinema from 1930-1970"
      />

      <QuickActionButton
        testId="random-movie-btn"
        onClick={() => handleDiscover("random")}
        disabled={loading !== null}
        isLoading={loading === "random"}
        icon={<span className={loading === "random" ? "animate-pulse" : ""}>🎲</span>}
        label="Surprise Me"
        tooltip="Random movie from any era"
      />

      <div className="group relative">
        <Link
          data-testid="cursed-movies-btn"
          to="/cursed-movies"
          className="inline-flex items-center gap-1.5 rounded-full border border-brown-medium/30 bg-beige px-3 py-1.5 text-xs font-medium text-brown-dark transition-all duration-200 hover:border-brown-medium/50 hover:bg-cream"
        >
          <CursedFilmIcon size={14} />
          Cursed Movies
        </Link>
        <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-48 -translate-x-1/2 rounded-lg bg-brown-dark px-3 py-2 text-center text-xs text-cream opacity-0 shadow-lg transition-opacity delay-300 duration-200 group-hover:opacity-100 group-hover:delay-300">
          Movies with statistically abnormal mortality
        </span>
      </div>

      <div className="group relative">
        <Link
          data-testid="cursed-actors-btn"
          to="/cursed-actors"
          className="inline-flex items-center gap-1.5 rounded-full border border-brown-medium/30 bg-beige px-3 py-1.5 text-xs font-medium text-brown-dark transition-all duration-200 hover:border-brown-medium/50 hover:bg-cream"
        >
          <CursedActorIcon size={14} />
          Cursed Actors
        </Link>
        <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-48 -translate-x-1/2 rounded-lg bg-brown-dark px-3 py-2 text-center text-xs text-cream opacity-0 shadow-lg transition-opacity delay-300 duration-200 group-hover:opacity-100 group-hover:delay-300">
          Actors with unusually high co-star mortality
        </span>
      </div>
    </div>
  )
}
