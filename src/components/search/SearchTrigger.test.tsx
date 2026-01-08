import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import SearchTrigger from "./SearchTrigger"

const mockOpenSearch = vi.fn()

vi.mock("./GlobalSearchProvider", () => ({
  useGlobalSearch: () => ({
    isOpen: false,
    openSearch: mockOpenSearch,
    closeSearch: vi.fn(),
  }),
}))

describe("SearchTrigger", () => {
  beforeEach(() => {
    mockOpenSearch.mockClear()
  })

  it("renders search icon button", () => {
    render(<SearchTrigger />)

    const button = screen.getByTestId("search-trigger")
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute("aria-label", "Search movies and TV shows")
  })

  it("calls openSearch when clicked", () => {
    render(<SearchTrigger />)

    fireEvent.click(screen.getByTestId("search-trigger"))

    expect(mockOpenSearch).toHaveBeenCalledTimes(1)
  })

  it("has keyboard shortcut tooltip", () => {
    render(<SearchTrigger />)

    const button = screen.getByTestId("search-trigger")
    expect(button).toHaveAttribute("title", "Search (⌘K)")
  })

  it("contains magnifying glass SVG icon", () => {
    render(<SearchTrigger />)

    const button = screen.getByTestId("search-trigger")
    const svg = button.querySelector("svg")
    expect(svg).toBeInTheDocument()
  })
})
