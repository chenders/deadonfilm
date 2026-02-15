/**
 * Renders a titled list of source entries with external links.
 */

import { ExternalLinkIcon } from "@/components/icons"
import type { SourceEntry } from "@/types"

interface SourceListProps {
  sources: SourceEntry[] | null
  title: string
}

export default function SourceList({ sources, title }: SourceListProps) {
  if (!sources || sources.length === 0) return null

  return (
    <div className="mt-2" data-testid={`sources-${title.toLowerCase()}`}>
      <h4 className="text-xs font-medium text-text-muted">{title}:</h4>
      <ul className="mt-1 space-y-1">
        {sources.map((source, idx) => (
          <li key={idx} className="text-xs text-text-muted">
            {source.url || source.archiveUrl ? (
              <a
                href={source.archiveUrl || source.url || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-brown-dark"
              >
                {source.description}
                <ExternalLinkIcon size={10} className="ml-1 inline" />
              </a>
            ) : (
              <span>{source.description}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
