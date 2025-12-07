import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import MortalityGauge from "./MortalityGauge"

describe("MortalityGauge", () => {
  const defaultStats = {
    totalCast: 30,
    deceasedCount: 5,
    livingCount: 25,
    mortalityPercentage: 17,
  }

  it("renders the gauge container", () => {
    render(<MortalityGauge stats={defaultStats} />)

    expect(screen.getByTestId("mortality-gauge")).toBeInTheDocument()
  })

  it("displays the mortality percentage", () => {
    render(<MortalityGauge stats={defaultStats} />)

    expect(screen.getByTestId("gauge-percentage")).toHaveTextContent("17%")
  })

  it("displays deceased label", () => {
    render(<MortalityGauge stats={defaultStats} />)

    expect(screen.getByText("deceased")).toBeInTheDocument()
  })

  it("renders with 0% mortality", () => {
    const stats = { ...defaultStats, deceasedCount: 0, mortalityPercentage: 0 }
    render(<MortalityGauge stats={stats} />)

    expect(screen.getByTestId("gauge-percentage")).toHaveTextContent("0%")
  })

  it("renders with 100% mortality", () => {
    const stats = {
      totalCast: 10,
      deceasedCount: 10,
      livingCount: 0,
      mortalityPercentage: 100,
    }
    render(<MortalityGauge stats={stats} />)

    expect(screen.getByTestId("gauge-percentage")).toHaveTextContent("100%")
  })

  it("renders SVG elements for the gauge", () => {
    const { container } = render(<MortalityGauge stats={defaultStats} />)

    // Check for SVG
    const svg = container.querySelector("svg")
    expect(svg).toBeInTheDocument()

    // Check for circles (background, arc, center hub)
    const circles = container.querySelectorAll("circle")
    expect(circles.length).toBeGreaterThan(0)
  })

  it("renders sprocket hole decorations", () => {
    const { container } = render(<MortalityGauge stats={defaultStats} />)

    // Should have 8 sprocket holes plus other circles
    const circles = container.querySelectorAll("circle")
    expect(circles.length).toBeGreaterThanOrEqual(8)
  })
})
