interface SkullLogoProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  className?: string
}

export default function SkullLogo({ className = "w-32 h-auto", ...props }: SkullLogoProps) {
  return (
    <img
      src="/skull-logo.png"
      alt="Dead on Film logo - winged skull"
      className={className}
      {...props}
    />
  )
}
