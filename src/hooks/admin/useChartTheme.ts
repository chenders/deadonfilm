import { useMemo } from "react"
import { useAdminTheme } from "../../contexts/AdminThemeContext"

interface ChartColors {
  /** Primary data series colors */
  series: string[]
  /** Grid line color */
  grid: string
  /** Axis text color */
  axis: string
  /** Tooltip styles */
  tooltip: {
    backgroundColor: string
    borderColor: string
    textColor: string
  }
  /** Cursor/crosshair color */
  cursor: string
  /** Legend text color */
  legend: string
}

interface ChartTheme extends ChartColors {
  /** Current theme mode */
  mode: "dark" | "light"
}

/**
 * Hook for getting theme-aware chart colors.
 * Returns colors that adapt to the current admin theme.
 *
 * @example
 * const chartTheme = useChartTheme()
 *
 * <LineChart>
 *   <XAxis stroke={chartTheme.axis} />
 *   <YAxis stroke={chartTheme.axis} />
 *   <CartesianGrid stroke={chartTheme.grid} />
 *   <Tooltip
 *     contentStyle={{
 *       backgroundColor: chartTheme.tooltip.backgroundColor,
 *       border: `1px solid ${chartTheme.tooltip.borderColor}`,
 *       color: chartTheme.tooltip.textColor,
 *     }}
 *   />
 *   <Line stroke={chartTheme.series[0]} />
 * </LineChart>
 */
export function useChartTheme(): ChartTheme {
  const { resolvedTheme } = useAdminTheme()

  return useMemo(() => {
    if (resolvedTheme === "dark") {
      return {
        mode: "dark",
        series: [
          "#58a6ff", // Blue
          "#3fb950", // Green
          "#f85149", // Red
          "#d29922", // Amber
          "#a371f7", // Purple
          "#f778ba", // Pink
          "#79c0ff", // Light blue
          "#56d364", // Light green
        ],
        grid: "#3d454f",
        axis: "#7d8a99",
        cursor: "#58a6ff",
        legend: "#b8c4d0",
        tooltip: {
          backgroundColor: "#272d35",
          borderColor: "#3d454f",
          textColor: "#f0f3f6",
        },
      }
    }

    // Light theme
    return {
      mode: "light",
      series: [
        "#0969da", // Blue
        "#1a7f37", // Green
        "#cf222e", // Red
        "#9a6700", // Amber
        "#8250df", // Purple
        "#bf3989", // Pink
        "#0550ae", // Dark blue
        "#116329", // Dark green
      ],
      grid: "#d0d7de",
      axis: "#6e7781",
      cursor: "#0969da",
      legend: "#57606a",
      tooltip: {
        backgroundColor: "#ffffff",
        borderColor: "#d0d7de",
        textColor: "#1f2328",
      },
    }
  }, [resolvedTheme])
}

/**
 * Creates a common tooltip style object for Recharts.
 * Use this with the contentStyle prop of Recharts Tooltip component.
 */
export function useChartTooltipStyle() {
  const { tooltip } = useChartTheme()

  return useMemo(
    () => ({
      backgroundColor: tooltip.backgroundColor,
      border: `1px solid ${tooltip.borderColor}`,
      borderRadius: "0.5rem",
      color: tooltip.textColor,
      padding: "0.5rem 0.75rem",
      boxShadow: "var(--admin-shadow-md)",
    }),
    [tooltip]
  )
}
