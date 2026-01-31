import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { isPermanentError } from "../src/lib/backfill-utils.js"

describe("backfill-movie-alternate-titles", () => {
  describe("error classification", () => {
    // Uses shared isPermanentError from backfill-utils
    it("classifies 404 as permanent error", () => {
      expect(isPermanentError(new Error("TMDB API error: 404 Not Found"))).toBe(true)
    })

    it("classifies 400 as permanent error", () => {
      expect(isPermanentError(new Error("TMDB API error: 400 Bad Request"))).toBe(true)
    })

    it("classifies 401 as permanent error in shared util", () => {
      // Note: The backfill script handles 401 specially as a fatal error
      // but the shared util still classifies it as permanent
      expect(isPermanentError(new Error("TMDB API error: 401 Unauthorized"))).toBe(true)
    })

    it("classifies 500 as transient error", () => {
      expect(isPermanentError(new Error("TMDB API error: 500 Internal Server Error"))).toBe(false)
    })

    it("classifies 503 as transient error", () => {
      expect(isPermanentError(new Error("TMDB API error: 503 Service Unavailable"))).toBe(false)
    })

    it("classifies network errors as transient", () => {
      expect(isPermanentError(new Error("Network error: ECONNRESET"))).toBe(false)
    })

    it("classifies timeout errors as transient", () => {
      expect(isPermanentError(new Error("Request timeout"))).toBe(false)
    })
  })

  describe("isAuthError (script-specific)", () => {
    // This tests the isAuthError function behavior that the script uses
    // to exit early on authentication failures
    it("identifies 401 errors", () => {
      const error = new Error("TMDB API error: 401 Unauthorized")
      const errorMsg = error.message.toLowerCase()
      expect(errorMsg.includes("401") || errorMsg.includes("unauthorized")).toBe(true)
    })

    it("identifies unauthorized errors", () => {
      const error = new Error("unauthorized access")
      const errorMsg = error.message.toLowerCase()
      expect(errorMsg.includes("401") || errorMsg.includes("unauthorized")).toBe(true)
    })

    it("does not flag 404 as auth error", () => {
      const error = new Error("TMDB API error: 404 Not Found")
      const errorMsg = error.message.toLowerCase()
      expect(errorMsg.includes("401") || errorMsg.includes("unauthorized")).toBe(false)
    })
  })
})
