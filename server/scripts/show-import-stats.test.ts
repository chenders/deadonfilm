import { describe, it, expect } from "vitest"
import { InvalidArgumentError } from "commander"
import {
  parseFormat,
  formatTableOutput,
  PHASE_THRESHOLDS,
  type OutputFormat,
} from "./show-import-stats.js"

describe("parseFormat", () => {
  it("parses valid format values", () => {
    expect(parseFormat("table")).toBe("table")
    expect(parseFormat("json")).toBe("json")
  })

  it("throws InvalidArgumentError for invalid format values", () => {
    expect(() => parseFormat("invalid")).toThrow(InvalidArgumentError)
    expect(() => parseFormat("invalid")).toThrow("Format must be: table or json")
    expect(() => parseFormat("")).toThrow(InvalidArgumentError)
    expect(() => parseFormat("TABLE")).toThrow(InvalidArgumentError)
    expect(() => parseFormat("JSON")).toThrow(InvalidArgumentError)
  })
})

describe("PHASE_THRESHOLDS", () => {
  it("has correct thresholds for popular phase", () => {
    expect(PHASE_THRESHOLDS.popular.min).toBe(50)
    expect(PHASE_THRESHOLDS.popular.max).toBe(Infinity)
  })

  it("has correct thresholds for standard phase", () => {
    expect(PHASE_THRESHOLDS.standard.min).toBe(10)
    expect(PHASE_THRESHOLDS.standard.max).toBe(50)
  })

  it("has correct thresholds for obscure phase", () => {
    expect(PHASE_THRESHOLDS.obscure.min).toBe(0)
    expect(PHASE_THRESHOLDS.obscure.max).toBe(10)
  })

  it("has non-overlapping ranges", () => {
    expect(PHASE_THRESHOLDS.standard.min).toBe(PHASE_THRESHOLDS.obscure.max)
    expect(PHASE_THRESHOLDS.popular.min).toBe(PHASE_THRESHOLDS.standard.max)
  })
})

describe("formatTableOutput", () => {
  const baseData = {
    overview: {
      total_shows: 1234,
      total_cast: 45678,
      total_deceased: 2345,
      avg_cast: 37,
      avg_deceased: 2,
    },
    actors: {
      unique_actors: 12345,
      deceased_actors: 2345,
    },
    quality: {
      zero_cast: 3,
      missing_mortality: 12,
      missing_age: 45,
      orphaned_appearances: 0,
    },
    lastImport: null,
  }

  it("includes overview section", () => {
    const output = formatTableOutput(baseData)

    expect(output).toContain("TV Show Import Statistics")
    expect(output).toContain("Overview")
    expect(output).toContain("Total shows:")
    expect(output).toContain("1,234")
    expect(output).toContain("Total actor appearances:")
    expect(output).toContain("45,678")
    expect(output).toContain("Unique actors:")
    expect(output).toContain("12,345")
    expect(output).toContain("Deceased actors:")
    expect(output).toContain("2,345")
  })

  it("includes data quality section", () => {
    const output = formatTableOutput(baseData)

    expect(output).toContain("Data Quality")
    expect(output).toContain("Shows with zero cast:")
    expect(output).toContain("3")
    expect(output).toContain("Shows missing mortality:")
    expect(output).toContain("12")
    expect(output).toContain("Appearances missing age:")
    expect(output).toContain("45")
    expect(output).toContain("Orphaned appearances:")
    expect(output).toContain("0")
  })

  it("shows 'No import checkpoint found' when lastImport is null", () => {
    const output = formatTableOutput(baseData)

    expect(output).toContain("Last Import")
    expect(output).toContain("No import checkpoint found")
  })

  it("shows import details when lastImport is provided", () => {
    const dataWithImport = {
      ...baseData,
      lastImport: {
        sync_type: "show_import",
        last_sync_date: "2025-12-22",
        last_run_at: new Date("2025-12-22T10:30:00Z"),
        items_processed: 234,
        new_deaths_found: 0,
        movies_updated: 0,
        errors_count: 5,
        current_phase: "popular",
        last_processed_id: 12345,
        phase_total: 500,
        phase_completed: 234,
      },
    }

    const output = formatTableOutput(dataWithImport)

    expect(output).toContain("Phase: popular")
    expect(output).toContain("Progress: 234/500")
    expect(output).toContain("47%")
    expect(output).toContain("Last ID: 12345")
    expect(output).toContain("Items Processed: 234")
    expect(output).toContain("Errors: 5")
  })

  it("includes phase breakdown when phases provided", () => {
    const dataWithPhases = {
      ...baseData,
      phases: [
        { phase: "popular", count: 456, avg_cast: 89, avg_deceased: 8, avg_curse_score: 0.12 },
        { phase: "standard", count: 567, avg_cast: 45, avg_deceased: 4, avg_curse_score: 0.08 },
        { phase: "obscure", count: 211, avg_cast: 23, avg_deceased: 2, avg_curse_score: 0.05 },
      ],
    }

    const output = formatTableOutput(dataWithPhases)

    expect(output).toContain("By Popularity Phase")
    expect(output).toContain("popular")
    expect(output).toContain("456")
    expect(output).toContain("standard")
    expect(output).toContain("567")
    expect(output).toContain("obscure")
    expect(output).toContain("211")
  })

  it("handles null curse score in phases", () => {
    const dataWithNullScore = {
      ...baseData,
      phases: [
        { phase: "popular", count: 10, avg_cast: 50, avg_deceased: 5, avg_curse_score: null },
      ],
    }

    const output = formatTableOutput(dataWithNullScore)

    expect(output).toContain("N/A")
  })

  it("includes year breakdown when years provided", () => {
    const dataWithYears = {
      ...baseData,
      years: [
        { year: 2024, count: 100, avg_cast: 50, avg_deceased: 3 },
        { year: 2023, count: 150, avg_cast: 48, avg_deceased: 4 },
      ],
    }

    const output = formatTableOutput(dataWithYears)

    expect(output).toContain("By Year")
    expect(output).toContain("2024")
    expect(output).toContain("2023")
    expect(output).toContain("100")
    expect(output).toContain("150")
  })

  it("includes status breakdown when statuses provided", () => {
    const dataWithStatuses = {
      ...baseData,
      statuses: [
        { status: "Ended", count: 800, avg_cast: 40, avg_deceased: 3 },
        { status: "Returning Series", count: 300, avg_cast: 35, avg_deceased: 1 },
        { status: "Canceled", count: 134, avg_cast: 25, avg_deceased: 2 },
      ],
    }

    const output = formatTableOutput(dataWithStatuses)

    expect(output).toContain("By Status")
    expect(output).toContain("Ended")
    expect(output).toContain("800")
    expect(output).toContain("Returning Series")
    expect(output).toContain("300")
    expect(output).toContain("Canceled")
    expect(output).toContain("134")
  })

  it("omits sections when data not provided", () => {
    const minimalData = {
      overview: baseData.overview,
      actors: baseData.actors,
      quality: baseData.quality,
      lastImport: null,
    }

    const output = formatTableOutput(minimalData)

    // Should have overview and quality but not phases/years/statuses
    expect(output).toContain("Overview")
    expect(output).toContain("Data Quality")
    expect(output).not.toContain("By Popularity Phase")
    expect(output).not.toContain("By Year")
    expect(output).not.toContain("By Status")
  })

  it("formats numbers with locale separators", () => {
    const output = formatTableOutput(baseData)

    // 45678 should be formatted as 45,678
    expect(output).toContain("45,678")
    // 12345 should be formatted as 12,345
    expect(output).toContain("12,345")
  })
})
