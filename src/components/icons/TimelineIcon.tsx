interface TimelineIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number
}

export default function TimelineIcon({ size = 24, className, ...props }: TimelineIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Vertical line */}
      <line x1="6" y1="3" x2="6" y2="21" />
      {/* Timeline nodes and labels */}
      <circle cx="6" cy="6" r="2" fill="currentColor" />
      <line x1="10" y1="6" x2="20" y2="6" />
      <circle cx="6" cy="12" r="2" fill="currentColor" />
      <line x1="10" y1="12" x2="18" y2="12" />
      <circle cx="6" cy="18" r="2" fill="currentColor" />
      <line x1="10" y1="18" x2="16" y2="18" />
    </svg>
  )
}
