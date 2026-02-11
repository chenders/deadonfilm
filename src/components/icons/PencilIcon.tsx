interface PencilIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number
}

export default function PencilIcon({ size = 16, className, ...props }: PencilIconProps) {
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
      <path d="M11.3 2.3a1.8 1.8 0 0 1 2.5 2.5L5.5 13.1l-3.3.8.8-3.3z" />
      <path d="M10 3.6l2.5 2.5" />
    </svg>
  )
}
