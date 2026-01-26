import AdminLayout from "../../components/admin/AdminLayout"

export default function ExternalToolsPage() {
  const tools = [
    {
      name: "Google Analytics",
      description: "View traffic, user behavior, and conversion metrics",
      url: import.meta.env.VITE_GOOGLE_ANALYTICS_URL,
      icon: "📊",
      color: "bg-admin-warning hover:bg-admin-warning/80",
    },
    {
      name: "Google Search Console",
      description: "Monitor search performance, keywords, and indexing status",
      url: import.meta.env.VITE_GOOGLE_SEARCH_CONSOLE_URL,
      icon: "🔍",
      color: "bg-admin-interactive hover:bg-admin-interactive-hover",
    },
    {
      name: "New Relic APM",
      description: "Application performance, errors, and database metrics",
      url: import.meta.env.VITE_NEW_RELIC_URL,
      icon: "⚡",
      color: "bg-admin-success hover:bg-admin-success/80",
    },
  ]

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-admin-text-primary md:text-3xl">
            External Tools & Resources
          </h1>
          <p className="mt-2 text-admin-text-muted">
            Quick access to analytics and monitoring platforms
          </p>
        </div>

        {/* Tool Cards Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <div
              key={tool.name}
              className="rounded-lg bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6"
            >
              <div className="mb-4 text-4xl">{tool.icon}</div>
              <h2 className="text-xl font-semibold text-admin-text-primary">{tool.name}</h2>
              <p className="mt-2 text-sm text-admin-text-muted">{tool.description}</p>

              {tool.url ? (
                <a
                  href={tool.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`mt-4 inline-block rounded px-4 py-2 text-admin-text-primary transition-colors ${tool.color}`}
                >
                  Open Dashboard →
                </a>
              ) : (
                <div className="mt-4 text-sm text-admin-text-muted">
                  URL not configured. Set{" "}
                  <code className="rounded bg-admin-surface-base px-1 py-0.5">
                    VITE_{tool.name.toUpperCase().replace(/\s+/g, "_")}_URL
                  </code>{" "}
                  in .env
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Configuration Info */}
        <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4 shadow-admin-sm md:p-6">
          <h2 className="mb-4 text-lg font-semibold text-admin-text-primary">Configuration</h2>
          <div className="space-y-2 text-sm text-admin-text-muted">
            <p>
              Configure external tool URLs in your{" "}
              <code className="rounded bg-admin-surface-base px-1 py-0.5">.env</code> file:
            </p>
            <div className="mt-4 rounded bg-admin-surface-base p-4 font-mono text-xs">
              <div>VITE_GOOGLE_ANALYTICS_URL=https://analytics.google.com/analytics/web/...</div>
              <div className="mt-1">
                VITE_GOOGLE_SEARCH_CONSOLE_URL=https://search.google.com/search-console
              </div>
              <div className="mt-1">VITE_NEW_RELIC_URL=https://one.newrelic.com/...</div>
            </div>
          </div>
        </div>

        {/* Security Note */}
        <div className="border-admin-interactive/30 bg-admin-interactive/10 rounded-lg border p-4">
          <p className="text-sm text-admin-interactive">
            <strong>Security Note:</strong> These links are only visible to authenticated admin
            users. External platforms have their own authentication requirements.
          </p>
        </div>
      </div>
    </AdminLayout>
  )
}
