import { useEffect, useState } from "react"

interface MortalityScoreProps {
  stats: {
    totalCast: number
    deceasedCount: number
    livingCount: number
    mortalityPercentage: number
  }
}

export default function MortalityScore({ stats }: MortalityScoreProps) {
  const { totalCast, deceasedCount, livingCount, mortalityPercentage } = stats
  const [animatedWidth, setAnimatedWidth] = useState(0)

  // Animate the bar on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedWidth(mortalityPercentage)
    }, 100)
    return () => clearTimeout(timer)
  }, [mortalityPercentage])

  return (
    <div
      data-testid="mortality-score"
      className="bg-beige border border-brown-medium/20 rounded-lg p-3 md:p-4 mb-3 md:mb-4 w-[70%] mx-auto shadow-sm"
    >
      {/* Horizontal layout: percentage+text and stats (wraps on narrow screens) */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span
            data-testid="mortality-percentage"
            className="text-2xl md:text-3xl font-display text-accent font-bold"
          >
            {mortalityPercentage}%
          </span>
          <span className="text-sm md:text-base text-brown-dark">of cast deceased</span>
        </div>

        <div data-testid="cast-stats" className="flex gap-3 text-xs md:text-sm">
          <span data-testid="deceased-count" className="text-accent font-medium">
            {deceasedCount} dead
          </span>
          <span data-testid="living-count" className="text-living font-medium">
            {livingCount} living
          </span>
          <span data-testid="total-count" className="text-brown-dark">
            {totalCast} total
          </span>
        </div>
      </div>

      {/* Vintage-style mortality bar */}
      <div
        data-testid="mortality-bar"
        className="mt-3 h-3 bg-living-muted/20 rounded border border-brown-medium/20 overflow-hidden relative"
      >
        {/* Film sprocket decoration */}
        <div className="absolute inset-y-0 left-0 right-0 flex justify-between items-center px-1 pointer-events-none">
          {Array.from({ length: 10 }, (_, i) => (
            <div
              key={i}
              className="w-1 h-1 rounded-full bg-brown-medium/10"
            />
          ))}
        </div>

        {/* Animated fill */}
        <div
          data-testid="mortality-bar-fill"
          className="h-full bg-gradient-to-r from-accent to-accent/80 transition-all duration-700 ease-out rounded-r"
          style={{ width: `${animatedWidth}%` }}
        />
      </div>
    </div>
  )
}
