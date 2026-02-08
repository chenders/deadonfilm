import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { HelmetProvider } from "react-helmet-async"
import FAQPage from "./FAQPage"

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter
        initialEntries={["/faq"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <FAQPage />
      </MemoryRouter>
    </HelmetProvider>
  )
}

describe("FAQPage", () => {
  it("renders with correct data-testid", () => {
    renderPage()
    expect(screen.getByTestId("faq-page")).toBeInTheDocument()
  })

  it("renders h1 heading", () => {
    renderPage()
    expect(
      screen.getByRole("heading", { level: 1, name: /frequently asked questions/i })
    ).toBeInTheDocument()
  })

  it("renders FAQ items as h2 headings", () => {
    renderPage()
    expect(screen.getByRole("heading", { name: /what is dead on film\?/i })).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: /how is 'years lost' calculated\?/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: /what is the archived footage rule\?/i })
    ).toBeInTheDocument()
  })

  it("renders FAQ answers", () => {
    renderPage()
    expect(screen.getByText(/movie and tv cast mortality database/i)).toBeInTheDocument()
    expect(screen.getByText(/cohort life expectancy tables/i)).toBeInTheDocument()
  })

  it("renders JSON-LD for FAQPage schema", () => {
    const { container } = renderPage()
    const scripts = container.querySelectorAll('script[type="application/ld+json"]')
    const jsonLdContents = Array.from(scripts).map((s) => s.textContent)
    const hasFAQSchema = jsonLdContents.some((content) => content && content.includes('"FAQPage"'))
    expect(hasFAQSchema).toBe(true)
  })

  it("renders cross-links to other authority pages", () => {
    renderPage()
    expect(screen.getByRole("link", { name: /about dead on film/i })).toHaveAttribute(
      "href",
      "/about"
    )
    expect(screen.getByRole("link", { name: /methodology/i })).toHaveAttribute(
      "href",
      "/methodology"
    )
    expect(screen.getByRole("link", { name: /data sources/i })).toHaveAttribute(
      "href",
      "/data-sources"
    )
  })
})
