import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import ActorDiagnosticTab from "./ActorDiagnosticTab"
import { AdminTestWrapper } from "../../../test/test-utils"

vi.mock("../../../services/api", () => ({
  adminApi: (path: string) => `/admin/api${path}`,
}))

vi.mock("../../../utils/formatDate", () => ({
  formatDate: (date: string) => date,
}))

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

const diagnosticData = {
  actor: {
    id: 2157,
    tmdbId: 4165,
    name: "John Wayne",
    deathday: "1979-06-11",
    popularity: 18.3,
  },
  idConflict: {
    hasConflict: false,
  },
  urls: {
    canonical: "/actor/john-wayne-2157",
    legacy: "/actor/john-wayne-4165",
  },
  cache: {
    profile: { cached: true, ttl: 7200 },
    death: { cached: false, ttl: null },
  },
  redirectStats: {
    last7Days: 42,
    last30Days: 185,
    topReferer: "https://www.google.com",
  },
}

describe("ActorDiagnosticTab", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <AdminTestWrapper>
          <ActorDiagnosticTab />
        </AdminTestWrapper>
      </QueryClientProvider>
    )
  }

  it("renders the search form with input and button", () => {
    renderComponent()

    expect(screen.getByLabelText(/enter actor id/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /lookup/i })).toBeInTheDocument()
  })

  it("lookup button is disabled when input is empty", () => {
    renderComponent()

    const button = screen.getByRole("button", { name: /lookup/i })
    expect(button).toBeDisabled()
  })

  it("lookup button is enabled when input has a value", async () => {
    const user = userEvent.setup()
    renderComponent()

    const input = screen.getByLabelText(/enter actor id/i)
    await user.type(input, "2157")

    const button = screen.getByRole("button", { name: /lookup/i })
    expect(button).toBeEnabled()
  })

  it("shows loading state when fetching", async () => {
    const user = userEvent.setup()
    mockFetch.mockImplementation(() => new Promise(() => {})) // Never resolves

    renderComponent()

    const input = screen.getByLabelText(/enter actor id/i)
    await user.type(input, "2157")
    await user.click(screen.getByRole("button", { name: /lookup/i }))

    await waitFor(() => {
      expect(screen.getByText("Loading actor diagnostic data...")).toBeInTheDocument()
    })
  })

  it("shows error message when actor not found", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
    })

    renderComponent()

    const input = screen.getByLabelText(/enter actor id/i)
    await user.type(input, "99999")
    await user.click(screen.getByRole("button", { name: /lookup/i }))

    await waitFor(() => {
      expect(screen.getByText("Actor not found")).toBeInTheDocument()
    })
  })

  it("shows generic error message for non-404 failures", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    })

    renderComponent()

    const input = screen.getByLabelText(/enter actor id/i)
    await user.type(input, "2157")
    await user.click(screen.getByRole("button", { name: /lookup/i }))

    await waitFor(() => {
      expect(screen.getByText("Failed to fetch diagnostic data")).toBeInTheDocument()
    })
  })

  it("displays actor information when data is loaded", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(diagnosticData),
    })

    renderComponent()

    const input = screen.getByLabelText(/enter actor id/i)
    await user.type(input, "2157")
    await user.click(screen.getByRole("button", { name: /lookup/i }))

    await waitFor(() => {
      expect(screen.getByText("Actor Information")).toBeInTheDocument()
      expect(screen.getByText("John Wayne")).toBeInTheDocument()
      expect(screen.getByText("2157")).toBeInTheDocument()
      expect(screen.getByText("4165")).toBeInTheDocument()
      expect(screen.getByText("18.3")).toBeInTheDocument()
    })
  })

  it("displays deceased status with formatted date", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(diagnosticData),
    })

    renderComponent()

    const input = screen.getByLabelText(/enter actor id/i)
    await user.type(input, "2157")
    await user.click(screen.getByRole("button", { name: /lookup/i }))

    await waitFor(() => {
      expect(screen.getByText(/deceased/i)).toBeInTheDocument()
      expect(screen.getByText(/1979-06-11/)).toBeInTheDocument()
    })
  })

  it("displays living status for actors without deathday", async () => {
    const user = userEvent.setup()
    const livingActorData = {
      ...diagnosticData,
      actor: { ...diagnosticData.actor, deathday: null },
    }
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(livingActorData),
    })

    renderComponent()

    const input = screen.getByLabelText(/enter actor id/i)
    await user.type(input, "2157")
    await user.click(screen.getByRole("button", { name: /lookup/i }))

    await waitFor(() => {
      expect(screen.getByText("Living")).toBeInTheDocument()
    })
  })

  it("displays no conflict message when IDs match", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(diagnosticData),
    })

    renderComponent()

    const input = screen.getByLabelText(/enter actor id/i)
    await user.type(input, "2157")
    await user.click(screen.getByRole("button", { name: /lookup/i }))

    await waitFor(() => {
      expect(screen.getByText(/no conflict/i)).toBeInTheDocument()
    })
  })

  it("displays ID conflict warning when conflict exists", async () => {
    const user = userEvent.setup()
    const conflictData = {
      ...diagnosticData,
      idConflict: {
        hasConflict: true,
        conflictingActor: {
          id: 9999,
          name: "Other Actor",
          popularity: 5.2,
        },
      },
    }
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(conflictData),
    })

    renderComponent()

    const input = screen.getByLabelText(/enter actor id/i)
    await user.type(input, "2157")
    await user.click(screen.getByRole("button", { name: /lookup/i }))

    await waitFor(() => {
      expect(screen.getByText(/conflict with actor #9999/i)).toBeInTheDocument()
      expect(screen.getByText(/Other Actor/)).toBeInTheDocument()
    })
  })

  it("displays URLs section with canonical and legacy URLs", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(diagnosticData),
    })

    renderComponent()

    const input = screen.getByLabelText(/enter actor id/i)
    await user.type(input, "2157")
    await user.click(screen.getByRole("button", { name: /lookup/i }))

    await waitFor(() => {
      expect(screen.getByText("URLs")).toBeInTheDocument()
      expect(screen.getByText("/actor/john-wayne-2157")).toBeInTheDocument()
      expect(screen.getByText("/actor/john-wayne-4165")).toBeInTheDocument()
    })
  })

  it("displays cache status section", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(diagnosticData),
    })

    renderComponent()

    const input = screen.getByLabelText(/enter actor id/i)
    await user.type(input, "2157")
    await user.click(screen.getByRole("button", { name: /lookup/i }))

    await waitFor(() => {
      expect(screen.getByText("Cache Status")).toBeInTheDocument()
      expect(screen.getByText("Profile Cache")).toBeInTheDocument()
      expect(screen.getByText("Death Cache")).toBeInTheDocument()
    })
  })

  it("displays cached status with TTL for cached entries", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(diagnosticData),
    })

    renderComponent()

    const input = screen.getByLabelText(/enter actor id/i)
    await user.type(input, "2157")
    await user.click(screen.getByRole("button", { name: /lookup/i }))

    await waitFor(() => {
      // Profile cache is cached with TTL 7200 => "2h 0m"
      expect(screen.getByText("TTL: 2h 0m")).toBeInTheDocument()
    })
  })

  it("displays not cached status for uncached entries", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(diagnosticData),
    })

    renderComponent()

    const input = screen.getByLabelText(/enter actor id/i)
    await user.type(input, "2157")
    await user.click(screen.getByRole("button", { name: /lookup/i }))

    await waitFor(() => {
      // Death cache is not cached
      expect(screen.getByText("Not cached")).toBeInTheDocument()
    })
  })

  it("displays redirect statistics", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(diagnosticData),
    })

    renderComponent()

    const input = screen.getByLabelText(/enter actor id/i)
    await user.type(input, "2157")
    await user.click(screen.getByRole("button", { name: /lookup/i }))

    await waitFor(() => {
      expect(screen.getByText("Recent Redirects")).toBeInTheDocument()
      expect(screen.getByText("Last 7 Days")).toBeInTheDocument()
      expect(screen.getByText("42")).toBeInTheDocument()
      expect(screen.getByText("Last 30 Days")).toBeInTheDocument()
      expect(screen.getByText("185")).toBeInTheDocument()
      expect(screen.getByText("Top Referer")).toBeInTheDocument()
      expect(screen.getByText("https://www.google.com")).toBeInTheDocument()
    })
  })

  it("displays N/A for top referer when none exists", async () => {
    const user = userEvent.setup()
    const noRefererData = {
      ...diagnosticData,
      redirectStats: {
        ...diagnosticData.redirectStats,
        topReferer: null,
      },
    }
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(noRefererData),
    })

    renderComponent()

    const input = screen.getByLabelText(/enter actor id/i)
    await user.type(input, "2157")
    await user.click(screen.getByRole("button", { name: /lookup/i }))

    await waitFor(() => {
      expect(screen.getByText("Top Referer")).toBeInTheDocument()
      // N/A for null topReferer (also N/A appears for null TMDB ID, but
      // in this case tmdbId is present so only one N/A expected for referer)
      const naElements = screen.getAllByText("N/A")
      expect(naElements.length).toBeGreaterThanOrEqual(1)
    })
  })

  it("fetches from the correct API endpoint", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(diagnosticData),
    })

    renderComponent()

    const input = screen.getByLabelText(/enter actor id/i)
    await user.type(input, "2157")
    await user.click(screen.getByRole("button", { name: /lookup/i }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/admin/api/actors/2157/diagnostic")
    })
  })

  it("resets search when input value changes after a search", async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(diagnosticData),
    })

    renderComponent()

    const input = screen.getByLabelText(/enter actor id/i)
    await user.type(input, "2157")
    await user.click(screen.getByRole("button", { name: /lookup/i }))

    await waitFor(() => {
      expect(screen.getByText("John Wayne")).toBeInTheDocument()
    })

    // Changing the input resets searchTriggered, so query is disabled
    await user.clear(input)
    await user.type(input, "999")

    // Results should disappear since searchTriggered was reset
    // and a new search hasn't been triggered yet
    await waitFor(() => {
      expect(screen.queryByText("John Wayne")).not.toBeInTheDocument()
    })
  })
})
