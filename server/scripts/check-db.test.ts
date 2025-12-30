import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock dotenv/config - must be before other imports
vi.mock("dotenv/config", () => ({}))

// Mock the database pool
const mockQuery = vi.fn()
const mockEnd = vi.fn()
vi.mock("../src/lib/db.js", () => ({
  getPool: () => ({
    query: mockQuery,
    end: mockEnd,
  }),
}))

// Capture console output
const consoleLogs: string[] = []
const originalLog = console.log
const originalTable = console.table

describe("check-db", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    consoleLogs.length = 0
    console.log = vi.fn((...args) => consoleLogs.push(args.join(" ")))
    console.table = vi.fn()
    // Prevent process.exit from actually exiting
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never)
  })

  afterEach(() => {
    console.log = originalLog
    console.table = originalTable
    vi.restoreAllMocks()
  })

  it("queries actor counts correctly", async () => {
    mockQuery.mockResolvedValue({ rows: [{ count: "100" }] })

    // Import and run the script
    await import("./check-db.js")

    // Wait for async operations
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Check that queries were made
    expect(mockQuery).toHaveBeenCalledWith("SELECT COUNT(*) as count FROM actors")
    expect(mockQuery).toHaveBeenCalledWith(
      "SELECT COUNT(*) as count FROM actors WHERE deathday IS NOT NULL"
    )
    expect(mockQuery).toHaveBeenCalledWith(
      "SELECT COUNT(*) as count FROM actors WHERE deathday IS NOT NULL AND is_obscure = true"
    )
  })

  it("handles query errors gracefully", async () => {
    mockQuery.mockRejectedValue(new Error("Connection failed"))

    // Reset modules to re-import
    vi.resetModules()
    vi.mock("dotenv/config", () => ({}))
    vi.mock("../src/lib/db.js", () => ({
      getPool: () => ({
        query: mockQuery,
        end: mockEnd,
      }),
    }))

    await import("./check-db.js")
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Should have logged errors
    expect(consoleLogs.some((log) => log.includes("ERROR"))).toBe(true)
  })

  it("handles empty result rows", async () => {
    mockQuery.mockResolvedValue({ rows: [] })

    vi.resetModules()
    vi.mock("dotenv/config", () => ({}))
    vi.mock("../src/lib/db.js", () => ({
      getPool: () => ({
        query: mockQuery,
        end: mockEnd,
      }),
    }))

    await import("./check-db.js")
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Should handle empty rows (count defaults to 0)
    expect(consoleLogs.some((log) => log.includes(": 0"))).toBe(true)
  })

  it("calls db.end() to close the connection", async () => {
    mockQuery.mockResolvedValue({ rows: [{ count: "50" }] })

    vi.resetModules()
    vi.mock("dotenv/config", () => ({}))
    vi.mock("../src/lib/db.js", () => ({
      getPool: () => ({
        query: mockQuery,
        end: mockEnd,
      }),
    }))

    await import("./check-db.js")
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(mockEnd).toHaveBeenCalled()
  })

  it("queries sync_state table", async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          sync_type: "person_changes",
          last_sync_date: "2024-01-01",
          last_run_at: new Date(),
          items_processed: 100,
        },
      ],
    })

    vi.resetModules()
    vi.mock("dotenv/config", () => ({}))
    vi.mock("../src/lib/db.js", () => ({
      getPool: () => ({
        query: mockQuery,
        end: mockEnd,
      }),
    }))

    await import("./check-db.js")
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(mockQuery).toHaveBeenCalledWith(
      "SELECT sync_type, last_sync_date, last_run_at, items_processed FROM sync_state ORDER BY sync_type"
    )
  })
})
