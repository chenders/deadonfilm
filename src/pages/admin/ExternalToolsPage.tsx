import AdminLayout from "../../components/admin/AdminLayout"

export default function ExternalToolsPage() {
  const tools = [
    {
      name: "Google Analytics",
      description: "View traffic, user behavior, and conversion metrics",
      url: import.meta.env.VITE_GOOGLE_ANALYTICS_URL,
      icon: "📊",
      color: "bg-yellow-600 hover:bg-yellow-700",
    },
    {
      name: "Google Search Console",
      description: "Monitor search performance, keywords, and indexing status",
      url: import.meta.env.VITE_GOOGLE_SEARCH_CONSOLE_URL,
      icon: "🔍",
      color: "bg-blue-600 hover:bg-blue-700",
    },
    {
      name: "New Relic APM",
      description: "Application performance, errors, and database metrics",
      url: import.meta.env.VITE_NEW_RELIC_URL,
      icon: "⚡",
      color: "bg-green-600 hover:bg-green-700",
    },
  ]

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white">External Tools & Resources</h1>
          <p className="mt-2 text-gray-400">Quick access to analytics and monitoring platforms</p>
        </div>

        {/* Tool Cards Grid */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <div key={tool.name} className="rounded-lg bg-gray-800 p-6">
              <div className="mb-4 text-4xl">{tool.icon}</div>
              <h2 className="text-xl font-semibold text-white">{tool.name}</h2>
              <p className="mt-2 text-sm text-gray-400">{tool.description}</p>

              {tool.url ? (
                <a
                  href={tool.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`mt-4 inline-block rounded px-4 py-2 text-white transition-colors ${tool.color}`}
                >
                  Open Dashboard →
                </a>
              ) : (
                <div className="mt-4 text-sm text-gray-500">
                  URL not configured. Set{" "}
                  <code className="rounded bg-gray-900 px-1 py-0.5">
                    VITE_{tool.name.toUpperCase().replace(/\s+/g, "_")}_URL
                  </code>{" "}
                  in .env
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Configuration Info */}
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">Configuration</h2>
          <div className="space-y-2 text-sm text-gray-400">
            <p>
              Configure external tool URLs in your{" "}
              <code className="rounded bg-gray-900 px-1 py-0.5">.env</code> file:
            </p>
            <div className="mt-4 rounded bg-gray-900 p-4 font-mono text-xs">
              <div>VITE_GOOGLE_ANALYTICS_URL=https://analytics.google.com/analytics/web/...</div>
              <div className="mt-1">
                VITE_GOOGLE_SEARCH_CONSOLE_URL=https://search.google.com/search-console
              </div>
              <div className="mt-1">VITE_NEW_RELIC_URL=https://one.newrelic.com/...</div>
            </div>
          </div>
        </div>

        {/* Security Note */}
        <div className="rounded-lg border border-blue-900 bg-blue-950 p-4">
          <p className="text-sm text-blue-200">
            <strong>Security Note:</strong> These links are only visible to authenticated admin
            users. External platforms have their own authentication requirements.
          </p>
        </div>
      </div>
    </AdminLayout>
  )
}
