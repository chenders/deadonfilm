/**
 * Tests for the prerender renderer (Playwright rendering logic)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock playwright-core
const mockPageClose = vi.fn().mockResolvedValue(undefined)
const mockPageGoto = vi.fn().mockResolvedValue(undefined)
const mockPageWaitForFunction = vi.fn().mockResolvedValue(undefined)
const mockPageEvaluate = vi.fn().mockResolvedValue("<html><body>rendered</body></html>")

const mockNewPage = vi.fn().mockResolvedValue({
  goto: mockPageGoto,
  waitForFunction: mockPageWaitForFunction,
  evaluate: mockPageEvaluate,
  close: mockPageClose,
})

const mockBrowserOn = vi.fn()
const mockBrowserClose = vi.fn().mockResolvedValue(undefined)
const mockBrowserIsConnected = vi.fn().mockReturnValue(true)

const mockLaunch = vi.fn().mockResolvedValue({
  newPage: mockNewPage,
  on: mockBrowserOn,
  close: mockBrowserClose,
  isConnected: mockBrowserIsConnected,
})

vi.mock("playwright-core", () => ({
  chromium: {
    launch: (...args: unknown[]) => mockLaunch(...args),
  },
}))

vi.mock("../lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { renderPage, closeBrowser, isBrowserHealthy } from "./renderer.js"

describe("renderer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBrowserIsConnected.mockReturnValue(true)
  })

  afterEach(async () => {
    await closeBrowser()
  })

  describe("renderPage", () => {
    it("launches browser and renders a page", async () => {
      const html = await renderPage("http://nginx:3000/actor/john-wayne-2157")

      expect(mockLaunch).toHaveBeenCalledWith({
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      })
      expect(mockNewPage).toHaveBeenCalledWith({
        viewport: { width: 1280, height: 800 },
      })
      expect(mockPageGoto).toHaveBeenCalledWith("http://nginx:3000/actor/john-wayne-2157", {
        waitUntil: "networkidle",
        timeout: 10_000,
      })
      expect(mockPageWaitForFunction).toHaveBeenCalled()
      expect(mockPageEvaluate).toHaveBeenCalled()
      expect(html).toContain("<!DOCTYPE html>")
      expect(html).toContain("rendered")
    })

    it("closes the page after rendering", async () => {
      await renderPage("http://nginx:3000/")

      expect(mockPageClose).toHaveBeenCalled()
    })

    it("closes the page even if rendering fails", async () => {
      mockPageGoto.mockRejectedValueOnce(new Error("Timeout"))

      await expect(renderPage("http://nginx:3000/")).rejects.toThrow("Timeout")
      expect(mockPageClose).toHaveBeenCalled()
    })

    it("reuses existing browser instance", async () => {
      await renderPage("http://nginx:3000/page1")
      await renderPage("http://nginx:3000/page2")

      // Browser should only be launched once
      expect(mockLaunch).toHaveBeenCalledTimes(1)
    })

    it("re-launches browser if disconnected", async () => {
      await renderPage("http://nginx:3000/page1")

      // Simulate disconnect
      mockBrowserIsConnected.mockReturnValue(false)

      await renderPage("http://nginx:3000/page2")

      // Browser should be launched twice
      expect(mockLaunch).toHaveBeenCalledTimes(2)
    })
  })

  describe("closeBrowser", () => {
    it("closes the browser instance", async () => {
      await renderPage("http://nginx:3000/")
      await closeBrowser()

      expect(mockBrowserClose).toHaveBeenCalled()
    })

    it("handles no browser gracefully", async () => {
      await closeBrowser()
      // Should not throw
    })
  })

  describe("isBrowserHealthy", () => {
    it("returns false when no browser exists", () => {
      expect(isBrowserHealthy()).toBe(false)
    })

    it("returns true when browser is connected", async () => {
      await renderPage("http://nginx:3000/")
      expect(isBrowserHealthy()).toBe(true)
    })

    it("returns false when browser is disconnected", async () => {
      await renderPage("http://nginx:3000/")
      mockBrowserIsConnected.mockReturnValue(false)
      expect(isBrowserHealthy()).toBe(false)
    })
  })
})
