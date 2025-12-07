interface InfoIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number
}

export default function InfoIcon({ size = 16, className, ...props }: InfoIconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Circle */}
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {/* Dot */}
      <circle cx="8" cy="4.5" r="1" />
      {/* Line */}
      <path d="M8 7v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
