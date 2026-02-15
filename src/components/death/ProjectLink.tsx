/**
 * Link to a movie/show project page, with fallbacks to IMDb or plain text.
 */

import { Link } from "react-router-dom"
import { createMovieSlug, createShowSlug } from "@/utils/slugify"
import { ExternalLinkIcon } from "@/components/icons"
import type { ProjectInfo } from "@/types"

interface ProjectLinkProps {
  project: ProjectInfo
}

export default function ProjectLink({ project }: ProjectLinkProps) {
  const getProjectUrl = () => {
    if (!project.tmdb_id) return null
    if (project.type === "movie") {
      return `/movie/${createMovieSlug(project.title, project.year?.toString() || "unknown", project.tmdb_id)}`
    } else if (project.type === "show") {
      return `/show/${createShowSlug(project.title, project.year ? `${project.year}-01-01` : null, project.tmdb_id)}`
    }
    return null
  }

  const url = getProjectUrl()
  const displayText = `${project.title}${project.year ? ` (${project.year})` : ""}`

  if (url) {
    return (
      <Link to={url} className="text-brown-dark underline hover:text-brown-medium">
        {displayText}
      </Link>
    )
  }

  if (project.imdb_id) {
    return (
      <a
        href={`https://www.imdb.com/title/${project.imdb_id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-brown-dark underline hover:text-brown-medium"
      >
        {displayText}
        <ExternalLinkIcon size={12} className="ml-1 inline" />
      </a>
    )
  }

  return <span>{displayText}</span>
}
