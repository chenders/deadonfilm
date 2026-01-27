import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import Skeleton from "./Skeleton"

describe("Skeleton", () => {
  describe("Base", () => {
    it("renders with status role", () => {
      render(<Skeleton />)
      expect(screen.getByRole("status")).toBeInTheDocument()
    })

    it("has aria-busy attribute", () => {
      render(<Skeleton />)
      expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true")
    })

    it("has default aria-label", () => {
      render(<Skeleton />)
      expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading...")
    })

    it("uses custom label when provided", () => {
      render(<Skeleton label="Custom loading" />)
      expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Custom loading")
    })

    it("applies animate-pulse class", () => {
      render(<Skeleton />)
      expect(screen.getByRole("status")).toHaveClass("animate-pulse")
    })

    it("applies custom className", () => {
      render(<Skeleton className="custom-class" />)
      expect(screen.getByRole("status")).toHaveClass("custom-class")
    })
  })

  describe("Text", () => {
    it("renders with status role", () => {
      render(<Skeleton.Text />)
      expect(screen.getByRole("status")).toBeInTheDocument()
    })

    it("renders 3 lines by default", () => {
      const { container } = render(<Skeleton.Text />)
      const lines = container.querySelectorAll(".animate-pulse")
      expect(lines).toHaveLength(3)
    })

    it("renders custom number of lines", () => {
      const { container } = render(<Skeleton.Text lines={5} />)
      const lines = container.querySelectorAll(".animate-pulse")
      expect(lines).toHaveLength(5)
    })

    it("makes last line shorter by default", () => {
      const { container } = render(<Skeleton.Text lines={3} />)
      const lines = container.querySelectorAll(".animate-pulse")
      // Last line should have 75% width
      expect(lines[2]).toHaveStyle({ width: "75%" })
    })

    it("respects custom lastLineWidth", () => {
      const { container } = render(<Skeleton.Text lines={2} lastLineWidth={50} />)
      const lines = container.querySelectorAll(".animate-pulse")
      expect(lines[1]).toHaveStyle({ width: "50%" })
    })

    it("makes last line full width when specified", () => {
      const { container } = render(<Skeleton.Text lines={2} lastLineWidth="full" />)
      const lines = container.querySelectorAll(".animate-pulse")
      expect(lines[1]).toHaveStyle({ width: "100%" })
    })

    it("has aria-label for text loading", () => {
      render(<Skeleton.Text />)
      expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading text...")
    })
  })

  describe("Card", () => {
    it("renders with status role", () => {
      render(<Skeleton.Card />)
      // Card has nested TextSkeleton which also has status role
      const statuses = screen.getAllByRole("status")
      expect(statuses.length).toBeGreaterThanOrEqual(1)
    })

    it("has aria-label for card loading", () => {
      render(<Skeleton.Card />)
      // Get the card element specifically by its aria-label
      const card = screen.getByLabelText("Loading card...")
      expect(card).toBeInTheDocument()
    })

    it("shows header by default", () => {
      const { container } = render(<Skeleton.Card />)
      // Header section has mb-4 class
      expect(container.querySelector(".mb-4")).toBeInTheDocument()
    })

    it("hides header when showHeader is false", () => {
      const { container } = render(<Skeleton.Card showHeader={false} />)
      // No header section
      const cardContent = container.firstChild
      const headerSection = cardContent?.firstChild
      // First child should be the content area, not header
      expect(headerSection).not.toHaveClass("mb-4")
    })

    it("applies card styling classes", () => {
      render(<Skeleton.Card />)
      const card = screen.getByLabelText("Loading card...")
      expect(card).toHaveClass("rounded-lg")
      expect(card).toHaveClass("border")
      expect(card).toHaveClass("border-admin-border")
    })
  })

  describe("Table", () => {
    it("renders with status role", () => {
      render(<Skeleton.Table />)
      expect(screen.getByRole("status")).toBeInTheDocument()
    })

    it("has aria-label for table loading", () => {
      render(<Skeleton.Table />)
      expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading table...")
    })

    it("renders header row plus data rows", () => {
      const { container } = render(<Skeleton.Table rows={3} columns={4} />)
      // Header row + 3 data rows = 4 total rows
      const rows = container.querySelectorAll(".flex.border-b, .flex.p-3")
      // Header + data rows
      expect(rows.length).toBeGreaterThanOrEqual(4)
    })

    it("renders correct number of columns per row", () => {
      const { container } = render(<Skeleton.Table rows={2} columns={5} />)
      // Check first row has 5 cells
      const firstRow = container.querySelector(".flex.border-b")
      const cells = firstRow?.querySelectorAll(".flex-1")
      expect(cells).toHaveLength(5)
    })
  })

  describe("Chart", () => {
    it("renders with status role", () => {
      render(<Skeleton.Chart />)
      expect(screen.getByRole("status")).toBeInTheDocument()
    })

    it("has aria-label for chart loading", () => {
      render(<Skeleton.Chart />)
      expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading chart...")
    })

    it("uses default height", () => {
      const { container } = render(<Skeleton.Chart />)
      const chartArea = container.querySelector("[style*='height: 200px']")
      expect(chartArea).toBeInTheDocument()
    })

    it("uses custom height", () => {
      const { container } = render(<Skeleton.Chart height={300} />)
      const chartArea = container.querySelector("[style*='height: 300px']")
      expect(chartArea).toBeInTheDocument()
    })
  })

  describe("StatCard", () => {
    it("renders with status role", () => {
      render(<Skeleton.StatCard />)
      expect(screen.getByRole("status")).toBeInTheDocument()
    })

    it("has aria-label for stat loading", () => {
      render(<Skeleton.StatCard />)
      expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading stat...")
    })

    it("applies stat card styling", () => {
      render(<Skeleton.StatCard />)
      const card = screen.getByRole("status")
      expect(card).toHaveClass("rounded-lg")
      expect(card).toHaveClass("border")
      expect(card).toHaveClass("p-4")
    })

    it("includes circular placeholder for icon/sparkline area", () => {
      const { container } = render(<Skeleton.StatCard />)
      const circle = container.querySelector(".rounded-full")
      expect(circle).toBeInTheDocument()
    })

    it("applies custom className", () => {
      render(<Skeleton.StatCard className="custom-class" />)
      expect(screen.getByRole("status")).toHaveClass("custom-class")
    })
  })
})
