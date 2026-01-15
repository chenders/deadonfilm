/**
 * Status Bar for Death Enrichment
 *
 * Provides a terminal status bar that shows current activity and running cost tally.
 * Updates in place at the bottom of the terminal without scrolling output.
 */

export interface StatusBarState {
  currentActor: string | null
  currentSource: string | null
  actorsProcessed: number
  totalActors: number
  totalCostUsd: number
  isRunning: boolean
}

/**
 * Terminal status bar that shows real-time progress and cost.
 */
export class StatusBar {
  private state: StatusBarState = {
    currentActor: null,
    currentSource: null,
    actorsProcessed: 0,
    totalActors: 0,
    totalCostUsd: 0,
    isRunning: false,
  }
  private lastLineLength = 0
  private isEnabled: boolean

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
    this.state.isRunning = true
    this.render()
  }

  /**
   * Update the current actor being processed.
   */
  setCurrentActor(name: string, index: number): void {
    this.state.currentActor = name
    this.state.actorsProcessed = index
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
   * Stop the status bar and clear the line.
   */
  stop(): void {
    this.state.isRunning = false
    this.clear()
  }

  /**
   * Clear the status bar line.
   */
  private clear(): void {
    if (!this.isEnabled) return
    // Move cursor to beginning and clear line
    process.stdout.write("\r" + " ".repeat(this.lastLineLength) + "\r")
    this.lastLineLength = 0
  }

  /**
   * Render the status bar to the terminal.
   */
  private render(): void {
    if (!this.isEnabled || !this.state.isRunning) return

    // Build status line
    const parts: string[] = []

    // Progress
    const progress = `[${this.state.actorsProcessed}/${this.state.totalActors}]`
    parts.push(progress)

    // Current actor
    if (this.state.currentActor) {
      const truncatedName =
        this.state.currentActor.length > 25
          ? this.state.currentActor.substring(0, 22) + "..."
          : this.state.currentActor
      parts.push(truncatedName)
    }

    // Current source
    if (this.state.currentSource) {
      parts.push(`→ ${this.state.currentSource}`)
    }

    // Cost (always show)
    const costStr = `💰 $${this.state.totalCostUsd.toFixed(4)}`
    parts.push(costStr)

    // Calculate percentage
    const percentage =
      this.state.totalActors > 0
        ? ((this.state.actorsProcessed / this.state.totalActors) * 100).toFixed(0)
        : "0"
    parts.push(`(${percentage}%)`)

    // Join and pad
    const line = parts.join(" | ")

    // Clear previous line and write new one
    this.clear()
    process.stdout.write("\r" + line)
    this.lastLineLength = line.length
  }

  /**
   * Write a log message above the status bar.
   * This clears the status bar, writes the message, then re-renders the status bar.
   */
  log(message: string): void {
    if (!this.isEnabled) {
      console.log(message)
      return
    }

    // Clear status bar, print message, re-render status bar
    this.clear()
    console.log(message)
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
