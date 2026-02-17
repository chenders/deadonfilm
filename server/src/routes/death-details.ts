import type { Request, Response } from "express"
import {
  getActorDeathCircumstancesByActorId,
  getActorByEitherIdWithSlug,
  getNotableDeaths as getNotableDeathsFromDb,
  getInDetailActors as getInDetailActorsFromDb,
  hasDetailedDeathInfo,
  type ProjectInfo,
  type SourceEntry,
  type InDetailResponse,
} from "../lib/db.js"
import { getPersonDetails } from "../lib/tmdb.js"
import { createActorSlug } from "../lib/slug-utils.js"
import { resolveRelatedCelebritySlugs } from "../lib/related-celebrity-slugs.js"
import newrelic from "newrelic"
import {
  CACHE_KEYS,
  CACHE_PREFIX,
  CACHE_TTL,
  buildCacheKey,
  getCached,
  setCached,
} from "../lib/cache.js"
import type { ResolvedUrl } from "../lib/death-sources/url-resolver.js"

// Response type for death details endpoint
interface DeathDetailsResponse {
  actor: {
    id: number
    tmdbId: number | null
    name: string
    birthday: string | null
    deathday: string
    profilePath: string | null
    causeOfDeath: string | null
    causeOfDeathDetails: string | null
    ageAtDeath: number | null
    yearsLost: number | null
    deathManner: string | null
    deathCategories: string[] | null
    strangeDeath: boolean
  }
  circumstances: {
    official: string | null
    confidence: string | null
    rumored: string | null
    locationOfDeath: string | null
    notableFactors: string[] | null
    additionalContext: string | null
  }
  career: {
    statusAtDeath: string | null
    lastProject: ProjectInfo | null
    posthumousReleases: ProjectInfo[] | null
  }
  relatedCelebrities: Array<{
    name: string
    tmdbId: number | null
    relationship: string
    slug: string | null
  }>
  sources: {
    cause: SourceEntry[] | null
    circumstances: SourceEntry[] | null
    rumored: SourceEntry[] | null
    additionalContext: SourceEntry[] | null
    careerStatus: SourceEntry[] | null
    lastProject: SourceEntry[] | null
    posthumousReleases: SourceEntry[] | null
    locationOfDeath: SourceEntry[] | null
    relatedCelebrities: SourceEntry[] | null
  }
}

/**
 * Raw source entry as stored in the database from the enrichment script.
 * Different from the SourceEntry type used in the API response.
 */
interface RawSourceEntry {
  type?: string
  url?: string | null
  confidence?: number
  retrievedAt?: string
  rawData?: {
    parsed?: {
      sources?: string[]
    }
    [key: string]: unknown
  }
  costUsd?: number
  queryUsed?: string
}

/**
 * Raw sources object as stored in the database.
 * Keys match what the enrichment script stores.
 */
interface RawSources {
  circumstances?: RawSourceEntry
  rumoredCircumstances?: RawSourceEntry
  cause?: RawSourceEntry
  additionalContext?: RawSourceEntry
  careerStatusAtDeath?: RawSourceEntry
  lastProject?: RawSourceEntry
  posthumousReleases?: RawSourceEntry
  locationOfDeath?: RawSourceEntry
  relatedCelebrities?: RawSourceEntry
  cleanupSource?: string
}

/**
 * Individual raw source entry from enrichment.
 */
interface RawResponseEntry {
  sourceName: string
  sourceType: string
  text?: string
  url?: string
  confidence: number
  resolvedSources?: ResolvedUrl[]
}

/**
 * Extract the raw sources array from the raw_response column.
 * Enrichment writes `{ rawSources: [...], gatheredAt: "..." }`,
 * batch API writes `{ response: "...", parsed_at: "..." }`.
 * Safely handles unknown shapes since the column is typed as `unknown`.
 */
function extractRawSources(rawResponse: unknown): RawResponseEntry[] | null {
  if (!rawResponse || typeof rawResponse !== "object") return null

  let candidates: unknown[] | null = null

  // Enrichment wrapper: { rawSources: [...] }
  if (
    "rawSources" in rawResponse &&
    Array.isArray((rawResponse as Record<string, unknown>).rawSources)
  ) {
    candidates = (rawResponse as Record<string, unknown>).rawSources as unknown[]
  }

  // Direct array (defensive, in case older records stored differently)
  if (!candidates && Array.isArray(rawResponse)) {
    candidates = rawResponse
  }

  if (!candidates || candidates.length === 0) return null

  // Validate individual elements: must have at least a sourceName string
  const valid = candidates.filter(
    (entry): entry is RawResponseEntry =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as Record<string, unknown>).sourceName === "string"
  )

  return valid.length > 0 ? valid : null
}

/**
 * Transform source entries from database to API response format.
 * Handles both legacy array format and new enrichment object format.
 */
function buildSourcesResponse(
  rawSources: RawSources | SourceEntry[] | null | undefined,
  rawResponse?: unknown
): DeathDetailsResponse["sources"] {
  if (!rawSources) {
    return {
      cause: null,
      circumstances: null,
      rumored: null,
      additionalContext: null,
      careerStatus: null,
      lastProject: null,
      posthumousReleases: null,
      locationOfDeath: null,
      relatedCelebrities: null,
    }
  }

  /**
   * Select the best single source from an array based on reputation.
   * Used for fields like career status where multiple sources are redundant.
   */
  const selectBestSource = (sources: SourceEntry[] | null): SourceEntry[] | null => {
    if (!sources || sources.length === 0) return null
    if (sources.length === 1) return sources

    // Reputation tiers (higher = more reputable)
    const reputationScore = (description: string): number => {
      const desc = description.toLowerCase()

      // Tier 1: Major news outlets (highest reputation)
      if (
        desc.includes("bbc") ||
        desc.includes("new york times") ||
        desc.includes("washington post") ||
        desc.includes("reuters") ||
        desc.includes("ap news")
      ) {
        return 100
      }

      // Tier 2: Major entertainment trades
      if (
        desc.includes("variety") ||
        desc.includes("hollywood reporter") ||
        desc.includes("deadline")
      ) {
        return 90
      }

      // Tier 3: Entertainment news
      if (
        desc.includes("people") ||
        desc.includes("entertainment weekly") ||
        desc.includes("tmz")
      ) {
        return 80
      }

      // Tier 4: General news
      if (
        desc.includes("cnn") ||
        desc.includes("nbc") ||
        desc.includes("abc") ||
        desc.includes("cbs")
      ) {
        return 70
      }

      // Tier 5: Reference sites
      if (desc.includes("wikipedia") || desc.includes("wikidata") || desc.includes("britannica")) {
        return 60
      }

      // Default: Unknown source
      return 50
    }

    // Find source with highest reputation
    const bestSource = sources.reduce((best, current) => {
      const currentScore = reputationScore(current.description)
      const bestScore = reputationScore(best.description)
      return currentScore > bestScore ? current : best
    })

    return [bestSource]
  }

  // Convert a raw source entry object to SourceEntry array format
  const rawToSourceEntry = (raw: RawSourceEntry | undefined): SourceEntry[] | null => {
    if (!raw) return null

    const entries: SourceEntry[] = []

    // Check for resolved sources from Gemini (new format with human-readable names)
    const resolvedSources = raw.rawData?.resolvedSources as ResolvedUrl[] | undefined
    if (resolvedSources && Array.isArray(resolvedSources) && resolvedSources.length > 0) {
      for (const source of resolvedSources) {
        // Only include sources that were successfully resolved
        if (source.finalUrl && !source.error) {
          entries.push({
            url: source.finalUrl,
            archive_url: null,
            description: source.sourceName, // Human-readable name like "People" instead of "Source: gemini_pro"
          })
        }
      }
      // If we got resolved sources, return them
      if (entries.length > 0) {
        return entries
      }
    }

    const sourceType = raw.type ? `Source: ${raw.type}` : "Source"

    // Check for sources in rawData.parsed.sources (from AI providers like Perplexity/Gemini)
    const parsedSources = raw.rawData?.parsed?.sources
    if (parsedSources && Array.isArray(parsedSources) && parsedSources.length > 0) {
      for (const sourceUrl of parsedSources) {
        if (typeof sourceUrl === "string" && sourceUrl.length > 0) {
          entries.push({
            url: sourceUrl,
            archive_url: null,
            description: sourceType,
          })
        }
      }
    }

    // If no sources from parsed, use the top-level URL
    if (entries.length === 0 && raw.url) {
      entries.push({
        url: raw.url,
        archive_url: null,
        description: sourceType,
      })
    }

    // If still no entries, return at least a description
    if (entries.length === 0) {
      entries.push({
        url: null,
        archive_url: null,
        description: sourceType,
      })
    }

    return entries
  }

  /**
   * Build source entries from the raw_response column (all sources that contributed
   * to Claude cleanup synthesis). Deduplicates by URL, sorted by confidence descending.
   */
  const rawResponseToSourceEntries = (
    raw: RawResponseEntry[] | null | undefined
  ): SourceEntry[] | null => {
    if (!raw || raw.length === 0) return null

    const entries: SourceEntry[] = []
    const seenUrls = new Set<string>()
    const seenNames = new Set<string>()

    // Sort by confidence descending so highest-confidence sources appear first
    const sorted = [...raw].sort(
      (a, b) =>
        (typeof b.confidence === "number" ? b.confidence : 0) -
        (typeof a.confidence === "number" ? a.confidence : 0)
    )

    for (const source of sorted) {
      // Sources with resolvedSources (e.g., Gemini with grounding URLs)
      if (Array.isArray(source.resolvedSources) && source.resolvedSources.length > 0) {
        for (const resolved of source.resolvedSources) {
          if (resolved.finalUrl && !resolved.error && !seenUrls.has(resolved.finalUrl)) {
            seenUrls.add(resolved.finalUrl)
            entries.push({
              url: resolved.finalUrl,
              archive_url: null,
              description: resolved.sourceName || source.sourceName,
            })
          }
        }
        continue
      }

      // Sources with a direct URL
      if (source.url) {
        if (!seenUrls.has(source.url)) {
          seenUrls.add(source.url)
          entries.push({
            url: source.url,
            archive_url: null,
            description: source.sourceName,
          })
        }
        continue
      }

      // Sources without a URL (description only, deduplicate by name)
      if (source.sourceName && !seenNames.has(source.sourceName)) {
        seenNames.add(source.sourceName)
        entries.push({
          url: null,
          archive_url: null,
          description: source.sourceName,
        })
      }
    }

    return entries.length > 0 ? entries : null
  }

  // Check if a value is already a valid SourceEntry array
  const isSourceEntryArray = (val: unknown): val is SourceEntry[] => {
    return (
      Array.isArray(val) && val.length > 0 && typeof val[0] === "object" && "description" in val[0]
    )
  }

  // Handle RawSources object format (from enrichment script)
  const sources = rawSources as RawSources

  // For each field, check if it's already an array (legacy format) or needs conversion
  const causeVal = sources.cause
  const circumstancesVal = sources.circumstances
  const rumoredVal = sources.rumoredCircumstances

  // Extract raw sources array from the wrapper object (runtime shape check)
  const extractedRawSources = sources.cleanupSource ? extractRawSources(rawResponse) : null

  return {
    cause: isSourceEntryArray(causeVal) ? causeVal : rawToSourceEntry(causeVal as RawSourceEntry),
    circumstances: extractedRawSources
      ? (rawResponseToSourceEntries(extractedRawSources) ??
        (isSourceEntryArray(circumstancesVal)
          ? circumstancesVal
          : rawToSourceEntry(circumstancesVal as RawSourceEntry)))
      : isSourceEntryArray(circumstancesVal)
        ? circumstancesVal
        : rawToSourceEntry(circumstancesVal as RawSourceEntry),
    rumored: isSourceEntryArray(rumoredVal)
      ? rumoredVal
      : rawToSourceEntry(rumoredVal as RawSourceEntry),
    additionalContext: rawToSourceEntry(sources.additionalContext as RawSourceEntry),
    careerStatus: selectBestSource(rawToSourceEntry(sources.careerStatusAtDeath as RawSourceEntry)),
    lastProject: rawToSourceEntry(sources.lastProject as RawSourceEntry),
    posthumousReleases: rawToSourceEntry(sources.posthumousReleases as RawSourceEntry),
    locationOfDeath: rawToSourceEntry(sources.locationOfDeath as RawSourceEntry),
    relatedCelebrities: rawToSourceEntry(sources.relatedCelebrities as RawSourceEntry),
  }
}

/**
 * Extract numeric actor ID from URL slug.
 * Slug format: "actor-name-12345" -> 12345
 */
function extractActorId(slug: string): number | null {
  const parts = slug.split("-")
  const lastPart = parts[parts.length - 1]
  const id = parseInt(lastPart, 10)
  return isNaN(id) ? null : id
}

/**
 * GET /api/actor/:slug/death
 * Get detailed death circumstances for an actor
 */
export async function getActorDeathDetails(req: Request, res: Response) {
  const slug = req.params.slug // Full slug like "john-wayne-4165"
  const numericId = extractActorId(slug)

  if (!numericId || isNaN(numericId)) {
    return res.status(400).json({ error: { message: "Invalid actor ID" } })
  }

  try {
    const startTime = Date.now()

    // Look up actor by EITHER id or tmdb_id, WITH SLUG VALIDATION
    const actorLookup = await getActorByEitherIdWithSlug(numericId, slug)

    if (!actorLookup) {
      return res.status(404).json({ error: { message: "Actor not found" } })
    }

    const { actor: actorRecord, matchedBy } = actorLookup

    // If matched by tmdb_id, redirect to canonical URL with actor.id
    if (matchedBy === "tmdb_id") {
      // Track redirect event for migration monitoring
      const userAgent = req.headers["user-agent"]
      const referer = req.headers["referer"] || req.headers["referrer"]
      newrelic.recordCustomEvent("ActorUrlRedirect", {
        actorId: actorRecord.id,
        ...(actorRecord.tmdb_id !== null && { tmdbId: actorRecord.tmdb_id }),
        actorName: actorRecord.name,
        slug: slug,
        matchType: "tmdb_id",
        endpoint: "death",
        ...(userAgent && { userAgent }),
        ...(referer && { referer: Array.isArray(referer) ? referer[0] : referer }),
      })

      const canonicalSlug = createActorSlug(actorRecord.name, actorRecord.id)
      return res.redirect(301, `/api/actor/${canonicalSlug}/death`)
    }

    // Use actor.id for cache key
    const cacheKey = CACHE_KEYS.actor(actorRecord.id).death

    // Check cache first
    const cached = await getCached<DeathDetailsResponse>(cacheKey)
    if (cached) {
      newrelic.recordCustomEvent("DeathDetailsView", {
        actorId: actorRecord.id,
        ...(actorRecord.tmdb_id !== null && { tmdbId: actorRecord.tmdb_id }),
        name: cached.actor.name,
        hasCircumstances: !!cached.circumstances.official,
        hasRumored: !!cached.circumstances.rumored,
        responseTimeMs: Date.now() - startTime,
        cacheHit: true,
      })
      return res.set("Cache-Control", "public, max-age=600").json(cached)
    }

    // First check if actor has detailed death info
    const tmdbIdForFetch = actorRecord.tmdb_id ?? actorRecord.id
    const hasDetailed = await hasDetailedDeathInfo(tmdbIdForFetch)
    if (!hasDetailed) {
      return res.status(404).json({
        error: { message: "No detailed death information available for this actor" },
      })
    }

    // Fetch person and circumstances in parallel (we already have actorRecord)
    const [person, circumstances] = await Promise.all([
      getPersonDetails(tmdbIdForFetch),
      getActorDeathCircumstancesByActorId(actorRecord.id),
    ])

    if (!actorRecord || !actorRecord.deathday) {
      return res.status(404).json({ error: { message: "Actor not found or not deceased" } })
    }

    // Resolve slugs for related celebrities using shared helper
    const relatedCelebrityData = circumstances?.related_celebrities || []
    const relatedCelebrities = await resolveRelatedCelebritySlugs(relatedCelebrityData)

    const response: DeathDetailsResponse = {
      actor: {
        id: actorRecord.id,
        tmdbId: actorRecord.tmdb_id ?? null,
        name: actorRecord.name,
        birthday: actorRecord.birthday,
        deathday: actorRecord.deathday,
        profilePath: actorRecord.profile_path || person.profile_path,
        causeOfDeath: actorRecord.cause_of_death,
        causeOfDeathDetails: actorRecord.cause_of_death_details,
        ageAtDeath: actorRecord.age_at_death,
        yearsLost: actorRecord.years_lost,
        deathManner: (actorRecord as unknown as { death_manner: string | null }).death_manner,
        deathCategories: (actorRecord as unknown as { death_categories: string[] | null })
          .death_categories,
        strangeDeath:
          (actorRecord as unknown as { strange_death: boolean | null }).strange_death ?? false,
      },
      circumstances: {
        official: circumstances?.circumstances || null,
        confidence: circumstances?.circumstances_confidence || null,
        rumored: circumstances?.rumored_circumstances || null,
        locationOfDeath: circumstances?.location_of_death || null,
        notableFactors: circumstances?.notable_factors || null,
        additionalContext: circumstances?.additional_context || null,
      },
      career: {
        statusAtDeath: circumstances?.career_status_at_death || null,
        lastProject: circumstances?.last_project || null,
        posthumousReleases: circumstances?.posthumous_releases || null,
      },
      relatedCelebrities,
      sources: buildSourcesResponse(
        circumstances?.sources as unknown as RawSources,
        circumstances?.raw_response
      ),
    }

    // Cache the response
    await setCached(cacheKey, response, CACHE_TTL.WEEK)

    newrelic.recordCustomEvent("DeathDetailsView", {
      actorId: actorRecord.id,
      ...(actorRecord.tmdb_id !== null && { tmdbId: actorRecord.tmdb_id }),
      name: actorRecord.name,
      hasCircumstances: !!circumstances?.circumstances,
      hasRumored: !!circumstances?.rumored_circumstances,
      confidence: circumstances?.circumstances_confidence || "unknown",
      responseTimeMs: Date.now() - startTime,
      cacheHit: false,
    })

    res.set("Cache-Control", "public, max-age=600").json(response)
  } catch (error) {
    console.error("Death details fetch error:", error)
    res.status(500).json({ error: { message: "Failed to fetch death details" } })
  }
}

// Response type for notable deaths list
interface NotableDeathsResponse {
  actors: Array<{
    id: number
    tmdbId: number | null
    name: string
    profilePath: string | null
    deathday: string
    ageAtDeath: number | null
    causeOfDeath: string | null
    deathManner: string | null
    strangeDeath: boolean
    notableFactors: string[] | null
    circumstancesConfidence: string | null
    slug: string
  }>
  pagination: {
    page: number
    pageSize: number
    totalCount: number
    totalPages: number
  }
}

/**
 * GET /api/deaths/notable
 * Get paginated list of actors with detailed death information
 */
export async function getNotableDeaths(req: Request, res: Response) {
  try {
    const startTime = Date.now()

    // Parse query params
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string, 10) || 50))
    const filter = (req.query.filter as "all" | "strange" | "disputed" | "controversial") || "all"
    const includeObscure = req.query.includeObscure === "true"
    // Normalize sort/dir to valid values to prevent cache key bloat
    const validSorts = ["date", "name"]
    const sort = validSorts.includes(req.query.sort as string) ? (req.query.sort as string) : "date"
    const dir = req.query.dir === "asc" ? "asc" : "desc"

    // Validate filter
    if (!["all", "strange", "disputed", "controversial"].includes(filter)) {
      return res.status(400).json({ error: { message: "Invalid filter value" } })
    }

    const cacheKey = buildCacheKey(CACHE_PREFIX.DEATHS, {
      type: "notable",
      page,
      pageSize,
      filter,
      includeObscure,
      sort,
      dir,
    })

    // Check cache first
    const cached = await getCached<NotableDeathsResponse>(cacheKey)
    if (cached) {
      newrelic.recordCustomEvent("NotableDeathsView", {
        filter,
        page,
        totalCount: cached.pagination.totalCount,
        responseTimeMs: Date.now() - startTime,
        cacheHit: true,
      })
      return res.set("Cache-Control", "public, max-age=300").json(cached)
    }

    // Fetch from database
    const result = await getNotableDeathsFromDb({
      page,
      pageSize,
      filter,
      includeObscure,
      sort,
      dir,
    })

    const response: NotableDeathsResponse = result

    // Cache for 5 minutes
    await setCached(cacheKey, response, CACHE_TTL.WEEK)

    newrelic.recordCustomEvent("NotableDeathsView", {
      filter,
      page,
      totalCount: result.pagination.totalCount,
      responseTimeMs: Date.now() - startTime,
      cacheHit: false,
    })

    res.set("Cache-Control", "public, max-age=300").json(response)
  } catch (error) {
    console.error("Notable deaths fetch error:", error)
    res.status(500).json({ error: { message: "Failed to fetch notable deaths" } })
  }
}

/**
 * GET /api/in-detail
 * Get paginated list of actors with thoroughly researched death information,
 * sorted by most recently enriched by default.
 */
export async function getInDetailHandler(req: Request, res: Response) {
  try {
    const startTime = Date.now()

    // Parse query params
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string, 10) || 50))
    const includeObscure = req.query.includeObscure === "true"
    const search = (req.query.search as string) || undefined

    // Normalize sort/dir to valid values to prevent cache key bloat
    const validSorts = ["updated", "date", "name", "age"]
    const sort = validSorts.includes(req.query.sort as string)
      ? (req.query.sort as string)
      : "updated"
    const dir = req.query.dir === "asc" ? "asc" : req.query.dir === "desc" ? "desc" : undefined

    // Skip cache when search is present (same pattern as AllDeaths)
    if (!search) {
      const cacheKey = buildCacheKey(CACHE_PREFIX.DEATHS, {
        type: "in-detail",
        page,
        pageSize,
        includeObscure,
        sort,
        dir,
      })

      const cached = await getCached<InDetailResponse>(cacheKey)
      if (cached) {
        newrelic.recordCustomEvent("InDetailView", {
          page,
          totalCount: cached.pagination.totalCount,
          responseTimeMs: Date.now() - startTime,
          cacheHit: true,
        })
        return res.set("Cache-Control", "public, max-age=300").json(cached)
      }

      // Fetch from database
      const result = await getInDetailActorsFromDb({
        page,
        pageSize,
        includeObscure,
        sort,
        dir,
      })

      // Cache for 5 minutes
      await setCached(cacheKey, result, CACHE_TTL.SHORT)

      newrelic.recordCustomEvent("InDetailView", {
        page,
        totalCount: result.pagination.totalCount,
        responseTimeMs: Date.now() - startTime,
        cacheHit: false,
      })

      return res.set("Cache-Control", "public, max-age=300").json(result)
    }

    // Search path (no caching)
    const result = await getInDetailActorsFromDb({
      page,
      pageSize,
      includeObscure,
      search,
      sort,
      dir,
    })

    newrelic.recordCustomEvent("InDetailView", {
      page,
      search: search.slice(0, 50),
      totalCount: result.pagination.totalCount,
      responseTimeMs: Date.now() - startTime,
      cacheHit: false,
    })

    res.set("Cache-Control", "public, max-age=60").json(result)
  } catch (error) {
    console.error("In-detail fetch error:", error)
    res.status(500).json({ error: { message: "Failed to fetch in-detail actors" } })
  }
}
