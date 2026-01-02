import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { ScriptMetrics } from "./newrelic-cli.js"

// Store original env value
const originalLicenseKey = process.env.NEW_RELIC_LICENSE_KEY

describe("newrelic-cli", () => {
  beforeEach(() => {
    vi.resetModules()
    delete process.env.NEW_RELIC_LICENSE_KEY
  })

  afterEach(() => {
    if (originalLicenseKey) {
      process.env.NEW_RELIC_LICENSE_KEY = originalLicenseKey
    } else {
      delete process.env.NEW_RELIC_LICENSE_KEY
    }
    vi.resetModules()
  })

  describe("withNewRelicTransaction", () => {
    it("executes function directly when NEW_RELIC_LICENSE_KEY is not set", async () => {
      const { withNewRelicTransaction } = await import("./newrelic-cli.js")

      const fn = vi.fn().mockResolvedValue("result")
      const result = await withNewRelicTransaction("test-script", fn)

      expect(result).toBe("result")
      expect(fn).toHaveBeenCalledTimes(1)
      // The recordMetrics function should be passed but be a no-op
      expect(fn).toHaveBeenCalledWith(expect.any(Function))
    })

    it("passes recordMetrics callback that is a no-op without agent", async () => {
      const { withNewRelicTransaction } = await import("./newrelic-cli.js")

      let recordMetricsFn: ((metrics: ScriptMetrics) => void) | undefined
      await withNewRelicTransaction("test-script", async (recordMetrics) => {
        recordMetricsFn = recordMetrics
        // Should not throw even without agent
        recordMetrics({ recordsProcessed: 100 })
        return "done"
      })

      expect(recordMetricsFn).toBeDefined()
    })

    it("propagates errors from the wrapped function", async () => {
      const { withNewRelicTransaction } = await import("./newrelic-cli.js")

      const error = new Error("Test error")
      const fn = vi.fn().mockRejectedValue(error)

      await expect(withNewRelicTransaction("test-script", fn)).rejects.toThrow("Test error")
    })

    it("returns the result from the wrapped function", async () => {
      const { withNewRelicTransaction } = await import("./newrelic-cli.js")

      const result = await withNewRelicTransaction("test-script", async () => {
        return { count: 42, name: "test" }
      })

      expect(result).toEqual({ count: 42, name: "test" })
    })
  })

  describe("addCliAttribute", () => {
    it("is a no-op when agent is not initialized", async () => {
      const { addCliAttribute } = await import("./newrelic-cli.js")

      // Should not throw
      expect(() => {
        addCliAttribute("key", "value")
        addCliAttribute("number", 123)
        addCliAttribute("bool", true)
      }).not.toThrow()
    })
  })

  describe("recordCliEvent", () => {
    it("is a no-op when agent is not initialized", async () => {
      const { recordCliEvent } = await import("./newrelic-cli.js")

      // Should not throw
      expect(() => {
        recordCliEvent("TestEvent", { key: "value", count: 1 })
      }).not.toThrow()
    })
  })

  describe("getCliAgent", () => {
    it("returns null when NEW_RELIC_LICENSE_KEY is not set", async () => {
      const { getCliAgent } = await import("./newrelic-cli.js")

      const agent = getCliAgent()
      expect(agent).toBeNull()
    })
  })

  describe("ScriptMetrics type", () => {
    it("accepts standard metric fields", async () => {
      const { withNewRelicTransaction } = await import("./newrelic-cli.js")

      await withNewRelicTransaction("test-script", async (recordMetrics) => {
        // Type check: all these should be valid
        recordMetrics({
          recordsProcessed: 100,
          recordsCreated: 10,
          recordsUpdated: 5,
          recordsDeleted: 2,
          errorsEncountered: 1,
        })
        return null
      })
    })

    it("accepts custom metric fields via index signature", async () => {
      const { withNewRelicTransaction } = await import("./newrelic-cli.js")

      await withNewRelicTransaction("test-script", async (recordMetrics) => {
        recordMetrics({
          customString: "value",
          customNumber: 42,
          customBoolean: true,
        })
        return null
      })
    })

    it("handles undefined values in metrics", async () => {
      const { withNewRelicTransaction } = await import("./newrelic-cli.js")

      await withNewRelicTransaction("test-script", async (recordMetrics) => {
        recordMetrics({
          recordsProcessed: 100,
          recordsCreated: undefined, // Should be skipped
        })
        return null
      })
    })
  })

  describe("initialization behavior", () => {
    it("only initializes once (idempotent)", async () => {
      const { getCliAgent, withNewRelicTransaction } = await import("./newrelic-cli.js")

      // Call multiple times - should not error
      const agent1 = getCliAgent()
      const agent2 = getCliAgent()

      expect(agent1).toBe(agent2)

      // Also works after withNewRelicTransaction
      await withNewRelicTransaction("test", async () => "done")
      const agent3 = getCliAgent()

      expect(agent3).toBe(agent1)
    })
  })
})
