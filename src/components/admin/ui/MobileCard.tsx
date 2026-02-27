import { ReactNode } from "react"

export interface MobileCardField {
  label: string
  value: ReactNode
}

export interface MobileCardProps {
  /** Primary title text */
  title: ReactNode
  /** Secondary subtitle text */
  subtitle?: ReactNode
  /** Key-value fields displayed in the card body */
  fields?: MobileCardField[]
  /** Action buttons rendered at the bottom of the card */
  actions?: ReactNode
  /** Whether the card is selectable (shows checkbox) */
  selectable?: boolean
  /** Whether the card is currently selected */
  selected?: boolean
  /** Callback when selection changes */
  onSelectionChange?: (selected: boolean) => void
  /** Plain text label for the selection checkbox (used when title is JSX) */
  ariaLabel?: string
  /** Optional data-testid */
  "data-testid"?: string
}

export default function MobileCard({
  title,
  subtitle,
  fields,
  actions,
  selectable,
  selected,
  onSelectionChange,
  ariaLabel,
  "data-testid": testId,
}: MobileCardProps) {
  return (
    <div
      data-testid={testId}
      className={`rounded-lg border bg-admin-surface-elevated p-4 ${
        selected ? "border-admin-interactive bg-admin-info-bg" : "border-admin-border"
      }`}
    >
      <div className="flex items-start gap-3">
        {selectable && (
          <input
            type="checkbox"
            checked={selected ?? false}
            onChange={(e) => onSelectionChange?.(e.target.checked)}
            aria-label={`Select ${ariaLabel ?? (typeof title === "string" ? title : "item")}`}
            className="mt-1 h-4 w-4 shrink-0 rounded border-admin-border bg-admin-surface-overlay text-admin-interactive focus:ring-admin-interactive"
          />
        )}
        <div
          className="min-w-0 flex-1"
          {...(selectable
            ? {
                role: "button",
                tabIndex: -1,
                onClick: () => onSelectionChange?.(!(selected ?? false)),
              }
            : {})}
        >
          <div className="font-medium text-admin-text-primary">{title}</div>
          {subtitle && <div className="mt-0.5 text-sm text-admin-text-muted">{subtitle}</div>}
        </div>
      </div>

      {fields && fields.length > 0 && (
        <dl className="mt-3 space-y-1.5">
          {fields.map((field) => (
            <div key={field.label} className="flex items-baseline justify-between gap-2 text-sm">
              <dt className="shrink-0 text-admin-text-muted">{field.label}</dt>
              <dd className="min-w-0 truncate text-right text-admin-text-secondary">
                {field.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {actions && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-admin-border pt-3">{actions}</div>
      )}
    </div>
  )
}
