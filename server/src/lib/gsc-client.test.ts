/**
 * Tests for the GSC client library.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock dependencies before importing
vi.mock("googleapis")
vi.mock("./logger.js")
vi.mock("./cache.js")

import { getCached, setCached } from "./cache.js"
import { isGscConfigured, daysAgo, resetGscClient } from "./gsc-client.js"

describe("gsc-client", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    resetGscClient()
    vi.mocked(getCached).mockResolvedValue(null)
    vi.mocked(setCached).mockResolvedValue()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  describe("isGscConfigured", () => {
    it("returns true when all required env vars are set", () => {
      process.env.GSC_SERVICE_ACCOUNT_EMAIL = "test@example.iam.gserviceaccount.com"
      process.env.GSC_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----"
      process.env.GSC_SITE_URL = "sc-domain:example.com"

      expect(isGscConfigured()).toBe(true)
    })

    it("returns false when email is missing", () => {
      delete process.env.GSC_SERVICE_ACCOUNT_EMAIL
      process.env.GSC_PRIVATE_KEY = "key"
      process.env.GSC_SITE_URL = "url"

      expect(isGscConfigured()).toBe(false)
    })

    it("returns false when private key is missing", () => {
      process.env.GSC_SERVICE_ACCOUNT_EMAIL = "email"
      delete process.env.GSC_PRIVATE_KEY
      process.env.GSC_SITE_URL = "url"

      expect(isGscConfigured()).toBe(false)
    })

    it("returns false when site URL is missing", () => {
      process.env.GSC_SERVICE_ACCOUNT_EMAIL = "email"
      process.env.GSC_PRIVATE_KEY = "key"
      delete process.env.GSC_SITE_URL

      expect(isGscConfigured()).toBe(false)
    })

    it("returns false when all env vars are empty", () => {
      process.env.GSC_SERVICE_ACCOUNT_EMAIL = ""
      process.env.GSC_PRIVATE_KEY = ""
      process.env.GSC_SITE_URL = ""

      expect(isGscConfigured()).toBe(false)
    })
  })

  describe("daysAgo", () => {
    it("returns today's date for 0 days ago", () => {
      const result = daysAgo(0)
      const today = new Date().toISOString().split("T")[0]
      expect(result).toBe(today)
    })

    it("returns correct date for 7 days ago", () => {
      const result = daysAgo(7)
      const expected = new Date()
      expected.setDate(expected.getDate() - 7)
      expect(result).toBe(expected.toISOString().split("T")[0])
    })

    it("returns YYYY-MM-DD format", () => {
      const result = daysAgo(30)
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })
})
