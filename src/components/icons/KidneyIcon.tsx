interface KidneyIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number
}

export default function KidneyIcon({ size = 24, className, ...props }: KidneyIconProps) {
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
      <path d="M12 3C9 3 7 5.5 7 8c0 1.5.5 3 1.5 4-.5 1.5-.5 3 0 4.5.5 2 2 3.5 3.5 3.5s3-1.5 3.5-3.5c.5-1.5.5-3 0-4.5 1-1 1.5-2.5 1.5-4 0-2.5-2-5-5-5z" />
    </svg>
  )
}
