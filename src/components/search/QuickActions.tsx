import { Link } from "react-router-dom"

export default function QuickActions() {
  const linkClass =
    "inline-flex items-center gap-1.5 rounded-full border border-border-theme/30 bg-surface-muted px-3 py-1.5 text-xs font-medium text-foreground transition-all duration-200 hover:border-border-theme/50 hover:bg-surface"

  const tooltipClass =
    "pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-48 -translate-x-1/2 rounded-lg bg-foreground px-3 py-2 text-center text-xs text-surface opacity-0 shadow-lg transition-opacity delay-300 duration-200 group-hover:opacity-100 group-hover:delay-300"

  const emojiClass = "text-base leading-none"

  return (
    <div
      data-testid="quick-actions"
      className="mx-auto mt-6 flex max-w-xl flex-wrap justify-center gap-2"
    >
      <div className="group relative">
        <Link data-testid="forever-young-btn" to="/forever-young" className={linkClass}>
          <span className={emojiClass}>👼</span>
          Forever Young
        </Link>
        <span className={tooltipClass}>Movies featuring actors who died tragically young</span>
      </div>

      <div className="group relative">
        <Link data-testid="covid-deaths-btn" to="/covid-deaths" className={linkClass}>
          <span className={emojiClass}>🦠</span>
          COVID-19
        </Link>
        <span className={tooltipClass}>Actors who died from COVID-19</span>
      </div>

      <div className="group relative">
        <Link data-testid="unnatural-deaths-btn" to="/unnatural-deaths" className={linkClass}>
          <span className={emojiClass}>⚠️</span>
          Unnatural Deaths
        </Link>
        <span className={tooltipClass}>Actors who died from unnatural causes</span>
      </div>

      <div className="group relative">
        <Link data-testid="death-watch-btn" to="/death-watch" className={linkClass}>
          <span className={emojiClass}>⏳</span>
          Death Watch
        </Link>
        <span className={tooltipClass}>Living actors most likely to die soon</span>
      </div>

      <div className="group relative">
        <Link data-testid="causes-of-death-btn" to="/causes-of-death" className={linkClass}>
          <span className={emojiClass}>📊</span>
          Causes of Death
        </Link>
        <span className={tooltipClass}>Browse actors by cause of death</span>
      </div>

      <div className="group relative">
        <Link data-testid="notable-deaths-btn" to="/deaths/notable" className={linkClass}>
          <span className={emojiClass}>🔍</span>
          Notable Deaths
        </Link>
        <span className={tooltipClass}>Strange, disputed, and controversial celebrity deaths</span>
      </div>
    </div>
  )
}
