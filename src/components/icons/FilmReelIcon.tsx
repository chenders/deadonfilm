interface FilmReelIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number
}

export default function FilmReelIcon({ size = 24, className, ...props }: FilmReelIconProps) {
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
      {/* Outer circle */}
      <circle cx="12" cy="12" r="10" />
      {/* Center hub */}
      <circle cx="12" cy="12" r="3" />
      {/* Sprocket holes */}
      <circle cx="12" cy="5" r="1.5" fill="currentColor" />
      <circle cx="12" cy="19" r="1.5" fill="currentColor" />
      <circle cx="5" cy="12" r="1.5" fill="currentColor" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" />
      {/* Diagonal sprockets */}
      <circle cx="7.05" cy="7.05" r="1.2" fill="currentColor" />
      <circle cx="16.95" cy="7.05" r="1.2" fill="currentColor" />
      <circle cx="7.05" cy="16.95" r="1.2" fill="currentColor" />
      <circle cx="16.95" cy="16.95" r="1.2" fill="currentColor" />
    </svg>
  )
}
