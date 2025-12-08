interface CastToggleProps {
  showLiving: boolean
  onToggle: (showLiving: boolean) => void
  deceasedCount: number
  livingCount: number
}

export default function CastToggle({
  showLiving,
  onToggle,
  deceasedCount,
  livingCount,
}: CastToggleProps) {
  const deceasedDisabled = deceasedCount === 0
  const livingDisabled = livingCount === 0

  return (
    <div data-testid="cast-toggle" className="mb-6 flex justify-center">
      <div className="inline-flex overflow-hidden rounded-lg border border-brown-medium/30 bg-white">
        <button
          data-testid="deceased-toggle-btn"
          aria-pressed={!showLiving}
          onClick={() => !deceasedDisabled && onToggle(false)}
          disabled={deceasedDisabled}
          className={`px-4 py-2 text-sm font-medium transition-colors duration-200 ${
            deceasedDisabled
              ? "cursor-not-allowed bg-gray-100 text-gray-400"
              : !showLiving
                ? "bg-accent text-white"
                : "bg-white text-brown-dark hover:bg-beige"
          }`}
        >
          Deceased ({deceasedCount})
        </button>
        <button
          data-testid="living-toggle-btn"
          aria-pressed={showLiving}
          onClick={() => !livingDisabled && onToggle(true)}
          disabled={livingDisabled}
          className={`px-4 py-2 text-sm font-medium transition-colors duration-200 ${
            livingDisabled
              ? "cursor-not-allowed bg-gray-100 text-gray-400"
              : showLiving
                ? "bg-living text-white"
                : "bg-white text-brown-dark hover:bg-beige"
          }`}
        >
          Living ({livingCount})
        </button>
      </div>
    </div>
  )
}
