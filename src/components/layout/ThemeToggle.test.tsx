import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ThemeProvider } from "@/contexts/ThemeContext"
import ThemeToggle from "./ThemeToggle"

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove("dark")
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query === "(prefers-color-scheme: dark)" ? false : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    )
  })

  it("renders the toggle button", () => {
    render(
      <ThemeProvider defaultTheme="light">
        <ThemeToggle />
      </ThemeProvider>
    )

    expect(screen.getByTestId("theme-toggle")).toBeInTheDocument()
  })

  it("shows moon icon in light mode", () => {
    render(
      <ThemeProvider defaultTheme="light">
        <ThemeToggle />
      </ThemeProvider>
    )

    const button = screen.getByTestId("theme-toggle")
    expect(button).toHaveAttribute("aria-label", "Switch to dark mode")
    expect(button).toHaveAttribute("title", "Switch to dark mode")
    // Moon icon should be present (check for the SVG)
    expect(button.querySelector("svg")).toBeInTheDocument()
  })

  it("shows sun icon in dark mode", () => {
    render(
      <ThemeProvider defaultTheme="dark">
        <ThemeToggle />
      </ThemeProvider>
    )

    const button = screen.getByTestId("theme-toggle")
    expect(button).toHaveAttribute("aria-label", "Switch to light mode")
    expect(button).toHaveAttribute("title", "Switch to light mode")
    // Sun icon should be present (check for the SVG)
    expect(button.querySelector("svg")).toBeInTheDocument()
  })

  it("toggles theme when clicked in light mode", () => {
    render(
      <ThemeProvider defaultTheme="light">
        <ThemeToggle />
      </ThemeProvider>
    )

    const button = screen.getByTestId("theme-toggle")
    expect(button).toHaveAttribute("aria-label", "Switch to dark mode")

    fireEvent.click(button)

    expect(button).toHaveAttribute("aria-label", "Switch to light mode")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })

  it("toggles theme when clicked in dark mode", () => {
    render(
      <ThemeProvider defaultTheme="dark">
        <ThemeToggle />
      </ThemeProvider>
    )

    const button = screen.getByTestId("theme-toggle")
    expect(button).toHaveAttribute("aria-label", "Switch to light mode")

    fireEvent.click(button)

    expect(button).toHaveAttribute("aria-label", "Switch to dark mode")
    expect(document.documentElement.classList.contains("dark")).toBe(false)
  })

  it("persists theme preference when toggled", () => {
    render(
      <ThemeProvider defaultTheme="light">
        <ThemeToggle />
      </ThemeProvider>
    )

    fireEvent.click(screen.getByTestId("theme-toggle"))

    expect(localStorage.getItem("dof-theme-preference")).toBe("dark")
  })

  it("has proper accessibility attributes", () => {
    render(
      <ThemeProvider defaultTheme="light">
        <ThemeToggle />
      </ThemeProvider>
    )

    const button = screen.getByTestId("theme-toggle")
    expect(button.tagName).toBe("BUTTON")
    expect(button).toHaveAttribute("aria-label")
    expect(button).toHaveAttribute("title")
  })
})
