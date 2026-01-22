/**
 * Generic CLI Status Bar for Batch Operations
 *
 * Provides a fixed-position terminal status bar that stays at the bottom
 * of the terminal while logs scroll above it. Uses ANSI escape codes to create
 * a scroll region for logs with a reserved bottom area for the status bar.
 *
 * Features:
 * - Colorized output with semantic colors
 * - Full-width layout with smart space utilization
 * - Progress tracking with ETA calculation
 * - Flexible metrics that can be customized per use case
 * - Auto-disables in non-TTY environments
 *
 * Usage:
 * ```typescript
 * const statusBar = new CLIStatusBar({
 *   totalItems: 100,
 *   itemLabel: 'chunks',
 *   metrics: ['checked', 'updated', 'errors']
 * })
 * statusBar.start()
 * statusBar.update({ current: 1, currentItem: 'Processing...', checked: 10 })
 * statusBar.stop()
 * ```
 */

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

export interface CLIStatusBarConfig {
  /** Total number of items to process */
  totalItems: number
  /** Label for items (e.g., 'chunks', 'actors', 'files') */
  itemLabel: string
  /** Optional metric labels to track (e.g., ['checked', 'updated', 'errors']) */
  metrics?: string[]
  /** Optional mode label (e.g., 'people', 'movies') */
  mode?: string
  /** Optional header text to display above the status bar (e.g., 'Processing: 2026-01-01 to 2026-01-21') */
  header?: string
}

export interface CLIStatusBarState {
  /** Current item being processed (0-based index) */
  current: number
  /** Description of current item (e.g., "Processing chunk 5") */
  currentItem: string | null
  /** Optional sub-operation within current item (e.g., "Fetching from API") */
  currentOperation: string | null
  /** Dynamic metrics (e.g., { checked: 100, updated: 50, errors: 2 }) */
  metrics: Record<string, number>
  /** Timestamp when processing started */
  startTime: number | null
  /** Whether the status bar is currently running */
  isRunning: boolean
}

/**
 * Generic CLI status bar for batch operations.
 * Shows progress, ETA, and customizable metrics in a fixed bottom panel.
 */
export class CLIStatusBar {
  private config: CLIStatusBarConfig
  private state: CLIStatusBarState = {
    current: 0,
    currentItem: null,
    currentOperation: null,
    metrics: {},
    startTime: null,
    isRunning: false,
  }
  private isEnabled: boolean
  private rows: number = 24
  private cols: number = 80
  private statusHeight: number = 3 // separator + elapsed/ETA + status (+ optional header)
  private resizeHandler: (() => void) | null = null

  constructor(config: CLIStatusBarConfig, enabled = true) {
    this.config = config
    // Add 1 line for header if provided
    if (config.header) {
      this.statusHeight = 4
    }
    // Initialize metrics to 0
    if (config.metrics) {
      for (const metric of config.metrics) {
        this.state.metrics[metric] = 0
      }
    }
    // Disable status bar if not running in a TTY or if explicitly disabled
    this.isEnabled = enabled && process.stdout.isTTY === true
  }

  /**
   * Start the status bar.
   */
  start(): void {
    this.state.current = 0
    this.state.startTime = Date.now()
    this.state.isRunning = true

    if (!this.isEnabled) return

    this.detectTerminalSize()
    this.setupScrollRegion(true) // Clear screen on initial setup
    this.listenForResize()
    this.render()
  }

  /**
   * Update the status bar with new progress information.
   */
  update(update: {
    current?: number
    currentItem?: string
    currentOperation?: string
    metrics?: Partial<Record<string, number>>
  }): void {
    if (update.current !== undefined) {
      this.state.current = update.current
    }
    if (update.currentItem !== undefined) {
      this.state.currentItem = update.currentItem
    }
    if (update.currentOperation !== undefined) {
      this.state.currentOperation = update.currentOperation
    }
    if (update.metrics) {
      for (const [key, value] of Object.entries(update.metrics)) {
        if (value !== undefined) {
          this.state.metrics[key] = value
        }
      }
    }
    this.render()
  }

  /**
   * Increment a metric by a given amount (default 1).
   */
  incrementMetric(metric: string, amount = 1): void {
    if (this.state.metrics[metric] === undefined) {
      this.state.metrics[metric] = 0
    }
    this.state.metrics[metric] += amount
    this.render()
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
    // Clear all status lines
    if (this.config.header) {
      const headerRow = this.rows - 3
      const separatorRow = this.rows - 2
      const elapsedRow = this.rows - 1
      const statusRow = this.rows
      process.stdout.write(`${ESC}${headerRow};1H${CLEAR_LINE}`)
      process.stdout.write(`${ESC}${separatorRow};1H${CLEAR_LINE}`)
      process.stdout.write(`${ESC}${elapsedRow};1H${CLEAR_LINE}`)
      process.stdout.write(`${ESC}${statusRow};1H${CLEAR_LINE}`)
    } else {
      const separatorRow = this.rows - 2
      const elapsedRow = this.rows - 1
      const statusRow = this.rows
      process.stdout.write(`${ESC}${separatorRow};1H${CLEAR_LINE}`)
      process.stdout.write(`${ESC}${elapsedRow};1H${CLEAR_LINE}`)
      process.stdout.write(`${ESC}${statusRow};1H${CLEAR_LINE}`)
    }
    // Move cursor to last line
    process.stdout.write(`${ESC}${this.rows};1H`)
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

  /**
   * Detect current terminal size.
   */
  private detectTerminalSize(): void {
    this.rows = process.stdout.rows || 24
    this.cols = process.stdout.columns || 80
  }

  /**
   * Set up the scroll region to exclude the bottom status lines.
   * @param clearScreen - Whether to clear the screen first (only for initial setup)
   */
  private setupScrollRegion(clearScreen = false): void {
    const scrollBottom = this.rows - this.statusHeight

    if (clearScreen) {
      // Clear the screen and move cursor to top-left
      process.stdout.write(`${ESC}2J`)
      process.stdout.write(`${ESC}1;1H`)
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
   * Get color for percentage based on progress.
   */
  private getPercentageColor(percentage: number): string {
    if (percentage >= 75) return FG_BRIGHT_GREEN
    if (percentage >= 50) return FG_BRIGHT_CYAN
    if (percentage >= 25) return FG_BRIGHT_YELLOW
    return FG_WHITE
  }

  /**
   * Calculate visible length of a string (excluding ANSI codes).
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
   * Format the elapsed/ETA line with metrics.
   */
  private formatElapsedLine(): string {
    const width = this.cols

    // === Left section: Elapsed time ===
    const elapsed = this.state.startTime ? Date.now() - this.state.startTime : 0
    const elapsedStr = `Elapsed: ${this.formatDuration(elapsed)}`
    const elapsedDisplay = `${FG_WHITE}${elapsedStr}${RESET}`

    // === Middle section: Current date range + Metrics ===
    const middleParts: string[] = []

    // Add current item (date range) if available
    if (this.state.currentItem) {
      middleParts.push(`${FG_BRIGHT_YELLOW}${this.state.currentItem}${RESET}`)
    }

    // Add metrics
    if (this.config.metrics) {
      for (const metric of this.config.metrics) {
        const value = this.state.metrics[metric] || 0
        if (value > 0) {
          middleParts.push(`${FG_BRIGHT_CYAN}${metric}: ${value.toLocaleString()}${RESET}`)
        }
      }
    }
    const middleDisplay = middleParts.length > 0 ? middleParts.join(" | ") : ""

    // === Right section: ETA ===
    let etaDisplay = ""
    if (this.state.current > 0 && this.state.startTime) {
      const avgTimePerItem = elapsed / this.state.current
      const remaining = this.config.totalItems - this.state.current
      const etaMs = avgTimePerItem * remaining
      const etaStr = `ETA: ~${this.formatDuration(etaMs)}`
      etaDisplay = `${FG_BRIGHT_GREEN}${etaStr}${RESET}`
    }

    // Build the line
    const sections = [elapsedDisplay]
    if (middleDisplay) sections.push(middleDisplay)
    if (etaDisplay) sections.push(etaDisplay)

    let leftContent: string
    let rightContent: string
    if (sections.length === 1) {
      // When only elapsed time is available, keep it on the left to avoid layout jump
      leftContent = sections[0]
      rightContent = ""
    } else {
      leftContent = sections.slice(0, -1).join("  ")
      rightContent = sections[sections.length - 1] || ""
    }

    // Calculate visible lengths
    const leftLen = this.visibleLength(leftContent)
    const rightLen = this.visibleLength(rightContent)
    const paddingLen = Math.max(1, width - leftLen - rightLen)
    const padding = " ".repeat(paddingLen)

    return `${BG_BLACK}${leftContent}${padding}${rightContent}${RESET}`
  }

  /**
   * Format the main status line.
   */
  private formatStatus(): string {
    const width = this.cols

    // === Build left section ===
    // Progress: [5/35 chunks]
    const progressNum = `${this.state.current}/${this.config.totalItems}`
    const progressLabel = this.config.itemLabel
    const modeLabel = this.config.mode ? ` ${this.config.mode}` : ""
    const progressText = `${progressNum}${modeLabel} ${progressLabel}`
    const progressDisplay = `${FG_CYAN}[${FG_BRIGHT_WHITE}${progressText}${FG_CYAN}]${RESET}`
    const progressVisibleLen = progressText.length + 2 // brackets

    // Current item
    let itemDisplay = ""
    let itemVisibleLen = 0
    if (this.state.currentItem) {
      itemDisplay = ` ${FG_BRIGHT_WHITE}${BOLD}${this.state.currentItem}${RESET}`
      itemVisibleLen = 1 + this.state.currentItem.length
    }

    // Current operation indicator
    let operationDisplay = ""
    let operationVisibleLen = 0
    if (this.state.currentOperation) {
      operationDisplay = ` ${DIM}${FG_YELLOW}→${RESET} ${FG_YELLOW}${this.state.currentOperation}${RESET}`
      operationVisibleLen = 3 + this.state.currentOperation.length
    }

    // === Build right section ===
    // Percentage
    const percentage =
      this.config.totalItems > 0 ? (this.state.current / this.config.totalItems) * 100 : 0
    const percentStr = `${percentage.toFixed(0)}%`
    const percentColor = this.getPercentageColor(percentage)
    const percentDisplay = `${percentColor}${percentStr}${RESET}`
    const percentVisibleLen = percentStr.length

    const rightSection = percentDisplay
    const rightVisibleLen = percentVisibleLen

    // === Calculate available space for item name ===
    const fixedLen = progressVisibleLen + operationVisibleLen + rightVisibleLen + 4
    const availableForItem = width - fixedLen

    // Truncate item name if needed
    if (this.state.currentItem && itemVisibleLen > availableForItem) {
      const maxNameLen = Math.max(availableForItem - 4, 10)
      if (this.state.currentItem.length > maxNameLen) {
        const truncatedName = this.state.currentItem.substring(0, maxNameLen - 3) + "..."
        itemDisplay = ` ${FG_BRIGHT_WHITE}${BOLD}${truncatedName}${RESET}`
        itemVisibleLen = 1 + truncatedName.length
      }
    }

    // === Build the full line ===
    const leftSection = `${progressDisplay}${itemDisplay}${operationDisplay}`
    const leftVisibleLen = progressVisibleLen + itemVisibleLen + operationVisibleLen

    // Calculate padding between left and right sections
    const paddingLen = Math.max(1, width - leftVisibleLen - rightVisibleLen)
    const padding = " ".repeat(paddingLen)

    // Assemble final line with background
    const line = `${BG_BLACK}${leftSection}${padding}${rightSection}${RESET}`

    return line
  }

  /**
   * Format the header line with progress bar.
   */
  private formatHeaderLine(): string {
    if (!this.config.header) return ""

    const width = this.cols
    const headerText = this.config.header

    // Calculate progress
    const percentage =
      this.config.totalItems > 0 ? (this.state.current / this.config.totalItems) * 100 : 0
    const percentStr = `${percentage.toFixed(0)}%`

    // Progress bar configuration
    const barWidth = 20 // Total width of the progress bar including brackets
    const filledWidth = Math.floor(((barWidth - 2) * percentage) / 100) // -2 for brackets
    const emptyWidth = barWidth - 2 - filledWidth
    const progressBar = `[${FG_BRIGHT_GREEN}${"█".repeat(filledWidth)}${RESET}${DIM}${"░".repeat(emptyWidth)}${RESET}]`

    // Right section: progress bar + percentage
    const rightSection = `${progressBar} ${FG_BRIGHT_WHITE}${percentStr}${RESET}`
    const rightVisibleLen = barWidth + 1 + percentStr.length // bar + space + percent

    // Calculate padding
    const headerTextLen = this.visibleLength(headerText)
    const paddingLen = Math.max(1, width - headerTextLen - rightVisibleLen)
    const padding = " ".repeat(paddingLen)

    // Build the line
    const line = `${BG_BLACK}${FG_BRIGHT_WHITE}${BOLD}${headerText}${RESET}${BG_BLACK}${padding}${rightSection}${RESET}`

    return line
  }

  /**
   * Render the status bar to the terminal.
   */
  private render(): void {
    if (!this.isEnabled || !this.state.isRunning) return

    const status = this.formatStatus()
    const elapsedLine = this.formatElapsedLine()

    // Create separator line (dim horizontal line)
    const separator = `${DIM}${"─".repeat(this.cols)}${RESET}`

    // Calculate row positions based on whether we have a header
    let output = SAVE_CURSOR

    if (this.config.header) {
      // 4 lines: header, separator, elapsed, status
      const headerRow = this.rows - 3
      const separatorRow = this.rows - 2
      const elapsedRow = this.rows - 1
      const statusRow = this.rows

      const headerLine = this.formatHeaderLine()

      output +=
        `${ESC}${headerRow};1H${CLEAR_LINE}${headerLine}` +
        `${ESC}${separatorRow};1H${CLEAR_LINE}${separator}` +
        `${ESC}${elapsedRow};1H${CLEAR_LINE}${elapsedLine}` +
        `${ESC}${statusRow};1H${CLEAR_LINE}${status}`
    } else {
      // 3 lines: separator, elapsed, status
      const separatorRow = this.rows - 2
      const elapsedRow = this.rows - 1
      const statusRow = this.rows

      output +=
        `${ESC}${separatorRow};1H${CLEAR_LINE}${separator}` +
        `${ESC}${elapsedRow};1H${CLEAR_LINE}${elapsedLine}` +
        `${ESC}${statusRow};1H${CLEAR_LINE}${status}`
    }

    output += RESTORE_CURSOR
    process.stdout.write(output)
  }
}

/**
 * Create a no-op status bar that doesn't output anything.
 * Useful for non-interactive environments or when status bar is disabled.
 */
export function createNoOpCLIStatusBar(config: CLIStatusBarConfig): CLIStatusBar {
  return new CLIStatusBar(config, false)
}
