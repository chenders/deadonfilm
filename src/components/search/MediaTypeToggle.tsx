import type { SearchMediaType } from "@/types"

interface MediaTypeToggleProps {
  value: SearchMediaType
  onChange: (type: SearchMediaType) => void
}

const options: { value: SearchMediaType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies" },
  { value: "tv", label: "TV Shows" },
  { value: "person", label: "People" },
]

export default function MediaTypeToggle({ value, onChange }: MediaTypeToggleProps) {
  return (
    <div
      data-testid="media-type-toggle"
      className="flex rounded-lg border border-brown-medium/20 bg-cream p-0.5"
      role="radiogroup"
      aria-label="Search type"
    >
      {options.map((option, index) => (
        <span key={option.value} className="flex items-center">
          {index > 0 && <span className="mx-0.5 h-4 w-px bg-brown-medium/20" aria-hidden="true" />}
          <button
            type="button"
            role="radio"
            aria-checked={value === option.value}
            data-testid={`media-type-${option.value}`}
            onClick={() => onChange(option.value)}
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
              value === option.value
                ? "bg-brown-dark text-cream"
                : "text-brown-medium hover:bg-beige/50 hover:text-brown-dark"
            }`}
          >
            {option.label}
          </button>
        </span>
      ))}
    </div>
  )
}
