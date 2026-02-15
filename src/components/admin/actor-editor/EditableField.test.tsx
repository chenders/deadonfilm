import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import EditableField from "./EditableField"

// Mock the useFieldHistory hook
vi.mock("../../../hooks/admin/useFieldHistory", () => ({
  useFieldHistory: vi.fn(() => ({
    history: [],
    isLoading: false,
    isError: false,
    error: null,
    total: 0,
    hasMore: false,
  })),
}))

import { useFieldHistory } from "../../../hooks/admin/useFieldHistory"

describe("EditableField", () => {
  describe("text input", () => {
    it("renders text input with label", () => {
      render(<EditableField name="test" label="Test Field" value="Hello" onChange={vi.fn()} />)

      expect(screen.getByLabelText("Test Field")).toBeInTheDocument()
      expect(screen.getByDisplayValue("Hello")).toBeInTheDocument()
    })

    it("calls onChange when value changes", () => {
      const handleChange = vi.fn()
      render(<EditableField name="test" label="Test Field" value="" onChange={handleChange} />)

      fireEvent.change(screen.getByLabelText("Test Field"), { target: { value: "New Value" } })

      expect(handleChange).toHaveBeenCalledWith("New Value")
    })

    it("shows placeholder when provided", () => {
      render(
        <EditableField
          name="test"
          label="Test Field"
          value=""
          onChange={vi.fn()}
          placeholder="Enter text..."
        />
      )

      expect(screen.getByPlaceholderText("Enter text...")).toBeInTheDocument()
    })

    it("shows help text when provided", () => {
      render(
        <EditableField
          name="test"
          label="Test Field"
          value=""
          onChange={vi.fn()}
          helpText="This is helpful"
        />
      )

      expect(screen.getByText("This is helpful")).toBeInTheDocument()
    })

    it("is disabled when disabled prop is true", () => {
      render(<EditableField name="test" label="Test Field" value="" onChange={vi.fn()} disabled />)

      expect(screen.getByLabelText("Test Field")).toBeDisabled()
    })
  })

  describe("textarea input", () => {
    it("renders textarea when type is textarea", () => {
      render(
        <EditableField
          name="test"
          label="Test Field"
          value="Long text"
          onChange={vi.fn()}
          type="textarea"
        />
      )

      const textarea = screen.getByLabelText("Test Field")
      expect(textarea.tagName).toBe("TEXTAREA")
      expect(textarea).toHaveValue("Long text")
    })
  })

  describe("date input", () => {
    it("renders date input when type is date", () => {
      render(
        <EditableField
          name="test"
          label="Test Date"
          value="2024-01-15"
          onChange={vi.fn()}
          type="date"
        />
      )

      const input = screen.getByLabelText("Test Date")
      expect(input).toHaveAttribute("type", "date")
      expect(input).toHaveValue("2024-01-15")
    })

    it("slices ISO timestamps to YYYY-MM-DD format", () => {
      render(
        <EditableField
          name="test"
          label="Test Date"
          value="1934-09-28T08:00:00.000Z"
          onChange={vi.fn()}
          type="date"
        />
      )

      expect(screen.getByLabelText("Test Date")).toHaveValue("1934-09-28")
    })

    it("handles null date value", () => {
      render(
        <EditableField name="test" label="Test Date" value={null} onChange={vi.fn()} type="date" />
      )

      expect(screen.getByLabelText("Test Date")).toHaveValue("")
    })
  })

  describe("boolean input", () => {
    it("renders checkbox when type is boolean", () => {
      render(
        <EditableField
          name="test"
          label="Test Bool"
          value={true}
          onChange={vi.fn()}
          type="boolean"
        />
      )

      const checkbox = screen.getByLabelText("Test Bool")
      expect(checkbox).toHaveAttribute("type", "checkbox")
      expect(checkbox).toBeChecked()
    })

    it("calls onChange with boolean value", () => {
      const handleChange = vi.fn()
      render(
        <EditableField
          name="test"
          label="Test Bool"
          value={false}
          onChange={handleChange}
          type="boolean"
        />
      )

      fireEvent.click(screen.getByLabelText("Test Bool"))

      expect(handleChange).toHaveBeenCalledWith(true)
    })
  })

  describe("select input", () => {
    it("renders select with options", () => {
      render(
        <EditableField
          name="test"
          label="Test Select"
          value="opt1"
          onChange={vi.fn()}
          type="select"
          options={[
            { value: "opt1", label: "Option 1" },
            { value: "opt2", label: "Option 2" },
          ]}
        />
      )

      expect(screen.getByLabelText("Test Select")).toHaveValue("opt1")
      expect(screen.getByText("Option 1")).toBeInTheDocument()
      expect(screen.getByText("Option 2")).toBeInTheDocument()
    })
  })

  describe("array input", () => {
    it("renders array as comma-separated values", () => {
      render(
        <EditableField
          name="test"
          label="Test Array"
          value={["one", "two", "three"]}
          onChange={vi.fn()}
          type="array"
        />
      )

      expect(screen.getByDisplayValue("one, two, three")).toBeInTheDocument()
    })

    it("converts comma-separated input to array", () => {
      const handleChange = vi.fn()
      render(
        <EditableField
          name="test"
          label="Test Array"
          value={[]}
          onChange={handleChange}
          type="array"
        />
      )

      fireEvent.change(screen.getByLabelText("Test Array"), { target: { value: "a, b, c" } })

      expect(handleChange).toHaveBeenCalledWith(["a", "b", "c"])
    })
  })

  describe("history and revert", () => {
    const mockHistory = [
      {
        field_name: "test",
        old_value: "Old Value",
        new_value: "New Value",
        source: "admin-manual-edit",
        created_at: "2024-01-15T10:00:00Z",
      },
    ]

    it("shows revert button when history exists", () => {
      render(
        <EditableField
          name="test"
          label="Test Field"
          value="New Value"
          onChange={vi.fn()}
          history={mockHistory}
          onRevert={vi.fn()}
        />
      )

      expect(screen.getByText("Revert")).toBeInTheDocument()
    })

    it("hides revert button when no history", () => {
      render(<EditableField name="test" label="Test Field" value="Value" onChange={vi.fn()} />)

      expect(screen.queryByText("Revert")).not.toBeInTheDocument()
    })

    it("calls onRevert with old value when clicked", () => {
      const handleRevert = vi.fn()
      render(
        <EditableField
          name="test"
          label="Test Field"
          value="New Value"
          onChange={vi.fn()}
          history={mockHistory}
          onRevert={handleRevert}
        />
      )

      fireEvent.click(screen.getByText("Revert"))

      expect(handleRevert).toHaveBeenCalledWith("Old Value")
    })

    it("shows last changed info", () => {
      render(
        <EditableField
          name="test"
          label="Test Field"
          value="Value"
          onChange={vi.fn()}
          history={mockHistory}
        />
      )

      expect(screen.getByText(/Last changed:/)).toBeInTheDocument()
      expect(screen.getByText(/admin-manual-edit/)).toBeInTheDocument()
    })

    it("toggles history view", () => {
      render(
        <EditableField
          name="test"
          label="Test Field"
          value="Value"
          onChange={vi.fn()}
          history={mockHistory}
        />
      )

      // Initially shows "Show history"
      expect(screen.getByText("Show history")).toBeInTheDocument()

      // Click to show history
      fireEvent.click(screen.getByText("Show history"))

      // Now shows "Hide history" and change history panel
      expect(screen.getByText("Hide history")).toBeInTheDocument()
      expect(screen.getByText("Change History")).toBeInTheDocument()
    })
  })

  describe("expanded history panel", () => {
    // Note: mockFullHistory includes field_name because it's used both:
    // 1. For the history prop (expects FieldChange which requires field_name)
    // 2. For mocking useFieldHistory (expects FieldHistoryEntry which doesn't have field_name)
    // The extra property is harmless when passed to useFieldHistory mock
    const mockFullHistory = [
      {
        id: 1,
        field_name: "test",
        old_value: "value3",
        new_value: "value4",
        source: "admin-manual-edit",
        batch_id: "batch-1",
        created_at: "2026-01-15T10:00:00Z",
      },
      {
        id: 2,
        field_name: "test",
        old_value: "value2",
        new_value: "value3",
        source: "claude-enrichment",
        batch_id: null,
        created_at: "2026-01-10T10:00:00Z",
      },
      {
        id: 3,
        field_name: "test",
        old_value: "value1",
        new_value: "value2",
        source: "admin-manual-edit",
        batch_id: "batch-2",
        created_at: "2026-01-05T10:00:00Z",
      },
    ]

    it("should show loading state when fetching full history", () => {
      vi.mocked(useFieldHistory).mockReturnValue({
        history: [],
        isLoading: true,
        isError: false,
        error: null,
        total: 0,
        hasMore: false,
      })

      render(
        <EditableField
          name="test"
          label="Test Field"
          value="value4"
          onChange={vi.fn()}
          actorId={123}
          history={[mockFullHistory[0]]}
        />
      )

      fireEvent.click(screen.getByText("Show history"))

      expect(screen.getByText("Loading history...")).toBeInTheDocument()
    })

    it("should show all history entries when expanded", () => {
      vi.mocked(useFieldHistory).mockReturnValue({
        history: mockFullHistory,
        isLoading: false,
        isError: false,
        error: null,
        total: 3,
        hasMore: false,
      })

      render(
        <EditableField
          name="test"
          label="Test Field"
          value="value4"
          onChange={vi.fn()}
          actorId={123}
          history={[mockFullHistory[0]]}
          onRevert={vi.fn()}
        />
      )

      fireEvent.click(screen.getByText("Show history"))

      expect(screen.getAllByRole("button", { name: /Revert/i })).toHaveLength(3)
    })

    it("should call onRevert with correct value from any history row", () => {
      vi.mocked(useFieldHistory).mockReturnValue({
        history: mockFullHistory,
        isLoading: false,
        isError: false,
        error: null,
        total: 3,
        hasMore: false,
      })

      const handleRevert = vi.fn()
      render(
        <EditableField
          name="test"
          label="Test Field"
          value="value4"
          onChange={vi.fn()}
          actorId={123}
          history={[mockFullHistory[0]]}
          onRevert={handleRevert}
        />
      )

      fireEvent.click(screen.getByText("Show history"))

      const revertButtons = screen.getAllByRole("button", { name: /Revert/i })
      fireEvent.click(revertButtons[2])

      expect(handleRevert).toHaveBeenCalledWith("value1")
    })

    it("should only fetch when panel is expanded", () => {
      vi.mocked(useFieldHistory).mockReturnValue({
        history: [],
        isLoading: false,
        isError: false,
        error: null,
        total: 0,
        hasMore: false,
      })

      render(
        <EditableField
          name="test"
          label="Test Field"
          value="value"
          onChange={vi.fn()}
          actorId={123}
          history={[mockFullHistory[0]]}
        />
      )

      expect(useFieldHistory).toHaveBeenLastCalledWith(123, "test", false)

      fireEvent.click(screen.getByText("Show history"))

      expect(useFieldHistory).toHaveBeenLastCalledWith(123, "test", true)
    })
  })
})
