import type { UnifiedSearchResult } from "@/types"
import SearchResult from "./SearchResult"

interface SearchDropdownProps {
  id?: string
  results: UnifiedSearchResult[]
  selectedIndex: number
  onSelect: (result: UnifiedSearchResult) => void
  searchQuery: string
}

export default function SearchDropdown({
  id,
  results,
  selectedIndex,
  onSelect,
  searchQuery,
}: SearchDropdownProps) {
  return (
    <ul
      id={id}
      role="listbox"
      data-testid="search-dropdown"
      className="absolute z-50 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-brown-medium/30 bg-cream shadow-lg"
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
