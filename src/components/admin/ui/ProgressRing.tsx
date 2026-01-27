/**
 * Circular progress indicator with animated fill.
 */

export type ProgressVariant = "default" | "success" | "warning" | "danger"

interface ProgressRingProps {
  /** Progress value (0-100) */
  value: number
  /** Size in pixels (diameter) */
  size?: number
  /** Stroke width in pixels */
  strokeWidth?: number
  /** Color variant */
  variant?: ProgressVariant
  /** Show percentage label in center */
  showLabel?: boolean
  /** Optional custom label (overrides percentage) */
  label?: string
  /** Whether to animate the fill on mount */
  animated?: boolean
}

const variantColors: Record<ProgressVariant, string> = {
  default: "var(--admin-interactive-primary)",
  success: "var(--admin-success)",
  warning: "var(--admin-warning)",
  danger: "var(--admin-danger)",
}

export default function ProgressRing({
  value,
  size = 48,
  strokeWidth = 4,
  variant = "default",
  showLabel = true,
  label,
  animated = true,
}: ProgressRingProps) {
  // Clamp value between 0 and 100
  const clampedValue = Math.min(100, Math.max(0, value))

  // Calculate SVG parameters
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (clampedValue / 100) * circumference

  // Center of the ring
  const center = size / 2

  // Font size scales with ring size
  const fontSize = Math.max(10, size / 4)

  const displayLabel = label ?? `${Math.round(clampedValue)}%`

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={clampedValue}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Progress: ${displayLabel}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--admin-surface-inset)"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={variantColors[variant]}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className={animated ? "transition-all duration-500 ease-out" : ""}
        />
      </svg>
      {showLabel && (
        <span className="absolute font-medium text-admin-text-primary" style={{ fontSize }}>
          {displayLabel}
        </span>
      )}
    </div>
  )
}
