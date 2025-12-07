interface PersonIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number
}

export default function PersonIcon({ size = 24, className, ...props }: PersonIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Head */}
      <circle cx="12" cy="8" r="4" />
      {/* Body/shoulders */}
      <path d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2" />
    </svg>
  )
}
