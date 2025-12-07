import type { MovieSearchResult } from "@/types"
import SearchResult from "./SearchResult"

interface SearchDropdownProps {
  id?: string
  movies: MovieSearchResult[]
  selectedIndex: number
  onSelect: (movie: MovieSearchResult) => void
  searchQuery: string
}

export default function SearchDropdown({
  id,
  movies,
  selectedIndex,
  onSelect,
  searchQuery,
}: SearchDropdownProps) {
  return (
    <ul
      id={id}
      role="listbox"
      className="absolute z-50 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-brown-medium/30 bg-cream shadow-lg"
    >
      {movies.slice(0, 10).map((movie, index) => (
        <SearchResult
          key={movie.id}
          movie={movie}
          isSelected={index === selectedIndex}
          onSelect={() => onSelect(movie)}
          searchQuery={searchQuery}
        />
      ))}
    </ul>
  )
}
