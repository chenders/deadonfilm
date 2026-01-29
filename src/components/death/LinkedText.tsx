import { Link } from "react-router-dom"
import type { EntityLink } from "@/types"

interface LinkedTextProps {
  text: string
  links?: EntityLink[]
  className?: string
}

/**
 * Generates the URL for an entity based on its type and slug.
 */
function getEntityUrl(entityType: EntityLink["entityType"], entitySlug: string): string {
  switch (entityType) {
    case "actor":
      return `/actor/${entitySlug}`
    case "movie":
      return `/movie/${entitySlug}`
    case "show":
      return `/show/${entitySlug}`
    default:
      // Exhaustive check - this should never happen
      return `/actor/${entitySlug}`
  }
}

/**
 * Formats the confidence score as a percentage label.
 */
function getConfidenceLabel(confidence: number): string {
  const percentage = Math.round(confidence * 100)
  return `${percentage}% confidence`
}

interface TextSegment {
  type: "text" | "link"
  content: string
  link?: EntityLink
}

/**
 * Parses text into segments (plain text and linked text).
 * Links are sorted by start position and processed in order.
 */
function parseTextSegments(text: string, links: EntityLink[]): TextSegment[] {
  if (!links || links.length === 0) {
    return [{ type: "text", content: text }]
  }

  // Sort links by start position
  const sortedLinks = [...links].sort((a, b) => a.start - b.start)
  const segments: TextSegment[] = []
  let currentPos = 0

  for (const link of sortedLinks) {
    // Skip invalid or overlapping links
    if (link.start < currentPos || link.start >= text.length) {
      continue
    }

    // Add text before this link
    if (link.start > currentPos) {
      segments.push({
        type: "text",
        content: text.slice(currentPos, link.start),
      })
    }

    // Add the linked text
    const linkEnd = Math.min(link.end, text.length)
    segments.push({
      type: "link",
      content: text.slice(link.start, linkEnd),
      link,
    })

    currentPos = linkEnd
  }

  // Add remaining text after last link
  if (currentPos < text.length) {
    segments.push({
      type: "text",
      content: text.slice(currentPos),
    })
  }

  return segments
}

/**
 * Renders a single link with tooltip.
 */
function LinkedEntity({ link, children }: { link: EntityLink; children: React.ReactNode }) {
  const url = getEntityUrl(link.entityType, link.entitySlug)
  const tooltip = getConfidenceLabel(link.confidence)

  return (
    <Link
      to={url}
      className="text-brown-dark underline decoration-dotted underline-offset-2 hover:text-brown-medium hover:decoration-solid"
      title={tooltip}
      data-testid="entity-link"
    >
      {children}
    </Link>
  )
}

/**
 * Renders a paragraph with entity links.
 */
function LinkedParagraph({
  text,
  links,
  className,
}: {
  text: string
  links: EntityLink[]
  className?: string
}) {
  const segments = parseTextSegments(text, links)

  // If only plain text (no links), render directly without spans
  if (segments.length === 1 && segments[0].type === "text") {
    return <p className={className}>{segments[0].content}</p>
  }

  return (
    <p className={className}>
      {segments.map((segment, idx) =>
        segment.type === "link" && segment.link ? (
          <LinkedEntity key={idx} link={segment.link}>
            {segment.content}
          </LinkedEntity>
        ) : (
          <span key={idx}>{segment.content}</span>
        )
      )}
    </p>
  )
}

/**
 * Splits links across multiple paragraphs based on text positions.
 * Double newlines indicate paragraph breaks.
 */
function splitLinksAcrossParagraphs(
  paragraphs: string[],
  links: EntityLink[]
): Map<number, EntityLink[]> {
  const result = new Map<number, EntityLink[]>()
  let currentOffset = 0

  paragraphs.forEach((paragraph, idx) => {
    const paragraphLinks: EntityLink[] = []
    const paragraphEnd = currentOffset + paragraph.length

    for (const link of links) {
      // Check if link falls within this paragraph
      if (link.start >= currentOffset && link.start < paragraphEnd) {
        // Adjust link positions relative to paragraph start
        paragraphLinks.push({
          ...link,
          start: link.start - currentOffset,
          end: Math.min(link.end, paragraphEnd) - currentOffset,
        })
      }
    }

    if (paragraphLinks.length > 0) {
      result.set(idx, paragraphLinks)
    }

    // Account for paragraph text + the separator that was split on
    // Original text has "\n\n" (or "\n\s*\n") between paragraphs
    currentOffset = paragraphEnd + 2 // +2 for the double newline
  })

  return result
}

/**
 * Renders text as multiple paragraphs with entity links.
 * Handles paragraph splitting (double newlines) and distributes links
 * to the appropriate paragraphs.
 */
export function LinkedText({ text, links, className = "" }: LinkedTextProps) {
  // Split on double newlines (with optional whitespace)
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim())

  if (paragraphs.length <= 1) {
    // Single paragraph
    return (
      <LinkedParagraph
        text={paragraphs[0]?.trim() ?? ""}
        links={links ?? []}
        className={className}
      />
    )
  }

  // Multiple paragraphs - distribute links across them
  const linksByParagraph = splitLinksAcrossParagraphs(
    paragraphs.map((p) => p.trim()),
    links ?? []
  )

  return (
    <div className="space-y-4" data-testid="linked-text">
      {paragraphs.map((paragraph, idx) => (
        <LinkedParagraph
          key={idx}
          text={paragraph.trim()}
          links={linksByParagraph.get(idx) ?? []}
          className={className}
        />
      ))}
    </div>
  )
}
