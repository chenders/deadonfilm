import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { HelmetProvider } from "react-helmet-async"
import { SEO } from "./SEO"

// Helper to render with HelmetProvider
function renderSEO(props: Parameters<typeof SEO>[0]) {
  const helmetContext = {}
  render(
    <HelmetProvider context={helmetContext}>
      <SEO {...props} />
    </HelmetProvider>
  )
  return helmetContext
}

describe("SEO", () => {
  describe("title rendering", () => {
    it("renders custom title with suffix", () => {
      renderSEO({ title: "Test Page" })

      const titleElement = document.querySelector("title")
      expect(titleElement?.textContent).toBe("Test Page - Dead on Film")
    })

    it("renders default title when no custom title provided", () => {
      renderSEO({})

      const titleElement = document.querySelector("title")
      expect(titleElement?.textContent).toBe("Dead on Film - Movie Cast Mortality Database")
    })
  })

  describe("description meta tag", () => {
    it("renders description meta tag when provided", () => {
      renderSEO({ description: "Test description for SEO" })

      const metaDescription = document.querySelector('meta[name="description"]')
      expect(metaDescription?.getAttribute("content")).toBe("Test description for SEO")
    })

    it("does not render description meta tag when omitted", () => {
      renderSEO({ title: "Test Page" })

      const metaDescription = document.querySelector('meta[name="description"]')
      expect(metaDescription).toBeNull()
    })
  })

  describe("canonical link", () => {
    it("renders canonical link when provided", () => {
      renderSEO({ canonical: "https://deadonfilm.com/test-page" })

      const canonicalLink = document.querySelector('link[rel="canonical"]')
      expect(canonicalLink?.getAttribute("href")).toBe("https://deadonfilm.com/test-page")
    })

    it("does not render canonical link when omitted", () => {
      renderSEO({ title: "Test Page" })

      const canonicalLink = document.querySelector('link[rel="canonical"]')
      expect(canonicalLink).toBeNull()
    })
  })

  describe("noindex meta tag", () => {
    it("renders noindex meta tag when true", () => {
      renderSEO({ noindex: true })

      const robotsMeta = document.querySelector('meta[name="robots"]')
      expect(robotsMeta?.getAttribute("content")).toBe("noindex, follow")
    })

    it("does not render noindex meta tag when false", () => {
      renderSEO({ noindex: false })

      const robotsMeta = document.querySelector('meta[name="robots"]')
      expect(robotsMeta).toBeNull()
    })

    it("does not render noindex meta tag when omitted", () => {
      renderSEO({ title: "Test Page" })

      const robotsMeta = document.querySelector('meta[name="robots"]')
      expect(robotsMeta).toBeNull()
    })
  })

  describe("combined props", () => {
    it("renders all props together correctly", () => {
      renderSEO({
        title: "Combined Test",
        description: "Combined description",
        canonical: "https://deadonfilm.com/combined",
        noindex: true,
      })

      const titleElement = document.querySelector("title")
      const metaDescription = document.querySelector('meta[name="description"]')
      const canonicalLink = document.querySelector('link[rel="canonical"]')
      const robotsMeta = document.querySelector('meta[name="robots"]')

      expect(titleElement?.textContent).toBe("Combined Test - Dead on Film")
      expect(metaDescription?.getAttribute("content")).toBe("Combined description")
      expect(canonicalLink?.getAttribute("href")).toBe("https://deadonfilm.com/combined")
      expect(robotsMeta?.getAttribute("content")).toBe("noindex, follow")
    })
  })
})
