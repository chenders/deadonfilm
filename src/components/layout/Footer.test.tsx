import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import Footer from "./Footer"

function renderFooter() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Footer />
    </MemoryRouter>
  )
}

describe("Footer", () => {
  it("renders footer nav with data-testid", () => {
    renderFooter()
    expect(screen.getByTestId("footer-nav")).toBeInTheDocument()
  })

  it("renders About link", () => {
    renderFooter()
    const link = screen.getByRole("link", { name: "About" })
    expect(link).toHaveAttribute("href", "/about")
  })

  it("renders FAQ link", () => {
    renderFooter()
    const link = screen.getByRole("link", { name: "FAQ" })
    expect(link).toHaveAttribute("href", "/faq")
  })

  it("renders Methodology link", () => {
    renderFooter()
    const link = screen.getByRole("link", { name: "Methodology" })
    expect(link).toHaveAttribute("href", "/methodology")
  })

  it("renders Data Sources link", () => {
    renderFooter()
    const link = screen.getByRole("link", { name: "Data Sources" })
    expect(link).toHaveAttribute("href", "/data-sources")
  })

  it("renders TMDB attribution", () => {
    renderFooter()
    expect(screen.getByTestId("tmdb-logo-link")).toBeInTheDocument()
  })
})
