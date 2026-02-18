import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { BrowserRouter } from "react-router-dom"
import DeathDetailsContent from "./DeathDetailsContent"
import type { DeathDetailsResponse } from "@/types"

const mockUseActorDeathDetails = vi.fn()

vi.mock("@/hooks/useDeathDetails", () => ({
  useActorDeathDetails: (...args: unknown[]) => mockUseActorDeathDetails(...args),
}))

function renderWithRouter(ui: React.ReactElement) {
  return render(
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {ui}
    </BrowserRouter>
  )
}

const fullData: DeathDetailsResponse = {
  actor: {
    id: 2157,
    tmdbId: 4165,
    name: "John Wayne",
    birthday: "1907-05-26",
    deathday: "1979-06-11",
    profilePath: "/test.jpg",
    causeOfDeath: "stomach cancer",
    causeOfDeathDetails: "Wayne died on June 11, 1979.",
    ageAtDeath: 72,
    yearsLost: 4.2,
    deathManner: "natural",
    deathCategories: ["cancer"],
    strangeDeath: false,
  },
  circumstances: {
    official: "John Wayne died of stomach cancer at UCLA Medical Center.",
    confidence: "high",
    rumored: "Some accounts suggest complications from prior surgery.",
    locationOfDeath: "Los Angeles, California",
    notableFactors: ["on_set_exposure", "agent_orange"],
    additionalContext: "Wayne had been battling cancer for years.",
  },
  career: {
    statusAtDeath: "semi-retired",
    lastProject: {
      title: "The Shootist",
      year: 1976,
      tmdb_id: 11575,
      imdb_id: "tt0075213",
      type: "movie" as const,
    },
    posthumousReleases: [
      {
        title: "The Big Trail",
        year: 1980,
        tmdb_id: null,
        imdb_id: null,
        type: "documentary" as const,
      },
    ],
  },
  relatedCelebrities: [
    {
      name: "Maureen O'Hara",
      tmdbId: 30614,
      relationship: "Frequent co-star",
      slug: "maureen-ohara-30614",
    },
  ],
  sources: {
    cause: [{ url: "https://example.com/obit", archiveUrl: null, description: "Obituary" }],
    circumstances: [
      { url: "https://example.com/details", archiveUrl: null, description: "Medical records" },
    ],
    rumored: [
      { url: "https://example.com/rumor", archiveUrl: null, description: "Alternative source" },
    ],
    additionalContext: null,
    careerStatus: null,
    lastProject: null,
    posthumousReleases: null,
    locationOfDeath: null,
    relatedCelebrities: null,
  },
}

describe("DeathDetailsContent", () => {
  it("shows loading skeleton while fetching", () => {
    mockUseActorDeathDetails.mockReturnValue({ data: undefined, isLoading: true, error: null })
    renderWithRouter(<DeathDetailsContent slug="john-wayne-2157" />)
    expect(screen.getByTestId("death-details-loading")).toBeInTheDocument()
  })

  it("shows error message on failure", () => {
    mockUseActorDeathDetails.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Failed"),
    })
    renderWithRouter(<DeathDetailsContent slug="john-wayne-2157" />)
    expect(screen.getByTestId("death-details-error")).toBeInTheDocument()
  })

  it("renders all sections with full data", () => {
    mockUseActorDeathDetails.mockReturnValue({ data: fullData, isLoading: false, error: null })
    renderWithRouter(<DeathDetailsContent slug="john-wayne-2157" />)

    expect(screen.getByTestId("death-details-content")).toBeInTheDocument()

    // What We Know
    expect(screen.getByTestId("official-section")).toBeInTheDocument()
    expect(screen.getByText(/stomach cancer at UCLA/)).toBeInTheDocument()
    expect(screen.getByText("What We Know")).toBeInTheDocument()

    // Alternative Accounts
    expect(screen.getByTestId("rumored-section")).toBeInTheDocument()
    expect(screen.getByText(/complications from prior surgery/)).toBeInTheDocument()

    // Additional Context
    expect(screen.getByTestId("context-section")).toBeInTheDocument()
    expect(screen.getByText(/battling cancer for years/)).toBeInTheDocument()

    // Career Context and Related People are now rendered on ActorPage
    expect(screen.queryByTestId("career-section")).not.toBeInTheDocument()
    expect(screen.queryByTestId("related-section")).not.toBeInTheDocument()

    // Sources
    expect(screen.getByTestId("sources-section")).toBeInTheDocument()
  })

  it("renders with partial data (no rumored, no career, no related)", () => {
    const partialData: DeathDetailsResponse = {
      ...fullData,
      circumstances: {
        ...fullData.circumstances,
        rumored: null,
        additionalContext: null,
        notableFactors: null,
      },
      career: {
        statusAtDeath: null,
        lastProject: null,
        posthumousReleases: null,
      },
      relatedCelebrities: [],
      sources: {
        ...fullData.sources,
        rumored: null,
      },
    }
    mockUseActorDeathDetails.mockReturnValue({ data: partialData, isLoading: false, error: null })
    renderWithRouter(<DeathDetailsContent slug="john-wayne-2157" />)

    // Should still show official section
    expect(screen.getByTestId("official-section")).toBeInTheDocument()

    // Should NOT show optional sections
    expect(screen.queryByTestId("rumored-section")).not.toBeInTheDocument()
    expect(screen.queryByTestId("context-section")).not.toBeInTheDocument()
  })

  it("renders with empty data (no circumstances)", () => {
    const emptyData: DeathDetailsResponse = {
      ...fullData,
      circumstances: {
        official: null,
        confidence: null,
        rumored: null,
        locationOfDeath: null,
        notableFactors: null,
        additionalContext: null,
      },
      career: { statusAtDeath: null, lastProject: null, posthumousReleases: null },
      relatedCelebrities: [],
      sources: {
        cause: null,
        circumstances: null,
        rumored: null,
        additionalContext: null,
        careerStatus: null,
        lastProject: null,
        posthumousReleases: null,
        locationOfDeath: null,
        relatedCelebrities: null,
      },
    }
    mockUseActorDeathDetails.mockReturnValue({ data: emptyData, isLoading: false, error: null })
    renderWithRouter(<DeathDetailsContent slug="john-wayne-2157" />)

    // Container renders but no sections
    expect(screen.getByTestId("death-details-content")).toBeInTheDocument()
    expect(screen.queryByTestId("official-section")).not.toBeInTheDocument()
    expect(screen.queryByTestId("rumored-section")).not.toBeInTheDocument()
    expect(screen.queryByTestId("sources-section")).not.toBeInTheDocument()
  })

  it("shows low confidence warning for disputed data", () => {
    const disputedData: DeathDetailsResponse = {
      ...fullData,
      circumstances: {
        ...fullData.circumstances,
        confidence: "disputed",
      },
    }
    mockUseActorDeathDetails.mockReturnValue({
      data: disputedData,
      isLoading: false,
      error: null,
    })
    renderWithRouter(<DeathDetailsContent slug="john-wayne-2157" />)
    expect(screen.getByTestId("low-confidence-warning")).toBeInTheDocument()
  })

  // Tests for new props: data and hideOfficialHeading

  it("uses pre-fetched data and skips internal fetch", () => {
    // When data prop is provided, useActorDeathDetails should be called with ""
    mockUseActorDeathDetails.mockReturnValue({ data: undefined, isLoading: false, error: null })
    renderWithRouter(<DeathDetailsContent slug="john-wayne-2157" data={fullData} />)

    // Should render content from the provided data
    expect(screen.getByTestId("death-details-content")).toBeInTheDocument()
    expect(screen.getByText(/stomach cancer at UCLA/)).toBeInTheDocument()

    // Hook was called with empty string (disabled)
    expect(mockUseActorDeathDetails).toHaveBeenCalledWith("")
  })

  it("does not show loading/error states when data prop is provided", () => {
    // Even if hook returns loading, pre-fetched data takes precedence
    mockUseActorDeathDetails.mockReturnValue({ data: undefined, isLoading: true, error: null })
    renderWithRouter(<DeathDetailsContent slug="john-wayne-2157" data={fullData} />)

    expect(screen.queryByTestId("death-details-loading")).not.toBeInTheDocument()
    expect(screen.getByTestId("death-details-content")).toBeInTheDocument()
  })

  it("hides What We Know heading when hideOfficialHeading is true", () => {
    mockUseActorDeathDetails.mockReturnValue({ data: fullData, isLoading: false, error: null })
    renderWithRouter(<DeathDetailsContent slug="john-wayne-2157" hideOfficialHeading />)

    expect(screen.getByTestId("official-section")).toBeInTheDocument()
    expect(screen.queryByText("What We Know")).not.toBeInTheDocument()
  })

  it("shows What We Know heading when hideOfficialHeading is false", () => {
    mockUseActorDeathDetails.mockReturnValue({ data: fullData, isLoading: false, error: null })
    renderWithRouter(<DeathDetailsContent slug="john-wayne-2157" />)

    expect(screen.getByText("What We Know")).toBeInTheDocument()
  })
})
