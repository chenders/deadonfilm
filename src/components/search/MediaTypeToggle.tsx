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
      className="flex rounded-lg border border-brown-medium/20 bg-cream p-0.5 dark:border-[#4a3d32] dark:bg-[#2a221c]"
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
              ? "bg-brown-dark text-cream dark:bg-[#d4c8b5] dark:text-[#1a1612]"
              : "text-brown-medium hover:bg-beige/50 hover:text-brown-dark dark:text-[#9a8b7a] dark:hover:bg-[#4a3d32]/50 dark:hover:text-[#d4c8b5]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
