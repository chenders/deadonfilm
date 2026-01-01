import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import fs from "fs"
import path from "path"
import os from "os"
import { loadCheckpoint, saveCheckpoint, deleteCheckpoint } from "./checkpoint-utils.js"

// Suppress console output during tests
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

interface TestCheckpoint {
  items: number[]
  lastUpdated: string
}

describe("checkpoint-utils", () => {
  let testDir: string
  let testCheckpointFile: string

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "checkpoint-utils-test-"))
    testCheckpointFile = path.join(testDir, "test-checkpoint.json")
  })

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true })
    }
  })

  describe("loadCheckpoint", () => {
    it("returns null when checkpoint file does not exist", () => {
      const result = loadCheckpoint<TestCheckpoint>(testCheckpointFile)
      expect(result).toBeNull()
    })

    it("loads checkpoint from existing file", () => {
      const checkpoint: TestCheckpoint = {
        items: [1, 2, 3],
        lastUpdated: "2024-01-01T00:00:00.000Z",
      }
      fs.writeFileSync(testCheckpointFile, JSON.stringify(checkpoint))

      const result = loadCheckpoint<TestCheckpoint>(testCheckpointFile)
      expect(result).toEqual(checkpoint)
    })

    it("throws on invalid JSON", () => {
      fs.writeFileSync(testCheckpointFile, "invalid json")
      expect(() => loadCheckpoint<TestCheckpoint>(testCheckpointFile)).toThrow(SyntaxError)
    })

    it("throws on permission errors (directory instead of file)", () => {
      const dirAsFile = path.join(testDir, "dir-checkpoint.json")
      fs.mkdirSync(dirAsFile)
      expect(() => loadCheckpoint<TestCheckpoint>(dirAsFile)).toThrow()
    })

    it("returns null for deeply nested non-existent path", () => {
      // When the file doesn't exist, loadCheckpoint returns null
      // (This also covers the ENOENT error path if existsSync returns false)
      const result = loadCheckpoint<TestCheckpoint>(
        path.join(testDir, "nonexistent", "deeply", "nested.json")
      )
      expect(result).toBeNull()
    })
  })

  describe("saveCheckpoint", () => {
    it("saves checkpoint to file", () => {
      const checkpoint: TestCheckpoint = {
        items: [4, 5, 6],
        lastUpdated: "2024-01-01T00:00:00.000Z",
      }

      saveCheckpoint(testCheckpointFile, checkpoint)

      const saved = JSON.parse(fs.readFileSync(testCheckpointFile, "utf-8"))
      expect(saved.items).toEqual([4, 5, 6])
    })

    it("calls updateTimestamp callback before saving", () => {
      const checkpoint: TestCheckpoint = {
        items: [7, 8, 9],
        lastUpdated: "old-value",
      }

      saveCheckpoint(testCheckpointFile, checkpoint, (cp) => {
        cp.lastUpdated = "new-value"
      })

      const saved = JSON.parse(fs.readFileSync(testCheckpointFile, "utf-8"))
      expect(saved.lastUpdated).toBe("new-value")
    })

    it("logs error but does not throw on write failure", () => {
      // Try to write to a directory path (will fail)
      const invalidPath = path.join(testDir, "nonexistent-dir", "file.json")
      const checkpoint: TestCheckpoint = { items: [], lastUpdated: "" }

      // Should not throw
      expect(() => saveCheckpoint(invalidPath, checkpoint)).not.toThrow()
      expect(console.error).toHaveBeenCalled()
    })
  })

  describe("deleteCheckpoint", () => {
    it("deletes existing checkpoint file", () => {
      fs.writeFileSync(testCheckpointFile, "{}")
      expect(fs.existsSync(testCheckpointFile)).toBe(true)

      deleteCheckpoint(testCheckpointFile)
      expect(fs.existsSync(testCheckpointFile)).toBe(false)
    })

    it("does not throw when file does not exist", () => {
      expect(() => deleteCheckpoint(testCheckpointFile)).not.toThrow()
    })

    it("logs error but does not throw on permission error", () => {
      // Create a directory - can't unlink a directory
      const dirPath = path.join(testDir, "checkpoint-dir")
      fs.mkdirSync(dirPath)

      // Should not throw
      expect(() => deleteCheckpoint(dirPath)).not.toThrow()
      expect(console.error).toHaveBeenCalled()
    })
  })
})
