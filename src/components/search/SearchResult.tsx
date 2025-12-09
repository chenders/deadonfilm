import { useRef, useEffect } from "react"
import type { MovieSearchResult } from "@/types"
import { getYear } from "@/utils/formatDate"
import { SkullIcon } from "@/components/icons"

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
      className={`cursor-pointer border-b border-brown-medium/10 px-4 py-3 transition-colors last:border-b-0 ${isSelected ? "bg-beige" : "hover:bg-beige/50"}`}
      onClick={onSelect}
      onMouseDown={(e) => e.preventDefault()} // Prevent input blur before click
      data-track-event="search_select"
      data-track-params={JSON.stringify({
        search_term: searchQuery,
        movie_title: movie.title,
        movie_id: movie.id,
      })}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium text-brown-dark">{movie.title}</div>
          <div className="text-sm text-text-muted">{year}</div>
        </div>
        {mortality.level && (
          <div
            className={`flex flex-shrink-0 items-center gap-0.5 ${
              mortality.level === "high" ? "text-accent" : "text-brown-medium/60"
            }`}
            title={mortality.label || undefined}
          >
            <SkullIcon size={28} />
            {mortality.level === "high" && <SkullIcon size={28} />}
          </div>
        )}
      </div>
    </li>
  )
}
