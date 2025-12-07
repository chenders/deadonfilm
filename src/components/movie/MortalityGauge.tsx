import { useEffect, useState } from "react"

interface MortalityGaugeProps {
  stats: {
    totalCast: number
    deceasedCount: number
    livingCount: number
    mortalityPercentage: number
  }
}

export default function MortalityGauge({ stats }: MortalityGaugeProps) {
  const { totalCast, deceasedCount, livingCount, mortalityPercentage } = stats
  const [animatedPercentage, setAnimatedPercentage] = useState(0)

  // Animate the gauge on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedPercentage(mortalityPercentage)
    }, 100)
    return () => clearTimeout(timer)
  }, [mortalityPercentage])

  // SVG calculations
  const size = 160
  const strokeWidth = 12
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
    <div
      data-testid="mortality-gauge"
      className="flex flex-col items-center mb-4"
    >
      <div className="relative">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="transform -rotate-90"
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
            <circle
              key={i}
              cx={hole.cx}
              cy={hole.cy}
              r="4"
              className="fill-brown-medium/20"
            />
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
          <circle
            cx={center}
            cy={center}
            r={radius - strokeWidth - 8}
            className="fill-beige"
          />
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
        <div className="absolute inset-0 flex flex-col items-center justify-center transform rotate-0">
          <span
            data-testid="gauge-percentage"
            className="text-3xl font-display text-accent font-bold"
          >
            {mortalityPercentage}%
          </span>
          <span className="text-xs text-brown-dark">deceased</span>
        </div>
      </div>

      {/* Stats row below gauge */}
      <div
        data-testid="gauge-stats"
        className="flex gap-4 mt-2 text-sm"
      >
        <span className="text-accent font-medium">
          {deceasedCount} dead
        </span>
        <span className="text-living font-medium">
          {livingCount} living
        </span>
        <span className="text-brown-dark">
          {totalCast} total
        </span>
      </div>
    </div>
  )
}
