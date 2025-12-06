import type { MovieSearchResult } from "@/types"
import SearchResult from "./SearchResult"

interface SearchDropdownProps {
  movies: MovieSearchResult[]
  selectedIndex: number
  onSelect: (movie: MovieSearchResult) => void
}

export default function SearchDropdown({ movies, selectedIndex, onSelect }: SearchDropdownProps) {
  return (
    <ul
      role="listbox"
      className="absolute z-50 w-full mt-1 bg-cream border border-brown-medium/30
                 rounded-lg shadow-lg max-h-80 overflow-y-auto"
    >
      {movies.slice(0, 10).map((movie, index) => (
        <SearchResult
          key={movie.id}
          movie={movie}
          isSelected={index === selectedIndex}
          onSelect={() => onSelect(movie)}
        />
      ))}
    </ul>
  )
}
