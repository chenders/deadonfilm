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

  return (
    <div
      data-testid="mortality-score"
      className="bg-beige rounded-lg p-2 md:p-3 mb-2 md:mb-3 w-[60%] mx-auto"
    >
      {/* Single row: percentage+text left, stats right */}
      <div className="flex flex-wrap items-baseline justify-between gap-1">
        <div className="flex items-baseline gap-1.5">
          <span
            data-testid="mortality-percentage"
            className="text-lg md:text-2xl font-display text-accent"
          >
            {mortalityPercentage}%
          </span>
          <span className="text-xs md:text-sm text-brown-dark">of cast deceased</span>
        </div>

        <div data-testid="cast-stats" className="flex gap-2 text-[10px] md:text-xs text-text-muted">
          <span data-testid="deceased-count">
            <strong className="text-accent">{deceasedCount}</strong> dead
          </span>
          <span data-testid="living-count">
            <strong className="text-green-700">{livingCount}</strong> living
          </span>
          <span data-testid="total-count">
            <strong className="text-brown-dark">{totalCast}</strong> total
          </span>
        </div>
      </div>

      {/* Mortality bar */}
      <div
        data-testid="mortality-bar"
        className="mt-1.5 h-1.5 bg-green-200 rounded-full overflow-hidden"
      >
        <div
          data-testid="mortality-bar-fill"
          className="h-full bg-accent transition-all duration-500"
          style={{ width: `${mortalityPercentage}%` }}
        />
      </div>
    </div>
  )
}
