#!/usr/bin/env tsx
/**
 * Compare OMDB search vs IMDb dataset matching for IMDb ID lookups.
 *
 * This script tests different methods of finding IMDb IDs for movies that
 * don't have them, comparing accuracy and coverage between approaches.
 *
 * Methods tested:
 * 1. OMDB exact title match - ?t={title}&y={year}&type=movie
 * 2. OMDB search - ?s={title}&y={year}&type=movie
 * 3. IMDb dataset fuzzy match - Fuse.js on title.basics.tsv.gz
 *
 * Usage:
 *   npm run compare:imdb-methods -- [options]
 *
 * Options:
 *   --sample-size <n>     Number of movies to test (default: 50)
 *   --min-popularity <n>  Only test movies with popularity >= n (default: 5)
 *   --verbose             Show detailed output for each movie
 *   --dry-run             Skip OMDB API calls (only test dataset matching)
 *
 * Examples:
 *   npm run compare:imdb-methods -- --sample-size 100
 *   npm run compare:imdb-methods -- --min-popularity 10 --verbose
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import Fuse from "fuse.js"
import { getPool, resetPool } from "../src/lib/db.js"
import { getMovieIndex } from "../src/lib/imdb.js"
import { searchOMDbByTitle, searchOMDb } from "../src/lib/omdb.js"

function parsePositiveInt(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  const parsed = parseInt(value, 10)
  if (parsed <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return parsed
}

function parseNonNegativeNumber(value: string): number {
  const parsed = parseFloat(value)
  if (isNaN(parsed) || parsed < 0) {
    throw new InvalidArgumentError("Must be a non-negative number")
  }
  return parsed
}

interface MovieToTest {
  tmdb_id: number
  title: string
  release_date: string | Date | null
  popularity: number | null
}

interface ComparisonResult {
  movie: MovieToTest
  year: number | null
  omdbExact: { imdbId: string; title: string } | null
  omdbSearch: { imdbId: string; title: string; position: number }[]
  datasetMatch: { imdbId: string; title: string; confidence: number; year: number | null } | null
  datasetAlternates: { imdbId: string; title: string; confidence: number; year: number | null }[]
  agreement: "all" | "partial" | "none" | "no-results"
}

interface FuseSearchItem {
  tconst: string
  primaryTitle: string
  originalTitle: string
  startYear: number | null
}

const program = new Command()
  .name("compare-imdb-lookup-methods")
  .description("Compare OMDB search vs IMDb dataset matching for IMDb ID lookups")
  .option("-s, --sample-size <number>", "Number of movies to test", parsePositiveInt, 50)
  .option(
    "--min-popularity <number>",
    "Only test movies with popularity >= n",
    parseNonNegativeNumber,
    5
  )
  .option("-v, --verbose", "Show detailed output for each movie")
  .option("-n, --dry-run", "Skip OMDB API calls (only test dataset matching)")
  .action(runComparison)

interface Options {
  sampleSize: number
  minPopularity: number
  verbose?: boolean
  dryRun?: boolean
}

async function runComparison(options: Options): Promise<void> {
  const { sampleSize, minPopularity, verbose, dryRun } = options

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  if (!dryRun && !process.env.OMDB_API_KEY) {
    console.error("OMDB_API_KEY environment variable is required (or use --dry-run)")
    process.exit(1)
  }

  const db = getPool()

  console.log("\n" + "=".repeat(70))
  console.log("IMDb ID Lookup Method Comparison")
  console.log("=".repeat(70))
  console.log(`Sample size: ${sampleSize}`)
  console.log(`Min popularity: ${minPopularity}`)
  console.log(`Dry run (skip OMDB): ${dryRun ? "yes" : "no"}`)
  console.log()

  // Step 1: Get sample of movies without IMDb IDs
  console.log("Fetching sample movies from database...")
  const result = await db.query<MovieToTest>(
    `SELECT tmdb_id, title, release_date, popularity
     FROM movies
     WHERE imdb_id IS NULL
       AND popularity >= $1
     ORDER BY RANDOM()
     LIMIT $2`,
    [minPopularity, sampleSize]
  )
  const movies = result.rows

  console.log(`Found ${movies.length} movies to test\n`)

  if (movies.length === 0) {
    console.log("No movies found matching criteria. Try lowering --min-popularity.")
    await resetPool()
    return
  }

  // Step 2: Load IMDb movie index and build Fuse.js search
  console.log("Loading IMDb movie index...")
  const imdbMovies = await getMovieIndex()
  console.log(`Loaded ${imdbMovies.length.toLocaleString()} movies from IMDb dataset\n`)

  // Build Fuse.js index with both primaryTitle and originalTitle
  console.log("Building Fuse.js search index...")
  const fuseItems: FuseSearchItem[] = imdbMovies.map((m) => ({
    tconst: m.tconst,
    primaryTitle: m.primaryTitle,
    originalTitle: m.originalTitle,
    startYear: m.startYear,
  }))

  const fuse = new Fuse(fuseItems, {
    keys: ["primaryTitle", "originalTitle"],
    threshold: 0.3, // 70% minimum similarity
    includeScore: true,
    minMatchCharLength: 3,
    ignoreLocation: true,
  })
  console.log("Search index ready\n")

  // Step 3: Test each movie
  console.log("Testing lookup methods...\n")
  const results: ComparisonResult[] = []

  for (let i = 0; i < movies.length; i++) {
    const movie = movies[i]
    // Handle release_date as either Date object or string
    let year: number | null = null
    if (movie.release_date) {
      if (movie.release_date instanceof Date) {
        year = movie.release_date.getFullYear()
      } else {
        year = parseInt(String(movie.release_date).substring(0, 4), 10)
      }
    }

    process.stdout.write(`[${i + 1}/${movies.length}] ${movie.title} (${year || "?"})... `)

    // Method 1: OMDB exact title match
    let omdbExact: ComparisonResult["omdbExact"] = null
    if (!dryRun) {
      const exactResult = await searchOMDbByTitle(movie.title, year || undefined, "movie")
      if (exactResult) {
        omdbExact = { imdbId: exactResult.imdbID, title: exactResult.Title }
      }
    }

    // Method 2: OMDB search
    let omdbSearch: ComparisonResult["omdbSearch"] = []
    if (!dryRun) {
      const searchResults = await searchOMDb(movie.title, year || undefined, "movie")
      omdbSearch = searchResults.slice(0, 5).map((r, idx) => ({
        imdbId: r.imdbID,
        title: r.Title,
        position: idx + 1,
      }))
    }

    // Method 3: IMDb dataset fuzzy match
    const fuseResults = fuse.search(movie.title)

    // Filter by year (exact match or ±1 year tolerance)
    const yearFilteredResults = fuseResults.filter((r) => {
      if (!year || !r.item.startYear) return false
      return Math.abs(r.item.startYear - year) <= 1
    })

    let datasetMatch: ComparisonResult["datasetMatch"] = null
    const datasetAlternates: ComparisonResult["datasetAlternates"] = []

    if (yearFilteredResults.length > 0) {
      const topMatch = yearFilteredResults[0]
      const confidence = 1 - (topMatch.score || 0)

      datasetMatch = {
        imdbId: topMatch.item.tconst,
        title: topMatch.item.primaryTitle,
        confidence,
        year: topMatch.item.startYear,
      }

      // Get alternates (next 2 matches)
      for (let j = 1; j < Math.min(yearFilteredResults.length, 3); j++) {
        const alt = yearFilteredResults[j]
        datasetAlternates.push({
          imdbId: alt.item.tconst,
          title: alt.item.primaryTitle,
          confidence: 1 - (alt.score || 0),
          year: alt.item.startYear,
        })
      }
    }

    // Determine agreement
    let agreement: ComparisonResult["agreement"] = "no-results"

    const allImdbIds = new Set<string>()
    if (omdbExact) allImdbIds.add(omdbExact.imdbId)
    if (omdbSearch.length > 0) allImdbIds.add(omdbSearch[0].imdbId)
    if (datasetMatch) allImdbIds.add(datasetMatch.imdbId)

    if (allImdbIds.size === 0) {
      agreement = "no-results"
    } else if (allImdbIds.size === 1) {
      agreement = "all"
    } else {
      // Check if any two methods agree
      const methods = [omdbExact?.imdbId, omdbSearch[0]?.imdbId, datasetMatch?.imdbId].filter(
        Boolean
      )

      if (methods.length >= 2 && new Set(methods).size < methods.length) {
        agreement = "partial"
      } else {
        agreement = "none"
      }
    }

    results.push({
      movie,
      year,
      omdbExact,
      omdbSearch,
      datasetMatch,
      datasetAlternates,
      agreement,
    })

    // Print result summary
    if (agreement === "all") {
      console.log(`\u2713 All agree: ${omdbExact?.imdbId || datasetMatch?.imdbId}`)
    } else if (agreement === "partial") {
      console.log(
        `~ Partial: OMDB=${omdbExact?.imdbId || "-"}, Dataset=${datasetMatch?.imdbId || "-"}`
      )
    } else if (agreement === "no-results") {
      console.log("- No results found")
    } else {
      console.log(
        `\u2717 Disagree: OMDB=${omdbExact?.imdbId || "-"}, Dataset=${datasetMatch?.imdbId || "-"}`
      )
    }

    if (verbose) {
      console.log(
        `    OMDB exact: ${omdbExact ? `${omdbExact.imdbId} "${omdbExact.title}"` : "not found"}`
      )
      console.log(
        `    OMDB search: ${omdbSearch.length > 0 ? omdbSearch.map((r) => r.imdbId).join(", ") : "none"}`
      )
      if (datasetMatch) {
        console.log(
          `    Dataset: ${datasetMatch.imdbId} "${datasetMatch.title}" (${(datasetMatch.confidence * 100).toFixed(0)}% confidence, ${datasetMatch.year})`
        )
      } else {
        console.log(`    Dataset: no match`)
      }
    }
  }

  // Step 4: Calculate and print statistics
  console.log("\n" + "=".repeat(70))
  console.log("RESULTS SUMMARY")
  console.log("=".repeat(70))

  const omdbExactSuccess = results.filter((r) => r.omdbExact !== null).length
  const omdbSearchSuccess = results.filter((r) => r.omdbSearch.length > 0).length
  const datasetSuccess90 = results.filter(
    (r) => r.datasetMatch !== null && r.datasetMatch.confidence >= 0.9
  ).length
  const datasetSuccess85 = results.filter(
    (r) => r.datasetMatch !== null && r.datasetMatch.confidence >= 0.85
  ).length
  const datasetSuccess80 = results.filter(
    (r) => r.datasetMatch !== null && r.datasetMatch.confidence >= 0.8
  ).length

  const allAgree = results.filter((r) => r.agreement === "all").length
  const partialAgree = results.filter((r) => r.agreement === "partial").length
  const noAgree = results.filter((r) => r.agreement === "none").length
  const noResults = results.filter((r) => r.agreement === "no-results").length

  console.log("\nSuccess rates:")
  if (!dryRun) {
    console.log(
      `  OMDB exact match: ${omdbExactSuccess}/${results.length} (${((omdbExactSuccess / results.length) * 100).toFixed(1)}%)`
    )
    console.log(
      `  OMDB search (any result): ${omdbSearchSuccess}/${results.length} (${((omdbSearchSuccess / results.length) * 100).toFixed(1)}%)`
    )
  }
  console.log(
    `  Dataset match (>=90% confidence): ${datasetSuccess90}/${results.length} (${((datasetSuccess90 / results.length) * 100).toFixed(1)}%)`
  )
  console.log(
    `  Dataset match (>=85% confidence): ${datasetSuccess85}/${results.length} (${((datasetSuccess85 / results.length) * 100).toFixed(1)}%)`
  )
  console.log(
    `  Dataset match (>=80% confidence): ${datasetSuccess80}/${results.length} (${((datasetSuccess80 / results.length) * 100).toFixed(1)}%)`
  )

  if (!dryRun) {
    console.log("\nAgreement between methods:")
    console.log(
      `  All methods agree: ${allAgree} (${((allAgree / results.length) * 100).toFixed(1)}%)`
    )
    console.log(
      `  Partial agreement: ${partialAgree} (${((partialAgree / results.length) * 100).toFixed(1)}%)`
    )
    console.log(`  No agreement: ${noAgree} (${((noAgree / results.length) * 100).toFixed(1)}%)`)
    console.log(
      `  No results from any method: ${noResults} (${((noResults / results.length) * 100).toFixed(1)}%)`
    )
  }

  // Show examples of disagreements
  if (!dryRun) {
    const disagreements = results.filter((r) => r.agreement === "none" || r.agreement === "partial")
    if (disagreements.length > 0) {
      console.log("\nDisagreement examples (first 5):")
      for (const r of disagreements.slice(0, 5)) {
        console.log(`\n  "${r.movie.title}" (${r.year || "?"})`)
        console.log(
          `    OMDB exact: ${r.omdbExact ? `${r.omdbExact.imdbId} "${r.omdbExact.title}"` : "not found"}`
        )
        console.log(
          `    OMDB search: ${r.omdbSearch.length > 0 ? `${r.omdbSearch[0].imdbId} "${r.omdbSearch[0].title}"` : "none"}`
        )
        if (r.datasetMatch) {
          console.log(
            `    Dataset: ${r.datasetMatch.imdbId} "${r.datasetMatch.title}" (${(r.datasetMatch.confidence * 100).toFixed(0)}%)`
          )
        } else {
          console.log(`    Dataset: not found`)
        }
      }
    }
  }

  // Show high-confidence dataset matches
  const highConfidenceMatches = results.filter(
    (r) => r.datasetMatch !== null && r.datasetMatch.confidence >= 0.95
  )
  console.log(`\nHigh confidence (>=95%) dataset matches: ${highConfidenceMatches.length}`)

  // Show borderline matches (85-90%)
  const borderlineMatches = results.filter(
    (r) =>
      r.datasetMatch !== null &&
      r.datasetMatch.confidence >= 0.85 &&
      r.datasetMatch.confidence < 0.9
  )
  if (borderlineMatches.length > 0) {
    console.log(`\nBorderline matches (85-90% confidence): ${borderlineMatches.length}`)
    for (const r of borderlineMatches.slice(0, 3)) {
      console.log(
        `  "${r.movie.title}" -> "${r.datasetMatch!.title}" (${(r.datasetMatch!.confidence * 100).toFixed(0)}%)`
      )
    }
  }

  console.log("\n" + "=".repeat(70))

  await resetPool()
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  program.parse()
}
