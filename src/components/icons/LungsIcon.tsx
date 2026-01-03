interface LungsIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number
}

export default function LungsIcon({ size = 24, className, ...props }: LungsIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path
        d="M12 4V2M12 4c0 2-1 3-2 4s-2 3-2 5c0 3 1.5 5 4 5s4-2 4-5c0-2-1-4-2-5s-2-2-2-4M8 13c-2 0-4 1-4 4 0 2 1 3 3 3h1M16 13c2 0 4 1 4 4 0 2-1 3-3 3h-1"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
