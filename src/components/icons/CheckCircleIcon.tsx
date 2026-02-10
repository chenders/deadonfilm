interface CheckCircleIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number
}

export default function CheckCircleIcon({ size = 16, className, ...props }: CheckCircleIconProps) {
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
      <circle cx="8" cy="8" r="6.5" />
      <polyline points="5.5 8 7.2 9.8 10.5 6.2" />
    </svg>
  )
}
