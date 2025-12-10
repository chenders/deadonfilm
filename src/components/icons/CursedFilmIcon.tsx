interface CursedFilmIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number
}

export default function CursedFilmIcon({ size = 24, className, ...props }: CursedFilmIconProps) {
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
      {/* Film reel base */}
      <path
        d="M18 4l2 3v11c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V7l2-3h12z"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      {/* Film perforations left */}
      <rect x="5" y="8" width="2" height="2" rx="0.5" />
      <rect x="5" y="12" width="2" height="2" rx="0.5" />
      <rect x="5" y="16" width="2" height="2" rx="0.5" />
      {/* Film perforations right */}
      <rect x="17" y="8" width="2" height="2" rx="0.5" />
      <rect x="17" y="12" width="2" height="2" rx="0.5" />
      <rect x="17" y="16" width="2" height="2" rx="0.5" />
      {/* Small skull in center */}
      <ellipse
        cx="12"
        cy="12"
        rx="3"
        ry="3.5"
        fillOpacity="0.2"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
      />
      <circle cx="10.5" cy="11.5" r="0.8" />
      <circle cx="13.5" cy="11.5" r="0.8" />
      <path d="M11 14h2" stroke="currentColor" strokeWidth="0.8" />
    </svg>
  )
}
