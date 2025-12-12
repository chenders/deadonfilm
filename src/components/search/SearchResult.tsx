import { useRef, useEffect } from "react"
import type { MovieSearchResult } from "@/types"
import { getYear } from "@/utils/formatDate"
import { SkullIcon, FilmReelIcon } from "@/components/icons"

interface SearchResultProps {
  movie: MovieSearchResult
  isSelected: boolean
  onSelect: () => void
  searchQuery: string
}

// Estimate mortality likelihood based on movie age
function getMortalityHint(releaseDate: string): {
  level: "high" | "medium" | "low" | null
  label: string | null
} {
  const year = parseInt(releaseDate?.substring(0, 4) || "0", 10)
  if (!year) return { level: null, label: null }

  const currentYear = new Date().getFullYear()
  const age = currentYear - year

  if (age >= 50) return { level: "high", label: "High mortality likely" }
  if (age >= 30) return { level: "medium", label: "Some deaths likely" }
  return { level: null, label: null }
}

// TMDB poster thumbnail URLs using their face-cropped format.
// This is intentionally separate from the getPosterUrl utility in api.ts because:
// 1. Face-cropped format (w45_and_h67_face) shows the most recognizable part of posters
// 2. Uses TMDB's media CDN (media.themoviedb.org) which supports face-cropping
// 3. Returns srcset for retina display support (1x and 2x variants)
function getPosterUrls(posterPath: string | null): {
  src: string
  srcSet: string
} | null {
  if (!posterPath) return null
  const base = "https://media.themoviedb.org/t/p"
  return {
    src: `${base}/w45_and_h67_face${posterPath}`,
    srcSet: `${base}/w45_and_h67_face${posterPath} 1x, ${base}/w94_and_h141_face${posterPath} 2x`,
  }
}

function FilmPoster({ posterPath, title }: { posterPath: string | null; title: string }) {
  const poster = getPosterUrls(posterPath)

  return (
    <div className="-my-1 h-14 w-[38px] flex-shrink-0 overflow-hidden rounded bg-brown-medium/10">
      {poster ? (
        <img
          src={poster.src}
          srcSet={poster.srcSet}
          alt={`${title} poster`}
          width={38}
          height={56}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-brown-medium/30">
          <FilmReelIcon size={16} />
        </div>
      )}
    </div>
  )
}

export default function SearchResult({
  movie,
  isSelected,
  onSelect,
  searchQuery,
}: SearchResultProps) {
  const ref = useRef<HTMLLIElement>(null)
  const year = getYear(movie.release_date)
  const mortality = getMortalityHint(movie.release_date)

  // Scroll selected item into view
  useEffect(() => {
    if (isSelected && ref.current) {
      ref.current.scrollIntoView({ block: "nearest" })
    }
  }, [isSelected])

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- Keyboard navigation handled by parent combobox
    <li
      ref={ref}
      role="option"
      aria-selected={isSelected}
      className={`cursor-pointer border-b border-brown-medium/10 px-4 py-2 transition-colors last:border-b-0 ${isSelected ? "bg-beige" : "hover:bg-beige/50"}`}
      onClick={onSelect}
      onMouseDown={(e) => e.preventDefault()} // Prevent input blur before click
      data-track-event="search_select"
      data-track-params={JSON.stringify({
        search_term: searchQuery,
        movie_title: movie.title,
        movie_id: movie.id,
      })}
    >
      <div className="flex items-center gap-3">
        <FilmPoster posterPath={movie.poster_path} title={movie.title} />

        {/* Title and year */}
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-brown-dark">{movie.title}</div>
          <div className="text-sm text-text-muted">{year}</div>
        </div>

        {/* Mortality indicator */}
        <div
          className={`flex h-7 w-14 flex-shrink-0 items-center justify-end ${
            mortality.level === "high"
              ? "text-accent"
              : mortality.level === "medium"
                ? "text-brown-medium/60"
                : ""
          }`}
          title={mortality.label || undefined}
        >
          {mortality.level && (
            <>
              <SkullIcon size={28} />
              {mortality.level === "high" && <SkullIcon size={28} />}
            </>
          )}
        </div>
      </div>
    </li>
  )
}
