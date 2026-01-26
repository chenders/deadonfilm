import { Link } from "react-router-dom"
import AdminLayout from "../../components/admin/AdminLayout"

interface ABTest {
  id: string
  name: string
  description: string
  path: string
  status: "active" | "completed" | "planned"
}

const abTests: ABTest[] = [
  {
    id: "source-requirement",
    name: "Source Requirement",
    description: "Comparing AI enrichment results with and without the source URL requirement",
    path: "/admin/ab-tests/source-requirement",
    status: "active",
  },
  {
    id: "provider-comparison",
    name: "AI Provider Comparison",
    description:
      "Comparing death enrichment quality across different AI providers (Gemini vs Perplexity)",
    path: "/admin/ab-tests/provider-comparison",
    status: "active",
  },
  {
    id: "comprehensive",
    name: "Comprehensive A/B Tests",
    description:
      "Provider × Source Strategy comparison with real-time tracking and statistical analysis",
    path: "/admin/ab-tests/comprehensive",
    status: "active",
  },
]

export default function ABTestsIndexPage() {
  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-admin-text-primary md:text-3xl">A/B Tests</h1>
          <p className="mt-2 text-admin-text-muted">
            Experiments comparing different approaches to death information enrichment
          </p>
        </div>

        {/* Test List */}
        <div className="grid gap-6">
          {abTests.map((test) => (
            <Link
              key={test.id}
              to={test.path}
              className="block rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm transition-colors hover:bg-admin-interactive-secondary md:p-6"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-semibold text-admin-text-primary">{test.name}</h2>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        test.status === "active"
                          ? "bg-admin-success/20 text-admin-success"
                          : test.status === "completed"
                            ? "bg-admin-interactive/20 text-admin-interactive"
                            : "bg-admin-surface-overlay/20 text-admin-text-muted"
                      }`}
                    >
                      {test.status.charAt(0).toUpperCase() + test.status.slice(1)}
                    </span>
                  </div>
                  <p className="mt-2 text-admin-text-muted">{test.description}</p>
                </div>
                <svg
                  className="h-6 w-6 flex-shrink-0 text-admin-text-muted"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </Link>
          ))}
        </div>

        {/* Empty State */}
        {abTests.length === 0 && (
          <div className="rounded-lg bg-admin-surface-elevated p-12 text-center shadow-admin-sm">
            <p className="text-admin-text-muted">No A/B tests configured yet.</p>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
