import { Link } from "react-router-dom"
import { DecadesIcon } from "@/components/icons"

const QUICK_ACTIONS = [
  {
    testId: "in-detail-btn",
    to: "/in-detail",
    emoji: "📋",
    label: "In Detail",
    tooltip: "Actors with thoroughly researched death information",
    shortDesc: "Full death accounts",
  },
  {
    testId: "covid-deaths-btn",
    to: "/covid-deaths",
    emoji: "🦠",
    label: "COVID-19",
    tooltip: "Actors who died from COVID-19",
    shortDesc: "Actors lost to the pandemic",
  },
  {
    testId: "unnatural-deaths-btn",
    to: "/unnatural-deaths",
    emoji: "⚠️",
    label: "Unnatural Deaths",
    tooltip: "Actors who died from unnatural causes",
    shortDesc: "Accidents, murders, suicides",
  },
  {
    testId: "death-watch-btn",
    to: "/death-watch",
    emoji: "⏳",
    label: "Death Watch",
    tooltip: "Living actors most likely to die soon",
    shortDesc: "Aging actors most at risk",
  },
  {
    testId: "causes-of-death-btn",
    to: "/causes-of-death",
    emoji: "📊",
    label: "Causes of Death",
    tooltip: "Browse actors by cause of death",
    shortDesc: "How actors died, categorized",
  },
  {
    testId: "notable-deaths-btn",
    to: "/deaths/notable",
    emoji: "🔍",
    label: "Notable Deaths",
    tooltip: "Strange, disputed, and controversial celebrity deaths",
    shortDesc: "Famous actors who have died",
  },
  {
    testId: "deaths-by-decade-btn",
    to: "/deaths/decades",
    icon: "decades" as const,
    label: "Deaths by Decade",
    tooltip: "Browse actors by decade of death",
    shortDesc: "Deaths across the decades",
  },
] as const

export default function QuickActions() {
  const linkClass =
    "inline-flex items-center gap-1.5 rounded-full border border-brown-medium/30 bg-beige px-3 py-1.5 text-xs font-medium text-brown-dark transition-all duration-200 hover:border-brown-medium/50 hover:bg-cream"

  const tooltipClass =
    "pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-48 -translate-x-1/2 rounded-lg bg-brown-dark px-3 py-2 text-center text-xs text-cream opacity-0 shadow-lg transition-opacity delay-300 duration-200 group-hover:opacity-100 group-hover:delay-300"

  const emojiClass = "text-base leading-none"

  return (
    <div
      data-testid="quick-actions"
      className="scrollbar-hide mt-5 grid auto-cols-max grid-flow-col grid-rows-2 gap-2 overflow-x-auto md:mx-auto md:mt-8 md:flex md:max-w-xl md:flex-wrap md:justify-center md:overflow-visible"
    >
      {QUICK_ACTIONS.map((action) => (
        <div key={action.testId} className="group relative">
          <Link data-testid={action.testId} to={action.to} className={linkClass}>
            {"icon" in action ? (
              <DecadesIcon size={16} />
            ) : (
              <span className={emojiClass}>{action.emoji}</span>
            )}
            {action.label}
          </Link>
          <span className={`${tooltipClass} hidden md:block`}>{action.tooltip}</span>
        </div>
      ))}
    </div>
  )
}
