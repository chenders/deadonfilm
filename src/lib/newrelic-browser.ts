/**
 * New Relic Browser Agent utilities.
 * The agent is loaded via server-injected script in index.html.
 * This module provides typed wrappers for the global newrelic object.
 */

// Declare the global newrelic object that's set by the injected script
declare global {
  interface Window {
    newrelic?: {
      setCustomAttribute: (name: string, value: string | number | boolean) => void
      addPageAction: (name: string, attributes?: Record<string, unknown>) => void
      noticeError: (error: Error, customAttributes?: Record<string, unknown>) => void
      setPageViewName: (name: string, host?: string) => void
    }
  }
}

export function isNewRelicInitialized(): boolean {
  return typeof window !== "undefined" && !!window.newrelic
}

export function trackPageView(path: string): void {
  if (!window.newrelic) return
  window.newrelic.setCustomAttribute("pagePath", path)
}

export function trackPageAction(name: string, attributes?: Record<string, unknown>): void {
  if (!window.newrelic) return
  window.newrelic.addPageAction(name, attributes)
}

export function trackError(error: Error, customAttributes?: Record<string, unknown>): void {
  if (!window.newrelic) return
  window.newrelic.noticeError(error, customAttributes)
}
