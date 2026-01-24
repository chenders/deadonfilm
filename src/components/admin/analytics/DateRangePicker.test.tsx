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

      const startInput = screen.getByLabelText(/Start Date/i)
      const endInput = screen.getByLabelText(/End Date/i)

      expect(startInput).toBeInTheDocument()
      expect(endInput).toBeInTheDocument()
      expect(startInput).toHaveValue("2024-01-01")
      expect(endInput).toHaveValue("2024-01-31")
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

      const startInput = screen.getByLabelText(/Start Date/i)
      fireEvent.change(startInput, { target: { value: "2024-01-15" } })

      expect(mockOnChange).toHaveBeenCalledWith("2024-01-15", "2024-01-31")
    })

    it("handles end date change", () => {
      render(<DateRangePicker {...defaultProps} />)

      const endInput = screen.getByLabelText(/End Date/i)
      fireEvent.change(endInput, { target: { value: "2024-02-15" } })

      expect(mockOnChange).toHaveBeenCalledWith("2024-01-01", "2024-02-15")
    })

    it("handles both dates changing", () => {
      render(<DateRangePicker {...defaultProps} />)

      const startInput = screen.getByLabelText(/Start Date/i)
      const endInput = screen.getByLabelText(/End Date/i)

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

      const startInput = screen.getByLabelText(/Start Date/i)
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
})
