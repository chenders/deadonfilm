interface VirusIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number
}

export default function VirusIcon({ size = 24, className, ...props }: VirusIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="2" x2="12" y2="5" stroke="currentColor" strokeWidth="2" />
      <line x1="12" y1="19" x2="12" y2="22" stroke="currentColor" strokeWidth="2" />
      <line x1="2" y1="12" x2="5" y2="12" stroke="currentColor" strokeWidth="2" />
      <line x1="19" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="2" />
      <line x1="4.93" y1="4.93" x2="7.05" y2="7.05" stroke="currentColor" strokeWidth="2" />
      <line x1="16.95" y1="16.95" x2="19.07" y2="19.07" stroke="currentColor" strokeWidth="2" />
      <line x1="4.93" y1="19.07" x2="7.05" y2="16.95" stroke="currentColor" strokeWidth="2" />
      <line x1="16.95" y1="7.05" x2="19.07" y2="4.93" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}
