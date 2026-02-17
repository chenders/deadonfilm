import { formatRelativeTime, formatFullDateTime } from "@/utils/formatRelativeTime"

interface RelativeTimeProps {
  date: string | null
  prefix?: string
  fallback?: string
  className?: string
}

/**
 * Renders a relative time string (e.g., "3 days ago") with a tooltip
 * showing the full date/time on hover.
 */
export default function RelativeTime({ date, prefix, fallback, className }: RelativeTimeProps) {
  const relative = formatRelativeTime(date)
  const full = formatFullDateTime(date)

  if (!relative) {
    if (fallback) {
      return <span className={className}>{fallback}</span>
    }
    return null
  }

  const display = prefix ? `${prefix} ${relative}` : relative

  return (
    <span className={className} title={full}>
      {display}
    </span>
  )
}
