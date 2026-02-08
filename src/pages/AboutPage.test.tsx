import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { HelmetProvider } from "react-helmet-async"
import AboutPage from "./AboutPage"

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter
        initialEntries={["/about"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <AboutPage />
      </MemoryRouter>
    </HelmetProvider>
  )
}

describe("AboutPage", () => {
  it("renders with correct data-testid", () => {
    renderPage()
    expect(screen.getByTestId("about-page")).toBeInTheDocument()
  })

  it("renders h1 heading", () => {
    renderPage()
    expect(
      screen.getByRole("heading", { level: 1, name: /about dead on film/i })
    ).toBeInTheDocument()
  })

  it("renders key section headings", () => {
    renderPage()
    expect(screen.getByRole("heading", { name: /what is dead on film/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /why does this exist/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /how it works/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /our commitment to accuracy/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /contact/i })).toBeInTheDocument()
  })

  it("renders cross-links to other authority pages", () => {
    renderPage()
    expect(screen.getByRole("link", { name: /frequently asked questions/i })).toHaveAttribute(
      "href",
      "/faq"
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
