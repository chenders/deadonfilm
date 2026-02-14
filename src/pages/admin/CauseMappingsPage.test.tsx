import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AdminTestWrapper } from "../../test/test-utils"

// Mock child tab components to isolate page-level testing
vi.mock("../../components/admin/cause-mappings/MannerMappingsTab", () => ({
  default: () => <div data-testid="manner-mappings-tab">MannerMappingsTab</div>,
}))
vi.mock("../../components/admin/cause-mappings/NormalizationsTab", () => ({
  default: () => <div data-testid="normalizations-tab">NormalizationsTab</div>,
}))
vi.mock("../../components/admin/cause-mappings/CategoryPreviewTab", () => ({
  default: () => <div data-testid="category-preview-tab">CategoryPreviewTab</div>,
}))
vi.mock("../../hooks/useAdminAuth", () => ({
  useAdminAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
  AdminAuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import CauseMappingsPage from "./CauseMappingsPage"

function renderPage(initialRoute = "/admin/cause-mappings") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminTestWrapper initialEntries={[initialRoute]}>
        <CauseMappingsPage />
      </AdminTestWrapper>
    </QueryClientProvider>
  )
}

describe("CauseMappingsPage", () => {
  it("renders page title and description", () => {
    renderPage()
    expect(screen.getByRole("heading", { name: "Cause Mappings" })).toBeInTheDocument()
    expect(
      screen.getByText("Manage manner-of-death classifications and cause normalizations")
    ).toBeInTheDocument()
  })

  it("renders all three tab buttons", () => {
    renderPage()
    expect(screen.getByTestId("tab-manner")).toBeInTheDocument()
    expect(screen.getByTestId("tab-normalizations")).toBeInTheDocument()
    expect(screen.getByTestId("tab-preview")).toBeInTheDocument()
  })

  it("shows MannerMappingsTab by default", () => {
    renderPage()
    expect(screen.getByTestId("manner-mappings-tab")).toBeInTheDocument()
    expect(screen.queryByTestId("normalizations-tab")).not.toBeInTheDocument()
    expect(screen.queryByTestId("category-preview-tab")).not.toBeInTheDocument()
  })

  it("shows NormalizationsTab when tab param is normalizations", () => {
    renderPage("/admin/cause-mappings?tab=normalizations")
    expect(screen.getByTestId("normalizations-tab")).toBeInTheDocument()
    expect(screen.queryByTestId("manner-mappings-tab")).not.toBeInTheDocument()
  })

  it("shows CategoryPreviewTab when tab param is preview", () => {
    renderPage("/admin/cause-mappings?tab=preview")
    expect(screen.getByTestId("category-preview-tab")).toBeInTheDocument()
    expect(screen.queryByTestId("manner-mappings-tab")).not.toBeInTheDocument()
  })
})
