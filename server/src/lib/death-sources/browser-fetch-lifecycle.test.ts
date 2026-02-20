/**
 * Tests for browser lifecycle management (idle timeout deferral).
 *
 * Separated from browser-fetch.test.ts because these tests require
 * top-level vi.mock() calls to intercept static imports of playwright-core
 * and browser-auth before the module loads.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

// vi.hoisted() ensures these are available in vi.mock() factories (which are hoisted)
const { mockContexts, mockClose, mockBrowser, mockPage, mockContext } = vi.hoisted(() => {
  const mockContexts: unknown[] = []
  const mockClose = vi.fn().mockResolvedValue(undefined)
  const mockBrowser = {
    isConnected: vi.fn().mockReturnValue(true),
    contexts: vi.fn().mockImplementation(() => [...mockContexts]),
    close: mockClose,
    on: vi.fn(),
    newContext: vi.fn(),
  }
  const mockPage = {
    setExtraHTTPHeaders: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  }
  const mockContext = {
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn().mockResolvedValue(undefined),
  }
  return { mockContexts, mockClose, mockBrowser, mockPage, mockContext }
})

vi.mock("fingerprint-injector", () => ({
  newInjectedContext: vi.fn(),
}))

vi.mock("playwright-core", () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue(mockBrowser),
  },
}))

vi.mock("./browser-auth/index.js", () => ({
  getBrowserAuthConfig: vi.fn().mockReturnValue({ enabled: false }),
  hasCredentialsForSite: vi.fn().mockReturnValue(false),
  loadSession: vi.fn().mockResolvedValue(null),
  saveSession: vi.fn().mockResolvedValue(undefined),
  applySessionToContext: vi.fn().mockResolvedValue(undefined),
  detectCaptcha: vi.fn().mockResolvedValue({ hasCaptcha: false }),
  solveCaptcha: vi.fn().mockResolvedValue(false),
  NYTimesLoginHandler: vi.fn(),
  WashingtonPostLoginHandler: vi.fn(),
  createStealthContext: vi.fn().mockResolvedValue(mockContext),
  getStealthLaunchArgs: vi.fn().mockReturnValue([]),
}))

import { getBrowserPage, shutdownBrowser, setBrowserConfig } from "./browser-fetch.js"
import { DEFAULT_BROWSER_FETCH_CONFIG } from "./types.js"

describe("browser idle timeout deferral", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Use a short idle timeout for faster tests
    setBrowserConfig({ ...DEFAULT_BROWSER_FETCH_CONFIG, idleTimeoutMs: 5000 })
    mockContexts.length = 0
    mockClose.mockClear()
    mockBrowser.isConnected.mockReturnValue(true)
  })

  afterEach(async () => {
    vi.useRealTimers()
    await shutdownBrowser()
    setBrowserConfig({ ...DEFAULT_BROWSER_FETCH_CONFIG })
  })

  it("defers shutdown when active contexts exist", async () => {
    // Simulate an active context (page still in use)
    mockContexts.push({ id: "ctx-1" })

    // Initialize browser by getting a page
    await getBrowserPage()

    // Advance past the idle timeout — browser should NOT shut down
    // because there are active contexts
    await vi.advanceTimersByTimeAsync(6000)
    expect(mockClose).not.toHaveBeenCalled()

    // Remove all contexts — browser should shut down on next timeout cycle
    mockContexts.length = 0
    await vi.advanceTimersByTimeAsync(6000)
    expect(mockClose).toHaveBeenCalled()
  })

  it("shuts down immediately when no active contexts exist", async () => {
    // No active contexts
    await getBrowserPage()

    // Advance past the idle timeout — browser should shut down
    await vi.advanceTimersByTimeAsync(6000)
    expect(mockClose).toHaveBeenCalled()
  })
})
