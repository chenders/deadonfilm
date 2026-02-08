import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import Breadcrumb from "./Breadcrumb"

const sampleItems = [
  { label: "Home", href: "/" },
  { label: "Movies", href: "/movies" },
  { label: "The Shining" },
]

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe("Breadcrumb", () => {
  it("returns null when only 1 item", () => {
    const { container } = renderWithRouter(<Breadcrumb items={[{ label: "Home", href: "/" }]} />)
    expect(container.innerHTML).toBe("")
  })

  it("renders breadcrumb with multiple items", () => {
    renderWithRouter(<Breadcrumb items={sampleItems} />)

    expect(screen.getByText("Home")).toBeInTheDocument()
    expect(screen.getByText("Movies")).toBeInTheDocument()
    expect(screen.getByText("The Shining")).toBeInTheDocument()
  })

  it("renders last item as plain text without link", () => {
    renderWithRouter(<Breadcrumb items={sampleItems} />)

    // The last item should not be a link
    const lastItem = screen.getByText("The Shining")
    expect(lastItem.tagName).toBe("SPAN")
    expect(lastItem.closest("a")).toBeNull()
    expect(lastItem).toHaveAttribute("aria-current", "page")
  })

  it("renders non-last items as links", () => {
    renderWithRouter(<Breadcrumb items={sampleItems} />)

    const homeLink = screen.getByRole("link", { name: "Home" })
    expect(homeLink).toHaveAttribute("href", "/")

    const moviesLink = screen.getByRole("link", { name: "Movies" })
    expect(moviesLink).toHaveAttribute("href", "/movies")
  })

  it("renders separators between items", () => {
    renderWithRouter(<Breadcrumb items={sampleItems} />)

    // With 3 items there should be 2 separator slashes
    const separators = screen.getAllByText("/")
    expect(separators).toHaveLength(2)
    separators.forEach((sep) => {
      expect(sep).toHaveAttribute("aria-hidden", "true")
    })
  })

  it("uses correct aria attributes", () => {
    renderWithRouter(<Breadcrumb items={sampleItems} />)

    const nav = screen.getByRole("navigation", { name: "Breadcrumb" })
    expect(nav).toBeInTheDocument()

    // The last item should have aria-current="page"
    const currentPage = screen.getByText("The Shining")
    expect(currentPage).toHaveAttribute("aria-current", "page")
  })
})
