import { useState, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { useMovieSearch } from "@/hooks/useMovieSearch"
import { useKeyboardNavigation } from "@/hooks/useKeyboardNavigation"
import { createMovieSlug } from "@/utils/slugify"
import type { MovieSearchResult } from "@/types"
import SearchInput from "./SearchInput"
import SearchDropdown from "./SearchDropdown"

export default function SearchBar() {
  const [query, setQuery] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const { data, isLoading } = useMovieSearch(query)
  const movies = data?.results || []

  const handleSelect = (movie: MovieSearchResult) => {
    const slug = createMovieSlug(movie.title, movie.release_date, movie.id)
    navigate(`/movie/${slug}`)
    setIsOpen(false)
    setQuery("")
  }

  const { selectedIndex, handleKeyDown } = useKeyboardNavigation({
    items: movies,
    isOpen,
    onSelect: handleSelect,
    onEscape: () => {
      setIsOpen(false)
      inputRef.current?.blur()
    },
  })

  return (
    <div data-testid="search-bar" className="relative w-full max-w-xl mx-auto">
      <SearchInput
        ref={inputRef}
        value={query}
        onChange={(value) => {
          setQuery(value)
          setIsOpen(value.length >= 2)
        }}
        onFocus={() => {
          if (query.length >= 2) {
            setIsOpen(true)
          }
        }}
        onBlur={() => {
          // Delay to allow click on dropdown items
          setTimeout(() => setIsOpen(false), 200)
        }}
        onKeyDown={handleKeyDown}
        isLoading={isLoading}
        placeholder="Search for a movie..."
      />

      {isOpen && movies.length > 0 && (
        <SearchDropdown
          movies={movies}
          selectedIndex={selectedIndex}
          onSelect={handleSelect}
          searchQuery={query}
        />
      )}

      {isOpen && query.length >= 2 && !isLoading && movies.length === 0 && (
        <div
          data-testid="search-no-results"
          className="absolute z-50 w-full mt-1 bg-cream border border-brown-medium/30 rounded-lg shadow-lg p-4 text-center"
        >
          <p className="text-sm font-display text-brown-dark uppercase tracking-wide mb-1">
            End of Reel
          </p>
          <p className="text-text-muted text-sm">
            No films found for "<span className="italic">{query}</span>"
          </p>
        </div>
      )}
    </div>
  )
}
