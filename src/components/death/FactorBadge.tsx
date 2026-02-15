/**
 * Notable factor badge (e.g., "On Set", "Young Death").
 * Converts snake_case factors to Title Case display.
 */

interface FactorBadgeProps {
  factor: string
}

export default function FactorBadge({ factor }: FactorBadgeProps) {
  const formatted = factor
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")

  return (
    <span
      className="inline-block rounded-full bg-deceased-bg px-2.5 py-1 text-xs text-deceased-badge-text"
      data-testid="factor-badge"
    >
      {formatted}
    </span>
  )
}
