import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { HelmetProvider } from "react-helmet-async"
import MethodologyPage from "./MethodologyPage"

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter
        initialEntries={["/methodology"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <MethodologyPage />
      </MemoryRouter>
    </HelmetProvider>
  )
}

describe("MethodologyPage", () => {
  it("renders with correct data-testid", () => {
    renderPage()
    expect(screen.getByTestId("methodology-page")).toBeInTheDocument()
  })

  it("renders h1 heading", () => {
    renderPage()
    expect(screen.getByRole("heading", { level: 1, name: /methodology/i })).toBeInTheDocument()
  })

  it("renders key section headings", () => {
    renderPage()
    expect(screen.getByRole("heading", { name: /overview/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /actuarial life tables/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /expected deaths/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /years lost/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /archived footage rule/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /limitations/i })).toBeInTheDocument()
  })

  it("renders formulas", () => {
    renderPage()
    expect(screen.getByText(/years lost = expected lifespan/i)).toBeInTheDocument()
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
    expect(screen.getByRole("link", { name: /data sources/i })).toHaveAttribute(
      "href",
      "/data-sources"
    )
  })
})
