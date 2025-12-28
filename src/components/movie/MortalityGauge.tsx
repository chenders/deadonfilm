import { useEffect, useState } from "react"

interface MortalityGaugeProps {
  stats: {
    totalCast: number
    deceasedCount: number
    livingCount: number
    mortalityPercentage: number
    expectedDeaths: number
    mortalitySurpriseScore: number
  }
}

export default function MortalityGauge({ stats }: MortalityGaugeProps) {
  const { mortalityPercentage, deceasedCount, expectedDeaths, mortalitySurpriseScore } = stats
  const [animatedPercentage, setAnimatedPercentage] = useState(0)

  // Determine if mortality is higher or lower than expected
  const getSurpriseLabel = () => {
    if (expectedDeaths === 0) return null
    if (mortalitySurpriseScore > 0.5) return { text: "Unusually High", color: "text-accent" }
    if (mortalitySurpriseScore > 0.2) return { text: "Higher Than Expected", color: "text-accent" }
    if (mortalitySurpriseScore < -0.3) return { text: "Lower Than Expected", color: "text-living" }
    return { text: "As Expected", color: "text-text-muted" }
  }
  const surpriseLabel = getSurpriseLabel()

  // Animate the gauge on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedPercentage(mortalityPercentage)
    }, 100)
    return () => clearTimeout(timer)
  }, [mortalityPercentage])

  // SVG calculations
  const size = 200
  const strokeWidth = 14
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const center = size / 2

  // Arc calculations (starts from top, goes clockwise)
  const deceasedArc = (animatedPercentage / 100) * circumference
  const livingArc = circumference - deceasedArc

  // Sprocket hole positions (8 holes around the edge)
  const sprocketHoles = Array.from({ length: 8 }, (_, i) => {
    const angle = (i * 45 - 90) * (Math.PI / 180) // Start from top
    const sprocketRadius = radius + strokeWidth / 2 + 8
    return {
      cx: center + Math.cos(angle) * sprocketRadius,
      cy: center + Math.sin(angle) * sprocketRadius,
    }
  })

  return (
    <div data-testid="mortality-gauge" className="flex flex-col items-center gap-4">
      <div className="relative">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90 transform"
        >
          {/* Outer decorative ring with sprocket holes */}
          <circle
            cx={center}
            cy={center}
            r={radius + strokeWidth / 2 + 4}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-brown-medium/30"
          />

          {/* Sprocket holes */}
          {sprocketHoles.map((hole, i) => (
            <circle key={i} cx={hole.cx} cy={hole.cy} r="4" className="fill-brown-medium/20" />
          ))}

          {/* Background track (living portion) */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-living-muted/30"
          />

          {/* Deceased arc (animated) */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${deceasedArc} ${livingArc}`}
            className="text-accent transition-all duration-700 ease-out"
          />

          {/* Center hub */}
          <circle cx={center} cy={center} r={radius - strokeWidth - 8} className="fill-beige" />
          <circle
            cx={center}
            cy={center}
            r={radius - strokeWidth - 8}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-brown-medium/30"
          />
        </svg>

        {/* Center text (positioned absolutely over SVG) */}
        <div className="absolute inset-0 flex rotate-0 transform flex-col items-center justify-center">
          <span
            data-testid="gauge-percentage"
            className="font-display text-4xl font-bold text-accent"
          >
            {mortalityPercentage}%
          </span>
          <span className="text-sm text-brown-dark">deceased</span>
        </div>
      </div>

      {/* Expected vs Actual mortality info */}
      {expectedDeaths > 0 && (
        <div data-testid="mortality-comparison" className="text-center text-sm">
          <div className="flex items-center justify-center gap-4">
            <div>
              <span className="text-text-muted">Expected: </span>
              <span className="font-medium text-brown-dark">{expectedDeaths.toFixed(1)}</span>
            </div>
            <div className="text-brown-medium/40">|</div>
            <div>
              <span className="text-text-muted">Actual: </span>
              <span className="font-medium text-accent">{deceasedCount.toLocaleString()}</span>
            </div>
          </div>
          {surpriseLabel && (
            <div
              data-testid="surprise-label"
              className={`mt-1 text-xs font-medium ${surpriseLabel.color}`}
            >
              {surpriseLabel.text}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
