interface DecadesIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number
}

export default function DecadesIcon({ size = 24, className, ...props }: DecadesIconProps) {
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
      {/* Horizontal timeline */}
      <line x1="3" y1="12" x2="21" y2="12" />
      {/* Decade markers */}
      <circle cx="6" cy="12" r="2" fill="currentColor" />
      <circle cx="10.5" cy="12" r="2" fill="currentColor" />
      <circle cx="15" cy="12" r="2" fill="currentColor" />
      <circle cx="19.5" cy="12" r="2" fill="currentColor" />
    </svg>
  )
}
