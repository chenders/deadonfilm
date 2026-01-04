import { useEffect } from "react"
import { useLocation } from "react-router-dom"
import { isNewRelicInitialized, trackPageView } from "../lib/newrelic-browser"

// Re-export tracking functions for use in components
export { trackPageAction, trackError } from "../lib/newrelic-browser"

/**
 * Hook to track page views in New Relic Browser.
 * New Relic is initialized in lib/newrelic-browser.ts which is imported
 * at the top of main.tsx before React loads.
 */
export function useNewRelicBrowser(): void {
  const location = useLocation()

  // Track route changes
  useEffect(() => {
    if (!isNewRelicInitialized()) return
    trackPageView(location.pathname + location.search)
  }, [location.pathname, location.search])
}
