import { useGlobalSearch } from "./GlobalSearchProvider"

export default function SearchTrigger() {
  const { openSearch } = useGlobalSearch()

  return (
    <button
      data-testid="search-trigger"
      onClick={openSearch}
      className="group relative rounded-full p-2 text-brown-dark transition-colors hover:bg-brown-medium/10"
      aria-label="Search movies and TV shows"
      title="Search (⌘K)"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-6 w-6 md:h-7 md:w-7"
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

      {/* Keyboard shortcut hint - hidden on mobile */}
      <span className="pointer-events-none absolute -bottom-8 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-brown-dark px-2 py-1 text-xs text-cream opacity-0 transition-opacity group-hover:opacity-100 sm:block">
        ⌘K
      </span>
    </button>
  )
}
