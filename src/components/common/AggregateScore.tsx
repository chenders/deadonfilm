import HoverTooltip from "./HoverTooltip"
import { StarIcon } from "@/components/icons"

interface AggregateScoreProps {
  score: number | null
  confidence: number | null
  className?: string
  size?: "sm" | "md" | "lg"
}

/**
 * Displays the "Dead on Film Score" - a weighted aggregate rating
 * from multiple sources (IMDb, RT, Metacritic, Trakt, TMDB, TheTVDB).
 */
export default function AggregateScore({
  score,
  confidence,
  className = "",
  size = "md",
}: AggregateScoreProps) {
  // Don't render if no score available
  if (score === null || score === undefined) {
    return null
  }

  // Size variants
  const sizeClasses = {
    sm: {
      container: "gap-1",
      score: "text-lg",
      label: "text-xs",
      star: 12,
    },
    md: {
      container: "gap-1.5",
      score: "text-2xl",
      label: "text-xs",
      star: 14,
    },
    lg: {
      container: "gap-2",
      score: "text-3xl",
      label: "text-sm",
      star: 16,
    },
  }

  const sizes = sizeClasses[size]

  // Format score to 1 decimal place
  const formattedScore = score.toFixed(1)

  // Calculate confidence description
  const getConfidenceLabel = (conf: number | null): string => {
    if (conf === null) return "Limited data"
    if (conf >= 0.8) return "High confidence"
    if (conf >= 0.5) return "Moderate confidence"
    return "Limited data"
  }

  // Tooltip content explaining the score
  const tooltipContent = `Dead on Film Score: A weighted average of ratings from IMDb, Rotten Tomatoes, Metacritic, Trakt, and TMDB. ${getConfidenceLabel(confidence)} based on available sources and vote counts.`

  return (
    <HoverTooltip content={tooltipContent} testId="aggregate-score-tooltip">
      <div
        data-testid="aggregate-score"
        className={`inline-flex flex-col items-center ${sizes.container} ${className}`}
      >
        <div className="flex items-center gap-1">
          <StarIcon size={sizes.star} className="text-amber-500" />
          <span
            data-testid="aggregate-score-value"
            className={`font-display font-bold text-brown-dark ${sizes.score}`}
          >
            {formattedScore}
          </span>
        </div>
        <span className={`text-text-muted ${sizes.label}`}>DOF Score</span>
      </div>
    </HoverTooltip>
  )
}
