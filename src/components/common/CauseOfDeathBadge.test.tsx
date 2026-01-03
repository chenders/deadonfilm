import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import CauseOfDeathBadge from "./CauseOfDeathBadge"

describe("CauseOfDeathBadge", () => {
  describe("without causeOfDeathDetails", () => {
    it("renders cause of death text only", () => {
      render(<CauseOfDeathBadge causeOfDeath="Natural causes" />)

      expect(screen.getByText("Natural causes")).toBeInTheDocument()
    })

    it("does not render info icon", () => {
      render(<CauseOfDeathBadge causeOfDeath="Natural causes" />)

      expect(screen.queryByRole("button")).not.toBeInTheDocument()
      expect(document.querySelector("svg")).not.toBeInTheDocument()
    })

    it("sets title attribute on span", () => {
      render(<CauseOfDeathBadge causeOfDeath="Natural causes" />)

      expect(screen.getByText("Natural causes")).toHaveAttribute("title", "Natural causes")
    })
  })

  describe("with causeOfDeathDetails", () => {
    it("renders cause of death text with info icon", () => {
      render(
        <CauseOfDeathBadge
          causeOfDeath="Heart attack"
          causeOfDeathDetails="Suffered a heart attack at home"
        />
      )

      expect(screen.getByText("Heart attack")).toBeInTheDocument()
      expect(document.querySelector("svg")).toBeInTheDocument()
    })

    it("renders as a button for accessibility", () => {
      render(
        <CauseOfDeathBadge
          causeOfDeath="Heart attack"
          causeOfDeathDetails="Suffered a heart attack at home"
        />
      )

      expect(screen.getByRole("button")).toBeInTheDocument()
    })

    it("has underline decoration style", () => {
      const { container } = render(
        <CauseOfDeathBadge
          causeOfDeath="Heart attack"
          causeOfDeathDetails="Suffered a heart attack at home"
        />
      )

      const tooltipTrigger = container.querySelector(".underline.decoration-dotted")
      expect(tooltipTrigger).toBeInTheDocument()
    })
  })

  describe("testId prop", () => {
    it("applies testId to the inner span when causeOfDeathDetails is present", () => {
      render(
        <CauseOfDeathBadge
          causeOfDeath="Accident"
          causeOfDeathDetails="Car accident"
          testId="death-details-123"
        />
      )

      expect(screen.getByTestId("death-details-123")).toBeInTheDocument()
    })

    it("does not apply testId when causeOfDeathDetails is not present", () => {
      render(<CauseOfDeathBadge causeOfDeath="Accident" testId="death-details-123" />)

      expect(screen.queryByTestId("death-details-123")).not.toBeInTheDocument()
    })
  })

  describe("iconSize prop", () => {
    it("uses default icon size of 12", () => {
      render(<CauseOfDeathBadge causeOfDeath="Overdose" causeOfDeathDetails="Drug overdose" />)

      const svg = document.querySelector("svg")
      expect(svg).toHaveAttribute("width", "12")
      expect(svg).toHaveAttribute("height", "12")
    })

    it("applies custom icon size", () => {
      render(
        <CauseOfDeathBadge
          causeOfDeath="Overdose"
          causeOfDeathDetails="Drug overdose"
          iconSize={14}
        />
      )

      const svg = document.querySelector("svg")
      expect(svg).toHaveAttribute("width", "14")
      expect(svg).toHaveAttribute("height", "14")
    })
  })

  describe("className prop", () => {
    it("applies custom className when causeOfDeathDetails is present", () => {
      const { container } = render(
        <CauseOfDeathBadge
          causeOfDeath="Cancer"
          causeOfDeathDetails="Died from cancer"
          className="custom-class"
        />
      )

      const tooltipTrigger = container.querySelector(".custom-class")
      expect(tooltipTrigger).toBeInTheDocument()
    })
  })

  describe("edge cases", () => {
    it("handles null causeOfDeathDetails", () => {
      render(<CauseOfDeathBadge causeOfDeath="Unknown" causeOfDeathDetails={null} />)

      expect(screen.getByText("Unknown")).toBeInTheDocument()
      expect(document.querySelector("svg")).not.toBeInTheDocument()
    })

    it("handles undefined causeOfDeathDetails", () => {
      render(<CauseOfDeathBadge causeOfDeath="Unknown" causeOfDeathDetails={undefined} />)

      expect(screen.getByText("Unknown")).toBeInTheDocument()
      expect(document.querySelector("svg")).not.toBeInTheDocument()
    })

    it("handles empty string causeOfDeathDetails", () => {
      render(<CauseOfDeathBadge causeOfDeath="Unknown" causeOfDeathDetails="" />)

      // Empty string is falsy, so should render without icon
      expect(screen.getByText("Unknown")).toBeInTheDocument()
      expect(document.querySelector("svg")).not.toBeInTheDocument()
    })
  })
})
