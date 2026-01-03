interface WarningIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number
}

export default function WarningIcon({ size = 24, className, ...props }: WarningIconProps) {
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
      {/* Warning triangle */}
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
    </svg>
  )
}
