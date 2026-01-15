import { useState, useRef, useEffect, useId } from "react"
import { useNavigate } from "react-router-dom"
import { useUnifiedSearch } from "@/hooks/useUnifiedSearch"
import { useKeyboardNavigation } from "@/hooks/useKeyboardNavigation"
import { createMovieSlug, createShowSlug } from "@/utils/slugify"
import type { UnifiedSearchResult, SearchMediaType } from "@/types"
import SearchInput from "./SearchInput"
import SearchDropdown from "./SearchDropdown"
import MediaTypeToggle from "./MediaTypeToggle"

interface SearchModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const [query, setQuery] = useState("")
  const [mediaType, setMediaType] = useState<SearchMediaType>("all")
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const listboxId = useId()

  const { data, isLoading } = useUnifiedSearch(query, mediaType)
  const results = data?.results || []

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setQuery("")
      setIsDropdownOpen(false)
    }
  }, [isOpen])

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure modal is rendered
      const timer = setTimeout(() => {
        inputRef.current?.focus()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  const handleSelect = (result: UnifiedSearchResult) => {
    if (result.media_type === "tv") {
      const slug = createShowSlug(result.title, result.release_date, result.id)
      navigate(`/show/${slug}`)
    } else {
      const slug = createMovieSlug(result.title, result.release_date, result.id)
      navigate(`/movie/${slug}`)
    }
    onClose()
  }

  const { selectedIndex, handleKeyDown } = useKeyboardNavigation({
    items: results,
    isOpen: isDropdownOpen,
    onSelect: handleSelect,
    onEscape: onClose,
  })

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const placeholderText =
    mediaType === "movie"
      ? "Search for a movie..."
      : mediaType === "tv"
        ? "Search for a TV show..."
        : "Search movies and TV shows..."

  if (!isOpen) return null

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      data-testid="search-modal-backdrop"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[10vh] transition-opacity duration-150 sm:pt-[15vh]"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        data-testid="search-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Search movies and TV shows"
        className="mx-4 w-full max-w-xl transform transition-all duration-150"
      >
        {/* Close button for mobile */}
        <button
          data-testid="search-modal-close"
          onClick={onClose}
          className="absolute right-6 top-4 rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white sm:hidden"
          aria-label="Close search"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <div className="rounded-lg bg-cream shadow-2xl dark:bg-[#241e18]">
          {/* Media type toggle */}
          <div className="flex justify-center border-b border-brown-medium/20 pb-3 pt-4 dark:border-[#4a3d32]">
            <MediaTypeToggle value={mediaType} onChange={setMediaType} />
          </div>

          {/* Search input */}
          <div className="p-4">
            <SearchInput
              ref={inputRef}
              value={query}
              onChange={(value) => {
                setQuery(value)
                setIsDropdownOpen(value.length >= 2)
              }}
              onFocus={() => {
                if (query.length >= 2) {
                  setIsDropdownOpen(true)
                }
              }}
              onBlur={() => {
                // Delay to allow click on dropdown items
                setTimeout(() => setIsDropdownOpen(false), 200)
              }}
              onKeyDown={handleKeyDown}
              isLoading={isLoading}
              placeholder={placeholderText}
              listboxId={listboxId}
            />

            {/* Keyboard hint */}
            <p className="mt-2 hidden text-center text-xs text-text-muted dark:text-[#9a8b7a] sm:block">
              Press{" "}
              <kbd className="rounded bg-brown-medium/20 px-1.5 py-0.5 font-mono dark:bg-[#4a3d32]">
                Esc
              </kbd>{" "}
              to close
            </p>
          </div>

          {/* Results dropdown */}
          {isDropdownOpen && results.length > 0 && (
            <div className="border-t border-brown-medium/20 dark:border-[#4a3d32]">
              <SearchDropdown
                id={listboxId}
                results={results}
                selectedIndex={selectedIndex}
                onSelect={handleSelect}
                searchQuery={query}
                inline
              />
            </div>
          )}

          {/* No results message */}
          {isDropdownOpen && query.length >= 2 && !isLoading && results.length === 0 && (
            <div
              data-testid="search-modal-no-results"
              className="border-t border-brown-medium/20 p-4 text-center dark:border-[#4a3d32]"
            >
              <p className="mb-1 font-display text-sm uppercase tracking-wide text-brown-dark dark:text-[#d4c8b5]">
                End of Reel
              </p>
              <p className="text-sm text-text-muted dark:text-[#9a8b7a]">
                No results found for "<span className="italic">{query}</span>"
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
