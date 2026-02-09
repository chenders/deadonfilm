import { useEffect, useRef } from "react"
import { useLocation } from "react-router-dom"
import { onCLS, onINP, onLCP, onTTFB } from "web-vitals"
import type { Metric } from "web-vitals"
import { trackPageAction } from "../lib/newrelic-browser"

export function getPageType(pathname: string): string {
  if (pathname === "/") return "home"
  if (pathname.startsWith("/actor/")) return "actor"
  if (pathname.startsWith("/movie/")) return "movie"
  if (pathname.startsWith("/show/")) return "show"
  if (pathname.startsWith("/episode/")) return "episode"
  if (pathname.startsWith("/articles")) return "article"
  if (pathname.startsWith("/admin")) return "admin"
  return "other"
}

/**
 * Hook to report Core Web Vitals (LCP, CLS, INP, TTFB) to GA4 and New Relic.
 * Initializes once on mount for the current page load; metrics are not
 * automatically reset on client-side route changes in an SPA.
 */
export function useWebVitals(): void {
  const location = useLocation()
  const locationRef = useRef(location)
  locationRef.current = location

  useEffect(() => {
    function reportMetric(metric: Metric) {
      const pageType = getPageType(locationRef.current.pathname)

      // GA4 — uses the format needed for CrUX integration
      if (typeof window.gtag === "function") {
        window.gtag("event", "web_vitals", {
          metric_name: metric.name,
          metric_value: Math.round(metric.name === "CLS" ? metric.value * 1000 : metric.value),
          metric_id: metric.id,
          metric_rating: metric.rating,
          page_type: pageType,
        })
      }

      // New Relic — enables NRQL dashboards
      trackPageAction("WebVital", {
        metricName: metric.name,
        metricValue: metric.value,
        metricId: metric.id,
        metricRating: metric.rating,
        pageType,
      })
    }

    onCLS(reportMetric)
    onINP(reportMetric)
    onLCP(reportMetric)
    onTTFB(reportMetric)
  }, [])
}
