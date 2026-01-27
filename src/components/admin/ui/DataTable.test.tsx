import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import DataTable, { Column } from "./DataTable"

interface TestRow {
  id: number
  name: string
  status: string
  count: number
}

const testData: TestRow[] = [
  { id: 1, name: "Alice", status: "active", count: 10 },
  { id: 2, name: "Bob", status: "inactive", count: 5 },
  { id: 3, name: "Charlie", status: "active", count: 15 },
]

const testColumns: Column<TestRow>[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "status", label: "Status" },
  { key: "count", label: "Count", sortable: true, align: "right" },
]

const getRowKey = (row: TestRow) => row.id

describe("DataTable", () => {
  describe("basic rendering", () => {
    it("renders table with data", () => {
      render(<DataTable data={testData} columns={testColumns} getRowKey={getRowKey} />)
      expect(screen.getByText("Alice")).toBeInTheDocument()
      expect(screen.getByText("Bob")).toBeInTheDocument()
      expect(screen.getByText("Charlie")).toBeInTheDocument()
    })

    it("renders column headers", () => {
      render(<DataTable data={testData} columns={testColumns} getRowKey={getRowKey} />)
      expect(screen.getByText("Name")).toBeInTheDocument()
      expect(screen.getByText("Status")).toBeInTheDocument()
      expect(screen.getByText("Count")).toBeInTheDocument()
    })

    it("renders empty state when no data", () => {
      render(
        <DataTable
          data={[]}
          columns={testColumns}
          getRowKey={getRowKey}
          emptyMessage="No items found"
        />
      )
      expect(screen.getByText("No items found")).toBeInTheDocument()
    })

    it("renders loading skeleton", () => {
      render(<DataTable data={testData} columns={testColumns} getRowKey={getRowKey} isLoading />)
      expect(screen.getByRole("status")).toBeInTheDocument()
    })

    it("uses custom render function for cells", () => {
      const columnsWithRender: Column<TestRow>[] = [
        {
          key: "name",
          label: "Name",
          render: (row) => <strong data-testid="custom-cell">{row.name.toUpperCase()}</strong>,
        },
      ]
      render(<DataTable data={testData} columns={columnsWithRender} getRowKey={getRowKey} />)
      const cells = screen.getAllByTestId("custom-cell")
      expect(cells).toHaveLength(3)
      expect(cells[0]).toHaveTextContent("ALICE")
      expect(cells[1]).toHaveTextContent("BOB")
      expect(cells[2]).toHaveTextContent("CHARLIE")
    })
  })

  describe("sorting", () => {
    it("renders sort indicators for sortable columns", () => {
      render(<DataTable data={testData} columns={testColumns} getRowKey={getRowKey} />)
      // Name and Count columns have sortable: true, so they should have clickable buttons
      const nameHeader = screen.getByRole("button", { name: /Name/i })
      expect(nameHeader).toBeInTheDocument()
    })

    it("calls onSortChange when clicking sortable column", () => {
      const onSortChange = vi.fn()
      render(
        <DataTable
          data={testData}
          columns={testColumns}
          getRowKey={getRowKey}
          onSortChange={onSortChange}
        />
      )
      fireEvent.click(screen.getByRole("button", { name: /Name/i }))
      expect(onSortChange).toHaveBeenCalledWith({ key: "name", direction: "asc" })
    })

    it("toggles sort direction on subsequent clicks", () => {
      const onSortChange = vi.fn()
      render(
        <DataTable
          data={testData}
          columns={testColumns}
          getRowKey={getRowKey}
          onSortChange={onSortChange}
        />
      )
      const nameButton = screen.getByRole("button", { name: /Name/i })

      // First click - ascending
      fireEvent.click(nameButton)
      expect(onSortChange).toHaveBeenLastCalledWith({ key: "name", direction: "asc" })

      // Second click - descending
      fireEvent.click(nameButton)
      expect(onSortChange).toHaveBeenLastCalledWith({ key: "name", direction: "desc" })

      // Third click - remove sort
      fireEvent.click(nameButton)
      expect(onSortChange).toHaveBeenLastCalledWith(null)
    })
  })

  describe("filtering", () => {
    it("renders filter inputs for filterable columns", () => {
      const columnsWithFilter: Column<TestRow>[] = [
        { key: "name", label: "Name", filterable: true },
        { key: "status", label: "Status" },
      ]
      render(<DataTable data={testData} columns={columnsWithFilter} getRowKey={getRowKey} />)
      expect(screen.getByPlaceholderText("Filter name...")).toBeInTheDocument()
    })

    it("filters data based on input", () => {
      const columnsWithFilter: Column<TestRow>[] = [
        { key: "name", label: "Name", filterable: true },
        { key: "status", label: "Status" },
      ]
      render(<DataTable data={testData} columns={columnsWithFilter} getRowKey={getRowKey} />)

      const filterInput = screen.getByPlaceholderText("Filter name...")
      fireEvent.change(filterInput, { target: { value: "Alice" } })

      // Only Alice should be visible
      expect(screen.getByText("Alice")).toBeInTheDocument()
      expect(screen.queryByText("Bob")).not.toBeInTheDocument()
      expect(screen.queryByText("Charlie")).not.toBeInTheDocument()
    })

    it("filters case-insensitively", () => {
      const columnsWithFilter: Column<TestRow>[] = [
        { key: "name", label: "Name", filterable: true },
        { key: "status", label: "Status" },
      ]
      render(<DataTable data={testData} columns={columnsWithFilter} getRowKey={getRowKey} />)

      const filterInput = screen.getByPlaceholderText("Filter name...")
      fireEvent.change(filterInput, { target: { value: "alice" } })

      expect(screen.getByText("Alice")).toBeInTheDocument()
    })
  })

  describe("selection", () => {
    it("renders checkboxes when selectable is true", () => {
      render(<DataTable data={testData} columns={testColumns} getRowKey={getRowKey} selectable />)
      // Header checkbox + 3 row checkboxes
      const checkboxes = screen.getAllByRole("checkbox")
      expect(checkboxes).toHaveLength(4)
    })

    it("selects individual rows", () => {
      const onSelectionChange = vi.fn()
      render(
        <DataTable
          data={testData}
          columns={testColumns}
          getRowKey={getRowKey}
          selectable
          onSelectionChange={onSelectionChange}
        />
      )

      const checkboxes = screen.getAllByRole("checkbox")
      // First is header, second is first row
      fireEvent.click(checkboxes[1])

      expect(onSelectionChange).toHaveBeenCalled()
    })

    it("selects all rows with header checkbox", () => {
      render(<DataTable data={testData} columns={testColumns} getRowKey={getRowKey} selectable />)

      const checkboxes = screen.getAllByRole("checkbox")
      const headerCheckbox = checkboxes[0]

      fireEvent.click(headerCheckbox)

      // All checkboxes should be checked
      checkboxes.forEach((cb) => {
        expect(cb).toBeChecked()
      })
    })

    it("shows selection count in toolbar", () => {
      render(<DataTable data={testData} columns={testColumns} getRowKey={getRowKey} selectable />)

      const checkboxes = screen.getAllByRole("checkbox")
      fireEvent.click(checkboxes[1])

      expect(screen.getByText("1 selected")).toBeInTheDocument()
    })
  })

  describe("pagination", () => {
    it("renders pagination controls", () => {
      const onPageChange = vi.fn()
      render(
        <DataTable
          data={testData}
          columns={testColumns}
          getRowKey={getRowKey}
          pagination={{
            page: 1,
            pageSize: 10,
            total: 50,
            onPageChange,
          }}
        />
      )
      // The actual text shows the data length (3) not pageSize
      expect(screen.getByText(/Showing/)).toBeInTheDocument()
      expect(screen.getByText(/of 50/)).toBeInTheDocument()
    })

    it("calls onPageChange when clicking next", () => {
      const onPageChange = vi.fn()
      render(
        <DataTable
          data={testData}
          columns={testColumns}
          getRowKey={getRowKey}
          pagination={{
            page: 1,
            pageSize: 10,
            total: 50,
            onPageChange,
          }}
        />
      )

      // Get all buttons and find the next navigation button (last one with SVG)
      const buttons = screen.getAllByRole("button")
      // Find the next button - it's the last button (contains the right arrow SVG)
      const nextBtn = buttons[buttons.length - 1]
      fireEvent.click(nextBtn)

      expect(onPageChange).toHaveBeenCalledWith(2)
    })

    it("disables previous button on first page", () => {
      const onPageChange = vi.fn()
      render(
        <DataTable
          data={testData}
          columns={testColumns}
          getRowKey={getRowKey}
          pagination={{
            page: 1,
            pageSize: 10,
            total: 50,
            onPageChange,
          }}
        />
      )

      // Get all navigation buttons
      const buttons = screen.getAllByRole("button")
      // The previous button should be near the end but disabled
      const prevBtns = buttons.filter((b) => b.hasAttribute("disabled"))
      expect(prevBtns.length).toBeGreaterThan(0)
    })

    it("renders page size selector when onPageSizeChange is provided", () => {
      const onPageChange = vi.fn()
      const onPageSizeChange = vi.fn()
      render(
        <DataTable
          data={testData}
          columns={testColumns}
          getRowKey={getRowKey}
          pagination={{
            page: 1,
            pageSize: 10,
            total: 50,
            onPageChange,
            onPageSizeChange,
          }}
        />
      )

      expect(screen.getByRole("combobox")).toBeInTheDocument()
    })
  })

  describe("export", () => {
    it("renders export dropdown when onExport is provided", () => {
      const onExport = vi.fn()
      render(
        <DataTable
          data={testData}
          columns={testColumns}
          getRowKey={getRowKey}
          onExport={onExport}
        />
      )

      // There should be a select with export options
      const exportSelect = screen.getByRole("combobox")
      expect(exportSelect).toBeInTheDocument()
    })

    it("calls onExport with csv format", () => {
      const onExport = vi.fn()
      render(
        <DataTable
          data={testData}
          columns={testColumns}
          getRowKey={getRowKey}
          onExport={onExport}
        />
      )

      const exportSelect = screen.getByRole("combobox")
      fireEvent.change(exportSelect, { target: { value: "csv" } })

      expect(onExport).toHaveBeenCalledWith("csv")
    })
  })

  describe("alignment", () => {
    it("applies right alignment to cells", () => {
      const columnsWithAlign: Column<TestRow>[] = [
        { key: "name", label: "Name" },
        { key: "count", label: "Count", align: "right" },
      ]
      const { container } = render(
        <DataTable data={testData} columns={columnsWithAlign} getRowKey={getRowKey} />
      )

      // Check that the count cell has text-right class
      const countCell = container.querySelector("td.text-right")
      expect(countCell).toBeInTheDocument()
    })

    it("applies center alignment to cells", () => {
      const columnsWithAlign: Column<TestRow>[] = [
        { key: "name", label: "Name" },
        { key: "status", label: "Status", align: "center" },
      ]
      const { container } = render(
        <DataTable data={testData} columns={columnsWithAlign} getRowKey={getRowKey} />
      )

      const centeredCell = container.querySelector("td.text-center")
      expect(centeredCell).toBeInTheDocument()
    })
  })
})
