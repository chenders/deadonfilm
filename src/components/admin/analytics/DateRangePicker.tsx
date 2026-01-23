/**
 * Date range picker component for analytics filtering.
 */

interface DateRangePickerProps {
  startDate: string
  endDate: string
  onChange: (startDate: string, endDate: string) => void
}

export default function DateRangePicker({ startDate, endDate, onChange }: DateRangePickerProps) {
  const handleQuickFilter = (days: number | "all") => {
    const end = new Date().toISOString().split("T")[0]
    if (days === "all") {
      onChange("", end)
    } else {
      const start = new Date()
      start.setDate(start.getDate() - days)
      onChange(start.toISOString().split("T")[0], end)
    }
  }

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => handleQuickFilter(7)}
          className="rounded-md bg-gray-700 px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-600"
        >
          Last 7 Days
        </button>
        <button
          onClick={() => handleQuickFilter(30)}
          className="rounded-md bg-gray-700 px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-600"
        >
          Last 30 Days
        </button>
        <button
          onClick={() => handleQuickFilter(90)}
          className="rounded-md bg-gray-700 px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-600"
        >
          Last 90 Days
        </button>
        <button
          onClick={() => handleQuickFilter("all")}
          className="rounded-md bg-gray-700 px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-600"
        >
          All Time
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="start-date" className="text-sm font-medium text-gray-300">
            Start Date:
          </label>
          <input
            type="date"
            id="start-date"
            value={startDate}
            onChange={(e) => onChange(e.target.value, endDate)}
            className="rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="end-date" className="text-sm font-medium text-gray-300">
            End Date:
          </label>
          <input
            type="date"
            id="end-date"
            value={endDate}
            onChange={(e) => onChange(startDate, e.target.value)}
            className="rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
    </div>
  )
}
