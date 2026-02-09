import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { TestMemoryRouter } from "@/test/test-utils"
import MobileMenu from "./MobileMenu"

function renderMobileMenu(isOpen = true, onClose = vi.fn()) {
  return {
    onClose,
    ...render(
      <TestMemoryRouter initialEntries={["/movie/test"]}>
        <MobileMenu isOpen={isOpen} onClose={onClose} />
      </TestMemoryRouter>
    ),
  }
}

describe("MobileMenu", () => {
  it("renders with slide-in animation when open", () => {
    renderMobileMenu(true)

    const menu = screen.getByTestId("mobile-menu")
    expect(menu.className).toContain("translate-x-0")
  })

  it("renders off-screen when closed", () => {
    renderMobileMenu(false)

    const menu = screen.getByTestId("mobile-menu")
    expect(menu.className).toContain("translate-x-full")
  })

  it("calls onClose when close button clicked", () => {
    const { onClose } = renderMobileMenu(true)

    fireEvent.click(screen.getByTestId("mobile-menu-close"))
    expect(onClose).toHaveBeenCalled()
  })

  it("calls onClose when backdrop clicked", () => {
    const { onClose } = renderMobileMenu(true)

    fireEvent.click(screen.getByTestId("mobile-menu-backdrop"))
    expect(onClose).toHaveBeenCalled()
  })

  it("calls onClose on Escape key", () => {
    const { onClose } = renderMobileMenu(true)

    fireEvent.keyDown(document, { key: "Escape" })
    expect(onClose).toHaveBeenCalled()
  })

  it("renders all navigation groups", () => {
    renderMobileMenu(true)

    expect(screen.getByText("Explore")).toBeInTheDocument()
    expect(screen.getByText("Discover")).toBeInTheDocument()
    expect(screen.getByText("More")).toBeInTheDocument()
  })

  it("renders all navigation links", () => {
    renderMobileMenu(true)

    expect(screen.getByText("Deaths")).toBeInTheDocument()
    expect(screen.getByText("Genres")).toBeInTheDocument()
    expect(screen.getByText("Causes of Death")).toBeInTheDocument()
    expect(screen.getByText("Death Watch")).toBeInTheDocument()
    expect(screen.getByText("Forever Young")).toBeInTheDocument()
    expect(screen.getByText("Notable Deaths")).toBeInTheDocument()
    expect(screen.getByText("Deaths by Decade")).toBeInTheDocument()
    expect(screen.getByText("About")).toBeInTheDocument()
  })

  it("has correct link destinations", () => {
    renderMobileMenu(true)

    expect(screen.getByTestId("mobile-nav-deaths-all")).toHaveAttribute("href", "/deaths/all")
    expect(screen.getByTestId("mobile-nav-genres")).toHaveAttribute("href", "/genres")
    expect(screen.getByTestId("mobile-nav-about")).toHaveAttribute("href", "/about")
  })

  it("locks body scroll when open", () => {
    renderMobileMenu(true)

    expect(document.body.style.overflow).toBe("hidden")
  })

  it("unlocks body scroll when closed", () => {
    const { rerender } = render(
      <TestMemoryRouter initialEntries={["/movie/test"]}>
        <MobileMenu isOpen={true} onClose={vi.fn()} />
      </TestMemoryRouter>
    )

    expect(document.body.style.overflow).toBe("hidden")

    rerender(
      <TestMemoryRouter initialEntries={["/movie/test"]}>
        <MobileMenu isOpen={false} onClose={vi.fn()} />
      </TestMemoryRouter>
    )

    expect(document.body.style.overflow).toBe("")
  })

  it("has proper accessibility attributes", () => {
    renderMobileMenu(true)

    const menu = screen.getByTestId("mobile-menu")
    expect(menu).toHaveAttribute("role", "dialog")
    expect(menu).toHaveAttribute("aria-modal", "true")
    expect(menu).toHaveAttribute("aria-label", "Site navigation")
  })
})
