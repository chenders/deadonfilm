import type { UnifiedSearchResult } from "@/types"
import SearchResult from "./SearchResult"

interface SearchDropdownProps {
  id?: string
  results: UnifiedSearchResult[]
  selectedIndex: number
  onSelect: (result: UnifiedSearchResult) => void
  searchQuery: string
  /** When true, renders inline (for modal). When false, renders with absolute positioning (for search bar). */
  inline?: boolean
}

export default function SearchDropdown({
  id,
  results,
  selectedIndex,
  onSelect,
  searchQuery,
  inline = false,
}: SearchDropdownProps) {
  const baseClasses = "max-h-80 w-full overflow-y-auto bg-cream"
  const positionClasses = inline
    ? "" // Inline mode for modal - no extra positioning/borders
    : "absolute z-50 mt-1 rounded-lg border border-brown-medium/30 shadow-lg" // Absolute mode for search bar

  return (
    <ul
      id={id}
      role="listbox"
      data-testid="search-dropdown"
      className={`${baseClasses} ${positionClasses}`}
    >
      {results.slice(0, 10).map((result, index) => (
        <SearchResult
          key={`${result.media_type}-${result.id}`}
          result={result}
          isSelected={index === selectedIndex}
          onSelect={() => onSelect(result)}
          searchQuery={searchQuery}
        />
      ))}
    </ul>
  )
}
