import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import DecadeChart from "./DecadeChart"
import type { DecadeBreakdown } from "@/types"

const mockBreakdown: DecadeBreakdown[] = [
  { decade: "1970s", count: 50 },
  { decade: "1980s", count: 100 },
  { decade: "1990s", count: 75 },
  { decade: "2000s", count: 25 },
]

describe("DecadeChart", () => {
  it("renders all decades", () => {
    render(<DecadeChart breakdown={mockBreakdown} />)

    expect(screen.getByText("1970s")).toBeInTheDocument()
    expect(screen.getByText("1980s")).toBeInTheDocument()
    expect(screen.getByText("1990s")).toBeInTheDocument()
    expect(screen.getByText("2000s")).toBeInTheDocument()
  })

  it("renders counts for each decade", () => {
    render(<DecadeChart breakdown={mockBreakdown} />)

    expect(screen.getByText("50")).toBeInTheDocument()
    expect(screen.getByText("100")).toBeInTheDocument()
    expect(screen.getByText("75")).toBeInTheDocument()
    expect(screen.getByText("25")).toBeInTheDocument()
  })

  it("renders bar widths proportional to counts", () => {
    const { container } = render(<DecadeChart breakdown={mockBreakdown} />)

    // Get all the bar elements (the inner divs with bg-accent class)
    const bars = container.querySelectorAll(".bg-accent")
    expect(bars).toHaveLength(4)

    // The max count is 100, so:
    // - 1970s (50) should be 50% width
    // - 1980s (100) should be 100% width
    // - 1990s (75) should be 75% width
    // - 2000s (25) should be 25% width
    expect(bars[0]).toHaveStyle({ width: "50%" })
    expect(bars[1]).toHaveStyle({ width: "100%" })
    expect(bars[2]).toHaveStyle({ width: "75%" })
    expect(bars[3]).toHaveStyle({ width: "25%" })
  })

  it("returns null when breakdown is empty", () => {
    const { container } = render(<DecadeChart breakdown={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it("handles single decade correctly", () => {
    const singleDecade: DecadeBreakdown[] = [{ decade: "2020s", count: 30 }]
    const { container } = render(<DecadeChart breakdown={singleDecade} />)

    expect(screen.getByText("2020s")).toBeInTheDocument()
    expect(screen.getByText("30")).toBeInTheDocument()

    // Single item should be 100% width (30/30 = 100%)
    const bars = container.querySelectorAll(".bg-accent")
    expect(bars[0]).toHaveStyle({ width: "100%" })
  })
})
