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
  return (
    <div data-testid="cast-toggle" className="flex justify-center mb-6">
      <div className="inline-flex rounded-lg border border-brown-medium/30 overflow-hidden">
        <button
          data-testid="deceased-toggle-btn"
          aria-pressed={!showLiving}
          onClick={() => onToggle(false)}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            !showLiving ? "bg-accent text-white" : "bg-white text-brown-dark hover:bg-beige"
          }`}
        >
          Deceased ({deceasedCount})
        </button>
        <button
          data-testid="living-toggle-btn"
          aria-pressed={showLiving}
          onClick={() => onToggle(true)}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            showLiving ? "bg-living text-white" : "bg-white text-brown-dark hover:bg-beige"
          }`}
        >
          Living ({livingCount})
        </button>
      </div>
    </div>
  )
}
