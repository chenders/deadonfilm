import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import MortalityGauge from "./MortalityGauge"

describe("MortalityGauge", () => {
  const defaultStats = {
    totalCast: 30,
    deceasedCount: 5,
    livingCount: 25,
    mortalityPercentage: 17,
    expectedDeaths: 3.2,
    mortalitySurpriseScore: 0.56,
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
    const stats = {
      ...defaultStats,
      deceasedCount: 0,
      mortalityPercentage: 0,
      expectedDeaths: 0,
      mortalitySurpriseScore: 0,
    }
    render(<MortalityGauge stats={stats} />)

    expect(screen.getByTestId("gauge-percentage")).toHaveTextContent("0%")
  })

  it("renders with 100% mortality", () => {
    const stats = {
      totalCast: 10,
      deceasedCount: 10,
      livingCount: 0,
      mortalityPercentage: 100,
      expectedDeaths: 6.5,
      mortalitySurpriseScore: 0.54,
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

  describe("mortality comparison display", () => {
    it("displays expected deaths when available", () => {
      render(<MortalityGauge stats={defaultStats} />)

      expect(screen.getByTestId("mortality-comparison")).toBeInTheDocument()
      expect(screen.getByText("Expected:")).toBeInTheDocument()
      expect(screen.getByText("3.2")).toBeInTheDocument()
    })

    it("displays actual deaths", () => {
      render(<MortalityGauge stats={defaultStats} />)

      expect(screen.getByText("Actual:")).toBeInTheDocument()
      expect(screen.getByText("5")).toBeInTheDocument()
    })

    it("does not show comparison when expectedDeaths is 0", () => {
      const stats = { ...defaultStats, expectedDeaths: 0, mortalitySurpriseScore: 0 }
      render(<MortalityGauge stats={stats} />)

      expect(screen.queryByTestId("mortality-comparison")).not.toBeInTheDocument()
    })

    it("shows 'Unusually High' label when surprise score > 0.5", () => {
      const stats = { ...defaultStats, mortalitySurpriseScore: 0.6 }
      render(<MortalityGauge stats={stats} />)

      expect(screen.getByTestId("surprise-label")).toHaveTextContent("Unusually High")
    })

    it("shows 'Higher Than Expected' label when surprise score between 0.2 and 0.5", () => {
      const stats = { ...defaultStats, mortalitySurpriseScore: 0.3 }
      render(<MortalityGauge stats={stats} />)

      expect(screen.getByTestId("surprise-label")).toHaveTextContent("Higher Than Expected")
    })

    it("shows 'Lower Than Expected' label when surprise score < -0.3", () => {
      const stats = { ...defaultStats, mortalitySurpriseScore: -0.4 }
      render(<MortalityGauge stats={stats} />)

      expect(screen.getByTestId("surprise-label")).toHaveTextContent("Lower Than Expected")
    })

    it("shows 'As Expected' label when surprise score is near zero", () => {
      const stats = { ...defaultStats, mortalitySurpriseScore: 0.1 }
      render(<MortalityGauge stats={stats} />)

      expect(screen.getByTestId("surprise-label")).toHaveTextContent("As Expected")
    })
  })
})
