/**
 * Enhanced card component with hover effects and variants.
 */

import { ReactNode } from "react"

interface CardProps {
  /** Card content */
  children: ReactNode
  /** Optional header title */
  title?: string
  /** Optional header action (button, link, etc.) */
  action?: ReactNode
  /** Whether to show hover lift effect */
  hoverable?: boolean
  /** Padding size */
  padding?: "sm" | "md" | "lg"
  /** Optional additional className */
  className?: string
  /** Optional click handler (makes the whole card clickable) */
  onClick?: () => void
}

const paddingClasses = {
  sm: "p-3",
  md: "p-4 md:p-5",
  lg: "p-5 md:p-6",
}

export default function Card({
  children,
  title,
  action,
  hoverable = false,
  padding = "md",
  className = "",
  onClick,
}: CardProps) {
  const isClickable = !!onClick || hoverable

  const baseClasses = `
    rounded-lg border border-admin-border bg-admin-surface-elevated
    shadow-admin-sm
    ${paddingClasses[padding]}
    ${isClickable ? "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-admin-md hover:border-admin-interactive/30" : ""}
    ${onClick ? "cursor-pointer" : ""}
    ${className}
  `

  const content = (
    <>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between">
          {title && <h3 className="text-sm font-semibold text-admin-text-primary">{title}</h3>}
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </>
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${baseClasses} w-full text-left`}>
        {content}
      </button>
    )
  }

  return <div className={baseClasses}>{content}</div>
}
