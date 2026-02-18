/**
 * Notable factor badge (e.g., "On Set", "Young Death", "Military Service").
 * Converts snake_case factors to Title Case display.
 *
 * Variants:
 *   - "death" (default): death-themed colors for death circumstances
 *   - "life": muted teal for biography life factors
 */

interface FactorBadgeProps {
  factor: string
  variant?: "death" | "life"
}

export default function FactorBadge({ factor, variant = "death" }: FactorBadgeProps) {
  const formatted = factor
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")

  const className =
    variant === "life"
      ? "inline-block rounded-full bg-life-factor-bg px-2.5 py-1 text-xs text-life-factor-text"
      : "inline-block rounded-full bg-deceased-bg px-2.5 py-1 text-xs text-deceased-badge-text"

  return (
    <span className={className} data-testid="factor-badge">
      {formatted}
    </span>
  )
}
