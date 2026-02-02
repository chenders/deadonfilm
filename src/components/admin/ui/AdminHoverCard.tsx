/**
 * Admin-themed hover card component.
 * - Desktop: Shows content on hover with 300ms delay
 * - Mobile: Tap to toggle content
 * - Portal-rendered for proper z-index
 * - Smart positioning to stay within viewport
 */

import { useState, useRef, useEffect, useCallback, ReactNode } from "react"
import { createPortal } from "react-dom"

interface AdminHoverCardProps {
  /** The trigger element */
  children: ReactNode
  /** Content to show in the hover card */
  content: ReactNode
  /** Callback when hover card opens (for lazy loading) */
  onOpen?: () => void
  /** Delay in ms before showing on hover (default: 300) */
  hoverDelay?: number
  /** Whether the card is disabled */
  disabled?: boolean
}

export default function AdminHoverCard({
  children,
  content,
  onOpen,
  hoverDelay = 300,
  disabled = false,
}: AdminHoverCardProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom")
  const triggerRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current) return

    const triggerRect = triggerRef.current.getBoundingClientRect()
    const cardHeight = 300 // Estimated max height
    const cardWidth = 320
    const padding = 8

    // Check if card would overflow bottom
    const spaceBelow = window.innerHeight - triggerRect.bottom
    const spaceAbove = triggerRect.top
    const shouldFlip = spaceBelow < cardHeight + padding && spaceAbove > spaceBelow

    // Calculate horizontal position (centered on trigger, but clamped to viewport)
    let left = triggerRect.left + triggerRect.width / 2 - cardWidth / 2
    left = Math.max(padding, Math.min(left, window.innerWidth - cardWidth - padding))

    // Calculate vertical position
    let top: number
    if (shouldFlip) {
      top = triggerRect.top - padding
      setPlacement("top")
    } else {
      top = triggerRect.bottom + padding
      setPlacement("bottom")
    }

    setPosition({ top, left })
  }, [])

  const openCard = useCallback(() => {
    if (disabled) return
    setIsOpen(true)
    onOpen?.()
    // Calculate position after state update
    requestAnimationFrame(calculatePosition)
  }, [disabled, onOpen, calculatePosition])

  const closeCard = useCallback(() => {
    setIsOpen(false)
  }, [])

  // Handle hover events (desktop)
  const handleMouseEnter = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
    hoverTimeoutRef.current = setTimeout(openCard, hoverDelay)
  }, [hoverDelay, openCard])

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    // Small delay before closing to allow moving to card
    closeTimeoutRef.current = setTimeout(closeCard, 100)
  }, [closeCard])

  // Handle card mouse events
  const handleCardMouseEnter = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
  }, [])

  const handleCardMouseLeave = useCallback(() => {
    closeTimeoutRef.current = setTimeout(closeCard, 100)
  }, [closeCard])

  // Handle touch events (mobile)
  // Note: We avoid preventDefault() here as it can block native scrolling
  // when a user starts a scroll gesture on the trigger
  const handleTouchStart = useCallback(
    (_e: React.TouchEvent) => {
      if (disabled) return
      if (isOpen) {
        closeCard()
      } else {
        openCard()
      }
    },
    [disabled, isOpen, openCard, closeCard]
  )

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        cardRef.current &&
        !cardRef.current.contains(e.target as Node)
      ) {
        closeCard()
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen, closeCard])

  // Close on escape key
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeCard()
      }
    }

    document.addEventListener("keydown", handleEscape)
    return () => document.removeEventListener("keydown", handleEscape)
  }, [isOpen, closeCard])

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current)
    }
  }, [])

  // Recalculate position on scroll/resize
  useEffect(() => {
    if (!isOpen) return

    const handleReposition = () => calculatePosition()
    window.addEventListener("scroll", handleReposition, true)
    window.addEventListener("resize", handleReposition)

    return () => {
      window.removeEventListener("scroll", handleReposition, true)
      window.removeEventListener("resize", handleReposition)
    }
  }, [isOpen, calculatePosition])

  const card = isOpen
    ? createPortal(
        <div
          ref={cardRef}
          className={`fixed z-50 w-80 rounded-lg border border-admin-border bg-admin-surface-elevated shadow-lg ${
            placement === "top" ? "-translate-y-full" : ""
          }`}
          style={{ top: position.top, left: position.left }}
          onMouseEnter={handleCardMouseEnter}
          onMouseLeave={handleCardMouseLeave}
          role="tooltip"
        >
          {content}
        </div>,
        document.body
      )
    : null

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        className="inline-block"
      >
        {children}
      </div>
      {card}
    </>
  )
}
