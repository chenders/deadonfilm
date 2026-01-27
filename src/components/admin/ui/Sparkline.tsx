/**
 * SVG-based sparkline mini-chart for compact data visualization.
 * No external dependencies - pure SVG.
 */

export type SparklineVariant = "default" | "success" | "warning" | "danger"

interface SparklineProps {
  /** Array of numeric data points to plot */
  data: number[]
  /** Width in pixels (default: 80) */
  width?: number
  /** Height in pixels (default: 24) */
  height?: number
  /** Color variant */
  variant?: SparklineVariant
  /** Whether to show gradient fill under the line */
  showFill?: boolean
  /** Optional aria-label for accessibility */
  label?: string
  /** Optional className */
  className?: string
}

const variantColors: Record<SparklineVariant, { stroke: string; fill: string }> = {
  default: { stroke: "var(--admin-interactive-primary)", fill: "var(--admin-info-bg)" },
  success: { stroke: "var(--admin-success)", fill: "var(--admin-success-bg)" },
  warning: { stroke: "var(--admin-warning)", fill: "var(--admin-warning-bg)" },
  danger: { stroke: "var(--admin-danger)", fill: "var(--admin-danger-bg)" },
}

export default function Sparkline({
  data,
  width = 80,
  height = 24,
  variant = "default",
  showFill = true,
  label,
  className = "",
}: SparklineProps) {
  // Handle empty or single-point data
  if (!data || data.length === 0) {
    return (
      <svg
        data-testid="sparkline"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={label || "No data"}
        className={`text-admin-text-muted ${className}`}
      >
        <line
          x1="0"
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="4 2"
          opacity="0.5"
        />
      </svg>
    )
  }

  if (data.length === 1) {
    return (
      <svg
        data-testid="sparkline"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={label || `Single value: ${data[0]}`}
        className={className}
      >
        <circle cx={width / 2} cy={height / 2} r="3" fill={variantColors[variant].stroke} />
      </svg>
    )
  }

  // Calculate min/max for scaling
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1 // Avoid division by zero for flat lines

  // Padding to prevent clipping at edges
  const paddingY = 2
  const effectiveHeight = height - paddingY * 2

  // Calculate points
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width
    const y = paddingY + effectiveHeight - ((value - min) / range) * effectiveHeight
    return { x, y }
  })

  // Create smooth path using quadratic bezier curves
  const linePath = points.reduce((path, point, index) => {
    if (index === 0) {
      return `M ${point.x},${point.y}`
    }
    const prev = points[index - 1]
    const midX = (prev.x + point.x) / 2
    return `${path} Q ${prev.x},${prev.y} ${midX},${(prev.y + point.y) / 2} T ${point.x},${point.y}`
  }, "")

  // Create fill path (closes the shape at the bottom)
  const fillPath = `${linePath} L ${width},${height} L 0,${height} Z`

  const colors = variantColors[variant]
  const gradientId = `sparkline-gradient-${variant}`

  return (
    <svg
      data-testid="sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label || `Sparkline chart with ${data.length} data points`}
      className={`overflow-visible ${className}`}
    >
      {showFill && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={colors.fill} stopOpacity="0.8" />
              <stop offset="100%" stopColor={colors.fill} stopOpacity="0.1" />
            </linearGradient>
          </defs>
          <path d={fillPath} fill={`url(#${gradientId})`} />
        </>
      )}
      <path
        d={linePath}
        fill="none"
        stroke={colors.stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End point indicator */}
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r="2"
        fill={colors.stroke}
      />
    </svg>
  )
}
