interface ParagraphTextProps {
  text: string
  className?: string
}

/**
 * Renders text as multiple paragraphs when the text contains double newlines.
 * Single paragraphs render as a simple <p> element.
 * Multiple paragraphs are wrapped in a div with spacing between them.
 */
export function ParagraphText({ text, className = "" }: ParagraphTextProps) {
  // Split on double newlines (with optional whitespace)
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim())

  if (paragraphs.length <= 1) {
    // Single paragraph or empty - render as single element
    return <p className={className}>{paragraphs[0]?.trim() ?? ""}</p>
  }

  return (
    <div className="space-y-4">
      {paragraphs.map((paragraph, index) => (
        <p key={index} className={className}>
          {paragraph.trim()}
        </p>
      ))}
    </div>
  )
}
