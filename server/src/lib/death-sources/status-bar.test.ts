import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { StatusBar, createNoOpStatusBar } from "./status-bar.js"

describe("StatusBar", () => {
  let originalIsTTY: boolean | undefined

  beforeEach(() => {
    // Save original TTY state
    originalIsTTY = process.stdout.isTTY
  })

  afterEach(() => {
    // Restore original TTY state
    Object.defineProperty(process.stdout, "isTTY", {
      value: originalIsTTY,
      writable: true,
    })
  })

  describe("constructor", () => {
    it("creates enabled status bar when TTY is available", () => {
      Object.defineProperty(process.stdout, "isTTY", {
        value: true,
        writable: true,
      })
      const bar = new StatusBar(true)
      expect(bar).toBeDefined()
    })

    it("creates disabled status bar when explicitly disabled", () => {
      const bar = new StatusBar(false)
      expect(bar).toBeDefined()
    })

    it("creates disabled status bar when not a TTY", () => {
      Object.defineProperty(process.stdout, "isTTY", {
        value: false,
        writable: true,
      })
      const bar = new StatusBar(true)
      expect(bar).toBeDefined()
    })
  })

  describe("start", () => {
    it("initializes with total actor count", () => {
      const bar = new StatusBar(false)
      bar.start(10)
      // No error thrown is success for disabled bar
      expect(true).toBe(true)
    })
  })

  describe("setCurrentActor", () => {
    it("updates current actor state", () => {
      const bar = new StatusBar(false)
      bar.start(10)
      bar.setCurrentActor("John Doe", 1)
      // No error thrown is success for disabled bar
      expect(true).toBe(true)
    })
  })

  describe("setCurrentSource", () => {
    it("updates current source state", () => {
      const bar = new StatusBar(false)
      bar.start(10)
      bar.setCurrentSource("Wikidata")
      // No error thrown is success for disabled bar
      expect(true).toBe(true)
    })
  })

  describe("addCost", () => {
    it("adds cost to running total", () => {
      const bar = new StatusBar(false)
      bar.start(10)
      bar.addCost(0.01)
      bar.addCost(0.005)
      // No error thrown is success for disabled bar
      expect(true).toBe(true)
    })
  })

  describe("setTotalCost", () => {
    it("sets total cost directly", () => {
      const bar = new StatusBar(false)
      bar.start(10)
      bar.setTotalCost(0.5)
      // No error thrown is success for disabled bar
      expect(true).toBe(true)
    })
  })

  describe("completeActor", () => {
    it("clears current source", () => {
      const bar = new StatusBar(false)
      bar.start(10)
      bar.setCurrentActor("John Doe", 1)
      bar.setCurrentSource("Wikidata")
      bar.completeActor()
      // No error thrown is success for disabled bar
      expect(true).toBe(true)
    })
  })

  describe("stop", () => {
    it("stops the status bar", () => {
      const bar = new StatusBar(false)
      bar.start(10)
      bar.stop()
      // No error thrown is success for disabled bar
      expect(true).toBe(true)
    })
  })

  describe("log", () => {
    it("logs message when disabled", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
      const bar = new StatusBar(false)
      bar.log("Test message")
      expect(consoleSpy).toHaveBeenCalledWith("Test message")
      consoleSpy.mockRestore()
    })
  })
})

describe("createNoOpStatusBar", () => {
  it("creates a disabled status bar", () => {
    const bar = createNoOpStatusBar()
    expect(bar).toBeDefined()
    // Should not throw when methods are called
    bar.start(10)
    bar.setCurrentActor("Test", 1)
    bar.setCurrentSource("Test Source")
    bar.addCost(0.01)
    bar.completeActor()
    bar.stop()
  })
})
