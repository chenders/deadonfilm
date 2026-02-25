/**
 * Tests for RunLogsSection component.
 * Covers: happy path, empty state, loading state, error state,
 * level filtering, pagination controls, log entry rendering.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { RunLogsSection } from "./RunLogsSection"
import * as enrichmentRunsHooks from "../../hooks/admin/useEnrichmentRuns"

vi.mock("../../hooks/admin/useEnrichmentRuns", async () => {
  const actual = await vi.importActual("../../hooks/admin/useEnrichmentRuns")
  return {
    ...actual,
    useRunLogs: vi.fn(),
  }
})

const mockLogs: enrichmentRunsHooks.RunLogEntry[] = [
  {
    id: 1,
    timestamp: "2026-02-24T12:00:00.000Z",
    level: "info",
    message: "Starting enrichment run",
    data: null,
    source: null,
  },
  {
    id: 2,
    timestamp: "2026-02-24T12:00:05.000Z",
    level: "warn",
    message: "Rate limited",
    data: { retryAfter: 1000 },
    source: "wikipedia",
  },
  {
    id: 3,
    timestamp: "2026-02-24T12:00:10.000Z",
    level: "error",
    message: "Source failed",
    data: { error: "timeout" },
    source: "imdb",
  },
]

function mockUseRunLogs(overrides: Record<string, unknown> = {}) {
  ;(enrichmentRunsHooks.useRunLogs as Mock).mockReturnValue({
    data: {
      logs: mockLogs,
      pagination: { page: 1, pageSize: 50, total: 3, totalPages: 1 },
    },
    isLoading: false,
    error: null,
    ...overrides,
  })
}

describe("RunLogsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders log entries with timestamps, levels, and messages", () => {
    mockUseRunLogs()
    render(
      <MemoryRouter>
        <RunLogsSection runType="death" runId={1} />
      </MemoryRouter>
    )

    expect(screen.getByText("Run Logs")).toBeInTheDocument()
    expect(screen.getByText("Starting enrichment run")).toBeInTheDocument()
    expect(screen.getByText("Rate limited")).toBeInTheDocument()
    expect(screen.getByText("Source failed")).toBeInTheDocument()
  })

  it("renders level badges for all log entries", () => {
    mockUseRunLogs()
    render(
      <MemoryRouter>
        <RunLogsSection runType="death" runId={1} />
      </MemoryRouter>
    )

    const badges = screen.getAllByText(/^(info|warn|error)$/)
    expect(badges).toHaveLength(3)

    // Verify all three levels are represented
    const levelTexts = badges.map((el) => el.textContent)
    expect(levelTexts).toContain("info")
    expect(levelTexts).toContain("warn")
    expect(levelTexts).toContain("error")
  })

  it("renders source badges when present", () => {
    mockUseRunLogs()
    render(
      <MemoryRouter>
        <RunLogsSection runType="death" runId={1} />
      </MemoryRouter>
    )

    expect(screen.getByText("[wikipedia]")).toBeInTheDocument()
    expect(screen.getByText("[imdb]")).toBeInTheDocument()
  })

  it("renders JSON data for entries with data", () => {
    mockUseRunLogs()
    render(
      <MemoryRouter>
        <RunLogsSection runType="death" runId={1} />
      </MemoryRouter>
    )

    expect(screen.getByText(/"retryAfter": 1000/)).toBeInTheDocument()
    expect(screen.getByText(/"error": "timeout"/)).toBeInTheDocument()
  })

  it("shows empty state when no logs", () => {
    mockUseRunLogs({
      data: { logs: [], pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 } },
    })
    render(
      <MemoryRouter>
        <RunLogsSection runType="death" runId={1} />
      </MemoryRouter>
    )

    expect(
      screen.getByText("No run logs found. Run logs will appear here for new enrichment runs.")
    ).toBeInTheDocument()
  })

  it("shows empty state when data is null", () => {
    mockUseRunLogs({ data: null })
    render(
      <MemoryRouter>
        <RunLogsSection runType="death" runId={1} />
      </MemoryRouter>
    )

    expect(
      screen.getByText("No run logs found. Run logs will appear here for new enrichment runs.")
    ).toBeInTheDocument()
  })

  it("shows loading state", () => {
    mockUseRunLogs({ isLoading: true, data: null })
    render(
      <MemoryRouter>
        <RunLogsSection runType="death" runId={1} />
      </MemoryRouter>
    )

    expect(screen.getByText("Loading logs...")).toBeInTheDocument()
  })

  it("shows error state when query fails", () => {
    mockUseRunLogs({ error: new Error("Network error"), data: null })
    render(
      <MemoryRouter>
        <RunLogsSection runType="death" runId={1} />
      </MemoryRouter>
    )

    expect(screen.getByText("Failed to load run logs")).toBeInTheDocument()
  })

  describe("level filtering", () => {
    it("renders level filter dropdown", () => {
      mockUseRunLogs()
      render(
        <MemoryRouter>
          <RunLogsSection runType="death" runId={1} />
        </MemoryRouter>
      )

      const select = screen.getByLabelText("Filter logs by level")
      expect(select).toBeInTheDocument()
      expect(select).toHaveValue("")
    })

    it("calls useRunLogs with selected level when filter changes", () => {
      mockUseRunLogs()
      render(
        <MemoryRouter>
          <RunLogsSection runType="death" runId={1} />
        </MemoryRouter>
      )

      const select = screen.getByLabelText("Filter logs by level")
      fireEvent.change(select, { target: { value: "error" } })

      // After changing filter, hook should be called with new level
      expect(enrichmentRunsHooks.useRunLogs).toHaveBeenLastCalledWith(
        "death",
        1,
        1, // page resets to 1
        50,
        "error"
      )
    })

    it("resets page to 1 when filter changes", () => {
      mockUseRunLogs()
      render(
        <MemoryRouter>
          <RunLogsSection runType="death" runId={1} />
        </MemoryRouter>
      )

      const select = screen.getByLabelText("Filter logs by level")
      fireEvent.change(select, { target: { value: "warn" } })

      // Page param should be 1 (reset)
      expect(enrichmentRunsHooks.useRunLogs).toHaveBeenLastCalledWith("death", 1, 1, 50, "warn")
    })
  })

  describe("pagination", () => {
    it("does not render pagination when only one page", () => {
      mockUseRunLogs()
      render(
        <MemoryRouter>
          <RunLogsSection runType="death" runId={1} />
        </MemoryRouter>
      )

      expect(screen.queryByLabelText("Go to previous page")).not.toBeInTheDocument()
      expect(screen.queryByLabelText("Go to next page")).not.toBeInTheDocument()
    })

    it("renders pagination controls when multiple pages", () => {
      mockUseRunLogs({
        data: {
          logs: mockLogs,
          pagination: { page: 1, pageSize: 50, total: 120, totalPages: 3 },
        },
      })
      render(
        <MemoryRouter>
          <RunLogsSection runType="death" runId={1} />
        </MemoryRouter>
      )

      expect(screen.getByText("Page 1 of 3 (120 total)")).toBeInTheDocument()
      expect(screen.getByLabelText("Go to previous page")).toBeDisabled()
      expect(screen.getByLabelText("Go to next page")).not.toBeDisabled()
    })

    it("disables next button on last page", () => {
      mockUseRunLogs({
        data: {
          logs: mockLogs,
          pagination: { page: 1, pageSize: 50, total: 100, totalPages: 2 },
        },
      })
      render(
        <MemoryRouter>
          <RunLogsSection runType="death" runId={1} />
        </MemoryRouter>
      )

      // Internal state starts at page 1; click next to reach page 2 (last page)
      fireEvent.click(screen.getByLabelText("Go to next page"))

      // Now page=2, totalPages=2 → next should be disabled
      expect(screen.getByLabelText("Go to next page")).toBeDisabled()
      expect(screen.getByLabelText("Go to previous page")).not.toBeDisabled()
    })

    it("advances page when next button clicked", () => {
      mockUseRunLogs({
        data: {
          logs: mockLogs,
          pagination: { page: 1, pageSize: 50, total: 120, totalPages: 3 },
        },
      })
      render(
        <MemoryRouter>
          <RunLogsSection runType="death" runId={1} />
        </MemoryRouter>
      )

      fireEvent.click(screen.getByLabelText("Go to next page"))

      expect(enrichmentRunsHooks.useRunLogs).toHaveBeenLastCalledWith(
        "death",
        1,
        2, // page 2
        50,
        undefined
      )
    })
  })
})
