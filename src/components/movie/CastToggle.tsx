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
    <div data-testid="cast-toggle" className="flex justify-center mb-6">
      <div className="inline-flex rounded-lg border border-brown-medium/30 bg-white overflow-hidden">
        <button
          data-testid="deceased-toggle-btn"
          aria-pressed={!showLiving}
          onClick={() => !deceasedDisabled && onToggle(false)}
          disabled={deceasedDisabled}
          className={`px-4 py-2 text-sm font-medium transition-colors duration-200 ${
            deceasedDisabled
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
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
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
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
