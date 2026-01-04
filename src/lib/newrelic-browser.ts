/**
 * New Relic Browser Agent initialization.
 * This file must be imported at the very top of main.tsx, BEFORE any React code.
 * This ensures the agent can instrument browser APIs before they're used.
 */
import { BrowserAgent } from "@newrelic/browser-agent/loaders/browser-agent"

const BROWSER_LICENSE_KEY = import.meta.env.VITE_NEW_RELIC_BROWSER_LICENSE_KEY as string | undefined
const BROWSER_APP_ID = import.meta.env.VITE_NEW_RELIC_BROWSER_APP_ID as string | undefined
const BROWSER_ACCOUNT_ID = import.meta.env.VITE_NEW_RELIC_BROWSER_ACCOUNT_ID as string | undefined

let browserAgent: BrowserAgent | null = null

// Initialize immediately when this module is imported
if (BROWSER_LICENSE_KEY && BROWSER_APP_ID && BROWSER_ACCOUNT_ID) {
  try {
    browserAgent = new BrowserAgent({
      init: {
        distributed_tracing: { enabled: true },
        privacy: { cookies_enabled: true },
        ajax: { deny_list: [] },
        feature_flags: ["soft_nav"],
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
  } catch (error) {
    console.error("Failed to initialize New Relic Browser:", error)
  }
}

export function isNewRelicInitialized(): boolean {
  return browserAgent !== null
}

export function trackPageView(path: string): void {
  if (!browserAgent) return
  browserAgent.setCustomAttribute("pagePath", path)
}

export function trackPageAction(name: string, attributes?: Record<string, unknown>): void {
  if (!browserAgent) return
  browserAgent.addPageAction(name, attributes)
}

export function trackError(error: Error, customAttributes?: Record<string, unknown>): void {
  if (!browserAgent) return
  browserAgent.noticeError(error, customAttributes)
}
