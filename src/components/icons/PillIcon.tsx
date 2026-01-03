interface PillIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number
}

export default function PillIcon({ size = 24, className, ...props }: PillIconProps) {
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
      <path d="M4.22 11.29l5.07-5.07a6.003 6.003 0 018.48 8.48l-5.07 5.07a6.003 6.003 0 01-8.48-8.48zm9.9 2.12l-4.24-4.24-2.83 2.83 4.24 4.24 2.83-2.83z" />
    </svg>
  )
}
