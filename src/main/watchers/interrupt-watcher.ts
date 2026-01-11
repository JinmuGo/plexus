/**
 * Interrupt Watcher
 *
 * Watches Claude session JSONL files for interrupt patterns.
 * Detects when a user interrupts an ongoing operation.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { devLog } from '../lib/utils'
import { jsonlParser } from './jsonl-parser'

// Callback type for interrupt events
export type InterruptHandler = (sessionId: string) => void

/**
 * Single session file watcher
 */
class SessionFileWatcher {
  private sessionId: string
  private cwd: string
  private filePath: string
  private watcher: fs.FSWatcher | null = null
  private lastSize = 0
  private pollInterval: NodeJS.Timeout | null = null
  private onInterrupt: InterruptHandler

  constructor(sessionId: string, cwd: string, onInterrupt: InterruptHandler) {
    this.sessionId = sessionId
    this.cwd = cwd
    this.onInterrupt = onInterrupt

    const projectDir = cwd.replace(/\//g, '-').replace(/\./g, '-')
    this.filePath = path.join(
      os.homedir(),
      '.claude',
      'projects',
      projectDir,
      `${sessionId}.jsonl`
    )
  }

  /**
   * Start watching the session file
   */
  start(): void {
    this.stop()

    if (!fs.existsSync(this.filePath)) {
      devLog.log(
        `[InterruptWatcher] File not found, waiting for creation: ${this.sessionId.slice(0, 8)}`
      )
      // Poll for file creation
      this.waitForFile()
      return
    }

    this.startWatching()
  }

  /**
   * Wait for file to be created
   */
  private waitForFile(): void {
    const checkInterval = setInterval(() => {
      if (fs.existsSync(this.filePath)) {
        clearInterval(checkInterval)
        this.startWatching()
      }
    }, 1000)

    // Store for cleanup
    this.pollInterval = checkInterval
  }

  /**
   * Start the actual file watching
   */
  private startWatching(): void {
    try {
      const stats = fs.statSync(this.filePath)
      this.lastSize = stats.size
    } catch {
      this.lastSize = 0
    }

    try {
      // Use fs.watch for file system events
      this.watcher = fs.watch(this.filePath, eventType => {
        if (eventType === 'change') {
          this.checkForChanges()
        }
      })

      this.watcher.on('error', error => {
        devLog.error(
          `[InterruptWatcher] Watcher error for ${this.sessionId.slice(0, 8)}:`,
          error
        )
      })

      devLog.log(
        `[InterruptWatcher] Started watching: ${this.sessionId.slice(0, 8)}`
      )
    } catch (error) {
      devLog.error(
        `[InterruptWatcher] Failed to start watching ${this.sessionId.slice(0, 8)}:`,
        error
      )
    }
  }

  /**
   * Check for file changes and parse new content
   */
  private checkForChanges(): void {
    try {
      const stats = fs.statSync(this.filePath)

      // File was truncated (reset)
      if (stats.size < this.lastSize) {
        this.lastSize = 0
        jsonlParser.resetState(this.sessionId)
      }

      // No new content
      if (stats.size === this.lastSize) {
        return
      }

      this.lastSize = stats.size

      // Parse incrementally
      const result = jsonlParser.parseIncremental(this.sessionId, this.cwd)

      if (result.interruptDetected) {
        devLog.log(
          `[InterruptWatcher] Interrupt detected for ${this.sessionId.slice(0, 8)}`
        )
        this.onInterrupt(this.sessionId)
      }

      if (result.clearDetected) {
        devLog.log(
          `[InterruptWatcher] Clear detected for ${this.sessionId.slice(0, 8)}`
        )
      }
    } catch (error) {
      // File might have been deleted
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        devLog.log(
          `[InterruptWatcher] File deleted for ${this.sessionId.slice(0, 8)}`
        )
        this.stop()
      }
    }
  }

  /**
   * Stop watching
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
  }
}

/**
 * Interrupt Watcher Manager
 *
 * Manages file watchers for multiple sessions.
 */
class InterruptWatcherManager {
  private watchers: Map<string, SessionFileWatcher> = new Map()
  private handler: InterruptHandler | null = null

  /**
   * Set the interrupt handler
   */
  setHandler(handler: InterruptHandler): void {
    this.handler = handler
  }

  /**
   * Start watching a session
   */
  start(sessionId: string, cwd: string): void {
    // Already watching
    if (this.watchers.has(sessionId)) {
      return
    }

    if (!this.handler) {
      devLog.warn('[InterruptWatcher] No handler set, skipping watcher')
      return
    }

    const watcher = new SessionFileWatcher(sessionId, cwd, this.handler)
    watcher.start()
    this.watchers.set(sessionId, watcher)
  }

  /**
   * Stop watching a session
   */
  stop(sessionId: string): void {
    const watcher = this.watchers.get(sessionId)
    if (watcher) {
      watcher.stop()
      this.watchers.delete(sessionId)
      devLog.log(
        `[InterruptWatcher] Stopped watching: ${sessionId.slice(0, 8)}`
      )
    }
  }

  /**
   * Stop all watchers
   */
  stopAll(): void {
    for (const [sessionId, watcher] of this.watchers) {
      watcher.stop()
      devLog.log(
        `[InterruptWatcher] Stopped watching: ${sessionId.slice(0, 8)}`
      )
    }
    this.watchers.clear()
  }

  /**
   * Check if a session is being watched
   */
  isWatching(sessionId: string): boolean {
    return this.watchers.has(sessionId)
  }

  /**
   * Get count of active watchers
   */
  getCount(): number {
    return this.watchers.size
  }
}

// Singleton instance
export const interruptWatcher = new InterruptWatcherManager()
