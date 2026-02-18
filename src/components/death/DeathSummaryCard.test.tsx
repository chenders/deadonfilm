import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { BrowserRouter } from "react-router-dom"
import DeathSummaryCard from "./DeathSummaryCard"
import type { DeathDetailsResponse } from "@/types"

const mockUseActorDeathDetails = vi.fn()

vi.mock("@/hooks/useDeathDetails", () => ({
  useActorDeathDetails: (...args: unknown[]) => mockUseActorDeathDetails(...args),
}))

// Mock DeathDetailsContent to avoid deep component tree
vi.mock("./DeathDetailsContent", () => ({
  default: ({
    hideOfficialHeading,
  }: {
    slug: string
    data?: unknown
    hideOfficialHeading?: boolean
  }) => (
    <div data-testid="death-details-content">
      {hideOfficialHeading && <span data-testid="hide-heading-flag" />}
    </div>
  ),
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
    notableFactors: ["on_set_exposure"],
    additionalContext: "Wayne had been battling cancer for years.",
  },
  career: {
    statusAtDeath: "semi-retired",
    lastProject: null,
    posthumousReleases: null,
  },
  relatedCelebrities: [],
  sources: {
    cause: [{ url: "https://example.com/obit", archiveUrl: null, description: "Obituary" }],
    circumstances: [
      { url: "https://example.com/details", archiveUrl: null, description: "Medical records" },
    ],
    rumored: null,
    additionalContext: null,
    careerStatus: null,
    lastProject: null,
    posthumousReleases: null,
    locationOfDeath: null,
    relatedCelebrities: null,
  },
}

const defaultProps = {
  causeOfDeath: "stomach cancer",
  ageAtDeath: 72,
  yearsLost: 4.2,
  hasFullDetails: true,
  slug: "john-wayne-2157",
}

describe("DeathSummaryCard", () => {
  it("shows skeleton while loading death details", () => {
    mockUseActorDeathDetails.mockReturnValue({ data: undefined, isLoading: true, error: null })
    renderWithRouter(<DeathSummaryCard {...defaultProps} />)

    expect(screen.getByTestId("death-summary-card")).toBeInTheDocument()
    expect(screen.getByTestId("death-details-loading")).toBeInTheDocument()
  })

  it("shows What We Know content when data is loaded", () => {
    mockUseActorDeathDetails.mockReturnValue({ data: fullData, isLoading: false, error: null })
    renderWithRouter(<DeathSummaryCard {...defaultProps} />)

    expect(screen.getByText(/stomach cancer at UCLA/)).toBeInTheDocument()
  })

  it("shows opaque gradient when collapsed", () => {
    mockUseActorDeathDetails.mockReturnValue({ data: fullData, isLoading: false, error: null })
    renderWithRouter(<DeathSummaryCard {...defaultProps} />)

    expect(screen.getByTestId("expandable-section-gradient")).toHaveClass("opacity-100")
    expect(screen.queryByTestId("death-details-expanded")).not.toBeInTheDocument()
  })

  it("expands on header click — gradient fades, full details shown", () => {
    mockUseActorDeathDetails.mockReturnValue({ data: fullData, isLoading: false, error: null })
    renderWithRouter(<DeathSummaryCard {...defaultProps} />)

    fireEvent.click(screen.getByTestId("expandable-section-toggle"))

    expect(screen.getByTestId("expandable-section-gradient")).toHaveClass("opacity-0")
    expect(screen.getByTestId("death-details-expanded")).toBeInTheDocument()
    expect(screen.getByTestId("death-details-content")).toBeInTheDocument()
  })

  it("passes hideOfficialHeading to DeathDetailsContent", () => {
    mockUseActorDeathDetails.mockReturnValue({ data: fullData, isLoading: false, error: null })
    renderWithRouter(<DeathSummaryCard {...defaultProps} />)

    fireEvent.click(screen.getByTestId("expandable-section-toggle"))

    expect(screen.getByTestId("hide-heading-flag")).toBeInTheDocument()
  })

  it("collapses on second click", () => {
    mockUseActorDeathDetails.mockReturnValue({ data: fullData, isLoading: false, error: null })
    renderWithRouter(<DeathSummaryCard {...defaultProps} />)

    fireEvent.click(screen.getByTestId("expandable-section-toggle")) // expand
    fireEvent.click(screen.getByTestId("expandable-section-toggle")) // collapse

    expect(screen.getByTestId("expandable-section-gradient")).toHaveClass("opacity-100")
    expect(screen.queryByTestId("death-details-expanded")).not.toBeInTheDocument()
  })

  it("fires onExpand callback on first expand only", () => {
    mockUseActorDeathDetails.mockReturnValue({ data: fullData, isLoading: false, error: null })
    const onExpand = vi.fn()
    renderWithRouter(<DeathSummaryCard {...defaultProps} onExpand={onExpand} />)

    const toggle = screen.getByTestId("expandable-section-toggle")
    fireEvent.click(toggle) // expand (first time)
    expect(onExpand).toHaveBeenCalledTimes(1)

    fireEvent.click(toggle) // collapse
    fireEvent.click(toggle) // expand again
    expect(onExpand).toHaveBeenCalledTimes(1) // still only once
  })

  it("sets aria-expanded correctly", () => {
    mockUseActorDeathDetails.mockReturnValue({ data: fullData, isLoading: false, error: null })
    renderWithRouter(<DeathSummaryCard {...defaultProps} />)

    const toggle = screen.getByTestId("expandable-section-toggle")
    expect(toggle).toHaveAttribute("aria-expanded", "false")

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")
  })

  it("shows teaser but no toggle when hasFullDetails is false", () => {
    mockUseActorDeathDetails.mockReturnValue({ data: undefined, isLoading: false, error: null })
    renderWithRouter(<DeathSummaryCard {...defaultProps} hasFullDetails={false} />)

    expect(screen.getByText(/Died of stomach cancer at age 72/)).toBeInTheDocument()
    expect(screen.queryByTestId("expandable-section-toggle")).not.toBeInTheDocument()
    expect(screen.getByText("Death Circumstances")).toBeInTheDocument()
  })

  it("renders nothing when no death info at all", () => {
    mockUseActorDeathDetails.mockReturnValue({ data: undefined, isLoading: false, error: null })
    const { container } = renderWithRouter(
      <DeathSummaryCard
        causeOfDeath={null}
        ageAtDeath={null}
        yearsLost={null}
        hasFullDetails={false}
        slug="test-actor-123"
      />
    )
    expect(container.innerHTML).toBe("")
  })

  it("renders age-only teaser when causeOfDeath is null", () => {
    mockUseActorDeathDetails.mockReturnValue({ data: undefined, isLoading: false, error: null })
    renderWithRouter(
      <DeathSummaryCard
        causeOfDeath={null}
        ageAtDeath={85}
        yearsLost={null}
        hasFullDetails={false}
        slug="test-actor-123"
      />
    )
    expect(screen.getByText("Died at age 85.")).toBeInTheDocument()
  })

  it("renders cause-only teaser when ageAtDeath is null", () => {
    mockUseActorDeathDetails.mockReturnValue({ data: undefined, isLoading: false, error: null })
    renderWithRouter(
      <DeathSummaryCard
        causeOfDeath="heart failure"
        ageAtDeath={null}
        yearsLost={null}
        hasFullDetails={false}
        slug="test-actor-123"
      />
    )
    expect(screen.getByText("Died of heart failure.")).toBeInTheDocument()
  })

  it("does not show years lost when zero or negative", () => {
    mockUseActorDeathDetails.mockReturnValue({ data: undefined, isLoading: false, error: null })
    renderWithRouter(<DeathSummaryCard {...defaultProps} hasFullDetails={false} yearsLost={-2.5} />)
    expect(screen.queryByText(/years before life expectancy/)).not.toBeInTheDocument()
  })
})
