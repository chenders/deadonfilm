import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// Mock archive fallback functions
const mockFetchFromArchive = vi.fn()
const mockFetchFromArchiveIs = vi.fn()
const mockSearchArchiveIsWithBrowser = vi.fn()
vi.mock("../death-sources/archive-fallback.js", () => ({
  fetchFromArchive: (...args: unknown[]) => mockFetchFromArchive(...args),
  fetchFromArchiveIs: (...args: unknown[]) => mockFetchFromArchiveIs(...args),
  searchArchiveIsWithBrowser: (...args: unknown[]) => mockSearchArchiveIsWithBrowser(...args),
}))

// Mock browser auth config (no CAPTCHA solver by default)
vi.mock("../death-sources/browser-auth/config.js", () => ({
  getBrowserAuthConfig: () => ({ captchaSolver: null }),
}))

import { fetchPageWithFallbacks } from "./fetch-page-with-fallbacks.js"

const SAMPLE_HTML = `<html><head><title>Test Page</title></head><body><p>Content here</p></body></html>`
const CAPTCHA_HTML = `<html><head><title>Verify</title></head><body><div>Please verify you are human</div></body></html>`

describe("fetchPageWithFallbacks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: archive functions fail
    mockFetchFromArchive.mockResolvedValue({ success: false, content: "", title: "" })
    mockFetchFromArchiveIs.mockResolvedValue({ success: false, content: "", title: "" })
    mockSearchArchiveIsWithBrowser.mockResolvedValue({ success: false, content: "", title: "" })
  })

  describe("direct fetch success", () => {
    it("returns content with fetchMethod='direct' on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => SAMPLE_HTML,
      })

      const result = await fetchPageWithFallbacks("https://example.com/page")

      expect(result.content).toBe(SAMPLE_HTML)
      expect(result.fetchMethod).toBe("direct")
      expect(result.title).toBe("Test Page")
      expect(result.url).toBe("https://example.com/page")
      expect(result.error).toBeUndefined()
    })

    it("extracts title from HTML", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          `<html><head><title>John Wayne | Britannica</title></head><body>Bio</body></html>`,
      })

      const result = await fetchPageWithFallbacks("https://britannica.com/bio")

      expect(result.title).toBe("John Wayne | Britannica")
    })

    it("passes custom userAgent and headers to fetch", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => SAMPLE_HTML,
      })

      await fetchPageWithFallbacks("https://example.com/page", {
        userAgent: "Custom-Agent/1.0",
        headers: { "Accept-Language": "en-GB" },
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const fetchCall = mockFetch.mock.calls[0]
      expect(fetchCall[0]).toBe("https://example.com/page")
      const headers = fetchCall[1].headers
      expect(headers["User-Agent"]).toBe("Custom-Agent/1.0")
      expect(headers["Accept-Language"]).toBe("en-GB")
    })
  })

  describe("non-blocking HTTP errors (no archive fallback)", () => {
    it("returns error immediately on 404 without trying archives", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const result = await fetchPageWithFallbacks("https://example.com/missing")

      expect(result.error).toBe("HTTP 404")
      expect(result.content).toBe("")
      expect(result.fetchMethod).toBe("none")
      // Archives should NOT be called for non-blocking errors
      expect(mockFetchFromArchive).not.toHaveBeenCalled()
    })

    it("returns error immediately on 500 without trying archives", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const result = await fetchPageWithFallbacks("https://example.com/error")

      expect(result.error).toBe("HTTP 500")
      expect(result.fetchMethod).toBe("none")
      expect(mockFetchFromArchive).not.toHaveBeenCalled()
    })
  })

  describe("blocked responses trigger archive fallback", () => {
    it("tries archive.org when direct fetch returns 403", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })
      mockFetchFromArchive.mockResolvedValueOnce({
        success: true,
        content: "<html><body>Archived content</body></html>",
        title: "Archived Page",
        archiveUrl: "https://web.archive.org/web/2024/https://example.com/page",
      })

      const result = await fetchPageWithFallbacks("https://example.com/page")

      expect(result.fetchMethod).toBe("archive.org")
      expect(result.content).toContain("Archived content")
      expect(result.error).toBeUndefined()
    })

    it("tries archive.org when direct fetch returns OK but has CAPTCHA (soft block)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => CAPTCHA_HTML,
      })
      mockFetchFromArchive.mockResolvedValueOnce({
        success: true,
        content: "<html><body>Real content</body></html>",
        title: "Real Page",
        archiveUrl: "https://web.archive.org/web/2024/https://example.com/page",
      })

      const result = await fetchPageWithFallbacks("https://example.com/page")

      expect(result.fetchMethod).toBe("archive.org")
      expect(result.content).toContain("Real content")
    })

    it("tries archive.org on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"))
      mockFetchFromArchive.mockResolvedValueOnce({
        success: true,
        content: "<html><body>Archived</body></html>",
        title: "Page",
        archiveUrl: "https://web.archive.org/web/2024/https://example.com/page",
      })

      const result = await fetchPageWithFallbacks("https://example.com/page")

      expect(result.fetchMethod).toBe("archive.org")
    })
  })

  describe("archive cascade", () => {
    it("tries archive.is when archive.org fails", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403 })
      mockFetchFromArchive.mockResolvedValueOnce({ success: false, content: "", title: "" })
      mockFetchFromArchiveIs.mockResolvedValueOnce({
        success: true,
        content: "<html><body>Archive.is content</body></html>",
        title: "Archive.is Page",
        archiveUrl: "https://archive.is/abc123",
      })

      const result = await fetchPageWithFallbacks("https://example.com/page")

      expect(result.fetchMethod).toBe("archive.is")
      expect(result.content).toContain("Archive.is content")
    })

    it("returns error when all methods fail", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403 })
      mockFetchFromArchive.mockResolvedValueOnce({ success: false, content: "", title: "" })
      mockFetchFromArchiveIs.mockResolvedValueOnce({ success: false, content: "", title: "" })

      const result = await fetchPageWithFallbacks("https://example.com/page")

      expect(result.error).toContain("All fetch methods failed")
      expect(result.content).toBe("")
      expect(result.fetchMethod).toBe("none")
    })
  })
})
