/**
 * Shared expandable section with header toggle and gradient truncation.
 *
 * Collapsed: shows content clipped to collapsedMaxHeight with a gradient fade.
 * Expanded: shows full content with no gradient.
 * Header row: chevron (rotates on expand), title, and +/- indicator.
 * Expand/collapse animates max-height via ref measurement.
 */

import { useRef, useState, useEffect, useCallback } from "react"

interface ExpandableSectionProps {
  title: string
  isExpanded: boolean
  onToggle: () => void
  /** CSS max-height value when collapsed (default "13rem") */
  collapsedMaxHeight?: string
  children: React.ReactNode
  className?: string
}

export default function ExpandableSection({
  title,
  isExpanded,
  onToggle,
  collapsedMaxHeight = "13rem",
  children,
  className = "",
}: ExpandableSectionProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [maxHeight, setMaxHeight] = useState<string | undefined>(
    isExpanded ? undefined : collapsedMaxHeight
  )
  const isFirstRender = useRef(true)

  useEffect(() => {
    // Skip animation on first render
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    const el = contentRef.current
    if (!el) return

    if (isExpanded) {
      // Expanding: animate from collapsedMaxHeight → scrollHeight, then remove
      setMaxHeight(`${el.scrollHeight}px`)
      const timer = setTimeout(() => setMaxHeight(undefined), 300)
      return () => clearTimeout(timer)
    } else {
      // Collapsing: set scrollHeight first, then animate to collapsedMaxHeight
      setMaxHeight(`${el.scrollHeight}px`)
      // Double rAF forces browser to apply the scrollHeight before transitioning
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setMaxHeight(collapsedMaxHeight)
        })
      })
    }
  }, [isExpanded, collapsedMaxHeight])

  // Re-measure when children change while expanded (e.g. lazy-loaded content)
  const handleTransitionEnd = useCallback(() => {
    if (isExpanded) {
      setMaxHeight(undefined)
    }
  }, [isExpanded])

  return (
    <div
      className={`rounded-lg bg-surface-elevated p-4 sm:p-6 ${className}`}
      data-testid="expandable-section"
    >
      {/* Header toggle */}
      <h2 className="font-display text-lg text-brown-dark">
        <button
          onClick={onToggle}
          aria-expanded={isExpanded}
          className="flex w-full items-center gap-2 text-left transition-colors hover:text-brown-medium"
          data-testid="expandable-section-toggle"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            aria-hidden="true"
            focusable="false"
            className={`flex-shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
          >
            <path
              d="M4 2l4 4-4 4"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="flex-1">{title}</span>
          <span className="text-xl leading-none text-brown-medium" aria-hidden="true">
            {isExpanded ? "\u2212" : "+"}
          </span>
        </button>
      </h2>

      {/* Content area with animated max-height — clickable when collapsed */}
      <div
        ref={contentRef}
        className={`relative mt-3 overflow-hidden transition-[max-height] duration-300 ease-in-out ${
          !isExpanded ? "cursor-pointer" : ""
        }`}
        style={maxHeight !== undefined ? { maxHeight } : undefined}
        onClick={
          !isExpanded
            ? (e: React.MouseEvent) => {
                // Don't trigger expand when clicking interactive children (links, buttons)
                const target = e.target as HTMLElement
                if (target.closest("a, button, input, select, textarea, [role='button']")) return
                onToggle()
              }
            : undefined
        }
        onTransitionEnd={handleTransitionEnd}
        data-testid="expandable-section-content"
      >
        {children}

        {/* Gradient overlay — fades with opacity for smooth transition; clickable to expand */}
        <div
          className={`absolute bottom-0 left-0 right-0 h-24 transition-opacity duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown-medium ${
            isExpanded ? "pointer-events-none opacity-0" : "cursor-pointer opacity-100"
          }`}
          style={{
            background: "linear-gradient(to bottom, transparent, var(--surface-elevated))",
          }}
          onClick={
            isExpanded
              ? undefined
              : (e) => {
                  e.stopPropagation()
                  onToggle()
                }
          }
          onKeyDown={
            isExpanded
              ? undefined
              : (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    onToggle()
                  }
                }
          }
          role={isExpanded ? undefined : "button"}
          tabIndex={isExpanded ? undefined : 0}
          aria-label={isExpanded ? undefined : `Expand ${title} section`}
          data-testid="expandable-section-gradient"
        />
      </div>
    </div>
  )
}
