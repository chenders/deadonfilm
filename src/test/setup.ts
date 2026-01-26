import "@testing-library/jest-dom"
import { vi, beforeAll, afterAll } from "vitest"

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

// Suppress known warnings from third-party libraries
const originalConsoleError = console.error
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    const message = typeof args[0] === "string" ? args[0] : args[0]?.toString() || ""
    // Suppress Radix UI Tooltip warnings - these are internal state updates
    // that don't affect test correctness
    if (message.includes("Warning: An update to TooltipContent inside a test")) {
      return
    }
    if (message.includes("Warning: An update to HoverTooltip inside a test")) {
      return
    }
    // Call original for other warnings
    originalConsoleError.apply(console, args)
  }
})

afterAll(() => {
  console.error = originalConsoleError
})
