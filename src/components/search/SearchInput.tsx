import { forwardRef } from "react"

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  onFocus: () => void
  onBlur: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
  isLoading: boolean
  placeholder?: string
  listboxId?: string
}

const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ value, onChange, onFocus, onBlur, onKeyDown, isLoading, placeholder, listboxId }, ref) => {
    const isExpanded = value.length >= 2
    return (
      <div data-testid="search-input-container" className="relative">
        <input
          data-testid="search-input"
          ref={ref}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="w-full rounded-lg border-2 border-brown-medium/30 bg-white px-4 py-3 text-lg placeholder:text-text-muted/50 focus:border-brown-medium focus:outline-none focus:ring-2 focus:ring-brown-medium/20 dark:border-[#4a3d32] dark:bg-[#2a221c] dark:text-[#d4c8b5] dark:placeholder:text-[#9a8b7a]/50 dark:focus:border-[#6a5d52] dark:focus:ring-[#4a3d32]"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isExpanded}
          aria-controls={listboxId}
          aria-haspopup="listbox"
          autoComplete="off"
        />

        {isLoading && (
          <div data-testid="search-loading" className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-beige border-t-brown-dark dark:border-[#4a3d32] dark:border-t-[#d4c8b5]" />
          </div>
        )}

        {!isLoading && value.length === 0 && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted dark:text-[#9a8b7a]">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        )}
      </div>
    )
  }
)

SearchInput.displayName = "SearchInput"

export default SearchInput
