import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { BrowserRouter } from "react-router-dom"
import DeathSummaryCard from "./DeathSummaryCard"

// Mock DeathDetailsContent to avoid needing the full hook chain
vi.mock("./DeathDetailsContent", () => ({
  default: ({ slug }: { slug: string }) => (
    <div data-testid="death-details-content">Details for {slug}</div>
  ),
}))

function renderWithRouter(ui: React.ReactElement) {
  return render(
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {ui}
    </BrowserRouter>
  )
}

const defaultProps = {
  causeOfDeath: "stomach cancer",
  causeOfDeathDetails: "Wayne died on June 11, 1979, at UCLA Medical Center.",
  ageAtDeath: 72,
  yearsLost: 4.2,
  hasFullDetails: true,
  slug: "john-wayne-2157",
}

function getToggle() {
  return screen.getByRole("button", { name: /Death Circumstances/ })
}

describe("DeathSummaryCard", () => {
  it("renders collapsed with teaser visible but full details hidden", () => {
    renderWithRouter(<DeathSummaryCard {...defaultProps} />)

    expect(screen.getByTestId("death-summary-card")).toBeInTheDocument()
    expect(getToggle()).toBeInTheDocument()
    // Teaser content is always visible
    expect(screen.getByText(/Died of stomach cancer at age 72/)).toBeInTheDocument()
    expect(screen.getByText(/Wayne died on June 11, 1979/)).toBeInTheDocument()
    expect(screen.getByText(/4\.2 years before life expectancy/)).toBeInTheDocument()
    // Full details are hidden when collapsed
    expect(screen.queryByTestId("death-details-expanded")).not.toBeInTheDocument()
  })

  it("expands on header click and shows full death details", () => {
    renderWithRouter(<DeathSummaryCard {...defaultProps} />)

    fireEvent.click(getToggle())

    expect(screen.getByTestId("death-details-expanded")).toBeInTheDocument()
    expect(screen.getByTestId("death-details-content")).toBeInTheDocument()
  })

  it("collapses on second click", () => {
    renderWithRouter(<DeathSummaryCard {...defaultProps} />)

    fireEvent.click(getToggle()) // expand
    fireEvent.click(getToggle()) // collapse

    expect(screen.queryByTestId("death-details-expanded")).not.toBeInTheDocument()
    // Teaser is still visible after collapse
    expect(screen.getByText(/Died of stomach cancer at age 72/)).toBeInTheDocument()
  })

  it("fires onExpand callback on first expand only", () => {
    const onExpand = vi.fn()
    renderWithRouter(<DeathSummaryCard {...defaultProps} onExpand={onExpand} />)

    fireEvent.click(getToggle()) // expand (first time)
    expect(onExpand).toHaveBeenCalledTimes(1)

    fireEvent.click(getToggle()) // collapse
    fireEvent.click(getToggle()) // expand again
    expect(onExpand).toHaveBeenCalledTimes(1) // still only once
  })

  it("sets aria-expanded correctly", () => {
    renderWithRouter(<DeathSummaryCard {...defaultProps} />)

    const toggle = getToggle()
    expect(toggle).toHaveAttribute("aria-expanded", "false")

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")
  })

  it("shows teaser but no full details when hasFullDetails is false", () => {
    renderWithRouter(<DeathSummaryCard {...defaultProps} hasFullDetails={false} />)

    // Teaser content is visible
    expect(screen.getByText(/Died of stomach cancer at age 72/)).toBeInTheDocument()
    // Expanding does not show DeathDetailsContent
    fireEvent.click(getToggle())
    expect(screen.queryByTestId("death-details-content")).not.toBeInTheDocument()
  })

  it("renders nothing when no death info at all", () => {
    const { container } = renderWithRouter(
      <DeathSummaryCard
        causeOfDeath={null}
        causeOfDeathDetails={null}
        ageAtDeath={null}
        yearsLost={null}
        hasFullDetails={false}
        slug="test-actor-123"
      />
    )
    expect(container.innerHTML).toBe("")
  })

  it("renders with only causeOfDeathDetails (no cause or age)", () => {
    renderWithRouter(
      <DeathSummaryCard
        causeOfDeath={null}
        causeOfDeathDetails="The actor passed away peacefully."
        ageAtDeath={null}
        yearsLost={null}
        hasFullDetails={false}
        slug="test-actor-123"
      />
    )

    expect(screen.getByText("The actor passed away peacefully.")).toBeInTheDocument()
  })

  it("renders age-only teaser when causeOfDeath is null", () => {
    renderWithRouter(
      <DeathSummaryCard
        causeOfDeath={null}
        causeOfDeathDetails={null}
        ageAtDeath={85}
        yearsLost={null}
        hasFullDetails={false}
        slug="test-actor-123"
      />
    )

    expect(screen.getByText("Died at age 85.")).toBeInTheDocument()
  })

  it("renders cause-only teaser when ageAtDeath is null", () => {
    renderWithRouter(
      <DeathSummaryCard
        causeOfDeath="heart failure"
        causeOfDeathDetails={null}
        ageAtDeath={null}
        yearsLost={null}
        hasFullDetails={false}
        slug="test-actor-123"
      />
    )

    expect(screen.getByText("Died of heart failure.")).toBeInTheDocument()
  })

  it("does not show years lost when zero or negative", () => {
    renderWithRouter(<DeathSummaryCard {...defaultProps} yearsLost={-2.5} />)
    expect(screen.queryByText(/years before life expectancy/)).not.toBeInTheDocument()
  })
})
