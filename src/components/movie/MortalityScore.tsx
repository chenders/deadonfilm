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
    <div className="bg-beige rounded-lg p-6 mb-8">
      <div className="text-center">
        <div className="text-5xl font-display text-accent mb-2">{mortalityPercentage}%</div>
        <p className="text-lg text-brown-dark mb-4">of the cast has passed away</p>

        <div className="flex justify-center gap-8 text-sm">
          <div>
            <span className="font-semibold text-accent">{deceasedCount}</span>
            <span className="text-text-muted"> deceased</span>
          </div>
          <div>
            <span className="font-semibold text-green-700">{livingCount}</span>
            <span className="text-text-muted"> living</span>
          </div>
          <div>
            <span className="font-semibold text-brown-dark">{totalCast}</span>
            <span className="text-text-muted"> total</span>
          </div>
        </div>
      </div>

      {/* Mortality bar */}
      <div className="mt-4 h-3 bg-green-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-accent transition-all duration-500"
          style={{ width: `${mortalityPercentage}%` }}
        />
      </div>
    </div>
  )
}
