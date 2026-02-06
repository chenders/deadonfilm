interface ConfidenceIndicatorProps {
  level: string | null
  variant?: "dots" | "badge"
}

const DOT_LEVELS = {
  high: { dots: 4, color: "bg-confidence-high", label: "High confidence" },
  medium: { dots: 3, color: "bg-confidence-medium", label: "Medium confidence" },
  low: { dots: 2, color: "bg-confidence-low", label: "Low confidence" },
  disputed: { dots: 1, color: "bg-confidence-disputed", label: "Disputed" },
} as const

const BADGE_LEVELS: Record<string, { color: string; label: string }> = {
  high: { color: "bg-confidence-high", label: "High" },
  medium: { color: "bg-confidence-medium", label: "Medium" },
  low: { color: "bg-confidence-low", label: "Low" },
  disputed: { color: "bg-confidence-disputed", label: "Disputed" },
}

/**
 * Displays a confidence level indicator in one of two variants:
 * - "dots" (default): Four dots showing confidence level, used on detail pages
 * - "badge": Compact colored pill with label, used in list views
 */
export default function ConfidenceIndicator({ level, variant = "dots" }: ConfidenceIndicatorProps) {
  if (!level) return null

  if (variant === "badge") {
    const config = BADGE_LEVELS[level] || BADGE_LEVELS.medium

    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-white ${config.color}`}
        title={`${config.label} confidence`}
      >
        {config.label}
      </span>
    )
  }

  const config = DOT_LEVELS[level as keyof typeof DOT_LEVELS] || DOT_LEVELS.medium

  return (
    <div
      className="inline-flex items-center gap-1"
      title={config.label}
      data-testid="confidence-indicator"
    >
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={`h-2 w-2 rounded-full ${i <= config.dots ? config.color : "bg-confidence-inactive"}`}
        />
      ))}
      <span className="ml-1 text-xs text-text-muted">{config.label}</span>
    </div>
  )
}
