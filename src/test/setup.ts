import "@testing-library/jest-dom"
import { vi } from "vitest"

// Mock requestAnimationFrame to run synchronously in tests
// This prevents act() warnings from components that use rAF for positioning
// Using vi.stubGlobal ensures it persists through fake timers
vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
  const timestamp =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now()
  callback(timestamp)
  return 0
})

vi.stubGlobal("cancelAnimationFrame", () => {})

// Mock window.matchMedia for theme detection in AdminThemeProvider
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: query === "(prefers-color-scheme: dark)",
    media: query,
    onchange: null,
    addListener: vi.fn(), // Deprecated
    removeListener: vi.fn(), // Deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})
