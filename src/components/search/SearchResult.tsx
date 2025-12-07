import { useRef, useEffect } from "react"
import type { MovieSearchResult } from "@/types"
import { getYear } from "@/utils/formatDate"

interface SearchResultProps {
  movie: MovieSearchResult
  isSelected: boolean
  onSelect: () => void
  searchQuery: string
}

export default function SearchResult({
  movie,
  isSelected,
  onSelect,
  searchQuery,
}: SearchResultProps) {
  const ref = useRef<HTMLLIElement>(null)
  const year = getYear(movie.release_date)

  // Scroll selected item into view
  useEffect(() => {
    if (isSelected && ref.current) {
      ref.current.scrollIntoView({ block: "nearest" })
    }
  }, [isSelected])

  return (
    <li
      ref={ref}
      role="option"
      aria-selected={isSelected}
      className={`px-4 py-3 cursor-pointer transition-colors border-b border-brown-medium/10 last:border-b-0
        ${isSelected ? "bg-beige" : "hover:bg-beige/50"}`}
      onClick={onSelect}
      onMouseDown={(e) => e.preventDefault()} // Prevent input blur before click
      data-track-event="search_select"
      data-track-params={JSON.stringify({
        search_term: searchQuery,
        movie_title: movie.title,
        movie_id: movie.id,
      })}
    >
      <div className="font-medium text-brown-dark">{movie.title}</div>
      <div className="text-sm text-text-muted">{year}</div>
    </li>
  )
}
