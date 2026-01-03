interface RibbonIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number
}

export default function RibbonIcon({ size = 24, className, ...props }: RibbonIconProps) {
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
      {/* Awareness ribbon shape */}
      <path d="M12 2C10 2 8 4 8 6c0 1.5.5 3 2 5-2 2-4 4-4 7h2c0-2 1.5-4 4-6 2.5 2 4 4 4 6h2c0-3-2-5-4-7 1.5-2 2-3.5 2-5 0-2-2-4-4-4zm0 2c1 0 2 1 2 2s-1 2.5-2 4c-1-1.5-2-3-2-4s1-2 2-2z" />
    </svg>
  )
}
