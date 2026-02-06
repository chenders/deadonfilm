/**
 * Tests for SitemapTab
 *
 * Verifies sitemap status display, regenerate/submit mutations,
 * error handling, success messages, and migration impact warning.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import SitemapTab from "./SitemapTab"

const mockSitemapStatus = {
  lastGenerated: "2024-06-15T10:30:00Z",
  actorUrls: 5000,
  movieUrls: 3000,
  showUrls: 500,
  totalUrls: 8500,
  changedSinceLastGeneration: 0,
  searchEngineSubmissions: {
    google: { lastSubmitted: null, status: "not_submitted" },
    bing: { lastSubmitted: null, status: "not_submitted" },
  },
}

let mockFetch: ReturnType<typeof vi.fn>

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SitemapTab />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe("SitemapTab", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSitemapStatus),
    })
    vi.stubGlobal("fetch", mockFetch)
  })

  describe("Loading state", () => {
    it("shows loading message while fetching status", () => {
      // Make fetch hang to keep loading state
      mockFetch.mockReturnValue(new Promise(() => {}))
      renderTab()
      expect(screen.getByText(/loading sitemap status/i)).toBeInTheDocument()
    })
  })

  describe("Status display", () => {
    it("renders sitemap status heading", async () => {
      renderTab()
      await waitFor(() => {
        expect(screen.getByText("Sitemap Status")).toBeInTheDocument()
      })
    })

    it("displays total URLs", async () => {
      renderTab()
      await waitFor(() => {
        expect(screen.getByText("8,500")).toBeInTheDocument()
      })
    })

    it("displays actor URLs", async () => {
      renderTab()
      await waitFor(() => {
        expect(screen.getByText("5,000")).toBeInTheDocument()
      })
    })

    it("displays movie URLs", async () => {
      renderTab()
      await waitFor(() => {
        expect(screen.getByText("3,000")).toBeInTheDocument()
      })
    })

    it("displays show URLs", async () => {
      renderTab()
      await waitFor(() => {
        expect(screen.getByText("500")).toBeInTheDocument()
      })
    })

    it("displays changed URLs count", async () => {
      renderTab()
      await waitFor(() => {
        expect(screen.getByText("0")).toBeInTheDocument()
      })
    })

    it("shows 'Never' when lastGenerated is null", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ...mockSitemapStatus, lastGenerated: null }),
      })
      renderTab()
      await waitFor(() => {
        expect(screen.getByText("Never")).toBeInTheDocument()
      })
    })
  })

  describe("Regenerate sitemap", () => {
    it("renders regenerate button", async () => {
      renderTab()
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /regenerate sitemap/i })).toBeInTheDocument()
      })
    })

    it("calls regenerate API when button is clicked", async () => {
      renderTab()
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /regenerate sitemap/i })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole("button", { name: /regenerate sitemap/i }))

      await waitFor(() => {
        const calls = mockFetch.mock.calls
        const regenerateCall = calls.find(
          (call: string[]) => typeof call[0] === "string" && call[0].includes("/sitemap/regenerate")
        )
        expect(regenerateCall).toBeTruthy()
        expect(regenerateCall![1]).toEqual({ method: "POST" })
      })
    })

    it("shows success message after successful regeneration", async () => {
      renderTab()
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /regenerate sitemap/i })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole("button", { name: /regenerate sitemap/i }))

      await waitFor(() => {
        expect(screen.getByText(/sitemap regenerated successfully/i)).toBeInTheDocument()
      })
    })

    it("shows error message when regeneration fails", async () => {
      // First call succeeds (status), subsequent POST fails
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSitemapStatus),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ error: "Failed" }),
        })

      renderTab()
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /regenerate sitemap/i })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole("button", { name: /regenerate sitemap/i }))

      await waitFor(() => {
        expect(screen.getByText(/error regenerating sitemap/i)).toBeInTheDocument()
      })
    })
  })

  describe("Search engine submissions", () => {
    it("renders search engine submissions section", async () => {
      renderTab()
      await waitFor(() => {
        expect(screen.getByText("Search Engine Submissions")).toBeInTheDocument()
      })
    })

    it("shows Google and Bing sections", async () => {
      renderTab()
      await waitFor(() => {
        expect(screen.getByText("Google")).toBeInTheDocument()
        expect(screen.getByText("Bing")).toBeInTheDocument()
      })
    })

    it("shows 'Not submitted' when engines have never been submitted to", async () => {
      renderTab()
      await waitFor(() => {
        const notSubmitted = screen.getAllByText("Not submitted")
        expect(notSubmitted).toHaveLength(2)
      })
    })

    it("renders submit to search engines button", async () => {
      renderTab()
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /submit to search engines/i })
        ).toBeInTheDocument()
      })
    })

    it("calls submit API when button is clicked", async () => {
      renderTab()
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /submit to search engines/i })
        ).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole("button", { name: /submit to search engines/i }))

      await waitFor(() => {
        const calls = mockFetch.mock.calls
        const submitCall = calls.find(
          (call: string[]) => typeof call[0] === "string" && call[0].includes("/sitemap/submit")
        )
        expect(submitCall).toBeTruthy()
        expect(submitCall![1]).toEqual({ method: "POST" })
      })
    })

    it("shows success message after successful submission", async () => {
      renderTab()
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /submit to search engines/i })
        ).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole("button", { name: /submit to search engines/i }))

      await waitFor(() => {
        expect(
          screen.getByText(/sitemap submitted to search engines successfully/i)
        ).toBeInTheDocument()
      })
    })

    it("shows error message when submission fails", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSitemapStatus),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ error: "Failed" }),
        })

      renderTab()
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /submit to search engines/i })
        ).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole("button", { name: /submit to search engines/i }))

      await waitFor(() => {
        expect(screen.getByText(/error submitting sitemap/i)).toBeInTheDocument()
      })
    })

    it("shows recent submission status for Google", async () => {
      const recentDate = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // 2 hours ago
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ...mockSitemapStatus,
            searchEngineSubmissions: {
              google: { lastSubmitted: recentDate, status: "submitted" },
              bing: { lastSubmitted: null, status: "not_submitted" },
            },
          }),
      })

      renderTab()
      await waitFor(() => {
        expect(screen.getByText(/submitted recently/i)).toBeInTheDocument()
      })
    })
  })

  describe("Migration impact warning", () => {
    it("does not show migration warning when changedSinceLastGeneration is 0", async () => {
      renderTab()
      await waitFor(() => {
        expect(screen.getByText("Sitemap Status")).toBeInTheDocument()
      })
      expect(screen.queryByText(/migration impact/i)).not.toBeInTheDocument()
    })

    it("shows migration warning when changedSinceLastGeneration > 0", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ...mockSitemapStatus,
            changedSinceLastGeneration: 1250,
          }),
      })

      renderTab()
      await waitFor(() => {
        expect(screen.getByText("Migration Impact")).toBeInTheDocument()
      })
      expect(screen.getByText(/1,250 URLs have changed/i)).toBeInTheDocument()
    })
  })
})
