interface CursedActorIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number
}

export default function CursedActorIcon({ size = 24, className, ...props }: CursedActorIconProps) {
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
      {/* Person silhouette */}
      <circle
        cx="12"
        cy="7"
        r="4"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M4 21v-2c0-2.2 1.8-4 4-4h8c2.2 0 4 1.8 4 4v2"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      {/* Small skull overlay in corner */}
      <g transform="translate(14, 2) scale(0.5)">
        <ellipse cx="6" cy="6" rx="5" ry="6" fill="currentColor" fillOpacity="0.9" />
        <ellipse cx="4" cy="5" rx="1.2" ry="1.5" fill="white" />
        <ellipse cx="8" cy="5" rx="1.2" ry="1.5" fill="white" />
        <path d="M4.5 9h3" stroke="white" strokeWidth="0.8" />
      </g>
    </svg>
  )
}
