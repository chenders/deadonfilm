import { useState, useRef, useId, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { useUnifiedSearch } from "@/hooks/useUnifiedSearch"
import { useKeyboardNavigation } from "@/hooks/useKeyboardNavigation"
import { createMovieSlug, createShowSlug, createActorSlug } from "@/utils/slugify"
import type { UnifiedSearchResult, SearchMediaType } from "@/types"
import SearchInput from "./SearchInput"
import SearchDropdown from "./SearchDropdown"
import MediaTypeToggle from "./MediaTypeToggle"
import EmptySearchState from "./EmptySearchState"
export default function SearchBar() {
  const [query, setQuery] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [mediaType, setMediaType] = useState<SearchMediaType>("all")
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const listboxId = useId()

  useEffect(() => {
    if (location.pathname === "/") {
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    }
  }, [location.pathname])

  const { data, isLoading } = useUnifiedSearch(query, mediaType)
  const results = data?.results || []

  const handleSelect = (result: UnifiedSearchResult) => {
    if (result.media_type === "person") {
      const slug = createActorSlug(result.title, result.id)
      navigate(`/actor/${slug}`)
    } else if (result.media_type === "tv") {
      const slug = createShowSlug(result.title, result.release_date, result.id)
      navigate(`/show/${slug}`)
    } else {
      const slug = createMovieSlug(result.title, result.release_date, result.id)
      navigate(`/movie/${slug}`)
    }
    setIsOpen(false)
    setQuery("")
  }

  const { selectedIndex, handleKeyDown } = useKeyboardNavigation({
    items: results,
    isOpen,
    onSelect: handleSelect,
    onEscape: () => {
      setIsOpen(false)
      inputRef.current?.blur()
    },
  })

  const placeholders: Record<SearchMediaType, string> = {
    all: "Search anything...",
    movie: "Search for a movie...",
    tv: "Search for a TV show...",
    person: "Search for a person...",
  }
  const placeholderText = placeholders[mediaType]

  return (
    <div data-testid="search-bar" className="relative mx-auto w-full max-w-xl">
      <div className="mb-3 flex justify-center">
        <MediaTypeToggle value={mediaType} onChange={setMediaType} />
      </div>

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
        placeholder={placeholderText}
        listboxId={listboxId}
      />

      {isOpen && results.length > 0 && (
        <SearchDropdown
          id={listboxId}
          results={results}
          selectedIndex={selectedIndex}
          onSelect={handleSelect}
          searchQuery={query}
          mediaType={mediaType}
        />
      )}

      {isOpen && query.length >= 2 && !isLoading && results.length === 0 && (
        <div
          data-testid="search-no-results"
          className="absolute z-50 mt-1 w-full rounded-lg border border-brown-medium/30 bg-cream p-4 text-center shadow-lg"
        >
          <EmptySearchState
            query={query}
            mediaType={mediaType}
            onTypeChange={setMediaType}
            onNavigate={() => {
              setIsOpen(false)
              setQuery("")
            }}
          />
        </div>
      )}
    </div>
  )
}
