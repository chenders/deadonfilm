interface RefreshIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number
}

export default function RefreshIcon({ size = 16, className, ...props }: RefreshIconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
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
      <path d="M13.5 8a5.5 5.5 0 1 1-1.1-3.3" />
      <polyline points="13.5 2.5 13.5 5 11 5" />
    </svg>
  )
}
