interface ExternalLinkIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number
}

export default function ExternalLinkIcon({
  size = 16,
  className,
  ...props
}: ExternalLinkIconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Arrow pointing out */}
      <path d="M6 3h7v7M13 3L6 10" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Box outline */}
      <path d="M10 9v4H3V6h4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
