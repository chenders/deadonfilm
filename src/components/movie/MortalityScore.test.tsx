import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import MortalityScore from "./MortalityScore"

describe("MortalityScore", () => {
  it("displays mortality percentage", () => {
    const stats = {
      totalCast: 10,
      deceasedCount: 7,
      livingCount: 3,
      mortalityPercentage: 70,
    }

    render(<MortalityScore stats={stats} />)

    expect(screen.getByText("70%")).toBeInTheDocument()
  })

  it("displays deceased count", () => {
    const stats = {
      totalCast: 10,
      deceasedCount: 7,
      livingCount: 3,
      mortalityPercentage: 70,
    }

    render(<MortalityScore stats={stats} />)

    expect(screen.getByTestId("deceased-count")).toHaveTextContent("7")
  })

  it("displays living count", () => {
    const stats = {
      totalCast: 10,
      deceasedCount: 7,
      livingCount: 3,
      mortalityPercentage: 70,
    }

    render(<MortalityScore stats={stats} />)

    expect(screen.getByTestId("living-count")).toHaveTextContent("3")
  })

  it("displays total cast count", () => {
    const stats = {
      totalCast: 10,
      deceasedCount: 7,
      livingCount: 3,
      mortalityPercentage: 70,
    }

    render(<MortalityScore stats={stats} />)

    expect(screen.getByTestId("total-count")).toHaveTextContent("10")
  })

  it("handles 0% mortality", () => {
    const stats = {
      totalCast: 5,
      deceasedCount: 0,
      livingCount: 5,
      mortalityPercentage: 0,
    }

    render(<MortalityScore stats={stats} />)

    expect(screen.getByText("0%")).toBeInTheDocument()
    expect(screen.getByTestId("deceased-count")).toHaveTextContent("0")
  })

  it("handles 100% mortality", () => {
    const stats = {
      totalCast: 12,
      deceasedCount: 12,
      livingCount: 0,
      mortalityPercentage: 100,
    }

    render(<MortalityScore stats={stats} />)

    expect(screen.getByText("100%")).toBeInTheDocument()
  })

  it("displays the correct description text", () => {
    const stats = {
      totalCast: 10,
      deceasedCount: 5,
      livingCount: 5,
      mortalityPercentage: 50,
    }

    render(<MortalityScore stats={stats} />)

    expect(screen.getByText("of cast deceased")).toBeInTheDocument()
  })

  it("renders mortality bar", () => {
    const stats = {
      totalCast: 10,
      deceasedCount: 6,
      livingCount: 4,
      mortalityPercentage: 60,
    }

    render(<MortalityScore stats={stats} />)

    // Bar exists and has fill element (starts at 0% and animates to target)
    expect(screen.getByTestId("mortality-bar")).toBeInTheDocument()
    expect(screen.getByTestId("mortality-bar-fill")).toBeInTheDocument()
  })
})
