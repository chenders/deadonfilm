import { describe, it, expect, vi, afterEach } from "vitest"

vi.mock("@debriefer/browser", () => ({
  fetchPageWithFallbacks: vi.fn().mockResolvedValue({
    content: "test content",
    title: "Test",
    url: "https://example.com",
    fetchMethod: "direct",
  }),
}))

vi.mock("./captcha-config.js", () => ({
  getCaptchaSolverConfig: vi.fn(),
}))

import { fetchPageWithFallbacks } from "./fetch-page-with-fallbacks.js"
import { fetchPageWithFallbacks as browserFetch } from "@debriefer/browser"
import { getCaptchaSolverConfig } from "./captcha-config.js"

describe("fetchPageWithFallbacks wrapper", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("passes undefined captchaSolver when env vars are not set", async () => {
    vi.mocked(getCaptchaSolverConfig).mockReturnValue(undefined)

    await fetchPageWithFallbacks("https://example.com")

    expect(browserFetch).toHaveBeenCalledWith("https://example.com", undefined, undefined)
  })

  it("passes captchaSolver config when env vars are set", async () => {
    const mockConfig = { provider: "2captcha" as const, apiKey: "test-key" }
    vi.mocked(getCaptchaSolverConfig).mockReturnValue(mockConfig)

    await fetchPageWithFallbacks("https://example.com")

    expect(browserFetch).toHaveBeenCalledWith("https://example.com", undefined, mockConfig)
  })

  it("passes options through to @debriefer/browser", async () => {
    vi.mocked(getCaptchaSolverConfig).mockReturnValue(undefined)
    const options = { timeoutMs: 5000 }

    await fetchPageWithFallbacks("https://example.com", options)

    expect(browserFetch).toHaveBeenCalledWith("https://example.com", options, undefined)
  })
})
