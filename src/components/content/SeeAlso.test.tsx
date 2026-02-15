import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import SeeAlso from "./SeeAlso"

const sampleLinks = [
  { href: "/movie/the-shining-1980-694", label: "The Shining" },
  { href: "/movie/alien-1979-348", label: "Alien" },
  { href: "/movie/jaws-1975-578", label: "Jaws" },
]

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe("SeeAlso", () => {
  it("returns null when links array is empty", () => {
    const { container } = renderWithRouter(<SeeAlso links={[]} />)
    expect(container.innerHTML).toBe("")
  })

  it("renders see-also label and links", () => {
    renderWithRouter(<SeeAlso links={sampleLinks} />)

    expect(screen.getByText("See also:")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "The Shining" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Alien" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Jaws" })).toBeInTheDocument()
  })

  it("renders separator dots between links", () => {
    renderWithRouter(<SeeAlso links={sampleLinks} />)

    // The middot separators have aria-hidden="true"
    const separators = screen.getAllByText("·")
    // With 3 links there should be 2 separators
    expect(separators).toHaveLength(2)
    separators.forEach((sep) => {
      expect(sep).toHaveAttribute("aria-hidden", "true")
    })
  })

  it("links to correct hrefs", () => {
    renderWithRouter(<SeeAlso links={sampleLinks} />)

    expect(screen.getByRole("link", { name: "The Shining" })).toHaveAttribute(
      "href",
      "/movie/the-shining-1980-694"
    )
    expect(screen.getByRole("link", { name: "Alien" })).toHaveAttribute(
      "href",
      "/movie/alien-1979-348"
    )
    expect(screen.getByRole("link", { name: "Jaws" })).toHaveAttribute(
      "href",
      "/movie/jaws-1975-578"
    )
  })
})
