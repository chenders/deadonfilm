import { useEffect } from "react"
import { useLocation } from "react-router-dom"

declare global {
  interface Window {
    dataLayer: unknown[]
    gtag: (...args: unknown[]) => void
  }
}

const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined

let isInitialized = false
let isDelegationSetup = false

function initializeGA() {
  if (isInitialized || !GA_MEASUREMENT_ID || typeof window === "undefined") return

  // Initialize dataLayer - must use 'arguments' not rest params for GA compatibility
  window.dataLayer = window.dataLayer || []
  window.gtag = function () {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments)
  }
  window.gtag("js", new Date())
  window.gtag("config", GA_MEASUREMENT_ID, {
    send_page_view: false, // We'll send page views manually on route changes
  })

  // Load gtag.js script
  const script = document.createElement("script")
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`
  document.head.appendChild(script)

  isInitialized = true
}

function trackEvent(eventName: string, params?: Record<string, string | number | boolean>) {
  if (!GA_MEASUREMENT_ID || !isInitialized) return
  window.gtag("event", eventName, params)
}

function handleTrackableEvent(e: Event, eventType: "click" | "hover") {
  const target = e.target as HTMLElement | null
  if (!target || typeof target.closest !== "function") return

  const trackable = target.closest("[data-track-event]") as HTMLElement | null
  if (!trackable) return

  // For hover events, only track elements with data-track-hover="true"
  if (eventType === "hover" && trackable.dataset.trackHover !== "true") return

  const eventName = trackable.dataset.trackEvent
  if (!eventName) return

  const params = trackable.dataset.trackParams
  let parsedParams: Record<string, string | number | boolean> | undefined
  if (params) {
    try {
      parsedParams = JSON.parse(params)
    } catch {
      // Invalid JSON in tracking params - skip this event
      return
    }
  }

  trackEvent(eventName, parsedParams)
}

function setupEventDelegation() {
  if (isDelegationSetup || typeof document === "undefined") return
  document.addEventListener("click", (e) => handleTrackableEvent(e, "click"))
  document.addEventListener("mouseenter", (e) => handleTrackableEvent(e, "hover"), true)
  isDelegationSetup = true
}

export function useGoogleAnalytics() {
  const location = useLocation()

  // Initialize GA and event delegation on first render
  useEffect(() => {
    initializeGA()
    if (GA_MEASUREMENT_ID) {
      setupEventDelegation()
    }
  }, [])

  // Track page views on route changes
  useEffect(() => {
    if (!GA_MEASUREMENT_ID || !isInitialized) return

    window.gtag("event", "page_view", {
      page_path: location.pathname + location.search,
      page_title: document.title,
    })
  }, [location.pathname, location.search])
}
