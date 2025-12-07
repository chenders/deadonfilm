import { useEffect } from "react"
import { useLocation } from "react-router-dom"
import { BrowserAgent } from "@newrelic/browser-agent/loaders/browser-agent"

const BROWSER_LICENSE_KEY = import.meta.env.VITE_NEW_RELIC_BROWSER_LICENSE_KEY as string | undefined
const BROWSER_APP_ID = import.meta.env.VITE_NEW_RELIC_BROWSER_APP_ID as string | undefined
const BROWSER_ACCOUNT_ID = import.meta.env.VITE_NEW_RELIC_BROWSER_ACCOUNT_ID as string | undefined

let browserAgent: BrowserAgent | null = null
let isInitialized = false

function initializeNewRelicBrowser(): void {
  if (isInitialized) return
  if (!BROWSER_LICENSE_KEY || !BROWSER_APP_ID || !BROWSER_ACCOUNT_ID) return

  try {
    browserAgent = new BrowserAgent({
      init: {
        distributed_tracing: { enabled: true },
        privacy: { cookies_enabled: true },
        ajax: { deny_list: [] },
      },
      info: {
        beacon: "bam.nr-data.net",
        errorBeacon: "bam.nr-data.net",
        licenseKey: BROWSER_LICENSE_KEY,
        applicationID: BROWSER_APP_ID,
        sa: 1,
      },
      loader_config: {
        accountID: BROWSER_ACCOUNT_ID,
        trustKey: BROWSER_ACCOUNT_ID,
        agentID: BROWSER_APP_ID,
        licenseKey: BROWSER_LICENSE_KEY,
        applicationID: BROWSER_APP_ID,
      },
    })

    isInitialized = true
  } catch (error) {
    console.error("Failed to initialize New Relic Browser:", error)
  }
}

function trackPageView(path: string): void {
  if (!isInitialized || !browserAgent) return

  // Set custom attribute for the current page path
  browserAgent.setCustomAttribute("pagePath", path)
}

/**
 * Track a custom page action in New Relic.
 */
export function trackPageAction(name: string, attributes?: Record<string, unknown>): void {
  if (!isInitialized || !browserAgent) return
  browserAgent.addPageAction(name, attributes)
}

/**
 * Track an error in New Relic.
 */
export function trackError(error: Error, customAttributes?: Record<string, unknown>): void {
  if (!isInitialized || !browserAgent) return
  browserAgent.noticeError(error, customAttributes)
}

export function useNewRelicBrowser(): void {
  const location = useLocation()

  // Initialize on first render
  useEffect(() => {
    initializeNewRelicBrowser()
  }, [])

  // Track route changes
  useEffect(() => {
    if (!isInitialized) return
    trackPageView(location.pathname + location.search)
  }, [location.pathname, location.search])
}
