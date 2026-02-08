import { Fragment } from "react"
import type { UnifiedSearchResult, SearchMediaType } from "@/types"
import SearchResult from "./SearchResult"

interface SearchDropdownProps {
  id?: string
  results: UnifiedSearchResult[]
  selectedIndex: number
  onSelect: (result: UnifiedSearchResult) => void
  searchQuery: string
  /** When true, renders inline (for modal). When false, renders with absolute positioning (for search bar). */
  inline?: boolean
  /** Current search media type filter */
  mediaType?: SearchMediaType
}

export default function SearchDropdown({
  id,
  results,
  selectedIndex,
  onSelect,
  searchQuery,
  inline = false,
  mediaType,
}: SearchDropdownProps) {
  const baseClasses = "max-h-80 w-full overflow-y-auto bg-cream"
  const positionClasses = inline
    ? "" // Inline mode for modal - no extra positioning/borders
    : "absolute z-50 mt-1 rounded-lg border border-brown-medium/30 shadow-lg" // Absolute mode for search bar

  // Find where person results start (for "all" mode section divider)
  const firstPersonIndex =
    mediaType === "all" ? results.findIndex((r) => r.media_type === "person") : -1

  return (
    <ul
      id={id}
      role="listbox"
      data-testid="search-dropdown"
      className={`${baseClasses} ${positionClasses}`}
    >
      {results.slice(0, 13).map((result, index) => (
        <Fragment key={`${result.media_type}-${result.id}`}>
          {index === firstPersonIndex && firstPersonIndex > 0 && (
            <li
              role="presentation"
              data-testid="people-section-header"
              className="border-t border-brown-medium/20 px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-text-muted"
            >
              People
            </li>
          )}
          <SearchResult
            result={result}
            isSelected={index === selectedIndex}
            onSelect={() => onSelect(result)}
            searchQuery={searchQuery}
          />
        </Fragment>
      ))}
    </ul>
  )
}
