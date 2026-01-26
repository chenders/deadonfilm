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
          <h1 className="text-3xl font-bold text-white">A/B Tests</h1>
          <p className="mt-2 text-gray-400">
            Experiments comparing different approaches to death information enrichment
          </p>
        </div>

        {/* Test List */}
        <div className="grid gap-6">
          {abTests.map((test) => (
            <Link
              key={test.id}
              to={test.path}
              className="hover:bg-gray-750 block rounded-lg bg-gray-800 p-6 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-semibold text-white">{test.name}</h2>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        test.status === "active"
                          ? "bg-green-500/20 text-green-400"
                          : test.status === "completed"
                            ? "bg-blue-500/20 text-blue-400"
                            : "bg-gray-500/20 text-gray-400"
                      }`}
                    >
                      {test.status.charAt(0).toUpperCase() + test.status.slice(1)}
                    </span>
                  </div>
                  <p className="mt-2 text-gray-400">{test.description}</p>
                </div>
                <svg
                  className="h-6 w-6 flex-shrink-0 text-gray-400"
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
          <div className="rounded-lg bg-gray-800 p-12 text-center">
            <p className="text-gray-400">No A/B tests configured yet.</p>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
