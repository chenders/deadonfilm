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
      <div className="relative inline-flex rounded-lg border border-brown-medium/30 overflow-hidden bg-white">
        {/* Sliding indicator */}
        <div
          data-testid="toggle-indicator"
          className={`absolute inset-y-0 w-1/2 rounded-md transition-all duration-300 ease-out ${
            showLiving ? "translate-x-full bg-living" : "translate-x-0 bg-accent"
          }`}
        />

        <button
          data-testid="deceased-toggle-btn"
          aria-pressed={!showLiving}
          onClick={() => onToggle(false)}
          className={`relative z-10 px-4 py-2 text-sm font-medium transition-colors duration-300 ${
            !showLiving ? "text-white" : "text-brown-dark hover:text-brown-medium"
          }`}
        >
          Deceased ({deceasedCount})
        </button>
        <button
          data-testid="living-toggle-btn"
          aria-pressed={showLiving}
          onClick={() => onToggle(true)}
          className={`relative z-10 px-4 py-2 text-sm font-medium transition-colors duration-300 ${
            showLiving ? "text-white" : "text-brown-dark hover:text-brown-medium"
          }`}
        >
          Living ({livingCount})
        </button>
      </div>
    </div>
  )
}
