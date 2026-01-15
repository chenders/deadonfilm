import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, screen, act } from "@testing-library/react"
import { ThemeProvider, useTheme } from "./ThemeContext"

// Helper component to test the hook
function TestConsumer() {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved-theme">{resolvedTheme}</span>
      <button data-testid="set-dark" onClick={() => setTheme("dark")}>
        Set Dark
      </button>
      <button data-testid="set-light" onClick={() => setTheme("light")}>
        Set Light
      </button>
      <button data-testid="set-system" onClick={() => setTheme("system")}>
        Set System
      </button>
      <button data-testid="toggle" onClick={toggleTheme}>
        Toggle
      </button>
    </div>
  )
}

describe("ThemeContext", () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear()
    // Remove dark class from document
    document.documentElement.classList.remove("dark")
    // Reset matchMedia mock
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query === "(prefers-color-scheme: dark)" ? false : false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    )
  })

  it("defaults to system theme when no preference is stored", () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    )

    expect(screen.getByTestId("theme")).toHaveTextContent("system")
  })

  it("uses defaultTheme prop when provided", () => {
    render(
      <ThemeProvider defaultTheme="dark">
        <TestConsumer />
      </ThemeProvider>
    )

    expect(screen.getByTestId("theme")).toHaveTextContent("dark")
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark")
  })

  it("persists theme preference to localStorage", () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    )

    act(() => {
      screen.getByTestId("set-dark").click()
    })

    expect(localStorage.getItem("dof-theme-preference")).toBe("dark")
  })

  it("loads theme preference from localStorage", () => {
    localStorage.setItem("dof-theme-preference", "dark")

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    )

    expect(screen.getByTestId("theme")).toHaveTextContent("dark")
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark")
  })

  it("resolves system theme to light when system prefers light", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query === "(prefers-color-scheme: dark)" ? false : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    )

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    )

    expect(screen.getByTestId("theme")).toHaveTextContent("system")
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("light")
  })

  it("resolves system theme to dark when system prefers dark", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query === "(prefers-color-scheme: dark)" ? true : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    )

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    )

    expect(screen.getByTestId("theme")).toHaveTextContent("system")
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark")
  })

  it("applies dark class to document when resolved theme is dark", () => {
    render(
      <ThemeProvider defaultTheme="dark">
        <TestConsumer />
      </ThemeProvider>
    )

    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })

  it("removes dark class from document when resolved theme is light", () => {
    document.documentElement.classList.add("dark")

    render(
      <ThemeProvider defaultTheme="light">
        <TestConsumer />
      </ThemeProvider>
    )

    expect(document.documentElement.classList.contains("dark")).toBe(false)
  })

  it("toggleTheme switches from light to dark", () => {
    render(
      <ThemeProvider defaultTheme="light">
        <TestConsumer />
      </ThemeProvider>
    )

    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("light")

    act(() => {
      screen.getByTestId("toggle").click()
    })

    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark")
    expect(screen.getByTestId("theme")).toHaveTextContent("dark")
  })

  it("toggleTheme switches from dark to light", () => {
    render(
      <ThemeProvider defaultTheme="dark">
        <TestConsumer />
      </ThemeProvider>
    )

    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark")

    act(() => {
      screen.getByTestId("toggle").click()
    })

    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("light")
    expect(screen.getByTestId("theme")).toHaveTextContent("light")
  })

  it("setTheme updates both theme and localStorage", () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    )

    act(() => {
      screen.getByTestId("set-dark").click()
    })

    expect(screen.getByTestId("theme")).toHaveTextContent("dark")
    expect(localStorage.getItem("dof-theme-preference")).toBe("dark")

    act(() => {
      screen.getByTestId("set-light").click()
    })

    expect(screen.getByTestId("theme")).toHaveTextContent("light")
    expect(localStorage.getItem("dof-theme-preference")).toBe("light")

    act(() => {
      screen.getByTestId("set-system").click()
    })

    expect(screen.getByTestId("theme")).toHaveTextContent("system")
    expect(localStorage.getItem("dof-theme-preference")).toBe("system")
  })

  it("throws error when useTheme is used outside ThemeProvider", () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    expect(() => render(<TestConsumer />)).toThrow("useTheme must be used within a ThemeProvider")

    consoleSpy.mockRestore()
  })
})
