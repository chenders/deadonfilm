interface ChevronIconProps {
  size?: number
  className?: string
  direction?: "up" | "down" | "left" | "right"
}

export default function ChevronIcon({
  size = 24,
  className = "",
  direction = "down",
}: ChevronIconProps) {
  const rotation = {
    up: 180,
    down: 0,
    left: 90,
    right: -90,
  }[direction]

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ transform: `rotate(${rotation}deg)` }}
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}
