/**
 * Linear progress bar with animated fill and theme variants.
 */

export type ProgressVariant = "default" | "success" | "warning" | "danger"

interface ProgressBarProps {
  /** Progress value (0-100) */
  value: number
  /** Color variant */
  variant?: ProgressVariant
  /** Show percentage label */
  showLabel?: boolean
  /** Label position: inside the bar or outside */
  labelPosition?: "inside" | "outside"
  /** Height of the bar in pixels */
  height?: number
  /** Optional aria-label */
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

export default function ProgressBar({
  value,
  variant = "default",
  showLabel = false,
  labelPosition = "outside",
  height = 8,
  label,
  animated = true,
}: ProgressBarProps) {
  // Clamp value between 0 and 100
  const clampedValue = Math.min(100, Math.max(0, value))
  const formattedValue = `${Math.round(clampedValue)}%`

  return (
    <div className="w-full">
      {showLabel && labelPosition === "outside" && (
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-admin-text-muted">{label || "Progress"}</span>
          <span className="font-medium text-admin-text-primary">{formattedValue}</span>
        </div>
      )}
      <div
        className="w-full overflow-hidden rounded-full bg-admin-surface-inset"
        style={{ height }}
        role="progressbar"
        aria-valuenow={clampedValue}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || `Progress: ${formattedValue}`}
      >
        <div
          className={`h-full rounded-full ${animated ? "transition-all duration-500 ease-out" : ""}`}
          style={{
            width: `${clampedValue}%`,
            backgroundColor: variantColors[variant],
          }}
        >
          {showLabel && labelPosition === "inside" && height >= 16 && (
            <span
              className="flex h-full items-center justify-end px-2 text-xs font-medium text-admin-text-inverse"
              style={{ minWidth: "2.5rem" }}
            >
              {clampedValue >= 15 ? formattedValue : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
