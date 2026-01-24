import { useQuery } from "@tanstack/react-query"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { adminApi } from "@/services/api"
import StatCard from "./StatCard"

interface ActorUrlRedirectData {
  dailyData: Array<{
    date: string
    redirect_count: number
  }>
  summary: {
    totalRedirects: number
    avgPerDay: number
    daysTracked: number
    periodDays: number
  }
}

interface ActorUrlMigrationSectionProps {
  startDate: string
  endDate: string
}

function getMigrationHealth(avgPerDay: number): {
  status: "success" | "warning" | "danger"
  label: string
  message: string
} {
  if (avgPerDay < 50) {
    return {
      status: "success",
      label: "Migration Complete",
      message: "Very low redirect volume indicates successful migration",
    }
  } else if (avgPerDay < 500) {
    return {
      status: "warning",
      label: "Migration In Progress",
      message: "Moderate redirect volume, monitor for next few weeks",
    }
  } else {
    return {
      status: "danger",
      label: "High Legacy URL Usage",
      message: "Consider sitemap resubmission or investigation",
    }
  }
}

export default function ActorUrlMigrationSection({
  startDate,
  endDate,
}: ActorUrlMigrationSectionProps) {
  const { data, isLoading, error } = useQuery<ActorUrlRedirectData>({
    queryKey: ["actor-url-redirects", startDate, endDate],
    queryFn: async () => {
      // Calculate days between dates
      const start = new Date(startDate)
      const end = new Date(endDate)
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))

      const response = await fetch(adminApi(`/analytics/actor-url-redirects?days=${days}`))
      if (!response.ok) throw new Error("Failed to fetch redirect data")
      return response.json()
    },
  })

  if (isLoading) {
    return (
      <div className="rounded-lg bg-gray-800 p-6">
        <h3 className="mb-4 text-xl font-semibold text-white">Actor URL Migration Status</h3>
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-400">Loading migration data...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg bg-gray-800 p-6">
        <h3 className="mb-4 text-xl font-semibold text-white">Actor URL Migration Status</h3>
        <div className="flex items-center justify-center py-12">
          <div className="text-red-400">Error loading migration data</div>
        </div>
      </div>
    )
  }

  if (!data) return null

  const health = getMigrationHealth(data.summary.avgPerDay)
  const healthColors = {
    success: "bg-green-900/50 text-green-400 border-green-700",
    warning: "bg-yellow-900/50 text-yellow-400 border-yellow-700",
    danger: "bg-red-900/50 text-red-400 border-red-700",
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-xl font-semibold text-white">Actor URL Migration Status</h3>
        <p className="text-sm text-gray-400">
          Tracking legacy tmdb_id URL redirects to new actor.id URLs
        </p>
      </div>

      {/* Migration Health Card */}
      <div className={`rounded-lg border-2 p-4 ${healthColors[health.status]}`}>
        <div className="flex items-start justify-between">
          <div>
            <h4 className="text-lg font-semibold">{health.label}</h4>
            <p className="mt-1 text-sm opacity-90">{health.message}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{Math.round(data.summary.avgPerDay)}</div>
            <div className="text-xs opacity-75">redirects/day</div>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Redirects" value={data.summary.totalRedirects.toLocaleString()} />
        <StatCard label="Avg Per Day" value={data.summary.avgPerDay.toFixed(1)} />
        <StatCard label="Days Tracked" value={data.summary.daysTracked.toString()} />
        <StatCard label="Period" value={`${data.summary.periodDays} days`} />
      </div>

      {/* Redirect Trend Chart */}
      <div className="rounded-lg bg-gray-800 p-6">
        <h4 className="mb-4 text-lg font-semibold text-white">Redirect Trend</h4>
        {data.dailyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data.dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="date"
                stroke="#9CA3AF"
                tick={{ fill: "#9CA3AF" }}
                tickFormatter={(date) => {
                  const d = new Date(date)
                  return `${d.getMonth() + 1}/${d.getDate()}`
                }}
              />
              <YAxis stroke="#9CA3AF" tick={{ fill: "#9CA3AF" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1F2937",
                  border: "1px solid #374151",
                  borderRadius: "0.5rem",
                  color: "#F3F4F6",
                }}
                labelStyle={{ color: "#9CA3AF" }}
                formatter={(value: number | undefined) => [value ?? 0, "Redirects"]}
                labelFormatter={(date) => {
                  const d = new Date(date)
                  return d.toLocaleDateString()
                }}
              />
              <Line
                type="monotone"
                dataKey="redirect_count"
                stroke="#3B82F6"
                strokeWidth={2}
                dot={{ fill: "#3B82F6", r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center py-12 text-gray-400">
            No redirect data available for this period
          </div>
        )}
      </div>

      {/* Interpretation Guide */}
      <div className="rounded-lg bg-gray-800 p-4 text-sm">
        <h5 className="mb-2 font-semibold text-white">What This Means</h5>
        <ul className="space-y-1 text-gray-400">
          <li>
            • <span className="text-green-400">Low redirects (&lt;50/day)</span>: Migration
            successful, most users on new URLs
          </li>
          <li>
            • <span className="text-yellow-400">Medium redirects (50-500/day)</span>: Active
            transition period, monitor weekly
          </li>
          <li>
            • <span className="text-red-400">High redirects (&gt;500/day)</span>: Consider
            resubmitting sitemap to search engines
          </li>
        </ul>
      </div>
    </div>
  )
}
