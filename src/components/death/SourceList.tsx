/**
 * Renders source entries as a vertical list.
 * Shows the first 3 sources by default; remaining are behind a toggle.
 */

import { useState } from "react"
import { ExternalLinkIcon } from "@/components/icons"
import type { SourceEntry } from "@/types"

const MAX_VISIBLE = 3

interface SourceListProps {
  sources: SourceEntry[] | null
  title: string
}

function SourceItem({ source }: { source: SourceEntry }) {
  if (source.url || source.archiveUrl) {
    return (
      <a
        href={source.archiveUrl || source.url || "#"}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-brown-dark"
      >
        {source.description}
        <ExternalLinkIcon size={10} className="ml-1 inline" />
      </a>
    )
  }
  return <span>{source.description}</span>
}

export default function SourceList({ sources, title }: SourceListProps) {
  const [expanded, setExpanded] = useState(false)

  if (!sources || sources.length === 0) return null

  const hasOverflow = sources.length > MAX_VISIBLE
  const visible = expanded ? sources : sources.slice(0, MAX_VISIBLE)
  const hiddenCount = Math.max(0, sources.length - MAX_VISIBLE)

  return (
    <div className="mt-2 text-xs text-text-muted" data-testid={`sources-${title.toLowerCase()}`}>
      <h4 className="font-medium">{title}:</h4>
      <ul className="mt-1 space-y-0.5">
        {visible.map((source, idx) => (
          <li key={idx}>
            <SourceItem source={source} />
          </li>
        ))}
      </ul>
      {hasOverflow && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className="mt-1 text-xs text-brown-medium hover:text-brown-dark focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-brown-medium/50"
          data-testid="sources-toggle"
        >
          {expanded ? "show less" : `+ ${hiddenCount} more`}
        </button>
      )}
    </div>
  )
}
