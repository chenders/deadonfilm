import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, within } from "@testing-library/react"
import { TestMemoryRouter } from "@/test/test-utils"
import Header from "./Header"

// Mock SearchTrigger and ThemeToggle to avoid complex context setup
vi.mock("@/components/search/SearchTrigger", () => ({
  default: () => <button data-testid="search-trigger">Search</button>,
}))

vi.mock("./ThemeToggle", () => ({
  default: () => <button data-testid="theme-toggle">Theme</button>,
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

  describe("desktop navigation", () => {
    it("shows nav links on non-home pages", () => {
      renderHeader("/movie/test")

      const desktopNav = screen.getByTestId("desktop-nav")
      expect(desktopNav).toBeInTheDocument()
      expect(within(desktopNav).getByText("Deaths")).toBeInTheDocument()
      expect(within(desktopNav).getByText("Genres")).toBeInTheDocument()
      expect(within(desktopNav).getByText("Causes")).toBeInTheDocument()
    })

    it("hides nav links on home page", () => {
      renderHeader("/")

      expect(screen.queryByTestId("desktop-nav")).not.toBeInTheDocument()
    })

    it("nav links have correct hrefs", () => {
      renderHeader("/movie/test")

      const desktopNav = screen.getByTestId("desktop-nav")
      expect(within(desktopNav).getByText("Deaths").closest("a")).toHaveAttribute(
        "href",
        "/deaths/all"
      )
      expect(within(desktopNav).getByText("Genres").closest("a")).toHaveAttribute(
        "href",
        "/movies/genres"
      )
      expect(within(desktopNav).getByText("Causes").closest("a")).toHaveAttribute(
        "href",
        "/causes-of-death"
      )
    })
  })

  describe("hamburger menu", () => {
    it("shows hamburger button on non-home pages", () => {
      renderHeader("/movie/test")

      expect(screen.getByTestId("hamburger-button")).toBeInTheDocument()
    })

    it("hides hamburger button on home page", () => {
      renderHeader("/")

      expect(screen.queryByTestId("hamburger-button")).not.toBeInTheDocument()
    })

    it("opens mobile menu when hamburger is clicked", () => {
      renderHeader("/movie/test")

      const hamburger = screen.getByTestId("hamburger-button")
      fireEvent.click(hamburger)

      const mobileMenu = screen.getByTestId("mobile-menu")
      expect(mobileMenu).toBeInTheDocument()
      // Menu should be visible (translated to 0)
      expect(mobileMenu.className).toContain("translate-x-0")
    })

    it("closes mobile menu when close button is clicked", () => {
      renderHeader("/movie/test")

      // Open menu
      fireEvent.click(screen.getByTestId("hamburger-button"))
      expect(screen.getByTestId("mobile-menu").className).toContain("translate-x-0")

      // Close menu
      fireEvent.click(screen.getByTestId("mobile-menu-close"))
      expect(screen.getByTestId("mobile-menu").className).toContain("translate-x-full")
    })

    it("closes mobile menu when backdrop is clicked", () => {
      renderHeader("/movie/test")

      fireEvent.click(screen.getByTestId("hamburger-button"))
      expect(screen.getByTestId("mobile-menu").className).toContain("translate-x-0")

      fireEvent.click(screen.getByTestId("mobile-menu-backdrop"))
      expect(screen.getByTestId("mobile-menu").className).toContain("translate-x-full")
    })

    it("mobile menu contains navigation links", () => {
      renderHeader("/movie/test")

      fireEvent.click(screen.getByTestId("hamburger-button"))

      // Check all nav groups are present
      expect(screen.getByText("Explore")).toBeInTheDocument()
      expect(screen.getByText("Discover")).toBeInTheDocument()
      expect(screen.getByText("More")).toBeInTheDocument()

      // Check specific links
      expect(screen.getByTestId("mobile-nav-deaths-all")).toBeInTheDocument()
      expect(screen.getByTestId("mobile-nav-movies-genres")).toBeInTheDocument()
      expect(screen.getByTestId("mobile-nav-causes-of-death")).toBeInTheDocument()
      expect(screen.getByTestId("mobile-nav-in-detail")).toBeInTheDocument()
      expect(screen.getByTestId("mobile-nav-about")).toBeInTheDocument()
    })
  })
})
