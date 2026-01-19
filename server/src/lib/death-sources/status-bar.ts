/**
 * Status Bar for Death Enrichment
 *
 * Provides a fixed-position terminal status bar (like Claude Code's) that stays at
 * the bottom of the terminal while logs scroll above it. Uses ANSI escape codes
 * to create a scroll region for logs with a reserved bottom line for the status bar.
 *
 * Features:
 * - Colorized output with semantic colors
 * - Full-width layout with smart space utilization
 * - Left-aligned progress/actor/source, right-aligned cost/percentage
 */

export interface StatusBarState {
  currentActor: string | null
  currentSource: string | null
  actorsProcessed: number
  totalActors: number
  totalCostUsd: number
  isRunning: boolean
  /** Count of actors that qualified for a /death page this run */
  deathPagesAdded: number
  /** Timestamp when batch started (for elapsed/ETA calculation) */
  startTime: number | null
  /** Count of actors successfully enriched (got data) */
  actorsEnriched: number
  /** Current actor details for display */
  currentActorDetails: {
    popularity: number | null
    birthday: string | null
    deathday: string | null
    causeOfDeath: string | null
  } | null
  /** Actors that qualified for death pages (for end summary) */
  deathPageActors: Array<{ id: number; tmdbId: number | null; name: string }>
  /** Link following stats for current actor */
  linkFollowing: {
    linksFollowed: number
    pagesFetched: number
    isActive: boolean
  }
  /** Cumulative link following stats for entire batch */
  batchLinkStats: {
    totalLinksFollowed: number
    totalPagesFetched: number
  }
  /** Sources that hit rate limits during this batch */
  exhaustedSources: Set<string>
  /** Per-source hit/miss statistics */
  sourceStats: Map<string, { hits: number; misses: number }>
  /** Cache hit/miss statistics */
  cacheStats: { hits: number; misses: number }
  /** Last source that successfully provided data */
  lastWinningSource: string | null
}

// ANSI escape codes for cursor/screen control
const ESC = "\x1b["
const SAVE_CURSOR = `${ESC}s`
const RESTORE_CURSOR = `${ESC}u`
const CLEAR_LINE = `${ESC}K`
const RESET_SCROLL_REGION = `${ESC}r`

// ANSI color codes
const RESET = `${ESC}0m`
const BOLD = `${ESC}1m`
const DIM = `${ESC}2m`

// Foreground colors
const FG_GREEN = `${ESC}32m`
const FG_YELLOW = `${ESC}33m`
const FG_CYAN = `${ESC}36m`
const FG_WHITE = `${ESC}37m`

// Background colors
const BG_BLACK = `${ESC}40m`

// Bright foreground colors
const FG_BRIGHT_WHITE = `${ESC}97m`
const FG_BRIGHT_CYAN = `${ESC}96m`
const FG_BRIGHT_GREEN = `${ESC}92m`
const FG_BRIGHT_YELLOW = `${ESC}93m`
const FG_BRIGHT_MAGENTA = `${ESC}95m`
const FG_BRIGHT_RED = `${ESC}91m`

/**
 * Terminal status bar that shows real-time progress and cost.
 * Uses ANSI scroll regions to keep the status bar fixed at the bottom
 * while logs scroll above it.
 */
export class StatusBar {
  private state: StatusBarState = {
    currentActor: null,
    currentSource: null,
    actorsProcessed: 0,
    totalActors: 0,
    totalCostUsd: 0,
    isRunning: false,
    deathPagesAdded: 0,
    startTime: null,
    actorsEnriched: 0,
    currentActorDetails: null,
    deathPageActors: [],
    linkFollowing: {
      linksFollowed: 0,
      pagesFetched: 0,
      isActive: false,
    },
    batchLinkStats: {
      totalLinksFollowed: 0,
      totalPagesFetched: 0,
    },
    exhaustedSources: new Set<string>(),
    sourceStats: new Map<string, { hits: number; misses: number }>(),
    cacheStats: { hits: 0, misses: 0 },
    lastWinningSource: null,
  }
  private isEnabled: boolean
  private rows: number = 24
  private cols: number = 80
  private readonly statusHeight: number = 4 // 1 separator, 1 source stats, 1 elapsed/ETA, 1 status
  private resizeHandler: (() => void) | null = null

  constructor(enabled = true) {
    // Disable status bar if not running in a TTY or if explicitly disabled
    this.isEnabled = enabled && process.stdout.isTTY === true
  }

  /**
   * Start the status bar with total actor count.
   */
  start(totalActors: number): void {
    this.state.totalActors = totalActors
    this.state.actorsProcessed = 0
    this.state.totalCostUsd = 0
    this.state.deathPagesAdded = 0
    this.state.startTime = Date.now()
    this.state.actorsEnriched = 0
    this.state.deathPageActors = []
    this.state.linkFollowing = { linksFollowed: 0, pagesFetched: 0, isActive: false }
    this.state.batchLinkStats = { totalLinksFollowed: 0, totalPagesFetched: 0 }
    this.state.exhaustedSources = new Set<string>()
    this.state.sourceStats = new Map<string, { hits: number; misses: number }>()
    this.state.cacheStats = { hits: 0, misses: 0 }
    this.state.lastWinningSource = null
    this.state.isRunning = true

    if (!this.isEnabled) return

    this.detectTerminalSize()
    this.setupScrollRegion(true) // Clear screen on initial setup
    this.listenForResize()
    this.render()
  }

  /**
   * Detect current terminal size.
   */
  private detectTerminalSize(): void {
    this.rows = process.stdout.rows || 24
    this.cols = process.stdout.columns || 80
  }

  /**
   * Set up the scroll region to exclude the bottom status line.
   * @param clearScreen - Whether to clear the screen first (only for initial setup)
   */
  private setupScrollRegion(clearScreen = false): void {
    const scrollBottom = this.rows - this.statusHeight

    if (clearScreen) {
      // Clear the screen and move cursor to top-left before setting up scroll region.
      // This prevents old content from appearing in weird positions after the
      // scroll region is established.
      process.stdout.write(`${ESC}2J`) // Clear entire screen
      process.stdout.write(`${ESC}1;1H`) // Move cursor to top-left
    }

    // Set scroll region from row 1 to (rows - statusHeight)
    process.stdout.write(`${ESC}1;${scrollBottom}r`)
    // Move cursor to top of scroll region
    process.stdout.write(`${ESC}1;1H`)
  }

  /**
   * Listen for terminal resize events.
   */
  private listenForResize(): void {
    this.resizeHandler = () => {
      if (!this.state.isRunning) return
      this.detectTerminalSize()
      this.setupScrollRegion()
      this.render()
    }
    process.stdout.on("resize", this.resizeHandler)
  }

  /**
   * Move cursor to the status bar line at the bottom.
   */
  private moveCursorToStatusLine(): string {
    return `${ESC}${this.rows};1H`
  }

  /**
   * Update the current actor being processed.
   */
  setCurrentActor(
    name: string,
    index: number,
    details?: {
      popularity?: number | null
      birthday?: string | null
      deathday?: string | null
      causeOfDeath?: string | null
    }
  ): void {
    this.state.currentActor = name
    this.state.actorsProcessed = index
    this.state.currentActorDetails = details
      ? {
          popularity: details.popularity ?? null,
          birthday: details.birthday ?? null,
          deathday: details.deathday ?? null,
          causeOfDeath: details.causeOfDeath ?? null,
        }
      : null
    this.render()
  }

  /**
   * Update the current source being tried.
   */
  setCurrentSource(sourceName: string): void {
    this.state.currentSource = sourceName
    this.render()
  }

  /**
   * Update the running cost tally.
   */
  addCost(cost: number): void {
    this.state.totalCostUsd += cost
    this.render()
  }

  /**
   * Set the total cost directly.
   */
  setTotalCost(cost: number): void {
    this.state.totalCostUsd = cost
    this.render()
  }

  /**
   * Increment processed count after completing an actor.
   */
  completeActor(): void {
    this.state.currentSource = null
    this.render()
  }

  /**
   * Record an actor that qualified for a /death page.
   */
  addDeathPageActor(actor: { id: number; tmdbId: number | null; name: string }): void {
    this.state.deathPagesAdded++
    this.state.deathPageActors.push(actor)
    this.render()
  }

  /**
   * Increment count of actors successfully enriched (got data).
   */
  incrementEnriched(): void {
    this.state.actorsEnriched++
    this.render()
  }

  /**
   * Start link following for current actor.
   */
  startLinkFollowing(): void {
    this.state.linkFollowing = { linksFollowed: 0, pagesFetched: 0, isActive: true }
    this.render()
  }

  /**
   * Update link following progress.
   */
  updateLinkFollowing(linksFollowed: number, pagesFetched: number): void {
    this.state.linkFollowing.linksFollowed = linksFollowed
    this.state.linkFollowing.pagesFetched = pagesFetched
    this.render()
  }

  /**
   * End link following for current actor.
   */
  endLinkFollowing(): void {
    // Add to batch totals
    this.state.batchLinkStats.totalLinksFollowed += this.state.linkFollowing.linksFollowed
    this.state.batchLinkStats.totalPagesFetched += this.state.linkFollowing.pagesFetched
    this.state.linkFollowing.isActive = false
    this.render()
  }

  /**
   * Get batch link following stats.
   */
  getBatchLinkStats(): { totalLinksFollowed: number; totalPagesFetched: number } {
    return { ...this.state.batchLinkStats }
  }

  /**
   * Mark a source as exhausted (hit rate limit).
   * Will be displayed as a warning in the status bar.
   */
  markSourceExhausted(sourceName: string): void {
    if (!this.state.exhaustedSources.has(sourceName)) {
      this.state.exhaustedSources.add(sourceName)
      // Log a warning that will scroll above the status bar
      this.log(`⚠️  ${sourceName} rate limit reached - will skip for remaining actors`)
      this.render()
    }
  }

  /**
   * Get list of exhausted sources.
   */
  getExhaustedSources(): string[] {
    return Array.from(this.state.exhaustedSources)
  }

  /**
   * Record a source lookup attempt (success or failure).
   */
  recordSourceAttempt(source: string, success: boolean): void {
    const stats = this.state.sourceStats.get(source) || { hits: 0, misses: 0 }
    if (success) {
      stats.hits++
    } else {
      stats.misses++
    }
    this.state.sourceStats.set(source, stats)
    this.render()
  }

  /**
   * Record a cache lookup (hit or miss).
   */
  recordCacheHit(hit: boolean): void {
    if (hit) {
      this.state.cacheStats.hits++
    } else {
      this.state.cacheStats.misses++
    }
    this.render()
  }

  /**
   * Set the last source that successfully provided data.
   */
  setLastWinningSource(source: string): void {
    this.state.lastWinningSource = source
    this.render()
  }

  /**
   * Get abbreviated source name for display.
   */
  private getShortSourceName(source: string): string {
    const abbreviations: Record<string, string> = {
      "Wikipedia SPARQL": "Wiki",
      "Wikipedia Text": "WikiTxt",
      DuckDuckGo: "DDG",
      IMDb: "IMDB",
      "The Guardian": "Guard",
      "New York Times": "NYT",
      "AP News": "AP",
      FamilySearch: "FamSrch",
      "Google Search": "Google",
      "Bing Search": "Bing",
      Claude: "Claude",
      // Handle variations
      wikidata: "Wiki",
      wikipedia: "WikiTxt",
      duckduckgo: "DDG",
      imdb: "IMDB",
      guardian: "Guard",
      nytimes: "NYT",
      "ap-news": "AP",
      familysearch: "FamSrch",
      google: "Google",
      bing: "Bing",
      claude: "Claude",
    }
    return abbreviations[source] || source.substring(0, 6)
  }

  /**
   * Get the current death pages count.
   */
  getDeathPagesAdded(): number {
    return this.state.deathPagesAdded
  }

  /**
   * Get the list of actors that qualified for death pages.
   */
  getDeathPageActors(): Array<{ id: number; tmdbId: number | null; name: string }> {
    return this.state.deathPageActors
  }

  /**
   * Stop the status bar and restore terminal to normal state.
   */
  stop(): void {
    this.state.isRunning = false

    if (!this.isEnabled) return

    // Remove resize listener
    if (this.resizeHandler) {
      process.stdout.off("resize", this.resizeHandler)
      this.resizeHandler = null
    }

    // Reset scroll region to full terminal
    process.stdout.write(RESET_SCROLL_REGION)
    // Clear all 4 status lines (separator, source stats, elapsed, status)
    const separatorRow = this.rows - 3
    const sourceStatsRow = this.rows - 2
    const elapsedRow = this.rows - 1
    const statusRow = this.rows
    process.stdout.write(`${ESC}${separatorRow};1H${CLEAR_LINE}`)
    process.stdout.write(`${ESC}${sourceStatsRow};1H${CLEAR_LINE}`)
    process.stdout.write(`${ESC}${elapsedRow};1H${CLEAR_LINE}`)
    process.stdout.write(`${ESC}${statusRow};1H${CLEAR_LINE}`)
    // Move cursor to last line
    process.stdout.write(`${ESC}${this.rows};1H`)
  }

  /**
   * Get color for percentage based on progress.
   */
  private getPercentageColor(percentage: number): string {
    if (percentage >= 75) return FG_BRIGHT_GREEN
    if (percentage >= 50) return FG_BRIGHT_CYAN
    if (percentage >= 25) return FG_BRIGHT_YELLOW
    return FG_WHITE
  }

  /**
   * Format duration in human-readable form.
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSecs = seconds % 60
    if (minutes < 60) return `${minutes}m ${remainingSecs}s`
    const hours = Math.floor(minutes / 60)
    const remainingMins = minutes % 60
    return `${hours}h ${remainingMins}m`
  }

  /**
   * Format the source statistics line (new line 2).
   * Shows per-source hit/miss counts, cache hit rate, and throughput.
   */
  private formatSourceStatsLine(): string {
    const width = this.cols

    // === Build source stats: "Wiki 12✓  DDG 8✓/4✗  IMDB 5✓" ===
    const sourceParts: string[] = []
    for (const [source, stats] of this.state.sourceStats) {
      const shortName = this.getShortSourceName(source)
      if (stats.misses > 0) {
        sourceParts.push(
          `${FG_BRIGHT_GREEN}${shortName} ${stats.hits}✓${RESET}${FG_BRIGHT_RED}/${stats.misses}✗${RESET}`
        )
      } else if (stats.hits > 0) {
        sourceParts.push(`${FG_BRIGHT_GREEN}${shortName} ${stats.hits}✓${RESET}`)
      }
    }

    let sourcesDisplay = ""
    let sourcesVisibleLen = 0
    if (sourceParts.length > 0) {
      sourcesDisplay = `Sources: ${sourceParts.join("  ")}`
      // Calculate visible length (approximation - each source part has ~8-12 chars visible)
      sourcesVisibleLen =
        9 + // "Sources: "
        Array.from(this.state.sourceStats.values()).reduce((sum, stats) => {
          const shortName = this.getShortSourceName(
            Array.from(this.state.sourceStats.entries()).find(([, s]) => s === stats)?.[0] || ""
          )
          return (
            sum +
            shortName.length +
            String(stats.hits).length +
            1 +
            (stats.misses > 0 ? String(stats.misses).length + 2 : 0)
          )
        }, 0) +
        (this.state.sourceStats.size - 1) * 2 // spacing between parts
    }

    // === Cache hit rate ===
    const totalCache = this.state.cacheStats.hits + this.state.cacheStats.misses
    let cacheDisplay = ""
    let cacheVisibleLen = 0
    if (totalCache > 0) {
      const cacheRate = Math.round((this.state.cacheStats.hits / totalCache) * 100)
      const cacheStr = `Cache: ${cacheRate}%`
      cacheDisplay = `${FG_BRIGHT_CYAN}${cacheStr}${RESET}`
      cacheVisibleLen = cacheStr.length
    }

    // === Throughput (actors per minute) ===
    let rateDisplay = ""
    let rateVisibleLen = 0
    const elapsed = this.state.startTime ? (Date.now() - this.state.startTime) / 60000 : 0
    if (elapsed > 0.1 && this.state.actorsProcessed > 0) {
      const rate = (this.state.actorsProcessed / elapsed).toFixed(1)
      const rateStr = `Rate: ${rate}/min`
      rateDisplay = `${FG_BRIGHT_YELLOW}${rateStr}${RESET}`
      rateVisibleLen = rateStr.length
    }

    // === Combine into line ===
    const leftContent = sourcesDisplay
    const rightParts = [cacheDisplay, rateDisplay].filter((p) => p.length > 0)
    const rightContent = rightParts.join("  ")
    const rightVisibleLen = cacheVisibleLen + rateVisibleLen + (rightParts.length > 1 ? 2 : 0)

    const leftLen = sourcesVisibleLen
    const paddingLen = Math.max(1, width - leftLen - rightVisibleLen)
    const padding = " ".repeat(paddingLen)

    return `${BG_BLACK}${leftContent}${padding}${rightContent}${RESET}`
  }

  /**
   * Format the elapsed/ETA line with actor details if space allows.
   */
  private formatElapsedLine(): string {
    const width = this.cols

    // === Left section: Elapsed time ===
    const elapsed = this.state.startTime ? Date.now() - this.state.startTime : 0
    const elapsedStr = `Elapsed: ${this.formatDuration(elapsed)}`
    const elapsedDisplay = `${FG_WHITE}${elapsedStr}${RESET}`

    // === Middle section: Enriched count (success rate) ===
    const enrichedStr = `Enriched: ${this.state.actorsEnriched}/${this.state.actorsProcessed}`
    const successRate =
      this.state.actorsProcessed > 0
        ? Math.round((this.state.actorsEnriched / this.state.actorsProcessed) * 100)
        : 0
    const successDisplay = `${FG_BRIGHT_CYAN}${enrichedStr} (${successRate}%)${RESET}`

    // === Last winning source ===
    let lastSourceDisplay = ""
    if (this.state.lastWinningSource) {
      const shortName = this.getShortSourceName(this.state.lastWinningSource)
      const lastStr = `Last: ${shortName}`
      lastSourceDisplay = `${FG_BRIGHT_GREEN}${lastStr}${RESET}`
    }

    // === Link stats (if any links have been followed) ===
    let linkStatsDisplay = ""
    const totalLinks = this.state.batchLinkStats.totalLinksFollowed
    if (totalLinks > 0) {
      const linkStr = `Links: ${totalLinks}`
      linkStatsDisplay = `${FG_BRIGHT_MAGENTA}${linkStr}${RESET}`
    }

    // === Exhausted sources warning ===
    let exhaustedDisplay = ""
    if (this.state.exhaustedSources.size > 0) {
      const sources = Array.from(this.state.exhaustedSources).join(", ")
      exhaustedDisplay = `${FG_BRIGHT_RED}⚠ ${sources} exhausted${RESET}`
    }

    // === Right section: ETA ===
    let etaDisplay = ""
    if (this.state.actorsProcessed > 0 && this.state.startTime) {
      const avgTimePerActor = elapsed / this.state.actorsProcessed
      const remaining = this.state.totalActors - this.state.actorsProcessed
      const etaMs = avgTimePerActor * remaining
      const etaStr = `ETA: ~${this.formatDuration(etaMs)}`
      etaDisplay = `${FG_BRIGHT_GREEN}${etaStr}${RESET}`
    }

    // === Actor details if space allows ===
    let detailsDisplay = ""
    const details = this.state.currentActorDetails
    if (details) {
      const parts: string[] = []

      // Popularity
      if (details.popularity !== null) {
        parts.push(`Pop: ${details.popularity.toFixed(1)}`)
      }

      // Birth/Death years
      if (details.birthday || details.deathday) {
        const birthYear = details.birthday ? details.birthday.substring(0, 4) : "?"
        const deathYear = details.deathday ? details.deathday.substring(0, 4) : "?"
        parts.push(`${birthYear}–${deathYear}`)
      }

      // Cause of death (truncated if needed)
      if (details.causeOfDeath) {
        // Calculate how much space we have
        const baseLen = elapsedStr.length + enrichedStr.length + 20 + (etaDisplay ? 20 : 0)
        const partsLen = parts.join(" | ").length
        const availableForCause = width - baseLen - partsLen - 10

        if (availableForCause > 15) {
          let cause = details.causeOfDeath
          if (cause.length > availableForCause) {
            cause = cause.substring(0, availableForCause - 3) + "..."
          }
          parts.push(cause)
        }
      }

      if (parts.length > 0) {
        detailsDisplay = `${FG_BRIGHT_YELLOW}${parts.join(" | ")}${RESET}`
      }
    }

    // Build the line
    const sections = [elapsedDisplay, successDisplay]
    if (lastSourceDisplay) sections.push(lastSourceDisplay)
    if (linkStatsDisplay) sections.push(linkStatsDisplay)
    if (exhaustedDisplay) sections.push(exhaustedDisplay)
    if (detailsDisplay) sections.push(detailsDisplay)
    if (etaDisplay) sections.push(etaDisplay)

    const leftContent = sections.slice(0, -1).join("  ")
    const rightContent = sections[sections.length - 1] || ""

    // Calculate visible lengths
    const leftLen = this.visibleLength(leftContent)
    const rightLen = this.visibleLength(rightContent)
    const paddingLen = Math.max(1, width - leftLen - rightLen)
    const padding = " ".repeat(paddingLen)

    return `${BG_BLACK}${leftContent}${padding}${rightContent}${RESET}`
  }

  /**
   * Calculate visible length of a string (excluding ANSI codes).
   * Uses string operations instead of regex to avoid control character warnings.
   */
  private visibleLength(str: string): number {
    let length = 0
    let inEscape = false
    for (let i = 0; i < str.length; i++) {
      if (str[i] === "\x1b" && str[i + 1] === "[") {
        inEscape = true
        continue
      }
      if (inEscape) {
        if (str[i] === "m") {
          inEscape = false
        }
        continue
      }
      length++
    }
    return length
  }

  /**
   * Format the status bar content with colors and full-width layout.
   */
  private formatStatus(): string {
    const width = this.cols

    // === Build left section ===
    // Progress: [5/35]
    const progressNum = `${this.state.actorsProcessed}/${this.state.totalActors}`
    const progressDisplay = `${FG_CYAN}[${FG_BRIGHT_WHITE}${progressNum}${FG_CYAN}]${RESET}`
    const progressVisibleLen = progressNum.length + 2 // brackets

    // Actor name
    let actorDisplay = ""
    let actorVisibleLen = 0
    if (this.state.currentActor) {
      actorDisplay = ` ${FG_BRIGHT_WHITE}${BOLD}${this.state.currentActor}${RESET}`
      actorVisibleLen = 1 + this.state.currentActor.length // space + name
    }

    // Source indicator (with link following status)
    let sourceDisplay = ""
    let sourceVisibleLen = 0
    if (this.state.linkFollowing.isActive) {
      // Show link following progress instead of source name
      const linkStr = `Following ${this.state.linkFollowing.linksFollowed}/${this.state.linkFollowing.pagesFetched} links...`
      sourceDisplay = ` ${DIM}${FG_BRIGHT_CYAN}⟶${RESET} ${FG_BRIGHT_CYAN}${linkStr}${RESET}`
      sourceVisibleLen = 3 + linkStr.length // " ⟶ " + text
    } else if (this.state.currentSource) {
      sourceDisplay = ` ${DIM}${FG_YELLOW}→${RESET} ${FG_YELLOW}${this.state.currentSource}${RESET}`
      sourceVisibleLen = 3 + this.state.currentSource.length // " → " + source
    }

    // === Build right section ===
    // Death pages added (only show if > 0)
    let deathPagesDisplay = ""
    let deathPagesVisibleLen = 0
    if (this.state.deathPagesAdded > 0) {
      const deathPagesStr = `+${this.state.deathPagesAdded} /death`
      deathPagesDisplay = `${FG_BRIGHT_MAGENTA}${deathPagesStr}${RESET}  `
      deathPagesVisibleLen = deathPagesStr.length + 2 // text + 2 trailing spaces
    }

    // Cost
    const costValue = this.state.totalCostUsd.toFixed(2)
    const costDisplay = `${FG_GREEN}$${costValue}${RESET}`
    const costVisibleLen = 1 + costValue.length // $ + value

    // Percentage with progress bar character
    const percentage =
      this.state.totalActors > 0 ? (this.state.actorsProcessed / this.state.totalActors) * 100 : 0
    const percentStr = `${percentage.toFixed(0)}%`
    const percentColor = this.getPercentageColor(percentage)
    const percentDisplay = `${percentColor}${percentStr}${RESET}`
    const percentVisibleLen = percentStr.length

    // Right section with separator
    const rightSection = `${deathPagesDisplay}${costDisplay}  ${percentDisplay}`
    const rightVisibleLen = deathPagesVisibleLen + costVisibleLen + 2 + percentVisibleLen

    // === Calculate available space for actor name ===
    // Total fixed elements: progress + source + right section + padding
    const fixedLen = progressVisibleLen + sourceVisibleLen + rightVisibleLen + 4 // 4 for minimal padding
    const availableForActor = width - fixedLen

    // Truncate actor name if needed
    if (this.state.currentActor && actorVisibleLen > availableForActor) {
      const maxNameLen = Math.max(availableForActor - 4, 10) // Leave room for "..." and space, min 10 chars
      if (this.state.currentActor.length > maxNameLen) {
        const truncatedName = this.state.currentActor.substring(0, maxNameLen - 3) + "..."
        actorDisplay = ` ${FG_BRIGHT_WHITE}${BOLD}${truncatedName}${RESET}`
        actorVisibleLen = 1 + truncatedName.length
      }
    }

    // === Build the full line ===
    const leftSection = `${progressDisplay}${actorDisplay}${sourceDisplay}`
    const leftVisibleLen = progressVisibleLen + actorVisibleLen + sourceVisibleLen

    // Calculate padding between left and right sections
    const paddingLen = Math.max(1, width - leftVisibleLen - rightVisibleLen)
    const padding = " ".repeat(paddingLen)

    // Assemble final line with background
    const line = `${BG_BLACK}${leftSection}${padding}${rightSection}${RESET}`

    return line
  }

  /**
   * Render the status bar to the terminal (separator + elapsed/ETA + status).
   */
  private render(): void {
    if (!this.isEnabled || !this.state.isRunning) return

    const status = this.formatStatus()
    const sourceStatsLine = this.formatSourceStatsLine()
    const elapsedLine = this.formatElapsedLine()
    const separatorRow = this.rows - 3
    const sourceStatsRow = this.rows - 2
    const elapsedRow = this.rows - 1
    const statusRow = this.rows

    // Create separator line (dim horizontal line)
    const separator = `${DIM}${"─".repeat(this.cols)}${RESET}`

    // Save cursor, draw all 4 lines, restore cursor
    process.stdout.write(
      `${SAVE_CURSOR}` +
        `${ESC}${separatorRow};1H${CLEAR_LINE}${separator}` +
        `${ESC}${sourceStatsRow};1H${CLEAR_LINE}${sourceStatsLine}` +
        `${ESC}${elapsedRow};1H${CLEAR_LINE}${elapsedLine}` +
        `${ESC}${statusRow};1H${CLEAR_LINE}${status}` +
        `${RESTORE_CURSOR}`
    )
  }

  /**
   * Write a log message above the status bar.
   * The message will scroll within the scroll region while the status bar stays fixed.
   */
  log(message: string): void {
    if (!this.isEnabled) {
      console.log(message)
      return
    }

    // Save cursor position
    process.stdout.write(SAVE_CURSOR)

    // Ensure cursor is within scroll region (move to bottom of scroll region)
    const scrollBottom = this.rows - this.statusHeight
    process.stdout.write(`${ESC}${scrollBottom};1H`)

    // Print message (this will scroll within the scroll region)
    console.log(message)

    // Restore cursor and re-render status bar
    process.stdout.write(RESTORE_CURSOR)
    this.render()
  }
}

/**
 * Create a no-op status bar that doesn't output anything.
 * Useful for non-interactive or test environments.
 */
export function createNoOpStatusBar(): StatusBar {
  return new StatusBar(false)
}
