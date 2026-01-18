import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// We need to test the module in isolation, mocking the newrelic agent
// The module uses a singleton pattern, so we'll test the exported functions

describe("newrelic wrapper functions", () => {
  // Save original env
  const originalEnv = process.env.NEW_RELIC_LICENSE_KEY

  afterEach(() => {
    vi.resetModules()
    // Restore original env
    if (originalEnv === undefined) {
      delete process.env.NEW_RELIC_LICENSE_KEY
    } else {
      process.env.NEW_RELIC_LICENSE_KEY = originalEnv
    }
  })

  describe("when New Relic is not initialized", () => {
    beforeEach(() => {
      delete process.env.NEW_RELIC_LICENSE_KEY
    })

    it("startBackgroundTransaction executes handler directly", async () => {
      const { startBackgroundTransaction } = await import("./newrelic.js")

      const handler = vi.fn().mockResolvedValue("result")
      const result = await startBackgroundTransaction("test", "group", handler)

      expect(handler).toHaveBeenCalled()
      expect(result).toBe("result")
    })

    it("startSegment executes handler directly", async () => {
      const { startSegment } = await import("./newrelic.js")

      const handler = vi.fn().mockResolvedValue("segment-result")
      const result = await startSegment("test-segment", true, handler)

      expect(handler).toHaveBeenCalled()
      expect(result).toBe("segment-result")
    })

    it("noticeError does nothing when agent not initialized", async () => {
      const { noticeError } = await import("./newrelic.js")

      // Should not throw
      expect(() => noticeError(new Error("test error"))).not.toThrow()
    })

    it("noticeError accepts custom attributes", async () => {
      const { noticeError } = await import("./newrelic.js")

      // Should not throw even with custom attributes
      expect(() => noticeError(new Error("test error"), { key: "value", count: 42 })).not.toThrow()
    })

    it("addCustomAttributes does nothing when agent not initialized", async () => {
      const { addCustomAttributes } = await import("./newrelic.js")

      // Should not throw
      expect(() => addCustomAttributes({ key: "value", count: 42, active: true })).not.toThrow()
    })
  })

  describe("sanitizeCustomAttributes", () => {
    it("filters out non-primitive values from custom attributes", async () => {
      const { sanitizeCustomAttributes } = await import("./newrelic.js")

      const input = {
        validString: "hello",
        validNumber: 42,
        validBoolean: true,
        invalidObject: { nested: "value" },
        invalidArray: [1, 2, 3],
        invalidFunction: () => {},
        invalidNull: null,
        invalidUndefined: undefined,
      }

      const result = sanitizeCustomAttributes(input as Record<string, unknown>)

      expect(result).toEqual({
        validString: "hello",
        validNumber: 42,
        validBoolean: true,
      })
    })

    it("returns empty object for undefined input", async () => {
      const { sanitizeCustomAttributes } = await import("./newrelic.js")

      const result = sanitizeCustomAttributes(undefined)

      expect(result).toEqual({})
    })

    it("returns empty object when all values are invalid", async () => {
      const { sanitizeCustomAttributes } = await import("./newrelic.js")

      const input = {
        obj: { a: 1 },
        arr: [1, 2],
        fn: () => {},
      }

      const result = sanitizeCustomAttributes(input as unknown as Record<string, unknown>)

      expect(result).toEqual({})
    })
  })
})
