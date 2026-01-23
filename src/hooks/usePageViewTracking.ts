/**
 * Hook for tracking page views.
 *
 * Sends page view data to the backend for analytics tracking.
 * Silently fails to avoid interrupting user experience.
 */

import { useEffect, useRef } from "react"

interface TrackPageViewOptions {
  pageType: "movie" | "show" | "episode" | "actor_death"
  entityId: number
  path: string
}

/**
 * Track a page view in the backend analytics system.
 */
async function trackPageView(options: TrackPageViewOptions): Promise<void> {
  try {
    await fetch("/api/page-views/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(options),
    })
    // Intentionally ignore response - tracking should be fire-and-forget
  } catch (error) {
    // Silently fail - don't interrupt user experience with tracking errors
    console.debug("Page view tracking failed:", error)
  }
}

/**
 * Hook to automatically track page views when component mounts.
 *
 * @param pageType Type of page being viewed
 * @param entityId Database ID of the entity
 * @param path Current URL path
 */
export function usePageViewTracking(
  pageType: "movie" | "show" | "episode" | "actor_death" | null,
  entityId: number | null,
  path: string
): void {
  const tracked = useRef(false)

  useEffect(() => {
    // Only track once per mount and when we have all required data
    if (tracked.current || !pageType || !entityId) {
      return
    }

    // Mark as tracked immediately to prevent double-tracking
    tracked.current = true

    // Track after a short delay to ensure page has loaded
    const timeoutId = setTimeout(() => {
      trackPageView({ pageType, entityId, path })
    }, 500)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [pageType, entityId, path])
}
