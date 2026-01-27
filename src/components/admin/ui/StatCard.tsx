/**
 * Enhanced stat display card with sparkline, trend indicator, and loading state.
 */

import { ReactNode } from "react"
import Sparkline, { SparklineVariant } from "./Sparkline"
import Skeleton from "./Skeleton"

type TrendDirection = "up" | "down" | "flat"

interface StatCardProps {
  /** Label describing the stat */
  label: string
  /** The main value to display */
  value: string | number
  /** Percentage change (e.g., 2.5 for +2.5%) */
  change?: number
  /** Optional icon to display */
  icon?: ReactNode
  /** Sparkline data points (last 7 days, etc.) */
  sparklineData?: number[]
  /** Color variant for sparkline and trend */
  variant?: SparklineVariant
  /** Whether data is loading */
  isLoading?: boolean
  /** Click handler to navigate to detail view */
  onClick?: () => void
  /** Optional link href (alternative to onClick) */
  href?: string
  /** Optional additional className */
  className?: string
}

function getTrendDirection(change: number | undefined): TrendDirection {
  if (change === undefined || Math.abs(change) < 0.1) return "flat"
  return change > 0 ? "up" : "down"
}

function TrendIndicator({ change, variant }: { change: number; variant: SparklineVariant }) {
  const direction = getTrendDirection(change)
  const formattedChange = `${change > 0 ? "+" : ""}${change.toFixed(1)}%`

  // Determine color based on variant or direction
  let colorClass: string
  if (variant === "success") {
    colorClass = "text-admin-success"
  } else if (variant === "danger") {
    colorClass = "text-admin-danger"
  } else if (variant === "warning") {
    colorClass = "text-admin-warning"
  } else {
    // Default: use direction-based coloring
    colorClass =
      direction === "up"
        ? "text-admin-success"
        : direction === "down"
          ? "text-admin-danger"
          : "text-admin-text-muted"
  }

  return (
    <span className={`inline-flex items-center gap-1 text-sm font-medium ${colorClass}`}>
      {direction === "up" && (
        <svg
          className="h-3 w-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={3}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      )}
      {direction === "down" && (
        <svg
          className="h-3 w-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={3}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      )}
      {direction === "flat" && (
        <svg
          className="h-3 w-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={3}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
        </svg>
      )}
      {formattedChange}
    </span>
  )
}

export default function StatCard({
  label,
  value,
  change,
  icon,
  sparklineData,
  variant = "default",
  isLoading = false,
  onClick,
  href,
  className = "",
}: StatCardProps) {
  if (isLoading) {
    return <Skeleton.StatCard className={className} />
  }

  const isClickable = !!onClick || !!href

  const cardContent = (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-admin-text-muted">{label}</p>
        <p className="mt-2 text-2xl font-semibold text-admin-text-primary md:text-3xl">
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
        {change !== undefined && (
          <div className="mt-2">
            <TrendIndicator change={change} variant={variant} />
          </div>
        )}
      </div>

      <div className="flex flex-col items-end gap-2">
        {icon && <div className="text-admin-text-muted">{icon}</div>}
        {sparklineData && sparklineData.length > 1 && (
          <Sparkline data={sparklineData} variant={variant} width={80} height={24} />
        )}
      </div>
    </div>
  )

  const baseClasses = `
    rounded-lg border border-admin-border bg-admin-surface-elevated p-4 md:p-6
    shadow-admin-sm
    ${isClickable ? "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-admin-md hover:border-admin-interactive/30 cursor-pointer" : ""}
    ${className}
  `

  if (href) {
    return (
      <a href={href} className={`block ${baseClasses}`}>
        {cardContent}
      </a>
    )
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${baseClasses} w-full text-left`}>
        {cardContent}
      </button>
    )
  }

  return <div className={baseClasses}>{cardContent}</div>
}
