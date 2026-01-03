interface BrainIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number
}

export default function BrainIcon({ size = 24, className, ...props }: BrainIconProps) {
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
      <path d="M12 2c-1.5 0-2.8.5-3.8 1.4C7 4.4 6.1 6 6 7.5c-1.3.3-2.5 1-3.3 2C1.5 10.8 1 12.3 1 14c0 1.5.5 2.8 1.4 3.8 1 1.2 2.4 2 4 2.1.2 1.1.7 2 1.4 2.7.8.8 1.9 1.4 3.2 1.4s2.4-.5 3.2-1.4c.7-.7 1.2-1.6 1.4-2.7 1.6-.1 3-.9 4-2.1.9-1 1.4-2.3 1.4-3.8 0-1.7-.5-3.2-1.7-4.5-.8-1-2-1.7-3.3-2-.1-1.5-1-3.1-2.2-4.1-1-1-2.3-1.4-3.8-1.4zM12 4c1 0 1.9.3 2.6.9.9.8 1.4 1.9 1.4 3.1h-2c0-.5-.2-1-.6-1.4-.5-.4-1-.6-1.4-.6s-.9.2-1.4.6c-.4.4-.6.9-.6 1.4H8c0-1.2.5-2.3 1.4-3.1.7-.6 1.6-.9 2.6-.9z" />
    </svg>
  )
}
