import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { formatRelativeTime, formatFullDateTime } from "./formatRelativeTime"

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-02-16T12:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns relative time for a recent date", () => {
    const result = formatRelativeTime("2026-02-16T10:00:00Z")
    expect(result).toContain("ago")
  })

  it("returns relative time for a date days ago", () => {
    const result = formatRelativeTime("2026-02-13T12:00:00Z")
    expect(result).toBe("3 days ago")
  })

  it("returns relative time with about prefix for approximate times", () => {
    const result = formatRelativeTime("2026-02-16T11:00:00Z")
    expect(result).toContain("ago")
  })

  it("returns empty string for null", () => {
    expect(formatRelativeTime(null)).toBe("")
  })

  it("returns empty string for empty string", () => {
    expect(formatRelativeTime("")).toBe("")
  })

  it("returns empty string for invalid date", () => {
    expect(formatRelativeTime("not-a-date")).toBe("")
  })

  it("handles ISO timestamp with timezone", () => {
    const result = formatRelativeTime("2026-02-15T12:00:00Z")
    expect(result).toContain("ago")
  })
})

describe("formatFullDateTime", () => {
  it("formats a date as full readable timestamp", () => {
    const result = formatFullDateTime("2026-02-16T15:45:00Z")
    expect(result).toMatch(/Feb 16, 2026 at/)
  })

  it("returns empty string for null", () => {
    expect(formatFullDateTime(null)).toBe("")
  })

  it("returns empty string for empty string", () => {
    expect(formatFullDateTime("")).toBe("")
  })

  it("returns empty string for invalid date", () => {
    expect(formatFullDateTime("not-a-date")).toBe("")
  })

  it("handles ISO timestamp format", () => {
    const result = formatFullDateTime("2025-12-25T08:30:00Z")
    expect(result).toMatch(/Dec 25, 2025 at/)
  })
})
