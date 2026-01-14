import "@testing-library/jest-dom"
import { vi } from "vitest"

// Mock requestAnimationFrame to run synchronously in tests
// This prevents act() warnings from components that use rAF for positioning
// Using vi.stubGlobal ensures it persists through fake timers
vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
  callback(0)
  return 0
})

vi.stubGlobal("cancelAnimationFrame", () => {})
