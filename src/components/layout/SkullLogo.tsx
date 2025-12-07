interface SkullLogoProps extends React.SVGProps<SVGSVGElement> {
  className?: string
}

export default function SkullLogo({ className = "w-32 h-auto", ...props }: SkullLogoProps) {
  return (
    <svg viewBox="0 0 200 100" className={className} aria-label="Dead on Film logo - winged skull" {...props}>
      {/* Left Wing */}
      <path
        d="M10 50 Q20 30 40 35 Q60 25 70 45 Q65 50 70 55 Q60 75 40 65 Q20 70 10 50"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-brown-dark"
      />
      {/* Left Wing Feathers */}
      <path
        d="M15 50 Q25 40 35 45"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-brown-dark"
      />
      <path
        d="M20 55 Q30 45 45 48"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-brown-dark"
      />
      <path
        d="M25 60 Q40 50 55 52"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-brown-dark"
      />

      {/* Right Wing */}
      <path
        d="M190 50 Q180 30 160 35 Q140 25 130 45 Q135 50 130 55 Q140 75 160 65 Q180 70 190 50"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-brown-dark"
      />
      {/* Right Wing Feathers */}
      <path
        d="M185 50 Q175 40 165 45"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-brown-dark"
      />
      <path
        d="M180 55 Q170 45 155 48"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-brown-dark"
      />
      <path
        d="M175 60 Q160 50 145 52"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-brown-dark"
      />

      {/* Skull */}
      <ellipse
        cx="100"
        cy="45"
        rx="25"
        ry="28"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-brown-dark"
      />

      {/* Eye Sockets */}
      <ellipse cx="90" cy="42" rx="7" ry="8" fill="currentColor" className="text-brown-dark" />
      <ellipse cx="110" cy="42" rx="7" ry="8" fill="currentColor" className="text-brown-dark" />

      {/* Nose */}
      <path d="M100 50 L97 58 L103 58 Z" fill="currentColor" className="text-brown-dark" />

      {/* Teeth */}
      <path
        d="M88 65 L88 72 M93 65 L93 72 M98 65 L98 72 M103 65 L103 72 M108 65 L108 72 M113 65 L113 72"
        stroke="currentColor"
        strokeWidth="2"
        className="text-brown-dark"
      />

      {/* Jaw line */}
      <path
        d="M85 65 Q100 75 115 65"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-brown-dark"
      />
    </svg>
  )
}
