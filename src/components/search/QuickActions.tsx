import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { getDiscoverMovie } from "@/services/api"
import { createMovieSlug } from "@/utils/slugify"
import { CursedFilmIcon, CursedActorIcon } from "@/components/icons"

export default function QuickActions() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  const handleForeverYoung = async () => {
    setLoading(true)
    try {
      const data = await getDiscoverMovie()
      const slug = createMovieSlug(data.title, data.release_date, data.id)
      navigate(`/movie/${slug}`)
    } catch (error) {
      console.error("Failed to get forever young movie:", error)
    } finally {
      setLoading(false)
    }
  }

  const buttonClass =
    "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brown-dark bg-beige border border-brown-medium/30 rounded-full hover:bg-cream hover:border-brown-medium/50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"

  const linkClass =
    "inline-flex items-center gap-1.5 rounded-full border border-brown-medium/30 bg-beige px-3 py-1.5 text-xs font-medium text-brown-dark transition-all duration-200 hover:border-brown-medium/50 hover:bg-cream"

  const tooltipClass =
    "pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-48 -translate-x-1/2 rounded-lg bg-brown-dark px-3 py-2 text-center text-xs text-cream opacity-0 shadow-lg transition-opacity delay-300 duration-200 group-hover:opacity-100 group-hover:delay-300"

  // Consistent icon size for all buttons: both emojis and SVG icons are 16px
  // - SVG icons use `iconSize` (16)
  // - Emojis use Tailwind's `text-base` (16px) via `emojiClass`
  const iconSize = 16
  const emojiClass = "text-base leading-none"

  return (
    <div
      data-testid="quick-actions"
      className="mt-6 grid grid-cols-2 justify-items-center gap-2 sm:grid-cols-4 md:flex md:flex-wrap md:justify-center"
    >
      <div className="group relative">
        <button
          data-testid="forever-young-btn"
          onClick={handleForeverYoung}
          disabled={loading}
          className={buttonClass}
        >
          <span className={`${emojiClass} ${loading ? "animate-pulse" : ""}`}>👼</span>
          {loading ? "..." : "Forever Young"}
        </button>
        <span className={tooltipClass}>Movies featuring actors who died tragically young</span>
      </div>

      <div className="group relative">
        <Link data-testid="cursed-movies-btn" to="/cursed-movies" className={linkClass}>
          <CursedFilmIcon size={iconSize} />
          Cursed Movies
        </Link>
        <span className={tooltipClass}>Movies with statistically abnormal mortality</span>
      </div>

      <div className="group relative">
        <Link data-testid="cursed-actors-btn" to="/cursed-actors" className={linkClass}>
          <CursedActorIcon size={iconSize} />
          Cursed Actors
        </Link>
        <span className={tooltipClass}>Actors with unusually high co-star mortality</span>
      </div>

      <div className="group relative">
        <Link data-testid="covid-deaths-btn" to="/covid-deaths" className={linkClass}>
          <span className={emojiClass}>🦠</span>
          COVID-19
        </Link>
        <span className={tooltipClass}>Actors who died from COVID-19</span>
      </div>

      <div className="group relative">
        <Link data-testid="death-watch-btn" to="/death-watch" className={linkClass}>
          <span className="text-sm">⏳</span>
          Death Watch
        </Link>
        <span className={tooltipClass}>Living actors most likely to die soon</span>
      </div>
    </div>
  )
}
