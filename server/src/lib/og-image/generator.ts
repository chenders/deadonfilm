/**
 * OG image generator using Satori (JSX-to-SVG) + resvg (SVG-to-PNG).
 *
 * Generates branded 1200x630 PNG images for social sharing previews.
 * Fonts are loaded once at startup via a lazy singleton.
 */

import satori from "satori"
import { Resvg } from "@resvg/resvg-js"
import { readFile } from "fs/promises"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { logger } from "../logger.js"
import {
  OG_WIDTH,
  OG_HEIGHT,
  movieTemplate,
  actorTemplate,
  showTemplate,
  type MovieOgData,
  type ActorOgData,
  type ShowOgData,
} from "./templates.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const FONTS_DIR = join(__dirname, "../../../data/fonts")

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p"

type FontData = { name: string; data: Buffer; weight: 400 | 700; style: "normal" }[]

let fontsPromise: Promise<FontData> | null = null

async function loadFonts(): Promise<FontData> {
  const [regular, bold] = await Promise.all([
    readFile(join(FONTS_DIR, "Inter-Regular.ttf")),
    readFile(join(FONTS_DIR, "Inter-Bold.ttf")),
  ])

  return [
    { name: "Inter", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Inter", data: bold, weight: 700 as const, style: "normal" as const },
  ]
}

function getFonts(): Promise<FontData> {
  if (!fontsPromise) {
    fontsPromise = loadFonts()
  }
  return fontsPromise
}

/**
 * Fetch a TMDB image and return it as a base64 data URL.
 * Returns null on failure (image generation proceeds without it).
 */
export async function fetchImageAsBase64(tmdbPath: string, size: string): Promise<string | null> {
  const url = `${TMDB_IMAGE_BASE}/${size}${tmdbPath}`
  try {
    const response = await fetch(url)
    if (!response.ok) return null

    const contentType = response.headers.get("content-type") || "image/jpeg"
    const buffer = await response.arrayBuffer()
    const base64 = Buffer.from(buffer).toString("base64")
    return `data:${contentType};base64,${base64}`
  } catch (err) {
    logger.warn({ err: (err as Error).message, url }, "Failed to fetch TMDB image for OG")
    return null
  }
}

async function renderSvgToPng(element: Record<string, unknown>): Promise<Buffer> {
  const fonts = await getFonts()

  // Satori accepts plain objects matching its internal element tree format,
  // but TypeScript types expect ReactNode. The cast is safe here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svg = await satori(element as any, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts,
  })

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width" as const, value: OG_WIDTH },
  })

  const pngData = resvg.render()
  return Buffer.from(pngData.asPng())
}

export async function generateMovieOgImage(data: MovieOgData): Promise<Buffer> {
  const element = movieTemplate(data)
  return renderSvgToPng(element)
}

export async function generateActorOgImage(data: ActorOgData): Promise<Buffer> {
  const element = actorTemplate(data)
  return renderSvgToPng(element)
}

export async function generateShowOgImage(data: ShowOgData): Promise<Buffer> {
  const element = showTemplate(data)
  return renderSvgToPng(element)
}
