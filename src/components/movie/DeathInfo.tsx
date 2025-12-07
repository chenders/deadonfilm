import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { formatDate, calculateAge } from "@/utils/formatDate"
import { InfoIcon } from "@/components/icons"

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

function Tooltip({
  content,
  triggerRef,
  isVisible,
  onMouseEnter,
  onMouseLeave,
}: TooltipProps & { onMouseEnter: () => void; onMouseLeave: () => void }) {
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!isVisible || !triggerRef.current) {
      setPosition(null)
      return
    }

    const updatePosition = () => {
      if (!triggerRef.current || !tooltipRef.current) return

      const trigger = triggerRef.current.getBoundingClientRect()
      const tooltip = tooltipRef.current.getBoundingClientRect()
      const padding = 8

      // Position below the trigger, right-aligned with it (since text is right-aligned)
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

    // Use requestAnimationFrame to ensure DOM is ready before measuring
    const rafId = requestAnimationFrame(updatePosition)

    window.addEventListener("scroll", updatePosition, true)
    window.addEventListener("resize", updatePosition)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener("scroll", updatePosition, true)
      window.removeEventListener("resize", updatePosition)
    }
  }, [isVisible, triggerRef])

  if (!isVisible) return null

  // Render tooltip in a portal to avoid layout issues from being inside the trigger
  return createPortal(
    <div
      ref={tooltipRef}
      className="fixed z-50 max-w-xs bg-brown-dark text-cream text-sm px-4 py-3 rounded-lg shadow-xl border border-brown-medium/50 animate-fade-slide-in"
      style={{
        top: position?.top ?? -9999,
        left: position?.left ?? -9999,
        visibility: position ? "visible" : "hidden",
        animationDelay: "0ms",
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Film strip decoration at top */}
      <div className="absolute -top-1 left-4 right-4 flex justify-between">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="w-1.5 h-2 bg-brown-medium/50 rounded-sm" />
        ))}
      </div>
      <p className="leading-relaxed">{content}</p>
    </div>,
    document.body
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
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMouseEnter = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
    setShowTooltip(true)
  }

  const handleMouseLeave = () => {
    // Small delay before hiding to allow mouse to move to tooltip
    hideTimeoutRef.current = setTimeout(() => {
      setShowTooltip(false)
    }, 100)
  }

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
              className="tooltip-trigger underline decoration-dotted cursor-help"
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
              <InfoIcon size={12} className="ml-1 inline opacity-60" />
              <Tooltip
                content={causeOfDeathDetails}
                triggerRef={triggerRef}
                isVisible={showTooltip}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
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
