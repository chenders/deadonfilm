import { describe, it, expect, afterEach } from "vitest"
import { render, cleanup } from "@testing-library/react"
import { HelmetProvider } from "react-helmet-async"
import PaginationHead from "./PaginationHead"

function renderPaginationHead(props: {
  currentPage: number
  totalPages: number
  basePath: string
  includeLinks?: boolean
}) {
  render(
    <HelmetProvider>
      <PaginationHead {...props} />
    </HelmetProvider>
  )
}

afterEach(cleanup)

describe("PaginationHead", () => {
  it("renders canonical for page 1 without ?page param", () => {
    renderPaginationHead({ currentPage: 1, totalPages: 5, basePath: "/deaths/all" })

    const canonical = document.querySelector('link[rel="canonical"]')
    expect(canonical?.getAttribute("href")).toBe("https://deadonfilm.com/deaths/all")
  })

  it("renders canonical with ?page=N for page 2+", () => {
    renderPaginationHead({ currentPage: 3, totalPages: 5, basePath: "/deaths/all" })

    const canonical = document.querySelector('link[rel="canonical"]')
    expect(canonical?.getAttribute("href")).toBe("https://deadonfilm.com/deaths/all?page=3")
  })

  it("does not render prev link on page 1", () => {
    renderPaginationHead({ currentPage: 1, totalPages: 5, basePath: "/deaths/all" })

    const prev = document.querySelector('link[rel="prev"]')
    expect(prev).toBeNull()
  })

  it("renders next link on page 1", () => {
    renderPaginationHead({ currentPage: 1, totalPages: 5, basePath: "/deaths/all" })

    const next = document.querySelector('link[rel="next"]')
    expect(next?.getAttribute("href")).toBe("https://deadonfilm.com/deaths/all?page=2")
  })

  it("renders both prev and next on middle pages", () => {
    renderPaginationHead({ currentPage: 3, totalPages: 5, basePath: "/deaths/all" })

    const prev = document.querySelector('link[rel="prev"]')
    const next = document.querySelector('link[rel="next"]')
    expect(prev?.getAttribute("href")).toBe("https://deadonfilm.com/deaths/all?page=2")
    expect(next?.getAttribute("href")).toBe("https://deadonfilm.com/deaths/all?page=4")
  })

  it("does not render next link on last page", () => {
    renderPaginationHead({ currentPage: 5, totalPages: 5, basePath: "/deaths/all" })

    const next = document.querySelector('link[rel="next"]')
    expect(next).toBeNull()
  })

  it("renders prev link on last page", () => {
    renderPaginationHead({ currentPage: 5, totalPages: 5, basePath: "/deaths/all" })

    const prev = document.querySelector('link[rel="prev"]')
    expect(prev?.getAttribute("href")).toBe("https://deadonfilm.com/deaths/all?page=4")
  })

  it("does not render noindex for pages <= 20", () => {
    renderPaginationHead({ currentPage: 20, totalPages: 50, basePath: "/deaths/all" })

    const robots = document.querySelector('meta[name="robots"]')
    expect(robots).toBeNull()
  })

  it("renders noindex for pages > 20", () => {
    renderPaginationHead({ currentPage: 21, totalPages: 50, basePath: "/deaths/all" })

    const robots = document.querySelector('meta[name="robots"]')
    expect(robots?.getAttribute("content")).toBe("noindex, follow")
  })

  it("renders no prev/next for single-page result", () => {
    renderPaginationHead({ currentPage: 1, totalPages: 1, basePath: "/deaths/all" })

    const prev = document.querySelector('link[rel="prev"]')
    const next = document.querySelector('link[rel="next"]')
    expect(prev).toBeNull()
    expect(next).toBeNull()
  })

  describe("includeLinks=false", () => {
    it("omits canonical, prev, and next links", () => {
      renderPaginationHead({
        currentPage: 3,
        totalPages: 5,
        basePath: "/deaths/all",
        includeLinks: false,
      })

      expect(document.querySelector('link[rel="canonical"]')).toBeNull()
      expect(document.querySelector('link[rel="prev"]')).toBeNull()
      expect(document.querySelector('link[rel="next"]')).toBeNull()
    })

    it("still renders noindex for deep pages", () => {
      renderPaginationHead({
        currentPage: 25,
        totalPages: 50,
        basePath: "/deaths/all",
        includeLinks: false,
      })

      const robots = document.querySelector('meta[name="robots"]')
      expect(robots?.getAttribute("content")).toBe("noindex, follow")
    })

    it("does not render noindex for shallow pages", () => {
      renderPaginationHead({
        currentPage: 3,
        totalPages: 50,
        basePath: "/deaths/all",
        includeLinks: false,
      })

      const robots = document.querySelector('meta[name="robots"]')
      expect(robots).toBeNull()
    })
  })
})
