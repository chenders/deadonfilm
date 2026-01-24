/**
 * Tests for StatCard component.
 */

import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import StatCard from "./StatCard"

describe("StatCard", () => {
  describe("rendering", () => {
    it("renders label and string value", () => {
      render(<StatCard label="Total Views" value="1,234" />)

      expect(screen.getByText("Total Views")).toBeInTheDocument()
      expect(screen.getByText("1,234")).toBeInTheDocument()
    })

    it("renders label and numeric value", () => {
      render(<StatCard label="Active Users" value={42} />)

      expect(screen.getByText("Active Users")).toBeInTheDocument()
      expect(screen.getByText("42")).toBeInTheDocument()
    })

    it("renders without change indicator when not provided", () => {
      render(<StatCard label="Total Views" value="1,234" />)

      // Should not render any percentage text
      expect(screen.queryByText(/\+/)).not.toBeInTheDocument()
      expect(screen.queryByText(/-/)).not.toBeInTheDocument()
      expect(screen.queryByText(/%/)).not.toBeInTheDocument()
    })

    it("renders without icon when not provided", () => {
      const { container } = render(<StatCard label="Total Views" value="1,234" />)

      // Icon container should not be in document - check that there's only one .text-gray-400 (the label)
      const grayElements = container.querySelectorAll(".text-gray-400")
      expect(grayElements).toHaveLength(1) // Only the label should have this class
    })
  })

  describe("change indicator", () => {
    it("renders positive change with + sign and green color", () => {
      render(<StatCard label="Total Views" value="1,234" change={15.5} />)

      const changeElement = screen.getByText("+15.5%")
      expect(changeElement).toBeInTheDocument()
      expect(changeElement).toHaveClass("text-green-400")
    })

    it("renders negative change without + sign and red color", () => {
      render(<StatCard label="Total Views" value="1,234" change={-8.3} />)

      const changeElement = screen.getByText("-8.3%")
      expect(changeElement).toBeInTheDocument()
      expect(changeElement).toHaveClass("text-red-400")
    })

    it("renders zero change with gray color", () => {
      render(<StatCard label="Total Views" value="1,234" change={0} />)

      const changeElement = screen.getByText("0.0%")
      expect(changeElement).toBeInTheDocument()
      expect(changeElement).toHaveClass("text-gray-400")
    })

    it("formats change percentage to 1 decimal place", () => {
      render(<StatCard label="Total Views" value="1,234" change={12.456} />)

      expect(screen.getByText("+12.5%")).toBeInTheDocument()
    })

    it("formats small positive change correctly", () => {
      render(<StatCard label="Total Views" value="1,234" change={0.1} />)

      expect(screen.getByText("+0.1%")).toBeInTheDocument()
    })

    it("formats small negative change correctly", () => {
      render(<StatCard label="Total Views" value="1,234" change={-0.05} />)

      expect(screen.getByText("-0.1%")).toBeInTheDocument()
    })

    it("formats large percentage correctly", () => {
      render(<StatCard label="Total Views" value="1,234" change={250.789} />)

      expect(screen.getByText("+250.8%")).toBeInTheDocument()
    })
  })

  describe("icon display", () => {
    it("renders provided icon", () => {
      const TestIcon = () => <div data-testid="test-icon">📊</div>
      render(<StatCard label="Total Views" value="1,234" icon={<TestIcon />} />)

      expect(screen.getByTestId("test-icon")).toBeInTheDocument()
      expect(screen.getByText("📊")).toBeInTheDocument()
    })

    it("renders icon with correct styling", () => {
      const TestIcon = () => <div data-testid="test-icon">Icon</div>
      const { container } = render(
        <StatCard label="Total Views" value="1,234" icon={<TestIcon />} />
      )

      const iconContainer = container.querySelector(".text-gray-400:has([data-testid='test-icon'])")
      expect(iconContainer).toBeInTheDocument()
    })
  })

  describe("color classes", () => {
    it("applies correct color class for positive change", () => {
      render(<StatCard label="Views" value="100" change={10} />)

      const changeElement = screen.getByText("+10.0%")
      expect(changeElement.className).toContain("text-green-400")
    })

    it("applies correct color class for negative change", () => {
      render(<StatCard label="Views" value="100" change={-10} />)

      const changeElement = screen.getByText("-10.0%")
      expect(changeElement.className).toContain("text-red-400")
    })

    it("applies correct color class for zero change", () => {
      render(<StatCard label="Views" value="100" change={0} />)

      const changeElement = screen.getByText("0.0%")
      expect(changeElement.className).toContain("text-gray-400")
    })

    it("applies standard label styling", () => {
      render(<StatCard label="Total Views" value="100" />)

      const label = screen.getByText("Total Views")
      expect(label.className).toContain("text-gray-400")
      expect(label.className).toContain("font-medium")
    })

    it("applies standard value styling", () => {
      render(<StatCard label="Views" value="1,234" />)

      const value = screen.getByText("1,234")
      expect(value.className).toContain("text-white")
      expect(value.className).toContain("font-semibold")
    })
  })

  describe("edge cases", () => {
    it("handles zero as value", () => {
      render(<StatCard label="Count" value={0} />)

      expect(screen.getByText("0")).toBeInTheDocument()
    })

    it("handles empty string as value", () => {
      render(<StatCard label="Count" value="" />)

      // Empty string should still render (as empty text node)
      expect(screen.getByText("Count")).toBeInTheDocument()
    })

    it("handles very long label text", () => {
      render(
        <StatCard label="This is a very long label that might wrap to multiple lines" value="100" />
      )

      expect(
        screen.getByText("This is a very long label that might wrap to multiple lines")
      ).toBeInTheDocument()
    })

    it("handles very large numeric value", () => {
      render(<StatCard label="Views" value={999999999} />)

      expect(screen.getByText("999999999")).toBeInTheDocument()
    })
  })
})
