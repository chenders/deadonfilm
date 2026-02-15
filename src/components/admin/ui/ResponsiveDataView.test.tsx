import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, within } from "@testing-library/react"
import ResponsiveDataView from "./ResponsiveDataView"
import { Column, PaginationConfig } from "./DataTable"

interface TestRow {
  id: number
  name: string
  status: string
}

const testData: TestRow[] = [
  { id: 1, name: "Alice", status: "active" },
  { id: 2, name: "Bob", status: "inactive" },
]

const columns: Column<TestRow>[] = [
  { key: "name", label: "Name" },
  { key: "status", label: "Status" },
]

const renderMobileCard = (row: TestRow) => ({
  title: row.name,
  subtitle: `ID: ${row.id}`,
  fields: [{ label: "Status", value: row.status }],
})

describe("ResponsiveDataView", () => {
  it("renders both desktop and mobile views (CSS controls visibility)", () => {
    render(
      <ResponsiveDataView
        data={testData}
        columns={columns}
        renderMobileCard={renderMobileCard}
        getRowKey={(row) => row.id}
      />
    )

    // Both are in the DOM; CSS hides one or the other
    // Desktop: DataTable renders the data
    expect(screen.getAllByText("Alice").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("Bob").length).toBeGreaterThanOrEqual(1)
  })

  it("renders mobile cards with title and fields", () => {
    render(
      <ResponsiveDataView
        data={testData}
        columns={columns}
        renderMobileCard={renderMobileCard}
        getRowKey={(row) => row.id}
      />
    )

    // Mobile cards include data-testid
    expect(screen.getByTestId("mobile-card-1")).toBeInTheDocument()
    expect(screen.getByTestId("mobile-card-2")).toBeInTheDocument()
  })

  it("shows loading state", () => {
    render(
      <ResponsiveDataView
        data={[]}
        columns={columns}
        renderMobileCard={renderMobileCard}
        getRowKey={(row: TestRow) => row.id}
        isLoading
      />
    )

    // Both views should show loading indicators
    // Mobile shows pulse placeholders, desktop shows skeleton table
    const pulseElements = document.querySelectorAll(".animate-pulse")
    expect(pulseElements.length).toBeGreaterThan(0)
  })

  it("shows empty message when no data", () => {
    render(
      <ResponsiveDataView
        data={[]}
        columns={columns}
        renderMobileCard={renderMobileCard}
        getRowKey={(row: TestRow) => row.id}
        emptyMessage="No actors found"
      />
    )

    // Both views render the empty message
    expect(screen.getAllByText("No actors found").length).toBeGreaterThanOrEqual(1)
  })

  it("renders mobile pagination when total exceeds page size", () => {
    const onPageChange = vi.fn()
    const pagination: PaginationConfig = {
      page: 1,
      pageSize: 10,
      total: 25,
      onPageChange,
    }

    render(
      <ResponsiveDataView
        data={testData}
        columns={columns}
        renderMobileCard={renderMobileCard}
        getRowKey={(row) => row.id}
        pagination={pagination}
      />
    )

    // Mobile pagination shows page info
    const mobileView = within(screen.getByTestId("mobile-view"))
    expect(mobileView.getByText("Page 1 of 3")).toBeInTheDocument()

    // Click next on mobile pagination
    fireEvent.click(mobileView.getByRole("button", { name: "Next page" }))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it("disables previous button on first page", () => {
    const pagination: PaginationConfig = {
      page: 1,
      pageSize: 10,
      total: 25,
      onPageChange: vi.fn(),
    }

    render(
      <ResponsiveDataView
        data={testData}
        columns={columns}
        renderMobileCard={renderMobileCard}
        getRowKey={(row) => row.id}
        pagination={pagination}
      />
    )

    const mobileView = within(screen.getByTestId("mobile-view"))
    expect(mobileView.getByRole("button", { name: "Previous page" })).toBeDisabled()
  })

  it("disables next button on last page", () => {
    const pagination: PaginationConfig = {
      page: 3,
      pageSize: 10,
      total: 25,
      onPageChange: vi.fn(),
    }

    render(
      <ResponsiveDataView
        data={testData}
        columns={columns}
        renderMobileCard={renderMobileCard}
        getRowKey={(row) => row.id}
        pagination={pagination}
      />
    )

    const mobileView = within(screen.getByTestId("mobile-view"))
    expect(mobileView.getByRole("button", { name: "Next page" })).toBeDisabled()
  })

  it("renders selectable mobile cards", () => {
    const selectedKeys = new Set<string | number>([1])
    const onRowSelectionChange = vi.fn()

    render(
      <ResponsiveDataView
        data={testData}
        columns={columns}
        renderMobileCard={renderMobileCard}
        getRowKey={(row) => row.id}
        selectable
        selectedKeys={selectedKeys}
        onRowSelectionChange={onRowSelectionChange}
      />
    )

    const checkboxes = screen.getAllByRole("checkbox")
    // At least the mobile card checkboxes should be present
    expect(checkboxes.length).toBeGreaterThanOrEqual(2)
  })

  it("does not render mobile pagination when total fits in one page", () => {
    const pagination: PaginationConfig = {
      page: 1,
      pageSize: 10,
      total: 5,
      onPageChange: vi.fn(),
    }

    render(
      <ResponsiveDataView
        data={testData}
        columns={columns}
        renderMobileCard={renderMobileCard}
        getRowKey={(row) => row.id}
        pagination={pagination}
      />
    )

    expect(screen.queryByText("Page 1 of 1")).not.toBeInTheDocument()
  })
})
