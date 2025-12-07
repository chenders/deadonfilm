interface SkullIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number
}

export default function SkullIcon({ size = 24, className, ...props }: SkullIconProps) {
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
      {/* Skull outline */}
      <path
        d="M12 2C7.58 2 4 5.58 4 10c0 2.12.83 4.05 2.18 5.48V18c0 1.1.9 2 2 2h1v1c0 .55.45 1 1 1h3.64c.55 0 1-.45 1-1v-1h1c1.1 0 2-.9 2-2v-2.52C19.17 14.05 20 12.12 20 10c0-4.42-3.58-8-8-8z"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      {/* Left eye */}
      <ellipse cx="9" cy="10" rx="1.5" ry="2" />
      {/* Right eye */}
      <ellipse cx="15" cy="10" rx="1.5" ry="2" />
      {/* Nose */}
      <path d="M12 13l-1 2h2l-1-2z" />
      {/* Teeth */}
      <path
        d="M8.5 17v2M10.5 17v2M12 17v2M13.5 17v2M15.5 17v2"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
      />
    </svg>
  )
}
