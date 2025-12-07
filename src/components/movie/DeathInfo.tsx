import { useState, useRef, useEffect } from "react"
import { formatDate, calculateAge } from "@/utils/formatDate"

interface DeathInfoProps {
  actorName: string
  deathday: string
  birthday: string | null
  causeOfDeath: string | null
  causeOfDeathDetails: string | null
  wikipediaUrl: string | null
  tmdbUrl: string
  isLoading?: boolean
}

function LoadingEllipsis() {
  return (
    <span className="inline-flex">
      <span className="animate-pulse">.</span>
      <span className="animate-pulse" style={{ animationDelay: "0.2s" }}>
        .
      </span>
      <span className="animate-pulse" style={{ animationDelay: "0.4s" }}>
        .
      </span>
    </span>
  )
}

interface TooltipProps {
  content: string
  triggerRef: React.RefObject<HTMLElement | null>
  isVisible: boolean
}

function Tooltip({ content, triggerRef, isVisible }: TooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (!isVisible || !triggerRef.current || !tooltipRef.current) return

    const updatePosition = () => {
      if (!triggerRef.current || !tooltipRef.current) return
      const trigger = triggerRef.current.getBoundingClientRect()
      const tooltip = tooltipRef.current.getBoundingClientRect()
      const padding = 8

      // Start with position below and to the left of the trigger (since text is right-aligned)
      let top = trigger.bottom + padding
      let left = trigger.right - tooltip.width

      // Keep tooltip within horizontal bounds
      if (left < padding) {
        left = padding
      }
      if (left + tooltip.width > window.innerWidth - padding) {
        left = window.innerWidth - tooltip.width - padding
      }

      // If tooltip would go below viewport, show it above the trigger
      if (top + tooltip.height > window.innerHeight - padding) {
        top = trigger.top - tooltip.height - padding
      }

      setPosition({ top, left })
    }

    updatePosition()
    window.addEventListener("scroll", updatePosition, true)
    window.addEventListener("resize", updatePosition)

    return () => {
      window.removeEventListener("scroll", updatePosition, true)
      window.removeEventListener("resize", updatePosition)
    }
  }, [isVisible, triggerRef])

  if (!isVisible) return null

  return (
    <div
      ref={tooltipRef}
      className="fixed z-50 max-w-xs bg-gray-900 text-white text-sm px-3 py-2 rounded-lg shadow-lg"
      style={{ top: position.top, left: position.left }}
    >
      {content}
    </div>
  )
}

// Get the best profile link with fallback priority: Wikipedia > TMDB
function getProfileLink(
  wikipediaUrl: string | null,
  tmdbUrl: string
): { url: string; label: string } {
  if (wikipediaUrl) {
    return { url: wikipediaUrl, label: "Wikipedia" }
  }
  // TMDB is always available since we have the person ID
  return { url: tmdbUrl, label: "TMDB" }
}

export default function DeathInfo({
  actorName,
  deathday,
  birthday,
  causeOfDeath,
  causeOfDeathDetails,
  wikipediaUrl,
  tmdbUrl,
  isLoading = false,
}: DeathInfoProps) {
  const ageAtDeath = calculateAge(birthday, deathday)
  const hasDetails = causeOfDeathDetails && causeOfDeathDetails.trim().length > 0
  const profileLink = getProfileLink(wikipediaUrl, tmdbUrl)
  const [showTooltip, setShowTooltip] = useState(false)
  const triggerRef = useRef<HTMLSpanElement>(null)

  const handleMouseEnter = () => setShowTooltip(true)
  const handleMouseLeave = () => setShowTooltip(false)

  return (
    <div data-testid="death-info" className="text-right sm:text-right">
      <p data-testid="death-date" className="text-accent font-medium">
        {formatDate(deathday)}
      </p>

      {ageAtDeath !== null && (
        <p data-testid="age-at-death" className="text-sm text-text-muted">
          Age {ageAtDeath}
        </p>
      )}

      {causeOfDeath && (
        <p className="text-sm text-text-muted mt-1">
          {hasDetails ? (
            <span
              ref={triggerRef}
              className="underline decoration-dotted cursor-help"
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              data-track-event="view_death_details"
              data-track-hover="true"
              data-track-params={JSON.stringify({
                actor_name: actorName,
                cause_of_death: causeOfDeath,
              })}
            >
              {causeOfDeath}
              <span className="ml-1 text-xs opacity-60">ⓘ</span>
              <Tooltip
                content={causeOfDeathDetails}
                triggerRef={triggerRef}
                isVisible={showTooltip}
              />
            </span>
          ) : (
            <a
              href={profileLink.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-brown-dark"
              data-track-event="click_external_link"
              data-track-params={JSON.stringify({
                actor_name: actorName,
                link_type: profileLink.label,
                link_url: profileLink.url,
              })}
            >
              {causeOfDeath}
            </a>
          )}
        </p>
      )}

      {!causeOfDeath && (wikipediaUrl || !isLoading) && (
        <p className="text-sm text-text-muted mt-1">
          <span className="italic">(cause unknown)</span>
          {" - "}
          <a
            href={profileLink.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brown-medium underline hover:text-brown-dark"
            data-track-event="click_external_link"
            data-track-params={JSON.stringify({
              actor_name: actorName,
              link_type: profileLink.label,
              link_url: profileLink.url,
            })}
          >
            {profileLink.label}
          </a>
        </p>
      )}

      {!causeOfDeath && !wikipediaUrl && isLoading && (
        <p className="text-sm text-text-muted mt-1 italic">
          Looking up cause
          <LoadingEllipsis />
        </p>
      )}
    </div>
  )
}
