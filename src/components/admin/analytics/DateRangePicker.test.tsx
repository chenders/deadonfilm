/**
 * Tests for DateRangePicker component.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import DateRangePicker from "./DateRangePicker"

describe("DateRangePicker", () => {
  const mockOnChange = vi.fn()
  const defaultProps = {
    startDate: "2024-01-01",
    endDate: "2024-01-31",
    onChange: mockOnChange,
  }

  beforeEach(() => {
    vi.useFakeTimers()
    // Use local timezone, not UTC
    vi.setSystemTime(new Date(2024, 0, 31, 12, 0, 0)) // January 31, 2024 12:00 local time
    mockOnChange.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("rendering", () => {
    it("renders quick filter buttons", () => {
      render(<DateRangePicker {...defaultProps} />)

      expect(screen.getByRole("button", { name: /Last 7 Days/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /Last 30 Days/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /Last 90 Days/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /All Time/i })).toBeInTheDocument()
    })

    it("renders start and end date inputs", () => {
      render(<DateRangePicker {...defaultProps} />)

      const startInput = screen.getByDisplayValue("2024-01-01")
      const endInput = screen.getByDisplayValue("2024-01-31")

      expect(startInput).toBeInTheDocument()
      expect(endInput).toBeInTheDocument()
      // react-datepicker uses text inputs, not date inputs
      expect(startInput).toHaveAttribute("type", "text")
      expect(endInput).toHaveAttribute("type", "text")
    })
  })

  describe("quick filter buttons", () => {
    it("handles Last 7 Days button click", () => {
      render(<DateRangePicker {...defaultProps} />)

      fireEvent.click(screen.getByRole("button", { name: /Last 7 Days/i }))

      expect(mockOnChange).toHaveBeenCalledWith("2024-01-24", "2024-01-31")
    })

    it("handles Last 30 Days button click", () => {
      render(<DateRangePicker {...defaultProps} />)

      fireEvent.click(screen.getByRole("button", { name: /Last 30 Days/i }))

      expect(mockOnChange).toHaveBeenCalledWith("2024-01-01", "2024-01-31")
    })

    it("handles Last 90 Days button click", () => {
      render(<DateRangePicker {...defaultProps} />)

      fireEvent.click(screen.getByRole("button", { name: /Last 90 Days/i }))

      expect(mockOnChange).toHaveBeenCalledWith("2023-11-02", "2024-01-31")
    })

    it("handles All Time button click", () => {
      render(<DateRangePicker {...defaultProps} />)

      fireEvent.click(screen.getByRole("button", { name: /All Time/i }))

      expect(mockOnChange).toHaveBeenCalledWith("", "2024-01-31")
    })
  })

  describe("custom date input", () => {
    it("handles start date change", () => {
      render(<DateRangePicker {...defaultProps} />)

      const startInput = screen.getByDisplayValue("2024-01-01")
      fireEvent.change(startInput, { target: { value: "2024-01-15" } })

      expect(mockOnChange).toHaveBeenCalledWith("2024-01-15", "2024-01-31")
    })

    it("handles end date change", () => {
      render(<DateRangePicker {...defaultProps} />)

      const endInput = screen.getByDisplayValue("2024-01-31")
      fireEvent.change(endInput, { target: { value: "2024-02-15" } })

      expect(mockOnChange).toHaveBeenCalledWith("2024-01-01", "2024-02-15")
    })

    it("handles both dates changing", () => {
      render(<DateRangePicker {...defaultProps} />)

      const startInput = screen.getByDisplayValue("2024-01-01")
      const endInput = screen.getByDisplayValue("2024-01-31")

      fireEvent.change(startInput, { target: { value: "2024-02-01" } })
      fireEvent.change(endInput, { target: { value: "2024-02-29" } })

      expect(mockOnChange).toHaveBeenCalledTimes(2)
      // First call: new start date with existing end date from props
      expect(mockOnChange).toHaveBeenNthCalledWith(1, "2024-02-01", "2024-01-31")
      // Second call: start date from props (not updated) with new end date
      expect(mockOnChange).toHaveBeenNthCalledWith(2, "2024-01-01", "2024-02-29")
    })

    it("handles empty start date", () => {
      render(<DateRangePicker {...defaultProps} />)

      const startInput = screen.getByDisplayValue("2024-01-01")
      fireEvent.change(startInput, { target: { value: "" } })

      expect(mockOnChange).toHaveBeenCalledWith("", "2024-01-31")
    })
  })

  describe("date formatting", () => {
    it("uses correct date format for quick filters", () => {
      // Set specific date to test formatting - use local time
      vi.setSystemTime(new Date(2024, 11, 5, 10, 30, 0)) // December 5, 2024 10:30 local time

      render(<DateRangePicker {...defaultProps} />)

      fireEvent.click(screen.getByRole("button", { name: /Last 7 Days/i }))

      // Should format as YYYY-MM-DD
      expect(mockOnChange).toHaveBeenCalledWith("2024-11-28", "2024-12-05")
    })

    it("handles month boundaries correctly", () => {
      // Test date at start of month - use local time
      vi.setSystemTime(new Date(2024, 1, 1, 0, 0, 0)) // February 1, 2024 local time

      render(<DateRangePicker {...defaultProps} />)

      fireEvent.click(screen.getByRole("button", { name: /Last 7 Days/i }))

      // Should go back to previous month
      expect(mockOnChange).toHaveBeenCalledWith("2024-01-25", "2024-02-01")
    })

    it("handles year boundaries correctly", () => {
      // Test date at start of year - use local time
      vi.setSystemTime(new Date(2024, 0, 5, 0, 0, 0)) // January 5, 2024 local time

      render(<DateRangePicker {...defaultProps} />)

      fireEvent.click(screen.getByRole("button", { name: /Last 30 Days/i }))

      // Should go back to previous year
      expect(mockOnChange).toHaveBeenCalledWith("2023-12-06", "2024-01-05")
    })
  })

  describe("showQuickFilters prop", () => {
    it("shows quick filters by default", () => {
      render(<DateRangePicker {...defaultProps} />)

      expect(screen.getByRole("button", { name: /Last 7 Days/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /Last 30 Days/i })).toBeInTheDocument()
    })

    it("hides quick filters when showQuickFilters is false", () => {
      render(<DateRangePicker {...defaultProps} showQuickFilters={false} />)

      expect(screen.queryByRole("button", { name: /Last 7 Days/i })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: /Last 30 Days/i })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: /Last 90 Days/i })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: /All Time/i })).not.toBeInTheDocument()
    })

    it("still shows date inputs when quick filters are hidden", () => {
      render(<DateRangePicker {...defaultProps} showQuickFilters={false} />)

      expect(screen.getByDisplayValue("2024-01-01")).toBeInTheDocument()
      expect(screen.getByDisplayValue("2024-01-31")).toBeInTheDocument()
    })
  })

  describe("custom labels", () => {
    it("uses custom start and end labels", () => {
      render(
        <DateRangePicker {...defaultProps} startLabel="Death Date From" endLabel="Death Date To" />
      )

      expect(screen.getByLabelText("Death Date From")).toBeInTheDocument()
      expect(screen.getByLabelText("Death Date To")).toBeInTheDocument()
      expect(screen.queryByLabelText("Start Date")).not.toBeInTheDocument()
      expect(screen.queryByLabelText("End Date")).not.toBeInTheDocument()
    })

    it("uses default labels when not provided", () => {
      render(<DateRangePicker {...defaultProps} />)

      expect(screen.getByLabelText("Start Date")).toBeInTheDocument()
      expect(screen.getByLabelText("End Date")).toBeInTheDocument()
    })
  })

  describe("validation", () => {
    it("shows error when start date is after end date", () => {
      render(
        <DateRangePicker startDate="2024-02-01" endDate="2024-01-01" onChange={mockOnChange} />
      )

      expect(screen.getByText("Start date cannot be after end date")).toBeInTheDocument()
    })

    it("does not show error when start date is before end date", () => {
      render(<DateRangePicker {...defaultProps} />)

      expect(screen.queryByText("Start date cannot be after end date")).not.toBeInTheDocument()
    })

    it("does not show error when start date equals end date", () => {
      render(
        <DateRangePicker startDate="2024-01-15" endDate="2024-01-15" onChange={mockOnChange} />
      )

      expect(screen.queryByText("Start date cannot be after end date")).not.toBeInTheDocument()
    })

    it("does not show error when dates are empty", () => {
      render(<DateRangePicker startDate="" endDate="" onChange={mockOnChange} />)

      expect(screen.queryByText("Start date cannot be after end date")).not.toBeInTheDocument()
    })

    it("does not show error when only one date is set", () => {
      render(<DateRangePicker startDate="2024-01-01" endDate="" onChange={mockOnChange} />)

      expect(screen.queryByText("Start date cannot be after end date")).not.toBeInTheDocument()
    })
  })

  describe("clear functionality", () => {
    it("shows clear dates button when at least one date is set", () => {
      render(<DateRangePicker {...defaultProps} />)

      expect(screen.getByRole("button", { name: /Clear Dates/i })).toBeInTheDocument()
    })

    it("hides clear dates button when both dates are empty", () => {
      render(<DateRangePicker startDate="" endDate="" onChange={mockOnChange} />)

      expect(screen.queryByRole("button", { name: /Clear Dates/i })).not.toBeInTheDocument()
    })

    it("shows clear dates button when only start date is set", () => {
      render(<DateRangePicker startDate="2024-01-01" endDate="" onChange={mockOnChange} />)

      expect(screen.getByRole("button", { name: /Clear Dates/i })).toBeInTheDocument()
    })

    it("shows clear dates button when only end date is set", () => {
      render(<DateRangePicker startDate="" endDate="2024-01-31" onChange={mockOnChange} />)

      expect(screen.getByRole("button", { name: /Clear Dates/i })).toBeInTheDocument()
    })

    it("clears both dates when clear dates button is clicked", () => {
      render(<DateRangePicker {...defaultProps} />)

      fireEvent.click(screen.getByRole("button", { name: /Clear Dates/i }))

      expect(mockOnChange).toHaveBeenCalledWith("", "")
    })

    it("shows clear button for individual date inputs", () => {
      render(<DateRangePicker {...defaultProps} />)

      // react-datepicker uses aria-label="Close" for clear buttons
      const clearButtons = screen.getAllByLabelText("Close")
      expect(clearButtons).toHaveLength(2)
    })

    it("clears start date when individual clear button is clicked", () => {
      render(<DateRangePicker {...defaultProps} />)

      // react-datepicker uses aria-label="Close" - first one is for start date
      const clearButtons = screen.getAllByLabelText("Close")
      fireEvent.click(clearButtons[0])

      expect(mockOnChange).toHaveBeenCalledWith("", "2024-01-31")
    })

    it("clears end date when individual clear button is clicked", () => {
      render(<DateRangePicker {...defaultProps} />)

      // react-datepicker uses aria-label="Close" - second one is for end date
      const clearButtons = screen.getAllByLabelText("Close")
      fireEvent.click(clearButtons[1])

      expect(mockOnChange).toHaveBeenCalledWith("2024-01-01", "")
    })
  })
})
