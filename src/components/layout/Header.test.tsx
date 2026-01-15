import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { TestMemoryRouter } from "@/test/test-utils"
import Header from "./Header"

// Mock SearchTrigger to avoid complex context setup
vi.mock("@/components/search/SearchTrigger", () => ({
  default: () => <button data-testid="search-trigger">Search</button>,
}))

function renderHeader(initialPath = "/movie/test") {
  return render(
    <TestMemoryRouter initialEntries={[initialPath]}>
      <Header />
    </TestMemoryRouter>
  )
}

describe("Header", () => {
  it("renders the site header", () => {
    renderHeader()

    expect(screen.getByTestId("site-header")).toBeInTheDocument()
  })

  it("renders home link with logo and title", () => {
    renderHeader()

    const homeLink = screen.getByTestId("home-link")
    expect(homeLink).toBeInTheDocument()
    expect(homeLink).toHaveAttribute("href", "/")

    expect(screen.getByTestId("skull-logo")).toBeInTheDocument()
    expect(screen.getByTestId("site-title")).toHaveTextContent("Dead on Film")
  })

  describe("search trigger visibility", () => {
    it("shows search trigger on non-home pages", () => {
      renderHeader("/movie/test")

      expect(screen.getByTestId("search-trigger")).toBeInTheDocument()
    })

    it("hides search trigger on home page", () => {
      renderHeader("/")

      expect(screen.queryByTestId("search-trigger")).not.toBeInTheDocument()
    })

    it("shows search trigger on show pages", () => {
      renderHeader("/show/test")

      expect(screen.getByTestId("search-trigger")).toBeInTheDocument()
    })

    it("shows search trigger on actor pages", () => {
      renderHeader("/actor/123")

      expect(screen.getByTestId("search-trigger")).toBeInTheDocument()
    })
  })

  describe("layout centering", () => {
    it("uses a 3-column grid layout to keep logo centered", () => {
      renderHeader()

      const header = screen.getByTestId("site-header")
      const gridContainer = header.querySelector(".grid.grid-cols-\\[1fr_auto_1fr\\]")

      expect(gridContainer).toBeInTheDocument()
    })

    it("has home link in the center column with justify-center", () => {
      renderHeader()

      const homeLink = screen.getByTestId("home-link")

      // The home link should have justify-center to center its contents
      expect(homeLink).toHaveClass("justify-center")
    })

    it("has search trigger in a right-aligned container", () => {
      renderHeader()

      const searchTrigger = screen.getByTestId("search-trigger")
      const rightContainer = searchTrigger.parentElement

      // The search trigger's parent should have justify-end
      expect(rightContainer).toHaveClass("justify-end")
    })

    it("has a left spacer to balance the search trigger", () => {
      renderHeader()

      const header = screen.getByTestId("site-header")
      const gridContainer = header.querySelector(".grid.grid-cols-\\[1fr_auto_1fr\\]")

      // Grid should have 3 children: spacer, home link, search container
      expect(gridContainer?.children).toHaveLength(3)

      // First child should be the spacer (aria-hidden div)
      const spacer = gridContainer?.children[0]
      expect(spacer).toHaveAttribute("aria-hidden", "true")
    })
  })
})
