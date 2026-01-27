/**
 * Loading skeleton placeholders with pulse animation.
 * Uses compound component pattern: Skeleton.Text, Skeleton.Card, etc.
 */

interface BaseSkeletonProps {
  /** Optional additional className */
  className?: string
  /** Optional aria-label for accessibility */
  label?: string
}

interface TextSkeletonProps extends BaseSkeletonProps {
  /** Number of text lines */
  lines?: number
  /** Width of the last line (percentage or 'full') */
  lastLineWidth?: number | "full"
}

interface CardSkeletonProps extends BaseSkeletonProps {
  /** Whether to show a header section */
  showHeader?: boolean
  /** Number of content lines */
  contentLines?: number
}

interface TableSkeletonProps extends BaseSkeletonProps {
  /** Number of rows */
  rows?: number
  /** Number of columns */
  columns?: number
}

interface ChartSkeletonProps extends BaseSkeletonProps {
  /** Height of the chart area in pixels */
  height?: number
}

const baseClass = "animate-pulse rounded bg-admin-surface-overlay"

/**
 * Base skeleton element
 */
function SkeletonBase({ className = "", label }: BaseSkeletonProps) {
  return (
    <div
      className={`${baseClass} ${className}`}
      role="status"
      aria-label={label || "Loading..."}
      aria-busy="true"
    />
  )
}

/**
 * Text placeholder with configurable number of lines
 */
function TextSkeleton({ lines = 3, lastLineWidth = 75, className = "", label }: TextSkeletonProps) {
  return (
    <div
      className={`space-y-2 ${className}`}
      role="status"
      aria-label={label || "Loading text..."}
      aria-busy="true"
    >
      {Array.from({ length: lines }).map((_, i) => {
        const isLastLine = i === lines - 1
        const width = isLastLine && lastLineWidth !== "full" ? `${lastLineWidth}%` : "100%"
        return <div key={i} className={`${baseClass} h-4`} style={{ width }} />
      })}
    </div>
  )
}

/**
 * Card placeholder with optional header and content lines
 */
function CardSkeleton({
  showHeader = true,
  contentLines = 3,
  className = "",
  label,
}: CardSkeletonProps) {
  return (
    <div
      className={`rounded-lg border border-admin-border bg-admin-surface-elevated p-4 ${className}`}
      role="status"
      aria-label={label || "Loading card..."}
      aria-busy="true"
    >
      {showHeader && (
        <div className="mb-4 flex items-center justify-between">
          <div className={`${baseClass} h-5 w-1/3`} />
          <div className={`${baseClass} h-5 w-8`} />
        </div>
      )}
      <div className="space-y-3">
        <div className={`${baseClass} h-8 w-1/2`} />
        <TextSkeleton lines={contentLines} />
      </div>
    </div>
  )
}

/**
 * Table placeholder with configurable rows and columns
 */
function TableSkeleton({ rows = 5, columns = 4, className = "", label }: TableSkeletonProps) {
  return (
    <div
      className={`overflow-hidden rounded-lg border border-admin-border ${className}`}
      role="status"
      aria-label={label || "Loading table..."}
      aria-busy="true"
    >
      {/* Header row */}
      <div className="flex border-b border-admin-border bg-admin-surface-inset p-3">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="flex-1 px-2">
            <div className={`${baseClass} h-4 w-3/4`} />
          </div>
        ))}
      </div>
      {/* Data rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex border-b border-admin-border-subtle bg-admin-surface-elevated p-3 last:border-b-0"
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <div key={colIndex} className="flex-1 px-2">
              <div
                className={`${baseClass} h-4`}
                style={{ width: `${60 + Math.random() * 30}%` }}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * Chart placeholder
 */
function ChartSkeleton({ height = 200, className = "", label }: ChartSkeletonProps) {
  return (
    <div
      className={`rounded-lg border border-admin-border bg-admin-surface-elevated p-4 ${className}`}
      role="status"
      aria-label={label || "Loading chart..."}
      aria-busy="true"
    >
      {/* Chart header */}
      <div className="mb-4 flex items-center justify-between">
        <div className={`${baseClass} h-5 w-1/4`} />
        <div className="flex gap-2">
          <div className={`${baseClass} h-6 w-16 rounded`} />
          <div className={`${baseClass} h-6 w-16 rounded`} />
        </div>
      </div>
      {/* Chart area */}
      <div className={`${baseClass} w-full`} style={{ height }} />
    </div>
  )
}

/**
 * Stat card placeholder (matches StatCard layout)
 */
function StatCardSkeleton({ className = "", label }: BaseSkeletonProps) {
  return (
    <div
      className={`rounded-lg border border-admin-border bg-admin-surface-elevated p-4 md:p-6 ${className}`}
      role="status"
      aria-label={label || "Loading stat..."}
      aria-busy="true"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-3">
          <div className={`${baseClass} h-4 w-1/2`} />
          <div className={`${baseClass} h-8 w-2/3`} />
          <div className={`${baseClass} h-4 w-1/4`} />
        </div>
        <div className={`${baseClass} h-10 w-10 rounded-full`} />
      </div>
    </div>
  )
}

// Export as compound component
const Skeleton = Object.assign(SkeletonBase, {
  Text: TextSkeleton,
  Card: CardSkeleton,
  Table: TableSkeleton,
  Chart: ChartSkeleton,
  StatCard: StatCardSkeleton,
})

export default Skeleton
