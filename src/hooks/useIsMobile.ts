import { useState, useEffect } from "react"

/**
 * Hook to detect if the viewport is at or below a mobile breakpoint.
 *
 * @param breakpoint - The max width in pixels to consider as mobile (default: 640, Tailwind's sm breakpoint)
 * @returns true if viewport width is less than the breakpoint
 */
export function useIsMobile(breakpoint = 640): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    // Default to false during SSR, will update on mount
    if (typeof window === "undefined") return false
    return window.innerWidth < breakpoint
  })

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < breakpoint)

    // Throttle resize handling to animation frames to avoid excessive re-renders
    let frameId: number | null = null
    const handleResize = () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
      frameId = requestAnimationFrame(() => {
        checkMobile()
        frameId = null
      })
    }

    // Check immediately on mount
    checkMobile()

    window.addEventListener("resize", handleResize)
    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
      window.removeEventListener("resize", handleResize)
    }
  }, [breakpoint])

  return isMobile
}
