import { useState, useRef, useId } from "react"
import { useNavigate } from "react-router-dom"
import { useUnifiedSearch } from "@/hooks/useUnifiedSearch"
import { useKeyboardNavigation } from "@/hooks/useKeyboardNavigation"
import { createMovieSlug, createShowSlug } from "@/utils/slugify"
import type { UnifiedSearchResult, SearchMediaType } from "@/types"
import SearchInput from "./SearchInput"
import SearchDropdown from "./SearchDropdown"
import MediaTypeToggle from "./MediaTypeToggle"
import InfoPopover from "@/components/common/InfoPopover"

export default function SearchBar() {
  const [query, setQuery] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [mediaType, setMediaType] = useState<SearchMediaType>("all")
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const listboxId = useId()

  const { data, isLoading } = useUnifiedSearch(query, mediaType)
  const results = data?.results || []

  const handleSelect = (result: UnifiedSearchResult) => {
    if (result.media_type === "tv") {
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

  const siteExplanation = (
    <>
      <h2 className="mb-3 font-display text-lg text-foreground">Cast Mortality Database</h2>
      <div className="space-y-3 text-sm text-foreground-muted">
        <p>
          Dead on Film lets you discover which actors from your favorite films and TV shows have
          passed away.
        </p>
        <p>
          We calculate <strong>expected vs actual deaths</strong> using US Social Security
          Administration actuarial life tables. This reveals which productions have statistically
          unusual mortality rates - not just old content where everyone has died, but those where
          deaths exceeded what math would predict.
        </p>
        <p>
          Search any movie or TV show to see death dates, causes, and how the cast compares to
          statistical expectations.
        </p>
      </div>
    </>
  )

  const placeholderText =
    mediaType === "movie"
      ? "Search for a movie..."
      : mediaType === "tv"
        ? "Search for a TV show..."
        : "Search movies and TV shows..."

  return (
    <div data-testid="search-bar" className="relative mx-auto w-full max-w-xl">
      <div className="mb-3 flex justify-center">
        <MediaTypeToggle value={mediaType} onChange={setMediaType} />
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
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
        </div>
        <InfoPopover>{siteExplanation}</InfoPopover>
      </div>

      {isOpen && results.length > 0 && (
        <SearchDropdown
          id={listboxId}
          results={results}
          selectedIndex={selectedIndex}
          onSelect={handleSelect}
          searchQuery={query}
        />
      )}

      {isOpen && query.length >= 2 && !isLoading && results.length === 0 && (
        <div
          data-testid="search-no-results"
          className="absolute z-50 mt-1 w-full rounded-lg border border-border-theme/30 bg-surface p-4 text-center shadow-lg"
        >
          <p className="mb-1 font-display text-sm uppercase tracking-wide text-foreground">
            End of Reel
          </p>
          <p className="text-sm text-foreground-muted">
            No results found for "<span className="italic">{query}</span>"
          </p>
        </div>
      )}
    </div>
  )
}
