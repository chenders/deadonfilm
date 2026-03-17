import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { HelmetProvider } from "react-helmet-async"
import DataSourcesPage from "./DataSourcesPage"

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter
        initialEntries={["/data-sources"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <DataSourcesPage />
      </MemoryRouter>
    </HelmetProvider>
  )
}

describe("DataSourcesPage", () => {
  it("renders with correct data-testid", () => {
    renderPage()
    expect(screen.getByTestId("data-sources-page")).toBeInTheDocument()
  })

  it("renders h1 heading", () => {
    renderPage()
    expect(screen.getByRole("heading", { level: 1, name: /data sources/i })).toBeInTheDocument()
  })

  it("renders key section headings", () => {
    renderPage()
    expect(screen.getByRole("heading", { name: /the movie database/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /research engine/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /death information/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /biography information/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /actuarial data/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /data freshness/i })).toBeInTheDocument()
  })

  it("renders enrichment pipeline phases", () => {
    renderPage()
    expect(screen.getByText(/phase 1: structured data/i)).toBeInTheDocument()
    expect(screen.getByText(/phases 2[-–]4: web search, news & obituaries/i)).toBeInTheDocument()
    expect(screen.getByText(/phases 5[-–]7: books, archives & genealogy/i)).toBeInTheDocument()
    expect(screen.getByText(/synthesis/i)).toBeInTheDocument()
  })

  it("renders external links to TMDB and SSA", () => {
    renderPage()
    const tmdbLink = screen.getByRole("link", { name: /the movie database \(tmdb\)/i })
    expect(tmdbLink).toHaveAttribute("href", "https://www.themoviedb.org/")

    const ssaLink = screen.getByRole("link", { name: /u\.s\. social security administration/i })
    expect(ssaLink).toHaveAttribute("href", "https://www.ssa.gov/oact/STATS/table4c6.html")
  })

  it("renders cross-links to other authority pages", () => {
    renderPage()
    expect(screen.getByRole("link", { name: /about dead on film/i })).toHaveAttribute(
      "href",
      "/about"
    )
    expect(screen.getByRole("link", { name: /frequently asked questions/i })).toHaveAttribute(
      "href",
      "/faq"
    )
    const methodologyLinks = screen.getAllByRole("link", { name: /^methodology$/i })
    expect(methodologyLinks.length).toBeGreaterThanOrEqual(1)
    expect(methodologyLinks[0]).toHaveAttribute("href", "/methodology")
  })
})
