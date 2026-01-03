import HoverTooltip from "@/components/common/HoverTooltip"
import { InfoIcon } from "@/components/icons"

interface CauseOfDeathBadgeProps {
  causeOfDeath: string
  causeOfDeathDetails?: string | null
  testId?: string
  /** Icon size - defaults to 12 for small text, 14 for regular */
  iconSize?: number
  className?: string
}

/**
 * Displays cause of death with optional info icon that shows details on hover.
 * If causeOfDeathDetails exists, shows an info icon that reveals a tooltip.
 * If not, just displays the cause text.
 */
export default function CauseOfDeathBadge({
  causeOfDeath,
  causeOfDeathDetails,
  testId,
  iconSize = 12,
  className = "",
}: CauseOfDeathBadgeProps) {
  if (causeOfDeathDetails) {
    return (
      <HoverTooltip
        content={causeOfDeathDetails}
        className={`underline decoration-dotted ${className}`}
      >
        <span data-testid={testId}>
          {causeOfDeath}
          <InfoIcon
            size={iconSize}
            className="ml-0.5 inline-block align-text-bottom text-brown-medium"
          />
        </span>
      </HoverTooltip>
    )
  }

  return <span title={causeOfDeath}>{causeOfDeath}</span>
}
