import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"

interface TooltipPosition {
  top: number
  left: number
}

interface HoverTooltipProps {
  content: string
  children: React.ReactNode
  className?: string
  testId?: string
  /** Called when tooltip is opened (on hover or click) */
  onOpen?: () => void
}

function TooltipContent({
  content,
  triggerRef,
  isVisible,
  onMouseEnter,
  onMouseLeave,
  testId = "hover-tooltip",
}: {
  content: string
  triggerRef: React.RefObject<HTMLElement | null>
  isVisible: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
  testId?: string
}) {
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<TooltipPosition | null>(null)

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

      // Position below the trigger, right-aligned with it
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

  // Render tooltip in a portal to avoid layout issues
  return createPortal(
    <div
      ref={tooltipRef}
      data-testid={testId}
      className="animate-fade-slide-in fixed z-50 max-w-sm rounded-lg border border-brown-medium/50 bg-brown-dark px-4 py-3 text-sm text-cream shadow-xl sm:max-w-md"
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
          <div key={i} className="h-2 w-1.5 rounded-sm bg-brown-medium/50" />
        ))}
      </div>
      <p className="max-h-[calc(60vh-2rem)] overflow-y-auto leading-relaxed">{content}</p>
    </div>,
    document.body
  )
}

export default function HoverTooltip({
  content,
  children,
  className = "",
  testId,
  onOpen,
}: HoverTooltipProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const triggerRef = useRef<HTMLSpanElement>(null)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasCalledOnOpen = useRef(false)

  const handleMouseEnter = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
    setShowTooltip(true)
    // Only call onOpen once per tooltip session
    if (!hasCalledOnOpen.current && onOpen) {
      hasCalledOnOpen.current = true
      onOpen()
    }
  }

  const handleMouseLeave = () => {
    // Small delay before hiding to allow mouse to move to tooltip
    hideTimeoutRef.current = setTimeout(() => {
      setShowTooltip(false)
      hasCalledOnOpen.current = false
    }, 100)
  }

  // Toggle on click/tap for mobile support
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const wasHidden = !showTooltip
    setShowTooltip((prev) => !prev)
    // Only call onOpen once per tooltip session (on open, not close)
    if (wasHidden && !hasCalledOnOpen.current && onOpen) {
      hasCalledOnOpen.current = true
      onOpen()
    }
    if (!wasHidden) {
      hasCalledOnOpen.current = false
    }
  }

  // Close tooltip when clicking outside
  useEffect(() => {
    if (!showTooltip) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      const isInsideTrigger = triggerRef.current?.contains(target)
      const isInsideTooltip = document
        .querySelector(`[data-testid="${testId || "hover-tooltip"}"]`)
        ?.contains(target)

      if (!isInsideTrigger && !isInsideTooltip) {
        setShowTooltip(false)
      }
    }

    // Delay adding listener to prevent immediate close from the opening click
    const timeoutId = setTimeout(() => {
      document.addEventListener("click", handleClickOutside)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener("click", handleClickOutside)
    }
  }, [showTooltip, testId])

  // Toggle on keyboard for accessibility
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      const wasHidden = !showTooltip
      setShowTooltip((prev) => !prev)
      // Only call onOpen once per tooltip session (on open, not close)
      if (wasHidden && !hasCalledOnOpen.current && onOpen) {
        hasCalledOnOpen.current = true
        onOpen()
      }
      if (!wasHidden) {
        hasCalledOnOpen.current = false
      }
    } else if (e.key === "Escape" && showTooltip) {
      setShowTooltip(false)
      hasCalledOnOpen.current = false
    }
  }

  return (
    <span
      ref={triggerRef}
      role="button"
      tabIndex={0}
      className={`cursor-help ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {children}
      <TooltipContent
        content={content}
        triggerRef={triggerRef}
        isVisible={showTooltip}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        testId={testId}
      />
    </span>
  )
}
