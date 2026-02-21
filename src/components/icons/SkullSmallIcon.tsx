interface SkullSmallIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number
}

export default function SkullSmallIcon({ size = 16, className, ...props }: SkullSmallIconProps) {
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
      {/* Cranium */}
      <path d="M3 8.5C3 5.5 5.2 3 8 3s5 2.5 5 5.5c0 1.5-.7 2.5-1.5 3V13H4.5v-1.5C3.7 11 3 10 3 8.5z" />
      {/* Left eye */}
      <circle cx="6.25" cy="7.75" r="1.25" />
      {/* Right eye */}
      <circle cx="9.75" cy="7.75" r="1.25" />
    </svg>
  )
}
