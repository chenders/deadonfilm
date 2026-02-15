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

describe("DeathSummaryCard", () => {
  it("renders collapsed teaser by default", () => {
    renderWithRouter(<DeathSummaryCard {...defaultProps} />)

    expect(screen.getByTestId("death-summary-card")).toBeInTheDocument()
    expect(screen.getByText(/Died of stomach cancer at age 72/)).toBeInTheDocument()
    expect(screen.getByText(/Wayne died on June 11, 1979/)).toBeInTheDocument()
    expect(screen.getByText(/4\.2 years before life expectancy/)).toBeInTheDocument()
    expect(screen.getByText("Read full story")).toBeInTheDocument()
    expect(screen.queryByTestId("death-details-expanded")).not.toBeInTheDocument()
  })

  it("expands on click and shows DeathDetailsContent", () => {
    renderWithRouter(<DeathSummaryCard {...defaultProps} />)

    fireEvent.click(screen.getByTestId("death-details-toggle"))

    expect(screen.getByTestId("death-details-expanded")).toBeInTheDocument()
    expect(screen.getByTestId("death-details-content")).toBeInTheDocument()
    expect(screen.getByText("Collapse")).toBeInTheDocument()
  })

  it("collapses on second click", () => {
    renderWithRouter(<DeathSummaryCard {...defaultProps} />)

    const toggle = screen.getByTestId("death-details-toggle")
    fireEvent.click(toggle) // expand
    fireEvent.click(toggle) // collapse

    expect(screen.queryByTestId("death-details-expanded")).not.toBeInTheDocument()
    expect(screen.getByText("Read full story")).toBeInTheDocument()
  })

  it("fires onExpand callback on first expand only", () => {
    const onExpand = vi.fn()
    renderWithRouter(<DeathSummaryCard {...defaultProps} onExpand={onExpand} />)

    const toggle = screen.getByTestId("death-details-toggle")

    fireEvent.click(toggle) // expand (first time)
    expect(onExpand).toHaveBeenCalledTimes(1)

    fireEvent.click(toggle) // collapse
    fireEvent.click(toggle) // expand again
    expect(onExpand).toHaveBeenCalledTimes(1) // still only once
  })

  it("sets aria-expanded correctly", () => {
    renderWithRouter(<DeathSummaryCard {...defaultProps} />)

    const toggle = screen.getByTestId("death-details-toggle")
    expect(toggle).toHaveAttribute("aria-expanded", "false")

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")
  })

  it("renders non-expandable variant when hasFullDetails is false", () => {
    renderWithRouter(<DeathSummaryCard {...defaultProps} hasFullDetails={false} />)

    expect(screen.getByText(/Died of stomach cancer at age 72/)).toBeInTheDocument()
    expect(screen.queryByTestId("death-details-toggle")).not.toBeInTheDocument()
    expect(screen.queryByTestId("death-details-expanded")).not.toBeInTheDocument()
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

  it("does not show years lost when zero or negative", () => {
    renderWithRouter(<DeathSummaryCard {...defaultProps} yearsLost={-2.5} />)
    expect(screen.queryByText(/years before life expectancy/)).not.toBeInTheDocument()
  })
})
