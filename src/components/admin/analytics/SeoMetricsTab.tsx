/**
 * SEO Metrics tab content for the Analytics Hub.
 *
 * Displays Google Search Console data including:
 * - Search performance overview (clicks, impressions, CTR, position)
 * - Top queries and pages tables
 * - Performance by page type
 * - Sitemap status
 * - Indexing health
 * - SEO alerts
 */

import { useState } from "react"
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { useChartTheme, useChartTooltipStyle } from "../../../hooks/admin/useChartTheme"
import {
  useGscStatus,
  useSearchPerformance,
  useTopQueries,
  useTopPages,
  usePageTypePerformance,
  useSitemaps,
  useIndexingStatus,
  useGscAlerts,
  useGscSnapshot,
  useInspectUrl,
  useAcknowledgeAlert,
} from "../../../hooks/admin/useGsc"
import StatCard from "./StatCard"

const DATE_RANGE_OPTIONS = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
]

export default function SeoMetricsTab() {
  const [days, setDays] = useState(30)
  const [inspectUrlInput, setInspectUrlInput] = useState("")

  const { data: status } = useGscStatus()
  const { data: performance, isLoading: perfLoading } = useSearchPerformance(days)
  const { data: topQueries, isLoading: queriesLoading } = useTopQueries(days, 20)
  const { data: topPages, isLoading: pagesLoading } = useTopPages(days, 20)
  const { data: pageTypes, isLoading: typesLoading } = usePageTypePerformance(days)
  const { data: sitemaps } = useSitemaps()
  const { data: indexing } = useIndexingStatus(90)
  const { data: alerts } = useGscAlerts(false)
  const snapshotMutation = useGscSnapshot()
  const inspectMutation = useInspectUrl()
  const acknowledgeMutation = useAcknowledgeAlert()

  const chartTheme = useChartTheme()
  const tooltipStyle = useChartTooltipStyle()

  if (!status?.configured) {
    return <GscNotConfigured />
  }

  return (
    <div className="space-y-8">
      {/* Date Range Selector */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-admin-text-muted">Period:</span>
        {DATE_RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setDays(opt.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              days === opt.value
                ? "bg-admin-interactive-primary text-white"
                : "bg-admin-surface-elevated text-admin-text-secondary hover:bg-admin-interactive-secondary"
            }`}
          >
            {opt.label}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          {performance?.source === "api" && (
            <span className="bg-admin-success/10 rounded-full px-2 py-0.5 text-xs text-admin-success">
              Live API
            </span>
          )}
          {performance?.source === "db" && (
            <span className="bg-admin-warning/10 rounded-full px-2 py-0.5 text-xs text-admin-warning">
              Stored Data
            </span>
          )}
          <button
            onClick={() => snapshotMutation.mutate()}
            disabled={snapshotMutation.isPending}
            className="rounded-md bg-admin-surface-elevated px-3 py-1.5 text-sm font-medium text-admin-text-secondary transition-colors hover:bg-admin-interactive-secondary disabled:opacity-50"
            data-testid="gsc-snapshot-button"
          >
            {snapshotMutation.isPending ? "Saving..." : "Save Snapshot"}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {alerts && alerts.data.length > 0 && (
        <AlertsSection
          alerts={alerts.data}
          onAcknowledge={(id) => acknowledgeMutation.mutate(id)}
        />
      )}

      {/* Performance Overview */}
      <PerformanceOverview
        performance={performance}
        isLoading={perfLoading}
        chartTheme={chartTheme}
        tooltipStyle={tooltipStyle}
      />

      {/* Top Queries & Pages */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <TopQueriesSection data={topQueries} isLoading={queriesLoading} />
        <TopPagesSection data={topPages} isLoading={pagesLoading} />
      </div>

      {/* Page Type Performance */}
      <PageTypeSection
        data={pageTypes}
        isLoading={typesLoading}
        chartTheme={chartTheme}
        tooltipStyle={tooltipStyle}
      />

      {/* Indexing & Sitemaps */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <IndexingSection data={indexing} chartTheme={chartTheme} tooltipStyle={tooltipStyle} />
        <SitemapsSection data={sitemaps} />
      </div>

      {/* URL Inspection Tool */}
      <UrlInspectionSection
        inspectUrlInput={inspectUrlInput}
        setInspectUrlInput={setInspectUrlInput}
        inspectMutation={inspectMutation}
      />
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

function GscNotConfigured() {
  return (
    <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-8 text-center">
      <h3 className="text-lg font-semibold text-admin-text-primary">
        Google Search Console Not Configured
      </h3>
      <p className="mt-2 text-admin-text-muted">
        Set the following environment variables to enable GSC integration:
      </p>
      <ul className="mt-4 space-y-1 font-mono text-sm text-admin-text-secondary">
        <li>GSC_SERVICE_ACCOUNT_EMAIL</li>
        <li>GSC_PRIVATE_KEY</li>
        <li>GSC_SITE_URL</li>
      </ul>
      <p className="mt-4 text-sm text-admin-text-muted">
        See the .env.example file for setup instructions.
      </p>
    </div>
  )
}

function AlertsSection({
  alerts,
  onAcknowledge,
}: {
  alerts: Array<{
    id: number
    alert_type: string
    severity: string
    message: string
    created_at: string
  }>
  onAcknowledge: (id: number) => void
}) {
  return (
    <div className="border-admin-warning/30 bg-admin-warning/5 rounded-lg border p-4">
      <h3 className="mb-3 text-sm font-semibold text-admin-warning">
        SEO Alerts ({alerts.length})
      </h3>
      <div className="space-y-2">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className="flex items-start justify-between rounded-md bg-admin-surface-elevated p-3"
          >
            <div>
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                  alert.severity === "critical"
                    ? "bg-admin-danger/10 text-admin-danger"
                    : "bg-admin-warning/10 text-admin-warning"
                }`}
              >
                {alert.severity}
              </span>
              <p className="mt-1 text-sm text-admin-text-primary">{alert.message}</p>
              <p className="mt-0.5 text-xs text-admin-text-muted">
                {new Date(alert.created_at).toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={() => onAcknowledge(alert.id)}
              className="ml-3 shrink-0 text-xs text-admin-text-muted hover:text-admin-text-secondary"
            >
              Dismiss
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

interface ChartThemeProps {
  chartTheme: ReturnType<typeof useChartTheme>
  tooltipStyle: ReturnType<typeof useChartTooltipStyle>
}

function PerformanceOverview({
  performance,
  isLoading,
  chartTheme,
  tooltipStyle,
}: {
  performance?: ReturnType<typeof useSearchPerformance>["data"]
  isLoading: boolean
} & ChartThemeProps) {
  if (isLoading) {
    return <LoadingSection title="Search Performance" />
  }

  if (!performance) return null

  const { totals, data } = performance

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-admin-text-primary">Search Performance</h2>

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Clicks" value={totals.clicks.toLocaleString()} />
        <StatCard label="Total Impressions" value={totals.impressions.toLocaleString()} />
        <StatCard label="Average CTR" value={`${(totals.ctr * 100).toFixed(1)}%`} />
        <StatCard label="Average Position" value={totals.position.toFixed(1)} />
      </div>

      {/* Performance Chart */}
      <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
            <XAxis
              dataKey="date"
              stroke={chartTheme.axis}
              tick={{ fontSize: 12 }}
              tickFormatter={(value: string) => {
                const d = new Date(value + "T00:00:00")
                return `${d.getMonth() + 1}/${d.getDate()}`
              }}
            />
            <YAxis yAxisId="left" stroke={chartTheme.axis} tick={{ fontSize: 12 }} />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke={chartTheme.axis}
              tick={{ fontSize: 12 }}
            />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ color: chartTheme.legend }} />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="clicks"
              stroke={chartTheme.series[0]}
              name="Clicks"
              dot={false}
              strokeWidth={2}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="impressions"
              stroke={chartTheme.series[1]}
              name="Impressions"
              dot={false}
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function TopQueriesSection({
  data,
  isLoading,
}: {
  data?: ReturnType<typeof useTopQueries>["data"]
  isLoading: boolean
}) {
  if (isLoading) return <LoadingSection title="Top Queries" />
  if (!data) return null

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-admin-text-primary">Top Queries</h2>
      <div className="overflow-x-auto rounded-lg border border-admin-border bg-admin-surface-elevated">
        <table className="w-full text-sm" data-testid="gsc-top-queries-table">
          <thead>
            <tr className="border-b border-admin-border-subtle bg-admin-surface-base">
              <th className="px-4 py-3 text-left font-medium text-admin-text-muted">Query</th>
              <th className="px-4 py-3 text-right font-medium text-admin-text-muted">Clicks</th>
              <th className="px-4 py-3 text-right font-medium text-admin-text-muted">
                Impressions
              </th>
              <th className="px-4 py-3 text-right font-medium text-admin-text-muted">CTR</th>
              <th className="px-4 py-3 text-right font-medium text-admin-text-muted">Position</th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((row, i) => (
              <tr key={row.query} className={i % 2 === 0 ? "" : "bg-admin-surface-base/50"}>
                <td className="max-w-[200px] truncate px-4 py-2.5 text-admin-text-primary">
                  {row.query}
                </td>
                <td className="px-4 py-2.5 text-right text-admin-text-secondary">
                  {row.clicks.toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-right text-admin-text-secondary">
                  {row.impressions.toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-right text-admin-text-secondary">
                  {(row.ctr * 100).toFixed(1)}%
                </td>
                <td className="px-4 py-2.5 text-right text-admin-text-secondary">
                  {row.position.toFixed(1)}
                </td>
              </tr>
            ))}
            {data.data.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-admin-text-muted">
                  No query data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TopPagesSection({
  data,
  isLoading,
}: {
  data?: ReturnType<typeof useTopPages>["data"]
  isLoading: boolean
}) {
  if (isLoading) return <LoadingSection title="Top Pages" />
  if (!data) return null

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-admin-text-primary">Top Pages</h2>
      <div className="overflow-x-auto rounded-lg border border-admin-border bg-admin-surface-elevated">
        <table className="w-full text-sm" data-testid="gsc-top-pages-table">
          <thead>
            <tr className="border-b border-admin-border-subtle bg-admin-surface-base">
              <th className="px-4 py-3 text-left font-medium text-admin-text-muted">Page</th>
              <th className="px-4 py-3 text-right font-medium text-admin-text-muted">Clicks</th>
              <th className="px-4 py-3 text-right font-medium text-admin-text-muted">
                Impressions
              </th>
              <th className="px-4 py-3 text-right font-medium text-admin-text-muted">CTR</th>
              <th className="px-4 py-3 text-right font-medium text-admin-text-muted">Position</th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((row, i) => (
              <tr key={row.page_url} className={i % 2 === 0 ? "" : "bg-admin-surface-base/50"}>
                <td className="max-w-[250px] truncate px-4 py-2.5 text-admin-text-primary">
                  {formatPageUrl(row.page_url)}
                </td>
                <td className="px-4 py-2.5 text-right text-admin-text-secondary">
                  {row.clicks.toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-right text-admin-text-secondary">
                  {row.impressions.toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-right text-admin-text-secondary">
                  {(row.ctr * 100).toFixed(1)}%
                </td>
                <td className="px-4 py-2.5 text-right text-admin-text-secondary">
                  {row.position.toFixed(1)}
                </td>
              </tr>
            ))}
            {data.data.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-admin-text-muted">
                  No page data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PageTypeSection({
  data,
  isLoading,
  chartTheme,
  tooltipStyle,
}: {
  data?: ReturnType<typeof usePageTypePerformance>["data"]
  isLoading: boolean
} & ChartThemeProps) {
  if (isLoading) return <LoadingSection title="Performance by Page Type" />
  if (!data) return null

  const chartData = Object.entries(data.data)
    .map(([type, metrics]) => ({
      type: formatPageType(type),
      clicks: metrics.clicks,
      impressions: metrics.impressions,
      ctr: metrics.ctr * 100,
      position: metrics.position,
    }))
    .sort((a, b) => b.impressions - a.impressions)

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-admin-text-primary">
        Performance by Page Type
      </h2>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Bar chart */}
        <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4">
          <h3 className="mb-3 text-sm font-medium text-admin-text-muted">Clicks & Impressions</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
              <XAxis dataKey="type" stroke={chartTheme.axis} tick={{ fontSize: 11 }} />
              <YAxis stroke={chartTheme.axis} tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ color: chartTheme.legend }} />
              <Bar dataKey="clicks" fill={chartTheme.series[0]} name="Clicks" />
              <Bar dataKey="impressions" fill={chartTheme.series[1]} name="Impressions" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-admin-border bg-admin-surface-elevated">
          <table className="w-full text-sm" data-testid="gsc-page-types-table">
            <thead>
              <tr className="border-b border-admin-border-subtle bg-admin-surface-base">
                <th className="px-4 py-3 text-left font-medium text-admin-text-muted">Type</th>
                <th className="px-4 py-3 text-right font-medium text-admin-text-muted">Clicks</th>
                <th className="px-4 py-3 text-right font-medium text-admin-text-muted">Impr.</th>
                <th className="px-4 py-3 text-right font-medium text-admin-text-muted">CTR</th>
                <th className="px-4 py-3 text-right font-medium text-admin-text-muted">Pos.</th>
              </tr>
            </thead>
            <tbody>
              {chartData.map((row, i) => (
                <tr key={row.type} className={i % 2 === 0 ? "" : "bg-admin-surface-base/50"}>
                  <td className="px-4 py-2.5 font-medium text-admin-text-primary">{row.type}</td>
                  <td className="px-4 py-2.5 text-right text-admin-text-secondary">
                    {row.clicks.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right text-admin-text-secondary">
                    {row.impressions.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right text-admin-text-secondary">
                    {row.ctr.toFixed(1)}%
                  </td>
                  <td className="px-4 py-2.5 text-right text-admin-text-secondary">
                    {row.position.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function IndexingSection({
  data,
  chartTheme,
  tooltipStyle,
}: {
  data?: ReturnType<typeof useIndexingStatus>["data"]
} & ChartThemeProps) {
  if (!data || data.data.length === 0) {
    return (
      <div>
        <h2 className="mb-4 text-xl font-semibold text-admin-text-primary">Indexing Health</h2>
        <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-6 text-center text-admin-text-muted">
          No indexing data yet. Click "Save Snapshot" to start tracking.
        </div>
      </div>
    )
  }

  const latest = data.data[data.data.length - 1]
  const indexRate =
    latest.total_submitted > 0
      ? ((latest.total_indexed / latest.total_submitted) * 100).toFixed(1)
      : "0"

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-admin-text-primary">Indexing Health</h2>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Submitted" value={latest.total_submitted.toLocaleString()} />
          <StatCard label="Indexed" value={latest.total_indexed.toLocaleString()} />
          <StatCard label="Index Rate" value={`${indexRate}%`} />
        </div>
        <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data.data}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
              <XAxis
                dataKey="date"
                stroke={chartTheme.axis}
                tick={{ fontSize: 11 }}
                tickFormatter={(value: string) => {
                  const d = new Date(value + "T00:00:00")
                  return `${d.getMonth() + 1}/${d.getDate()}`
                }}
              />
              <YAxis stroke={chartTheme.axis} tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ color: chartTheme.legend }} />
              <Line
                type="monotone"
                dataKey="total_indexed"
                stroke={chartTheme.series[0]}
                name="Indexed"
                dot={false}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="total_submitted"
                stroke={chartTheme.series[2]}
                name="Submitted"
                dot={false}
                strokeWidth={2}
                strokeDasharray="5 5"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

function SitemapsSection({ data }: { data?: ReturnType<typeof useSitemaps>["data"] }) {
  if (!data?.configured) {
    return null
  }

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-admin-text-primary">Sitemaps</h2>
      <div className="space-y-3">
        {data.data.map((sitemap) => (
          <div
            key={sitemap.path}
            className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-sm text-admin-text-primary">{sitemap.path}</p>
                <div className="mt-1 flex gap-3 text-xs text-admin-text-muted">
                  {sitemap.lastDownloaded && (
                    <span>Downloaded: {new Date(sitemap.lastDownloaded).toLocaleDateString()}</span>
                  )}
                  {sitemap.isIndex && <span className="text-admin-text-secondary">Index</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {sitemap.errors > 0 && (
                  <span className="bg-admin-danger/10 rounded-full px-2 py-0.5 text-xs text-admin-danger">
                    {sitemap.errors} errors
                  </span>
                )}
                {sitemap.warnings > 0 && (
                  <span className="bg-admin-warning/10 rounded-full px-2 py-0.5 text-xs text-admin-warning">
                    {sitemap.warnings} warnings
                  </span>
                )}
                {sitemap.isPending && (
                  <span className="bg-admin-interactive-primary/10 text-admin-interactive-primary rounded-full px-2 py-0.5 text-xs">
                    Pending
                  </span>
                )}
              </div>
            </div>
            {sitemap.contents.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {sitemap.contents.map((content) => (
                  <div key={content.type} className="text-xs">
                    <span className="text-admin-text-muted">{content.type}:</span>{" "}
                    <span className="text-admin-text-secondary">
                      {content.indexed}/{content.submitted}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {data.data.length === 0 && (
          <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-6 text-center text-admin-text-muted">
            No sitemaps found
          </div>
        )}
      </div>
    </div>
  )
}

function UrlInspectionSection({
  inspectUrlInput,
  setInspectUrlInput,
  inspectMutation,
}: {
  inspectUrlInput: string
  setInspectUrlInput: (v: string) => void
  inspectMutation: ReturnType<typeof useInspectUrl>
}) {
  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-admin-text-primary">URL Inspection</h2>
      <div className="rounded-lg border border-admin-border bg-admin-surface-elevated p-4">
        <div className="flex gap-3">
          <input
            type="text"
            value={inspectUrlInput}
            onChange={(e) => setInspectUrlInput(e.target.value)}
            placeholder="https://deadonfilm.com/actor/..."
            className="focus:border-admin-interactive-primary focus:ring-admin-interactive-primary flex-1 rounded-md border border-admin-border bg-admin-surface-base px-3 py-2 text-sm text-admin-text-primary placeholder:text-admin-text-muted focus:outline-none focus:ring-1"
            data-testid="gsc-inspect-url-input"
          />
          <button
            onClick={() => inspectMutation.mutate(inspectUrlInput)}
            disabled={!inspectUrlInput || inspectMutation.isPending}
            className="bg-admin-interactive-primary hover:bg-admin-interactive-primary/90 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
            data-testid="gsc-inspect-url-button"
          >
            {inspectMutation.isPending ? "Inspecting..." : "Inspect"}
          </button>
        </div>

        {inspectMutation.data && (
          <div className="mt-4 space-y-2 rounded-md border border-admin-border-subtle bg-admin-surface-base p-4">
            <InspectionRow label="URL" value={inspectMutation.data.url} />
            <InspectionRow label="Verdict" value={inspectMutation.data.verdict} />
            <InspectionRow label="Indexing State" value={inspectMutation.data.indexingState} />
            <InspectionRow label="Page Fetch" value={inspectMutation.data.pageFetchState} />
            <InspectionRow label="Robots.txt" value={inspectMutation.data.robotsTxtState} />
            <InspectionRow label="Crawled As" value={inspectMutation.data.crawledAs || "N/A"} />
            <InspectionRow
              label="Last Crawl"
              value={
                inspectMutation.data.lastCrawlTime
                  ? new Date(inspectMutation.data.lastCrawlTime).toLocaleString()
                  : "N/A"
              }
            />
          </div>
        )}

        {inspectMutation.isError && (
          <p className="mt-3 text-sm text-admin-danger">
            Failed to inspect URL. Check that the URL is valid and belongs to the configured site.
          </p>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Utility components
// ============================================================================

function InspectionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="shrink-0 font-medium text-admin-text-muted">{label}:</span>
      <span className="text-admin-text-primary">{value}</span>
    </div>
  )
}

function LoadingSection({ title }: { title: string }) {
  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-admin-text-primary">{title}</h2>
      <div className="flex h-48 items-center justify-center rounded-lg border border-admin-border bg-admin-surface-elevated">
        <div className="text-admin-text-muted">Loading...</div>
      </div>
    </div>
  )
}

function formatPageUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.pathname || "/"
  } catch {
    return url
  }
}

function formatPageType(type: string): string {
  const labels: Record<string, string> = {
    home: "Home",
    actor: "Actors",
    "actor-death": "Actor Deaths",
    movie: "Movies",
    show: "TV Shows",
    episode: "Episodes",
    deaths: "Deaths",
    "causes-of-death": "Causes of Death",
    genre: "Genres",
    curated: "Curated Pages",
    other: "Other",
  }
  return labels[type] || type
}
