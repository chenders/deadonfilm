import { useState, useRef, useId } from "react"
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
  const listboxId = useId()

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
    <div data-testid="search-bar" className="relative mx-auto w-full max-w-xl">
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
        listboxId={listboxId}
      />

      {isOpen && movies.length > 0 && (
        <SearchDropdown
          id={listboxId}
          movies={movies}
          selectedIndex={selectedIndex}
          onSelect={handleSelect}
          searchQuery={query}
        />
      )}

      {isOpen && query.length >= 2 && !isLoading && movies.length === 0 && (
        <div
          data-testid="search-no-results"
          className="absolute z-50 mt-1 w-full rounded-lg border border-brown-medium/30 bg-cream p-4 text-center shadow-lg"
        >
          <p className="mb-1 font-display text-sm uppercase tracking-wide text-brown-dark">
            End of Reel
          </p>
          <p className="text-sm text-text-muted">
            No films found for "<span className="italic">{query}</span>"
          </p>
        </div>
      )}
    </div>
  )
}
