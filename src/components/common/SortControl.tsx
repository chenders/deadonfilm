interface SortOption {
  value: string
  label: string
}

interface SortControlProps {
  options: SortOption[]
  currentSort: string
  currentDir: "asc" | "desc"
  onSortChange: (sort: string) => void
  onDirChange: (dir: "asc" | "desc") => void
  testId?: string
}

export default function SortControl({
  options,
  currentSort,
  currentDir,
  onSortChange,
  onDirChange,
  testId = "sort-control",
}: SortControlProps) {
  return (
    <div data-testid={testId} className="flex items-center gap-2">
      <label htmlFor={`${testId}-select`} className="text-xs text-text-muted">
        Sort by
      </label>
      <select
        id={`${testId}-select`}
        data-testid={`${testId}-select`}
        value={currentSort}
        onChange={(e) => onSortChange(e.target.value)}
        className="rounded-lg border border-brown-medium/30 bg-surface-elevated px-2 py-1 text-xs text-brown-dark focus:border-brown-medium focus:outline-none focus:ring-1 focus:ring-brown-medium"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        data-testid={`${testId}-dir`}
        onClick={() => onDirChange(currentDir === "asc" ? "desc" : "asc")}
        className="rounded-lg border border-brown-medium/30 bg-surface-elevated px-2 py-1 text-xs text-brown-dark transition-colors hover:bg-cream focus:border-brown-medium focus:outline-none focus:ring-1 focus:ring-brown-medium"
        title={currentDir === "asc" ? "Ascending order" : "Descending order"}
        aria-label={currentDir === "asc" ? "Sort ascending" : "Sort descending"}
      >
        {currentDir === "asc" ? "\u2191" : "\u2193"}
      </button>
    </div>
  )
}

export type { SortOption, SortControlProps }
