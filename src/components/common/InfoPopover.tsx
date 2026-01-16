import { useState, useEffect, useCallback, useRef, useId } from "react"

interface InfoPopoverProps {
  children: React.ReactNode
  triggerLabel?: string
  className?: string
}

export default function InfoPopover({
  children,
  triggerLabel = "About this site",
  className = "",
}: InfoPopoverProps) {
  const [isOpen, setIsOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogId = useId()

  const closePopover = useCallback(() => {
    setIsOpen(false)
    triggerRef.current?.focus()
  }, [])

  // Focus management - move focus to dismiss button when popover opens
  useEffect(() => {
    if (isOpen) {
      // Find the dismiss button and focus it
      const dismissButton = popoverRef.current?.querySelector("button")
      if (dismissButton) {
        dismissButton.focus()
      }
    }
  }, [isOpen])

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePopover()
    }

    document.addEventListener("keydown", handleEscape)
    return () => document.removeEventListener("keydown", handleEscape)
  }, [isOpen, closePopover])

  // Handle click outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        closePopover()
      }
    }

    // Delay to prevent immediate close on the click that opens
    const timeoutId = setTimeout(() => {
      document.addEventListener("click", handleClickOutside)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener("click", handleClickOutside)
    }
  }, [isOpen, closePopover])

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={triggerLabel}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={dialogId}
        className="flex h-5 w-5 items-center justify-center rounded-full border border-foreground-muted/50 text-xs text-foreground-muted transition-colors hover:border-foreground hover:text-foreground"
      >
        ?
      </button>

      {/* Always render for SEO, use sr-only when closed */}
      <div
        ref={popoverRef}
        id={dialogId}
        role="dialog"
        aria-modal={isOpen ? "true" : undefined}
        aria-labelledby={`${dialogId}-title`}
        className={
          isOpen
            ? "absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-border-theme/30 bg-surface p-4 shadow-xl sm:w-80"
            : "sr-only"
        }
      >
        {/* Arrow */}
        {isOpen && (
          <div className="absolute -top-2 right-2 h-0 w-0 border-x-8 border-b-8 border-x-transparent border-b-surface" />
        )}

        {/* Content */}
        <div id={`${dialogId}-title`}>{children}</div>

        {/* Dismiss button - only show when open */}
        {isOpen && (
          <button
            onClick={closePopover}
            className="mt-4 w-full rounded bg-foreground px-4 py-2 text-sm text-surface transition-colors hover:bg-foreground/80"
          >
            Got it
          </button>
        )}
      </div>
    </div>
  )
}
