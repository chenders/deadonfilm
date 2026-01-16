import type { SearchMediaType } from "@/types"

interface MediaTypeToggleProps {
  value: SearchMediaType
  onChange: (type: SearchMediaType) => void
}

const options: { value: SearchMediaType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies" },
  { value: "tv", label: "TV Shows" },
]

export default function MediaTypeToggle({ value, onChange }: MediaTypeToggleProps) {
  return (
    <div
      data-testid="media-type-toggle"
      className="flex rounded-lg border border-border-theme/20 bg-surface-muted p-0.5"
      role="radiogroup"
      aria-label="Search type"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          data-testid={`media-type-${option.value}`}
          onClick={() => onChange(option.value)}
          className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
            value === option.value
              ? "bg-foreground text-surface"
              : "text-foreground-muted hover:bg-surface hover:text-foreground"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
