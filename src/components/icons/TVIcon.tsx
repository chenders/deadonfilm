interface TVIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number
}

export default function TVIcon({ size = 24, className, ...props }: TVIconProps) {
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
      {/* TV screen */}
      <rect x="2" y="5" width="20" height="14" rx="2" />
      {/* Stand */}
      <path d="M8 21h8" />
      <path d="M12 19v2" />
      {/* Antenna (retro style) */}
      <path d="M8 2l4 3 4-3" />
    </svg>
  )
}
