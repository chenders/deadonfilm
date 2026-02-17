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

  it("renders category headings", () => {
    renderFooter()
    expect(screen.getByText("Explore")).toBeInTheDocument()
    expect(screen.getByText("Statistics")).toBeInTheDocument()
    expect(screen.getByText("Information")).toBeInTheDocument()
  })

  it("renders Explore links", () => {
    renderFooter()
    expect(screen.getByRole("link", { name: "Death Watch" })).toHaveAttribute(
      "href",
      "/death-watch"
    )
    expect(screen.getByRole("link", { name: "Notable Deaths" })).toHaveAttribute(
      "href",
      "/deaths/notable"
    )
    expect(screen.getByRole("link", { name: "Causes of Death" })).toHaveAttribute(
      "href",
      "/causes-of-death"
    )
  })

  it("renders Statistics links", () => {
    renderFooter()
    expect(screen.getByRole("link", { name: "Deaths by Decade" })).toHaveAttribute(
      "href",
      "/deaths/decades"
    )
    expect(screen.getByRole("link", { name: "Movie Genres" })).toHaveAttribute(
      "href",
      "/movies/genres"
    )
  })

  it("renders Information links", () => {
    renderFooter()
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute("href", "/about")
    expect(screen.getByRole("link", { name: "FAQ" })).toHaveAttribute("href", "/faq")
    expect(screen.getByRole("link", { name: "Methodology" })).toHaveAttribute(
      "href",
      "/methodology"
    )
    expect(screen.getByRole("link", { name: "Data Sources" })).toHaveAttribute(
      "href",
      "/data-sources"
    )
  })

  it("renders TMDB attribution", () => {
    renderFooter()
    expect(screen.getByTestId("tmdb-logo-link")).toBeInTheDocument()
  })
})
