/**
 * Renders source entries inline with middot separators.
 * Shows the first 3 sources by default; remaining are behind a toggle.
 * Uses semantic <ul>/<li> with inline flex layout for accessibility.
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
  const hiddenCount = sources.length - MAX_VISIBLE

  return (
    <div className="mt-2 text-xs text-text-muted" data-testid={`sources-${title.toLowerCase()}`}>
      <h4 className="inline font-medium">{title}:</h4>{" "}
      <ul className="inline">
        {visible.map((source, idx) => (
          <li key={idx} className="inline">
            <SourceItem source={source} />
            {idx < visible.length - 1 && (
              <span className="mx-1" aria-hidden="true">
                &middot;
              </span>
            )}
          </li>
        ))}
      </ul>
      {hasOverflow && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="ml-1 text-xs text-brown-medium hover:text-brown-dark"
          data-testid="sources-toggle"
        >
          {expanded ? "show less" : `+ ${hiddenCount} more`}
        </button>
      )}
    </div>
  )
}
